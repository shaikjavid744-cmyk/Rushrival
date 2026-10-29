"""Accounts: email/password JWT, rotating refresh tokens, Emergent Google, reset codes, deletion, guest linking."""
from __future__ import annotations

import logging
import os
import re
import secrets
from datetime import timedelta
from html import escape
from typing import Literal, Optional

import httpx
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from ..core import ApiError, auth_rate, current_user, enforce_ban, get_db, hash_password, issue_tokens, new_id, now, sha256, verify_password
from ..economy import empty_wallet
from ..mailer import send_email

router = APIRouter(prefix="/auth", tags=["auth"])
log = logging.getLogger("rr.auth")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


class Register(BaseModel):
    email: str
    password: str
    name: Optional[str] = Field(default=None, max_length=24)


class Login(BaseModel):
    email: str
    password: str


class Refresh(BaseModel):
    refresh_token: str


class GoogleSession(BaseModel):
    session_id: str


class Forgot(BaseModel):
    email: str


class Reset(BaseModel):
    email: str
    code: str
    new_password: str


class DeleteReq(BaseModel):
    confirm: str


def public_user(u: dict) -> dict:
    return {k: u.get(k) for k in ("user_id", "email", "name", "provider", "picture", "wallet", "inventory", "equipped", "best_score", "level", "progress_initialized", "prefs", "created_at")}


async def create_user(email: str, name: str, provider: str, password_hash: Optional[str] = None, picture: Optional[str] = None) -> dict:
    u = {
        "user_id": new_id("usr"), "email": email, "name": name[:24] or "Runner", "provider": provider, "password_hash": password_hash, "picture": picture,
        "role": "player", "banned": False, "deleted": False, "wallet": empty_wallet(), "inventory": {"character": ["rush"], "board": ["default"], "world": ["city"]},
        "equipped": {"character": "rush", "board": "default", "world": "city"}, "best_score": 0, "progress_initialized": False,
        "stats": {"total_runs": 0, "total_coins": 0, "best_score": 0}, "day_stats": {}, "daily": {"last_day": None, "streak": 0},
        "prefs": {"notifications": False, "ad_personalisation": False}, "created_at": now(), "updated_at": now(),
    }
    await get_db().users.insert_one(dict(u))
    return u


def _email(e: str) -> str:
    e = e.strip().lower()
    if not EMAIL_RE.match(e):
        raise ApiError(400, "invalid_email", "Enter a valid email address")
    return e


@router.post("/register", status_code=201, dependencies=[Depends(auth_rate)])
async def register(body: Register):
    email = _email(body.email)
    if len(body.password) < 8:
        raise ApiError(400, "weak_password", "Password must be at least 8 characters")
    if await get_db().users.find_one({"email": email}):
        raise ApiError(409, "email_taken", "Email already registered")
    try:
        u = await create_user(email, body.name or email.split("@")[0], "password", hash_password(body.password))
    except Exception:
        raise ApiError(409, "email_taken", "Email already registered")
    return {"user": public_user(u), **await issue_tokens(u["user_id"])}


@router.post("/login", dependencies=[Depends(auth_rate)])
async def login(body: Login):
    u = await get_db().users.find_one({"email": body.email.strip().lower(), "deleted": {"$ne": True}}, {"_id": 0})
    if not u or not u.get("password_hash") or not verify_password(body.password, u["password_hash"]):
        raise ApiError(401, "invalid_credentials", "Sign-in failed. Check your details and try again.")
    await enforce_ban(u)
    return {"user": public_user(u), **await issue_tokens(u["user_id"])}


@router.post("/refresh", dependencies=[Depends(auth_rate)])
async def refresh(body: Refresh):
    """Rotate: old token is revoked; reuse of a revoked token revokes the whole family."""
    db = get_db()
    doc = await db.refresh_tokens.find_one_and_update({"token_hash": sha256(body.refresh_token), "revoked": False, "expires_at": {"$gt": now()}}, {"$set": {"revoked": True, "rotated_at": now()}})
    if not doc:
        old = await db.refresh_tokens.find_one({"token_hash": sha256(body.refresh_token)})
        if old:
            await db.refresh_tokens.update_many({"family": old["family"]}, {"$set": {"revoked": True}})
        raise ApiError(401, "invalid_refresh", "Session expired, sign in again")
    return await issue_tokens(doc["user_id"], doc["family"])


@router.post("/logout")
async def logout(body: Refresh, u: dict = Depends(current_user)):
    await get_db().refresh_tokens.update_many({"token_hash": sha256(body.refresh_token), "user_id": u["user_id"]}, {"$set": {"revoked": True}})
    return {"ok": True}


