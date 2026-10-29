"""Core: settings, Mongo, error shape, auth deps, JWT/bcrypt, rate limiting, idempotency, pagination."""
from __future__ import annotations

import base64
import hashlib
import os
import secrets
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Optional

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import Depends, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError
from starlette.exceptions import HTTPException as StarletteHTTPException

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

JWT_SECRET = os.environ["JWT_SECRET"]
RUN_SECRET = os.environ["RUN_TOKEN_SECRET"]
ACCESS_TTL = timedelta(minutes=15)
REFRESH_TTL = timedelta(days=30)

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]


def use_db(name: str):
    """Switch database (tests)."""
    global db
    db = _client[name]
    return db


def get_db():
    return db


def now() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


def day_key(t: Optional[datetime] = None) -> str:
    return (t or now()).strftime("%Y-%m-%d")


def week_key(t: Optional[datetime] = None) -> str:
    y, w, _ = (t or now()).isocalendar()
    return f"{y}-W{w:02d}"


# ------------------------------------------------------------------ errors ---
class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: Any = None):
        self.status, self.code, self.message, self.details = status, code, message, details


def err_body(code: str, message: str, details: Any = None) -> dict:
    e: dict = {"code": code, "message": message}
    if details is not None:
        e["details"] = details
    return {"error": e}


