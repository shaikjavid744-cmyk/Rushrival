"""Admin realm (Phase 6): separate admin accounts, mandatory TOTP, lockout, cookie sessions + CSRF,
granular permissions per domain × action, immutable audit log."""
from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta
from typing import Any, Optional

import jwt
from fastapi import Depends, Request

from .core import JWT_SECRET, ApiError, client_ip, get_db, new_id, now

COOKIE = "rr_admin_session"
COOKIE_PATH = "/api/v1/admin"
IDLE = timedelta(minutes=30)
MAX_AGE = timedelta(hours=12)
LOCK_AFTER, LOCK_WINDOW, LOCK_FOR = 5, timedelta(minutes=15), timedelta(minutes=15)

DOMAINS = ["dashboard", "players", "economy", "reports", "catalog", "liveops", "content", "config", "release", "purchases", "tickets", "admins", "audit"]
ACTIONS = ["view", "edit", "publish", "approve", "refund", "enforce", "manage_admins"]


def _p(spec: dict[str, str]) -> set[str]:
    return {f"{d}:{a}" for d, acts in spec.items() for a in acts.split(",")}


_VIEW_OPS = {d: "view" for d in DOMAINS if d not in ("admins", "audit")}
ROLES: dict[str, set[str]] = {
    "owner": {f"{d}:{a}" for d in DOMAINS for a in ACTIONS},
    "liveops_editor": _p({"dashboard": "view", "catalog": "view,edit", "liveops": "view,edit", "config": "view,edit", "release": "view,edit", "content": "view,edit"}),
    "publisher": _p({"dashboard": "view", "catalog": "view", "liveops": "view", "config": "view,approve,publish", "release": "view", "content": "view,edit,publish"}),
    "support": _p({"dashboard": "view", "players": "view", "economy": "view,edit", "tickets": "view,edit", "reports": "view"}),
    "finance": _p({"dashboard": "view", "players": "view", "economy": "view", "purchases": "view,refund"}),
    "moderator": _p({"dashboard": "view", "players": "view,enforce", "reports": "view,edit"}),
    "viewer": _p(_VIEW_OPS),
}
ROLE_NAMES = {"owner": "Owner", "liveops_editor": "LiveOps Editor", "publisher": "Publisher", "support": "Support", "finance": "Finance", "moderator": "Moderator", "viewer": "Viewer"}


def sha(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def mask(s: Optional[str]) -> Optional[str]:
    return s if not s or len(s) <= 12 else f"{s[:4]}…{s[-4:]}"


def public_admin(a: dict) -> dict:
    return {"admin_id": a["admin_id"], "email": a["email"], "name": a.get("name"), "role": a["role"], "role_name": ROLE_NAMES[a["role"]],
            "disabled": a.get("disabled", False), "mfa_enrolled": bool(a.get("totp_enrolled")), "permissions": sorted(ROLES[a["role"]]), "created_at": a.get("created_at")}


def mfa_token(admin_id: str) -> str:
    return jwt.encode({"sub": admin_id, "typ": "admin_mfa", "exp": now() + timedelta(minutes=10)}, JWT_SECRET, algorithm="HS256")


def read_mfa_token(t: str) -> str:
    try:
        d = jwt.decode(t, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise ApiError(401, "mfa_token_invalid", "Sign in again")
    if d.get("typ") != "admin_mfa":
        raise ApiError(401, "mfa_token_invalid", "Sign in again")
    return d["sub"]


async def check_locked(a: dict):
    lu = a.get("locked_until")
    if lu and lu.replace(tzinfo=lu.tzinfo or now().tzinfo) > now():
        raise ApiError(423, "account_locked", "Too many failed attempts. Try again in 15 minutes.", {"locked_until": lu.replace(tzinfo=lu.tzinfo or now().tzinfo).isoformat()})


async def record_failure(a: dict):
    t = now()
    recent = [f for f in a.get("failures", []) if f.replace(tzinfo=f.tzinfo or t.tzinfo) > t - LOCK_WINDOW] + [t]
    upd: dict[str, Any] = {"failures": recent}
    if len(recent) >= LOCK_AFTER:
        upd.update(locked_until=t + LOCK_FOR, failures=[])
    await get_db().admins.update_one({"admin_id": a["admin_id"]}, {"$set": upd})
    if len(recent) >= LOCK_AFTER:
        raise ApiError(423, "account_locked", "Too many failed attempts. Try again in 15 minutes.")


async def create_session(a: dict, request: Request) -> tuple[str, dict]:
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
    s = {"session_id": new_id("ses"), "token_hash": sha(token), "admin_id": a["admin_id"], "csrf": csrf, "ip": client_ip(request),
         "user_agent": request.headers.get("user-agent", "")[:200], "created_at": now(), "last_seen": now(), "revoked": False}
    await get_db().admin_sessions.insert_one(s)
    return token, s


def set_cookie(resp, token: str):
    resp.set_cookie(COOKIE, token, httponly=True, secure=True, samesite="strict", path=COOKIE_PATH, max_age=int(MAX_AGE.total_seconds()))


async def admin_session(request: Request) -> tuple[dict, dict]:
    token = request.cookies.get(COOKIE)
    if not token:
        raise ApiError(401, "admin_unauthorized", "Admin sign-in required")
    db = get_db()
    s = await db.admin_sessions.find_one({"token_hash": sha(token)}, {"_id": 0})
    t = now()

    def aware(d):
        return d.replace(tzinfo=d.tzinfo or t.tzinfo)

    if not s or s["revoked"] or aware(s["last_seen"]) < t - IDLE or aware(s["created_at"]) < t - MAX_AGE:
        raise ApiError(401, "session_expired", "Your admin session expired. Sign in again.")
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get("X-CSRF-Token") != s["csrf"]:
        raise ApiError(403, "csrf_failed", "Missing or invalid CSRF token")
    a = await db.admins.find_one({"admin_id": s["admin_id"]}, {"_id": 0})
    if not a or a.get("disabled") or not a.get("totp_enrolled"):
        raise ApiError(401, "admin_unauthorized", "Admin sign-in required")
    await db.admin_sessions.update_one({"session_id": s["session_id"]}, {"$set": {"last_seen": t}})
    request.state.admin, request.state.session = a, s
    return a, s


def perm(domain: str, action: str):
    need = f"{domain}:{action}"

    async def dep(request: Request, ctx=Depends(admin_session)) -> dict:
        a, _ = ctx
        if need not in ROLES[a["role"]]:
            raise ApiError(403, "forbidden", f"Missing permission {need}")
        return a

    dep.required = need  # introspected by the permission-matrix test
    return dep


async def audit(request: Request, admin: dict | None, action: str, target: str, before: Any = None, after: Any = None):
    """Append-only: there is no API that updates or deletes audit entries."""
    await get_db().admin_audit.insert_one({"audit_id": new_id("aud"), "admin_id": admin["admin_id"] if admin else None, "admin_email": admin["email"] if admin else None,
                                          "action": action, "target": target, "before": before, "after": after, "ip": client_ip(request), "time": now()})