@router.post("/google", dependencies=[Depends(auth_rate)])
async def google(body: GoogleSession):
    """Emergent-managed Google sign-in: exchange session_id server-side, upsert by email, issue our tokens."""
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": body.session_id})
        r.raise_for_status()
        data = r.json()
    except Exception:
        raise ApiError(401, "google_failed", "Sign-in failed. Check your details and try again.")
    email = _email(data.get("email", ""))
    db = get_db()
    u = await db.users.find_one({"email": email, "deleted": {"$ne": True}}, {"_id": 0})
    if u:
        await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"picture": data.get("picture"), "google_name": data.get("name"), "updated_at": now()}})
    else:
        u = await create_user(email, data.get("name") or "Runner", "google", picture=data.get("picture"))
    return {"user": public_user(u), **await issue_tokens(u["user_id"])}


@router.post("/forgot-password", dependencies=[Depends(auth_rate)])
async def forgot(body: Forgot):
    """Always 200 (no account enumeration). Code: 6 digits, 15 min, single use, stored hashed."""
    db = get_db()
    email = body.email.strip().lower()
    u = await db.users.find_one({"email": email, "deleted": {"$ne": True}, "password_hash": {"$ne": None}}, {"_id": 0})
    if u:
        code = f"{secrets.randbelow(1_000_000):06d}"
        await db.reset_codes.update_many({"user_id": u["user_id"], "used": False}, {"$set": {"used": True}})
        await db.reset_codes.insert_one({"user_id": u["user_id"], "code_hash": sha256(f"{u['user_id']}:{code}"), "used": False, "attempts": 0, "expires_at": now() + timedelta(minutes=15), "created_at": now()})
        brand = escape(os.environ["EMAIL_FROM_NAME"])
        html = (f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif">'
                f'<p>Hi {escape(u["name"])},</p><p>Your {brand} password reset code is:</p>'
                f'<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{code}</p>'
                f'<p>Enter it in the app within 15 minutes. If you didn\'t ask for this, ignore this email.</p>'
                f'<p style="font-size:12px;color:#888">Sent by {brand}. We never ask for your password by email.</p></td></tr></table>')
        try:
            await send_email(to=email, subject=f"Your {os.environ['EMAIL_FROM_NAME']} reset code", html=html)
        except Exception as e:  # keep response uniform; owner sees the log
            log.warning("reset email failed: %s", e)
        if os.environ.get("EXPOSE_RESET_CODE_FOR_TESTS") == "1":
            return {"ok": True, "debug_code": code}
    return {"ok": True}


@router.post("/reset-password", dependencies=[Depends(auth_rate)])
async def reset(body: Reset):
    db = get_db()
    if len(body.new_password) < 8:
        raise ApiError(400, "weak_password", "Password must be at least 8 characters")
    u = await db.users.find_one({"email": body.email.strip().lower(), "deleted": {"$ne": True}}, {"_id": 0, "user_id": 1})
    bad = ApiError(400, "invalid_code", "That code is wrong or has expired")
    if not u:
        raise bad
    rc = await db.reset_codes.find_one({"user_id": u["user_id"], "used": False, "expires_at": {"$gt": now()}}, sort=[("created_at", -1)])
    if not rc or rc.get("attempts", 0) >= 5:
        raise bad
    if rc["code_hash"] != sha256(f"{u['user_id']}:{body.code.strip()}"):
        await db.reset_codes.update_one({"_id": rc["_id"]}, {"$inc": {"attempts": 1}})
        raise bad
    upd = await db.reset_codes.update_one({"_id": rc["_id"], "used": False}, {"$set": {"used": True}})
    if upd.modified_count != 1:
        raise bad
    await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"password_hash": hash_password(body.new_password), "updated_at": now()}})
    await db.refresh_tokens.update_many({"user_id": u["user_id"]}, {"$set": {"revoked": True}})
    return {"ok": True}


@router.post("/delete-account")
async def delete_account(body: DeleteReq, u: dict = Depends(current_user)):
    if body.confirm != "DELETE":
        raise ApiError(400, "confirmation_required", 'Type DELETE to confirm')
    db, uid = get_db(), u["user_id"]
    for col in ("refresh_tokens", "ledger", "runs", "scores", "idempotency", "claims", "reset_codes", "event_progress"):
        await db[col].delete_many({"user_id": uid})
    await db.tickets.update_many({"user_id": uid}, {"$set": {"user_id": None, "email": None}})
    await db.users.delete_one({"user_id": uid})
    return {"ok": True, "deleted": True}