def install_error_handlers(app):
    @app.exception_handler(ApiError)
    async def _api(_req, exc: ApiError):
        return JSONResponse(err_body(exc.code, exc.message, exc.details), status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def _val(_req, exc: RequestValidationError):
        details = [{"loc": list(e.get("loc", [])), "msg": e.get("msg")} for e in exc.errors()]
        return JSONResponse(err_body("validation_error", "Invalid request", details), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_req, exc: StarletteHTTPException):
        code = {401: "unauthorized", 403: "forbidden", 404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
        return JSONResponse(err_body(code, str(exc.detail)), status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def _any(_req, exc: Exception):
        return JSONResponse(err_body("internal_error", "Something went wrong"), status_code=500)


# ---------------------------------------------------------------- security ---
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except ValueError:
        return False


def sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def make_access(user_id: str) -> str:
    return jwt.encode({"sub": user_id, "type": "access", "exp": now() + ACCESS_TTL, "jti": secrets.token_hex(6)}, JWT_SECRET, algorithm="HS256")


async def issue_tokens(user_id: str, family: Optional[str] = None) -> dict:
    """Access JWT + opaque refresh token (stored hashed; rotated on every refresh)."""
    refresh = secrets.token_urlsafe(40)
    await db.refresh_tokens.insert_one({"token_hash": sha256(refresh), "user_id": user_id, "family": family or new_id("fam"), "revoked": False, "expires_at": now() + REFRESH_TTL, "created_at": now()})
    return {"access_token": make_access(user_id), "refresh_token": refresh, "token_type": "bearer", "expires_in": int(ACCESS_TTL.total_seconds())}


async def _user_from_request(request: Request) -> Optional[dict]:
    h = request.headers.get("Authorization", "")
    if not h.startswith("Bearer "):
        return None
    try:
        p = jwt.decode(h[7:], JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise ApiError(401, "token_expired", "Session expired")
    except jwt.InvalidTokenError:
        raise ApiError(401, "unauthorized", "Invalid token")
    if p.get("type") != "access":
        raise ApiError(401, "unauthorized", "Invalid token")
    u = await db.users.find_one({"user_id": p["sub"], "deleted": {"$ne": True}}, {"_id": 0, "password_hash": 0})
    if not u:
        raise ApiError(401, "unauthorized", "Account not found")
    await enforce_ban(u)
    return u


async def enforce_ban(u: dict) -> None:
    """403 while banned / suspended; a suspension whose `suspended_until` has passed is lifted lazily."""
    if not u.get("banned"):
        return
    until = u.get("suspended_until")
    if until and until.replace(tzinfo=until.tzinfo or timezone.utc) <= now():
        await get_db().users.update_one({"user_id": u["user_id"]}, {"$set": {"banned": False}, "$unset": {"ban_reason": "", "suspended_until": ""}})
        u["banned"] = False
        return
    raise ApiError(403, "banned", "This account is suspended")


def banned_filter() -> dict:
    """Users currently hidden from leaderboards (bans + unexpired suspensions)."""
    return {"banned": True, "$or": [{"suspended_until": None}, {"suspended_until": {"$gt": now()}}]}


async def current_user(request: Request) -> dict:
    u = await _user_from_request(request)
    if not u:
        raise ApiError(401, "unauthorized", "Sign in required")
    request.state.user_id = u["user_id"]
    return u


async def optional_user(request: Request) -> Optional[dict]:
    try:
        return await _user_from_request(request)
    except ApiError:
        return None


def require_role(*roles: str):
    """Phase 6 admin RBAC hook."""
    async def dep(u: dict = Depends(current_user)):
        if u.get("role", "player") not in roles:
            raise ApiError(403, "forbidden", "Not allowed")
        return u
    return dep


def assert_owner(u: dict, user_id: str):
    if u["user_id"] != user_id:
        raise ApiError(403, "forbidden", "You can't access another player's data")


# -------------------------------------------------------------- rate limit ---
class RateLimiter:
    def __init__(self):
        self.hits: dict[str, deque] = defaultdict(deque)

    def check(self, key: str, limit: int, window: float = 60.0):
        t = time.monotonic()
        q = self.hits[key]
        while q and q[0] <= t - window:
            q.popleft()
        if len(q) >= limit:
            raise ApiError(429, "rate_limited", "Too many requests, slow down", {"retry_after_s": int(window - (t - q[0])) + 1})
        q.append(t)

    def reset(self):
        self.hits.clear()


limiter = RateLimiter()
AUTH_LIMIT = int(os.environ.get("RATE_LIMIT_AUTH", "10"))
GAMEPLAY_LIMIT = int(os.environ.get("RATE_LIMIT_GAMEPLAY", "30"))


TRUSTED_PROXY_HOPS = int(os.environ.get("TRUSTED_PROXY_HOPS", "3"))


def client_ip(request: Request) -> str:
    """Client IP as seen by our trusted ingress. Each proxy *appends* to X-Forwarded-For, so the leftmost
    entries are client-controlled (spoofable); take the entry added by the outermost trusted hop."""
    fwd = [p.strip() for p in (request.headers.get("x-forwarded-for") or "").split(",") if p.strip()]
    if len(fwd) >= TRUSTED_PROXY_HOPS:
        return fwd[-TRUSTED_PROXY_HOPS]
    if fwd:  # shorter chain (fewer proxies than configured): leftmost is the best available client address
        return fwd[0]
    return request.client.host if request.client else "?"


async def auth_rate(request: Request):
    limiter.check(f"auth:{client_ip(request)}", AUTH_LIMIT)


async def gameplay_rate(u: dict = Depends(current_user)):
    limiter.check(f"play:{u['user_id']}", GAMEPLAY_LIMIT)
    return u


# ------------------------------------------------------------- idempotency ---
def idem_key(request: Request) -> str:
    k = request.headers.get("Idempotency-Key", "").strip()
    if not (8 <= len(k) <= 128):
        raise ApiError(400, "idempotency_key_required", "Idempotency-Key header (8-128 chars) is required")
    return k


async def idempotent(user_id: str, key: str, scope: str, fn: Callable[[], Awaitable[dict]]) -> dict:
    """Run fn once per (user, key). Repeats return the stored result; concurrent duplicates get 409."""
    try:
        await db.idempotency.insert_one({"user_id": user_id, "key": key, "scope": scope, "status": "pending", "created_at": now()})
    except DuplicateKeyError:
        doc = await db.idempotency.find_one({"user_id": user_id, "key": key}, {"_id": 0})
        if doc and doc.get("status") == "done":
            if doc.get("scope") != scope:
                raise ApiError(409, "idempotency_key_reused", "Idempotency-Key already used for another operation")
            if doc.get("error"):
                raise ApiError(doc["error"]["status"], doc["error"]["code"], doc["error"]["message"], doc["error"].get("details"))
            return {**doc["response"], "replayed": True}
        raise ApiError(409, "idempotency_in_progress", "This request is already being processed")
    try:
        res = await fn()
    except ApiError as e:
        await db.idempotency.update_one({"user_id": user_id, "key": key}, {"$set": {"status": "done", "error": {"status": e.status, "code": e.code, "message": e.message, "details": e.details}}})
        raise
    except Exception:
        await db.idempotency.delete_one({"user_id": user_id, "key": key})
        raise
    await db.idempotency.update_one({"user_id": user_id, "key": key}, {"$set": {"status": "done", "response": res}})
    return res


# -------------------------------------------------------------- pagination ---
def page_args(limit: int = 20, cursor: Optional[str] = None) -> tuple[int, int]:
    limit = max(1, min(100, int(limit)))
    try:
        off = int(base64.urlsafe_b64decode(cursor.encode()).decode()) if cursor else 0
    except Exception:
        raise ApiError(400, "bad_cursor", "Invalid cursor")
    return limit, max(0, off)


def next_cursor(off: int, limit: int, got: int) -> Optional[str]:
    return base64.urlsafe_b64encode(str(off + limit).encode()).decode() if got == limit else None
