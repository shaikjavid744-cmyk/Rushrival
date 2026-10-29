"""Admin API (/api/v1/admin/*) — cookie session + CSRF + TOTP realm; every privileged write is audited."""

import copy
import csv
import io
import os
import re
from html import escape
from datetime import timedelta
from typing import Any, Literal, Optional

import pyotp
from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from .. import billing as B
from .. import live
from ..admin_core import (COOKIE, COOKIE_PATH, ROLES, admin_session, audit, check_locked, create_session, mask, mfa_token, perm, public_admin,
                          read_mfa_token, record_failure, set_cookie)
from ..core import ApiError, auth_rate, day_key, get_db, hash_password, idem_key, idempotent, new_id, next_cursor, now, page_args, verify_password
from ..economy import apply
from ..mailer import try_send

router = APIRouter(prefix="/admin", tags=["admin"])
Confirm = Literal[True]


async def _mail(to: Optional[str], subject: str, html: str) -> tuple[bool, Optional[str]]:
    return await try_send(to=to, subject=subject, html=html)


# ---------------------------------------------------------------- auth -----
class Login(BaseModel):
    email: str = Field(max_length=200)  # T1: EmailStr rejected the seeded *.test admin emails (special-use TLD)
    password: str = Field(max_length=200)


@router.post("/auth/login", dependencies=[Depends(auth_rate)])
async def login(body: Login, request: Request):
    db = get_db()
    a = await db.admins.find_one({"email": body.email.lower()}, {"_id": 0})
    if not a or a.get("disabled"):
        raise ApiError(401, "invalid_credentials", "Wrong email or password")
    await check_locked(a)
    if not verify_password(body.password, a["password_hash"]):
        await record_failure(a)
        raise ApiError(401, "invalid_credentials", "Wrong email or password")
    return {"mfa_token": mfa_token(a["admin_id"]), "mfa_enrolled": bool(a.get("totp_enrolled"))}


class MfaReq(BaseModel):
    mfa_token: str


@router.post("/auth/totp/enroll", dependencies=[Depends(auth_rate)])
async def totp_enroll(body: MfaReq):
    db = get_db()
    a = await db.admins.find_one({"admin_id": read_mfa_token(body.mfa_token)}, {"_id": 0})
    if not a or a.get("disabled"):
        raise ApiError(401, "mfa_token_invalid", "Sign in again")
    if a.get("totp_enrolled"):
        raise ApiError(409, "mfa_already_enrolled", "TOTP is already set up")
    secret = pyotp.random_base32()
    await db.admins.update_one({"admin_id": a["admin_id"]}, {"$set": {"totp_pending": secret}})
    # Shown ONCE, during enrolment only (QR = otpauth_uri). Never returned afterwards.
    return {"secret": secret, "otpauth_uri": pyotp.TOTP(secret).provisioning_uri(name=a["email"], issuer_name="Rush Rivals Admin")}


class Verify(MfaReq):
    code: str = Field(pattern=r"^\d{6}$")


@router.post("/auth/totp/verify", dependencies=[Depends(auth_rate)])
async def totp_verify(body: Verify, request: Request, response: Response):
    db = get_db()
    a = await db.admins.find_one({"admin_id": read_mfa_token(body.mfa_token)}, {"_id": 0})
    if not a or a.get("disabled"):
        raise ApiError(401, "mfa_token_invalid", "Sign in again")
    await check_locked(a)
    secret = a.get("totp_secret") if a.get("totp_enrolled") else a.get("totp_pending")
    if not secret:
        raise ApiError(409, "mfa_enrolment_required", "Set up TOTP first")
    totp, t = pyotp.TOTP(secret), now()
    step = next((totp.timecode(t) + off for off in (0, -1, 1) if totp.at(t, off) == body.code), None)
    if step is None:
        await record_failure(a)
        raise ApiError(401, "invalid_code", "Wrong code")
    # replay protection: each 30-s code is single-use (atomic compare-and-set on the last used step)
    r = await db.admins.update_one({"admin_id": a["admin_id"], "$or": [{"totp_last_step": {"$lt": step}}, {"totp_last_step": {"$exists": False}}]}, {"$set": {"totp_last_step": step}})
    if not r.modified_count:
        await record_failure(a)
        raise ApiError(401, "code_already_used", "That code was already used — wait for the next one")
    if not a.get("totp_enrolled"):
        await db.admins.update_one({"admin_id": a["admin_id"]}, {"$set": {"totp_secret": secret, "totp_enrolled": True}, "$unset": {"totp_pending": ""}})
    await db.admins.update_one({"admin_id": a["admin_id"]}, {"$set": {"failures": [], "last_login_at": now()}, "$unset": {"locked_until": ""}})
    token, s = await create_session(a, request)
    set_cookie(response, token)
    await audit(request, a, "auth.sign_in", a["admin_id"], None, {"session_id": s["session_id"]})
    a = await db.admins.find_one({"admin_id": a["admin_id"]}, {"_id": 0})
    return {"admin": public_admin(a), "csrf_token": s["csrf"], "idle_timeout_s": 1800, "max_session_s": 43200}


@router.get("/me")
async def me(ctx=Depends(admin_session)):
    a, s = ctx
    return {"admin": public_admin(a), "csrf_token": s["csrf"], "session_id": s["session_id"]}


@router.post("/auth/logout")
async def logout(request: Request, response: Response, ctx=Depends(admin_session)):
    a, s = ctx
    await get_db().admin_sessions.update_one({"session_id": s["session_id"]}, {"$set": {"revoked": True}})
    response.delete_cookie(COOKIE, path=COOKIE_PATH)
    await audit(request, a, "auth.sign_out", s["session_id"])
    return {"ok": True}


@router.get("/sessions")
async def sessions(ctx=Depends(admin_session)):
    a, cur = ctx
    items = [{**{k: s[k] for k in ("session_id", "ip", "user_agent", "created_at", "last_seen")}, "current": s["session_id"] == cur["session_id"]}
             async for s in get_db().admin_sessions.find({"admin_id": a["admin_id"], "revoked": False}).sort("last_seen", -1)]
    return {"items": items}


@router.post("/sessions/{session_id}/revoke")
async def revoke_session(session_id: str, request: Request, ctx=Depends(admin_session)):
    a, _ = ctx
    r = await get_db().admin_sessions.update_one({"session_id": session_id, "admin_id": a["admin_id"]}, {"$set": {"revoked": True}})
    if not r.matched_count:
        raise ApiError(404, "not_found", "Session not found")
    await audit(request, a, "auth.revoke_session", session_id)
    return {"ok": True}


@router.post("/sessions/revoke-all")
async def revoke_all(request: Request, ctx=Depends(admin_session)):
    a, _ = ctx
    r = await get_db().admin_sessions.update_many({"admin_id": a["admin_id"], "revoked": False}, {"$set": {"revoked": True}})
    await audit(request, a, "auth.sign_out_everywhere", a["admin_id"], None, {"revoked": r.modified_count})
    return {"ok": True, "revoked": r.modified_count}


# -------------------------------------------------------------- admins -----
class NewAdmin(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$", max_length=200)
    password: str = Field(min_length=12, max_length=200)
    name: str = Field(min_length=1, max_length=60)
    role: Literal["owner", "liveops_editor", "publisher", "support", "finance", "moderator", "viewer"]


class EditAdmin(BaseModel):
    role: Optional[Literal["owner", "liveops_editor", "publisher", "support", "finance", "moderator", "viewer"]] = None
    disabled: Optional[bool] = None


@router.get("/admins")
async def list_admins(_=Depends(perm("admins", "manage_admins"))):
    return {"items": [public_admin(a) async for a in get_db().admins.find({}, {"_id": 0}).sort("created_at", 1)], "roles": {k: sorted(v) for k, v in ROLES.items()}}


@router.post("/admins", status_code=201)
async def create_admin(body: NewAdmin, request: Request, a=Depends(perm("admins", "manage_admins"))):
    doc = {"admin_id": new_id("adm"), "email": body.email.lower(), "name": body.name, "role": body.role, "password_hash": hash_password(body.password),
           "totp_enrolled": False, "disabled": False, "failures": [], "created_by": a["admin_id"], "created_at": now()}
    try:
        await get_db().admins.insert_one(doc)
    except DuplicateKeyError:
        raise ApiError(409, "email_taken", "An admin with this email exists")
    out = public_admin(doc)
    await audit(request, a, "admins.create", doc["admin_id"], None, {"email": doc["email"], "role": doc["role"]})
    return out


async def _owner_guard(target: dict, body: EditAdmin):
    if target["role"] == "owner" and (body.disabled or (body.role and body.role != "owner")):
        if await get_db().admins.count_documents({"role": "owner", "disabled": {"$ne": True}}) <= 1:
            raise ApiError(409, "last_owner", "Can't demote or disable the last Owner")


@router.patch("/admins/{admin_id}")
async def edit_admin(admin_id: str, body: EditAdmin, request: Request, a=Depends(perm("admins", "manage_admins"))):
    db = get_db()
    t = await db.admins.find_one({"admin_id": admin_id}, {"_id": 0})
    if not t:
        raise ApiError(404, "not_found", "Admin not found")
    await _owner_guard(t, body)
    upd = body.model_dump(exclude_none=True)
    await db.admins.update_one({"admin_id": admin_id}, {"$set": upd})
    if upd.get("disabled"):
        await db.admin_sessions.update_many({"admin_id": admin_id}, {"$set": {"revoked": True}})
    await audit(request, a, "admins.edit", admin_id, {k: t.get(k) for k in upd}, upd)
    return public_admin(await db.admins.find_one({"admin_id": admin_id}, {"_id": 0}))


@router.post("/admins/{admin_id}/reset-mfa")
async def reset_mfa(admin_id: str, request: Request, a=Depends(perm("admins", "manage_admins"))):
    db = get_db()
    r = await db.admins.update_one({"admin_id": admin_id}, {"$set": {"totp_enrolled": False}, "$unset": {"totp_secret": "", "totp_pending": ""}})
    if not r.matched_count:
        raise ApiError(404, "not_found", "Admin not found")
    await db.admin_sessions.update_many({"admin_id": admin_id}, {"$set": {"revoked": True}})
    await audit(request, a, "admins.reset_mfa", admin_id)
    return {"ok": True}


# ----------------------------------------------------------- dashboard -----
@router.get("/dashboard")
async def dashboard(_=Depends(perm("dashboard", "view"))):
    db = get_db()
    t = now()
    week = t - timedelta(days=7)
    runs_today = {"day": day_key(), "status": "finished"}
    avg = [d async for d in db.runs.aggregate([{"$match": {"status": "finished", "finished_at": {"$gte": week}}}, {"$group": {"_id": None, "avg": {"$avg": "$report.duration"}}}])]
    return {
        "generated_at": t,
        "players": {"total": await db.users.count_documents({}), "new_7d": await db.users.count_documents({"created_at": {"$gte": week}}),
                    "dau": len(await db.runs.distinct("user_id", {"day": day_key()})), "wau": len(await db.runs.distinct("user_id", {"created_at": {"$gte": week}}))},
        "runs": {"today": await db.runs.count_documents(runs_today), "avg_duration_s_7d": round(avg[0]["avg"], 1) if avg and avg[0]["avg"] else None},
        "purchases": {"verified": await db.iap_purchases.count_documents({"revoked": False}), "refunded": await db.iap_purchases.count_documents({"revoked": True}),
                      "revenue_by_currency": None, "revenue_note": "Verified revenue needs Google Play price data (Play Developer Reporting API) — not connected"},
        "ads": {"rewards_granted": await db.ad_rewards.count_documents({}), "admob": {"connected": False, "label": "AdMob revenue requires AdMob API connection"}},
        "support": {"open_tickets": await db.tickets.count_documents({"status": {"$ne": "closed"}}), "open_reports": await db.reports.count_documents({"status": {"$in": ["open", "reviewing", None]}})},
        "crashes": {"connected": False, "label": "Connect Firebase to see crashes"},
    }


# ------------------------------------------------------------- players -----
USER_FIELDS = ("user_id", "email", "name", "created_at", "wallet", "inventory", "equipped", "stats", "banned", "ban_reason", "suspended_until", "prefs", "ad_progress", "role", "seed")
USER_PROJ = {"_id": 0, **{f: 1 for f in USER_FIELDS}}


def _ledger_out(e: dict) -> dict:
    return {**{k: v for k, v in e.items() if k != "_id"}, "ref": mask(e.get("ref"))}


def _purchase_out(p: dict) -> dict:
    return {**{k: v for k, v in p.items() if k not in ("_id", "purchase_token")}, "purchase_token": mask(p.get("purchase_token"))}


@router.get("/players")
async def search_players(q: str = "", limit: int = 20, cursor: Optional[str] = None, _=Depends(perm("players", "view"))):
    lim, off = page_args(limit, cursor)
    rx = {"$regex": re.escape(q.strip()), "$options": "i"}
    flt = {"$or": [{"email": rx}, {"name": rx}, {"user_id": q.strip()}]} if q.strip() else {}
    items = [u async for u in get_db().users.find(flt, USER_PROJ).sort("created_at", -1).skip(off).limit(lim)]
    return {"items": items, "next_cursor": next_cursor(off, lim, len(items))}


@router.get("/players/{user_id}")
async def player_detail(user_id: str, _=Depends(perm("players", "view"))):
    db = get_db()
    u = await db.users.find_one({"user_id": user_id}, USER_PROJ)
    if not u:
        raise ApiError(404, "not_found", "Player not found")
    return {
        "player": u,
        "ledger": [_ledger_out(e) async for e in db.ledger.find({"user_id": user_id}).sort("created_at", -1).limit(50)],
        "entitlements": [e["entitlement"] async for e in db.entitlements.find({"owner": user_id, "active": True})],
        "purchases": [_purchase_out(p) async for p in db.iap_purchases.find({"owner": user_id}).sort("created_at", -1).limit(50)],
        "runs": [{k: r.get(k) for k in ("run_id", "mode", "status", "world", "day", "created_at", "report", "granted")} async for r in db.runs.find({"user_id": user_id}).sort("created_at", -1).limit(20)],
        "reports": [{k: v for k, v in r.items() if k != "_id"} async for r in db.reports.find({"target_user_id": user_id}).sort("created_at", -1).limit(20)],
        "tickets": [{k: v for k, v in t.items() if k != "_id"} async for t in db.tickets.find({"user_id": user_id}).sort("created_at", -1).limit(20)],
    }


class Compensate(BaseModel):
    coins: int = Field(default=0, ge=0, le=1_000_000)
    gems: int = Field(default=0, ge=0, le=10_000)
    hoverboards: int = Field(default=0, ge=0, le=100)
    reason: str = Field(min_length=5, max_length=300)


@router.post("/players/{user_id}/compensate")
async def compensate(user_id: str, body: Compensate, request: Request, a=Depends(perm("economy", "edit"))):
    key = idem_key(request)
    delta = {k: v for k, v in (("coins", body.coins), ("gems", body.gems), ("hoverboards", body.hoverboards)) if v}
    if not delta:
        raise ApiError(400, "validation_error", "Grant at least one currency")

    async def run():
        if not await get_db().users.find_one({"user_id": user_id}, {"_id": 1}):
            raise ApiError(404, "not_found", "Player not found")
        wallet = await apply(user_id, delta, "admin_compensation", f"{a['admin_id']}:{key}")
        await audit(request, a, "players.compensate", user_id, None, {"delta": delta, "reason": body.reason, "idempotency_key": key})
        return {"ok": True, "wallet": wallet}

    return await idempotent(f"admin:{a['admin_id']}", key, f"comp:{user_id}", run)


class Enforce(BaseModel):
    action: Literal["ban", "suspend", "unban"]
    reason: str = Field(min_length=5, max_length=300)
    confirm: Confirm
    days: Optional[int] = Field(default=None, ge=1, le=365)


@router.post("/players/{user_id}/enforce")
async def enforce(user_id: str, body: Enforce, request: Request, a=Depends(perm("players", "enforce"))):
    db = get_db()
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "banned": 1, "suspended_until": 1})
    if not u:
        raise ApiError(404, "not_found", "Player not found")
    if body.action == "unban":
        upd = {"$set": {"banned": False}, "$unset": {"ban_reason": "", "suspended_until": ""}}
    else:
        until = now() + timedelta(days=body.days or 7) if body.action == "suspend" else None
        upd = {"$set": {"banned": True, "ban_reason": body.reason, "suspended_until": until}}
        await db.refresh_tokens.update_many({"user_id": user_id}, {"$set": {"revoked": True}})
    await db.users.update_one({"user_id": user_id}, upd)
    await audit(request, a, f"players.{body.action}", user_id, u, {"reason": body.reason, "days": body.days})
    return {"ok": True}


@router.get("/deletion-requests")
async def deletion_requests(_=Depends(perm("players", "view"))):
    return {"items": [r async for r in get_db().deletion_requests.find({}, {"_id": 0, "ip": 0}).sort("created_at", -1).limit(100)]}


# ------------------------------------------------------------- reports -----
@router.get("/reports")
async def reports(status: Optional[str] = None, limit: int = 20, cursor: Optional[str] = None, _=Depends(perm("reports", "view"))):
    lim, off = page_args(limit, cursor)
    items = [r async for r in get_db().reports.find({"status": status} if status else {}, {"_id": 0}).sort("created_at", -1).skip(off).limit(lim)]
    return {"items": items, "next_cursor": next_cursor(off, lim, len(items))}


class ReportUpd(BaseModel):
    status: Literal["open", "reviewing", "actioned", "dismissed"]
    note: str = Field(default="", max_length=500)


@router.patch("/reports/{report_id}")
async def update_report(report_id: str, body: ReportUpd, request: Request, a=Depends(perm("reports", "edit"))):
    db = get_db()
    before = await db.reports.find_one({"report_id": report_id}, {"_id": 0})
    if not before:
        raise ApiError(404, "not_found", "Report not found")
    await db.reports.update_one({"report_id": report_id}, {"$set": {"status": body.status, "updated_at": now()},
                                                          "$push": {"notes": {"admin_id": a["admin_id"], "status": body.status, "note": body.note, "at": now()}}})
    await audit(request, a, "reports.update", report_id, {"status": before.get("status")}, body.model_dump())
    return await db.reports.find_one({"report_id": report_id}, {"_id": 0})


# -------------------------------------------------------------- ledger -----
@router.get("/ledger")
async def ledger(user_id: Optional[str] = None, reason: Optional[str] = None, date_from: Optional[str] = None, date_to: Optional[str] = None,
                 limit: int = 50, cursor: Optional[str] = None, _=Depends(perm("economy", "view"))):
    from datetime import datetime
    lim, off = page_args(limit, cursor)
    f: dict[str, Any] = {}
    if user_id:
        f["user_id"] = user_id
    if reason:
        f["reason"] = reason
    rng = {}
    try:
        if date_from:
            rng["$gte"] = datetime.fromisoformat(date_from)
        if date_to:
            rng["$lte"] = datetime.fromisoformat(date_to)
    except ValueError:
        raise ApiError(400, "validation_error", "Dates must be ISO 8601")
    if rng:
        f["created_at"] = rng
    items = [_ledger_out(e) async for e in get_db().ledger.find(f).sort("created_at", -1).skip(off).limit(lim)]
    return {"items": items, "next_cursor": next_cursor(off, lim, len(items))}


# ------------------------------------------------------ config workflow -----
SECTIONS = ("remote", "catalog", "missions", "achievements", "daily_rewards", "events")


class ConfigData(BaseModel):
    remote: dict
    catalog: dict[str, dict[str, dict]]
    missions: list[dict]
    achievements: list[dict]
    daily_rewards: list[dict] = Field(min_length=7, max_length=7)
    events: list[dict] = []


class Draft(BaseModel):
    data: Optional[ConfigData] = None
    note: str = Field(default="", max_length=300)


def _validate(d: dict):
    """Pure check (never touches the live tables)."""
    errs = []
    for kind, items in d["catalog"].items():
        if kind not in ("character", "board", "world"):
            errs.append(f"catalog.{kind}: unknown kind")
        for i, it in items.items():
            p = it.get("price")
            if not (p is None or p == "ad" or (isinstance(p, dict) and p.get("currency") in ("coins", "gems") and isinstance(p.get("amount"), int) and p["amount"] >= 0)):
                errs.append(f"catalog.{kind}.{i}.price: must be null, 'ad' or {{currency: coins|gems, amount: int>=0}}")
    for name in ("missions", "achievements"):
        if any(not isinstance(m.get("id"), str) or not isinstance(m.get("target"), int) for m in d[name]):
            errs.append(f"{name}: each needs id (str) and target (int)")
    for e in d.get("events", []):
        if not all(k in e for k in ("event_id", "starts_at", "ends_at")):
            errs.append("events: each needs event_id, starts_at, ends_at")
    if errs:
        raise ApiError(400, "validation_error", "Invalid config", {"errors": errs})


def _diff(a: Any, b: Any, path: str = "") -> list[dict]:
    if isinstance(a, dict) and isinstance(b, dict):
        out = []
        for k in sorted(set(a) | set(b), key=str):
            out += _diff(a.get(k), b.get(k), f"{path}.{k}" if path else str(k))
        return out
    return [] if a == b else [{"path": path, "before": a, "after": b}]


async def _next_version() -> int:
    last = await get_db().config_versions.find_one({}, {"version": 1}, sort=[("version", -1)])
    return (last["version"] if last else 0) + 1


async def _get_version(v: int) -> dict:
    d = await get_db().config_versions.find_one({"version": v}, {"_id": 0})
    if not d:
        raise ApiError(404, "not_found", "Config version not found")
    return d


async def _insert_version(doc: dict) -> dict:
    for _ in range(5):
        doc["version"] = await _next_version()
        try:
            await get_db().config_versions.insert_one(doc)
            doc.pop("_id", None)
            return doc
        except DuplicateKeyError:
            continue
    raise ApiError(409, "conflict", "Try again")


async def _make_live(doc: dict):
    db = get_db()
    prev = await live.published()
    await db.config_versions.update_many({"status": "published", "version": {"$ne": doc["version"]}}, {"$set": {"status": "superseded"}})
    pub = await live.published()
    live.apply(copy.deepcopy(pub["data"]), pub["version"])
    await live.sync_db(pub["data"], pub["version"])
    return prev


@router.get("/config/published")
async def config_published(_=Depends(perm("config", "view"))):
    return await live.published()


@router.get("/config/versions")
async def config_versions(limit: int = 20, cursor: Optional[str] = None, _=Depends(perm("config", "view"))):
    lim, off = page_args(limit, cursor)
    items = [v async for v in get_db().config_versions.find({}, {"_id": 0, "data": 0}).sort("version", -1).skip(off).limit(lim)]
    return {"items": items, "next_cursor": next_cursor(off, lim, len(items))}


@router.get("/config/versions/{v}")
async def config_version(v: int, _=Depends(perm("config", "view"))):
    return await _get_version(v)


@router.get("/config/versions/{v}/diff")
async def config_diff(v: int, _=Depends(perm("config", "view"))):
    d, pub = await _get_version(v), await live.published()
    return {"version": v, "against": pub["version"], "changes": _diff(pub["data"], d["data"])}


@router.post("/config/drafts", status_code=201)
async def create_draft(body: Draft, request: Request, a=Depends(perm("config", "edit"))):
    pub = await live.published()
    data = body.data.model_dump() if body.data else copy.deepcopy(pub["data"])
    _validate(data)
    doc = await _insert_version({"status": "draft", "data": data, "note": body.note, "author": a["admin_id"], "base_version": pub["version"], "created_at": now()})
    await audit(request, a, "config.draft_create", f"v{doc['version']}", None, {"note": body.note})
    return doc


@router.put("/config/drafts/{v}")
async def update_draft(v: int, body: Draft, request: Request, a=Depends(perm("config", "edit"))):
    d = await _get_version(v)
    if d["status"] != "draft":
        raise ApiError(409, "not_editable", "Only drafts can be edited; published versions are immutable")
    if not body.data:
        raise ApiError(400, "validation_error", "data is required")
    data = body.data.model_dump()
    _validate(data)
    await get_db().config_versions.update_one({"version": v, "status": "draft"}, {"$set": {"data": data, "note": body.note or d.get("note", ""), "author": a["admin_id"], "updated_at": now()}})
    await audit(request, a, "config.draft_update", f"v{v}", None, {"changes": _diff(d["data"], data)})
    return await _get_version(v)


async def _transition(v: int, frm: str, to: str, extra: dict, request: Request, a: dict, action: str):
    r = await get_db().config_versions.find_one_and_update({"version": v, "status": frm}, {"$set": {"status": to, **extra}}, projection={"_id": 0}, return_document=ReturnDocument.AFTER)
    if not r:
        raise ApiError(409, "invalid_state", f"Version must be '{frm}'")
    await audit(request, a, action, f"v{v}", {"status": frm}, {"status": to, **{k: val for k, val in extra.items() if k != "updated_at"}})
    return r


@router.post("/config/versions/{v}/submit")
async def submit(v: int, request: Request, a=Depends(perm("config", "edit"))):
    return await _transition(v, "draft", "pending_approval", {"submitted_at": now(), "submitted_by": a["admin_id"]}, request, a, "config.submit")


@router.post("/config/versions/{v}/approve")
async def approve(v: int, request: Request, a=Depends(perm("config", "approve"))):
    d = await _get_version(v)
    if a["admin_id"] in (d.get("author"), d.get("submitted_by")):
        await audit(request, a, "config.approve_rejected_four_eyes", f"v{v}")
        raise ApiError(403, "four_eyes", "You can't approve a change you authored — another admin must approve it")
    return await _transition(v, "pending_approval", "approved", {"approver": a["admin_id"], "approved_at": now()}, request, a, "config.approve")


class Reject(BaseModel):
    note: str = Field(min_length=3, max_length=300)


@router.post("/config/versions/{v}/reject")
async def reject(v: int, body: Reject, request: Request, a=Depends(perm("config", "approve"))):
    return await _transition(v, "pending_approval", "rejected", {"rejected_by": a["admin_id"], "reject_note": body.note}, request, a, "config.reject")


class ConfirmBody(BaseModel):
    confirm: bool = False


@router.post("/config/versions/{v}/publish")
async def publish(v: int, body: ConfirmBody, request: Request, a=Depends(perm("config", "publish"))):
    d = await _get_version(v)
    pub = await live.published()
    if d.get("base_version") is not None and d["base_version"] != pub["version"] and not body.confirm:
        raise ApiError(409, "stale_draft", f"This draft was based on v{d['base_version']} but v{pub['version']} is live now — publishing replaces those later changes. Review the diff and confirm to publish.",
                       {"base_version": d["base_version"], "live_version": pub["version"]})
    if d["data"]["remote"].get("maintenance") and not pub["data"]["remote"].get("maintenance") and not body.confirm:
        raise ApiError(400, "confirmation_required", "This version turns maintenance ON — confirm to publish")
    await _transition(v, "approved", "published", {"publisher": a["admin_id"], "published_at": now()}, request, a, "config.publish")
    await _make_live(d)
    return await _get_version(v)


class Rollback(BaseModel):
    version: int
    confirm: Confirm
    note: str = Field(default="", max_length=300)


@router.post("/config/rollback")
async def rollback(body: Rollback, request: Request, a=Depends(perm("config", "publish"))):
    src = await _get_version(body.version)
    if not src.get("published_at"):
        raise ApiError(400, "not_published", "Only previously published versions can be restored")
    prev = await live.published()
    doc = await _insert_version({"status": "published", "data": src["data"], "note": body.note or f"Rollback to v{body.version}", "rollback_of": body.version,
                                 "author": a["admin_id"], "approver": a["admin_id"], "publisher": a["admin_id"], "created_at": now(), "published_at": now()})
    await _make_live(doc)
    await audit(request, a, "config.rollback", f"v{doc['version']}", {"version": prev["version"] if prev else None}, {"restored": body.version})
    return doc


class Quick(BaseModel):
    maintenance: Optional[bool] = None
    flags: Optional[dict[str, bool]] = None
    confirm: Confirm


@router.post("/config/quick")
async def quick_toggle(body: Quick, request: Request, a=Depends(perm("config", "publish"))):
    """Maintenance / feature flags toggle (explicit confirmation) → published as a new immutable version."""
    pub = await live.published()
    data = copy.deepcopy(pub["data"])
    if body.maintenance is not None:
        data["remote"]["maintenance"] = body.maintenance
    if body.flags:
        data["remote"].setdefault("flags", {}).update(body.flags)
    doc = await _insert_version({"status": "published", "data": data, "note": "Quick toggle", "kind": "quick_toggle", "author": a["admin_id"], "approver": a["admin_id"],
                                 "publisher": a["admin_id"], "created_at": now(), "published_at": now()})
    await _make_live(doc)
    await audit(request, a, "config.quick_toggle", f"v{doc['version']}", {"maintenance": pub["data"]["remote"].get("maintenance"), "flags": pub["data"]["remote"].get("flags")},
                {"maintenance": data["remote"]["maintenance"], "flags": data["remote"].get("flags")})
    return doc


@router.get("/catalog")
async def admin_catalog(_=Depends(perm("catalog", "view"))):
    pub = await live.published()
    return {"version": pub["version"], **{k: pub["data"][k] for k in SECTIONS if k != "remote"}}


@router.get("/release")
async def release(_=Depends(perm("release", "view"))):
    r = (await live.published())["data"]["remote"]
    return {k: r.get(k) for k in ("min_supported_version", "latest_version", "release_notes", "store_url_android")}


# ------------------------------------------------------------- content -----
class News(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=80)
    summary: str = Field(min_length=3, max_length=300)
    body: str = Field(min_length=3, max_length=20000)
    image_url: Optional[str] = Field(default=None, max_length=300)


class NewsPatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=3, max_length=120)
    summary: Optional[str] = Field(default=None, max_length=300)
    body: Optional[str] = Field(default=None, max_length=20000)
    image_url: Optional[str] = Field(default=None, max_length=300)


class Faq(BaseModel):
    question: str = Field(min_length=3, max_length=200)
    answer: str = Field(min_length=3, max_length=4000)
    order: int = 0


class FaqPatch(BaseModel):
    question: Optional[str] = Field(default=None, min_length=3, max_length=200)
    answer: Optional[str] = Field(default=None, min_length=3, max_length=4000)
    order: Optional[int] = None


class Publish(BaseModel):
    inbox: bool = False


def _content(kind: str):
    coll, key = ("news", "news_id") if kind == "news" else ("faq", "faq_id")
    return coll, key


for _kind, _New, _Patch in (("news", News, NewsPatch), ("faq", Faq, FaqPatch)):
    def _routes(kind=_kind, New=_New, Patch=_Patch):
        coll, key = _content(kind)

        @router.get(f"/{kind}", name=f"list_{kind}")
        async def list_items(_=Depends(perm("content", "view"))):
            return {"items": [d async for d in get_db()[coll].find({}, {"_id": 0}).sort("created_at", -1)]}

        @router.post(f"/{kind}", status_code=201, name=f"create_{kind}")
        async def create(body: New, request: Request, a=Depends(perm("content", "edit"))):
            doc = {key: new_id(kind), **body.model_dump(), "status": "draft", "created_by": a["admin_id"], "created_at": now(), "updated_at": now()}
            try:
                await get_db()[coll].insert_one(doc)
            except DuplicateKeyError:
                raise ApiError(409, "slug_taken", "That slug is already used")
            doc.pop("_id", None)
            await audit(request, a, f"{kind}.create", doc[key], None, body.model_dump())
            return doc

        @router.patch(f"/{kind}/{{item_id}}", name=f"edit_{kind}")
        async def edit(item_id: str, body: Patch, request: Request, a=Depends(perm("content", "edit"))):
            db = get_db()
            before = await db[coll].find_one({key: item_id}, {"_id": 0})
            if not before:
                raise ApiError(404, "not_found", "Not found")
            upd = body.model_dump(exclude_none=True)
            await db[coll].update_one({key: item_id}, {"$set": {**upd, "updated_at": now()}})
            await audit(request, a, f"{kind}.edit", item_id, {k: before.get(k) for k in upd}, upd)
            return await db[coll].find_one({key: item_id}, {"_id": 0})

        @router.post(f"/{kind}/{{item_id}}/publish", name=f"publish_{kind}")
        async def pub(item_id: str, body: Publish, request: Request, a=Depends(perm("content", "publish"))):
            db = get_db()
            d = await db[coll].find_one_and_update({key: item_id}, {"$set": {"status": "published", "published_at": now(), "updated_at": now()}}, projection={"_id": 0}, return_document=ReturnDocument.AFTER)
            if not d:
                raise ApiError(404, "not_found", "Not found")
            if body.inbox and kind == "news":
                await db.messages.update_one({"msg_id": f"news_{item_id}"}, {"$setOnInsert": {"msg_id": f"news_{item_id}", "user_id": None, "title": d["title"], "body": d["summary"],
                                                                                            "attachment": None, "source": "news", "created_at": now()}}, upsert=True)
            await audit(request, a, f"{kind}.publish", item_id, None, {"inbox": body.inbox})
            return d

        @router.post(f"/{kind}/{{item_id}}/unpublish", name=f"unpublish_{kind}")
        async def unpub(item_id: str, request: Request, a=Depends(perm("content", "publish"))):
            db = get_db()
            d = await db[coll].find_one_and_update({key: item_id}, {"$set": {"status": "draft", "updated_at": now()}}, projection={"_id": 0}, return_document=ReturnDocument.AFTER)
            if not d:
                raise ApiError(404, "not_found", "Not found")
            await db.messages.delete_one({"msg_id": f"news_{item_id}"})
            await audit(request, a, f"{kind}.unpublish", item_id)
            return d

        @router.post(f"/{kind}/{{item_id}}/delete", name=f"delete_{kind}")
        async def delete(item_id: str, body: ConfirmBody, request: Request, a=Depends(perm("content", "publish"))):
            if not body.confirm:
                raise ApiError(400, "confirmation_required", "Confirm to delete")
            db = get_db()
            before = await db[coll].find_one_and_delete({key: item_id}, projection={"_id": 0})
            if not before:
                raise ApiError(404, "not_found", "Not found")
            await audit(request, a, f"{kind}.delete", item_id, before, None)
            return {"ok": True}

    _routes()


# ----------------------------------------------------------- purchases -----
@router.get("/purchases")
async def purchases(owner: Optional[str] = None, revoked: Optional[bool] = None, limit: int = 50, cursor: Optional[str] = None, _=Depends(perm("purchases", "view"))):
    lim, off = page_args(limit, cursor)
    f: dict[str, Any] = {}
    if owner:
        f["owner"] = owner
    if revoked is not None:
        f["revoked"] = revoked
    items = [_purchase_out(p) async for p in get_db().iap_purchases.find(f).sort("created_at", -1).skip(off).limit(lim)]
    return {"items": items, "next_cursor": next_cursor(off, lim, len(items))}


async def _purchase(pid: str) -> dict:
    p = await get_db().iap_purchases.find_one({"purchase_id": pid}, {"_id": 0})
    if not p:
        raise ApiError(404, "not_found", "Purchase not found")
    return p


@router.post("/purchases/{purchase_id}/reverify")
async def reverify(purchase_id: str, request: Request, a=Depends(perm("purchases", "refund"))):
    p = await _purchase(purchase_id)
    st = await B.provider_state(p["product_id"], p["purchase_token"])  # verification_unavailable (503) when Play isn't configured
    await get_db().iap_purchases.update_one({"purchase_id": purchase_id}, {"$set": {"verify_state": st["state"], "last_verified_at": now()}})
    await audit(request, a, "purchases.reverify", purchase_id, {"verify_state": p.get("verify_state")}, {"verify_state": st["state"]})
    return _purchase_out(await _purchase(purchase_id))


class Revoke(BaseModel):
    reason: str = Field(min_length=5, max_length=300)
    confirm: Confirm


@router.post("/purchases/{purchase_id}/revoke")
async def revoke(purchase_id: str, body: Revoke, request: Request, a=Depends(perm("purchases", "refund"))):
    p = await _purchase(purchase_id)
    done = await B.revoke(p["purchase_token"], f"admin: {body.reason}")
    await audit(request, a, "purchases.revoke", purchase_id, {"revoked": p.get("revoked")}, {"revoked": True, "reason": body.reason, "changed": done})
    return _purchase_out(await _purchase(purchase_id))


# ------------------------------------------------------------- tickets -----
@router.get("/tickets")
async def tickets(status: Optional[str] = None, limit: int = 20, cursor: Optional[str] = None, _=Depends(perm("tickets", "view"))):
    lim, off = page_args(limit, cursor)
    items = [t async for t in get_db().tickets.find({"status": status} if status else {}, {"_id": 0}).sort("created_at", -1).skip(off).limit(lim)]
    return {"items": items, "next_cursor": next_cursor(off, lim, len(items))}


async def _ticket(no: str) -> dict:
    t = await get_db().tickets.find_one({"ticket_no": no}, {"_id": 0})
    if not t:
        raise ApiError(404, "not_found", "Ticket not found")
    return t


@router.get("/tickets/{no}")
async def ticket(no: str, _=Depends(perm("tickets", "view"))):
    return await _ticket(no)


class Assign(BaseModel):
    admin_id: str


@router.post("/tickets/{no}/assign")
async def assign(no: str, body: Assign, request: Request, a=Depends(perm("tickets", "edit"))):
    t = await _ticket(no)
    if not await get_db().admins.find_one({"admin_id": body.admin_id}, {"_id": 1}):
        raise ApiError(404, "not_found", "Admin not found")
    await get_db().tickets.update_one({"ticket_no": no}, {"$set": {"assignee": body.admin_id, "updated_at": now()}})
    await audit(request, a, "tickets.assign", no, {"assignee": t.get("assignee")}, {"assignee": body.admin_id})
    return await _ticket(no)


class Reply(BaseModel):
    message: str = Field(min_length=2, max_length=4000)


@router.post("/tickets/{no}/reply")
async def reply(no: str, body: Reply, request: Request, a=Depends(perm("tickets", "edit"))):
    db = get_db()
    t = await _ticket(no)
    inbox = False
    if t.get("user_id"):
        await db.messages.insert_one({"msg_id": new_id("msg"), "user_id": t["user_id"], "title": f"Support reply · {no}", "body": body.message, "attachment": None, "source": "support", "created_at": now()})
        inbox = True
    email_to = t.get("email") or (await db.users.find_one({"user_id": t.get("user_id")}, {"email": 1}) or {}).get("email")
    brand = escape(os.environ["EMAIL_FROM_NAME"])
    html = (f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif">'
            f'<p>{escape(body.message)}</p><p>— {brand} Support · ticket {escape(no)}</p>'
            f'<p style="font-size:12px;color:#888">Sent by {brand}. We never ask for your password by email.</p></td></tr></table>')
    sent, reason = await _mail(email_to, f"{os.environ['EMAIL_FROM_NAME']} support — {no}", html)
    await db.tickets.update_one({"ticket_no": no}, {"$push": {"replies": {"admin_id": a["admin_id"], "message": body.message, "at": now(), "inbox": inbox, "email_sent": sent, "email_error": reason}},
                                                    "$set": {"status": "replied", "updated_at": now()}})
    await audit(request, a, "tickets.reply", no, None, {"inbox": inbox, "email_sent": sent, "email_error": reason})
    return {"ticket": await _ticket(no), "inbox": inbox, "email_sent": sent, "email_error": reason}


@router.post("/tickets/{no}/close")
async def close(no: str, request: Request, a=Depends(perm("tickets", "edit"))):
    t = await _ticket(no)
    await get_db().tickets.update_one({"ticket_no": no}, {"$set": {"status": "closed", "closed_at": now(), "updated_at": now()}})
    await audit(request, a, "tickets.close", no, {"status": t["status"]}, {"status": "closed"})
    return await _ticket(no)


# --------------------------------------------------------------- audit -----
def _audit_filter(admin_id: Optional[str], action: Optional[str], q: Optional[str]) -> dict:
    f: dict[str, Any] = {}
    if admin_id:
        f["admin_id"] = admin_id
    if action:
        f["action"] = {"$regex": f"^{re.escape(action)}"}
    if q:
        f["$or"] = [{"target": {"$regex": re.escape(q), "$options": "i"}}, {"admin_email": {"$regex": re.escape(q), "$options": "i"}}]
    return f


@router.get("/audit")
async def audit_log(admin_id: Optional[str] = None, action: Optional[str] = None, q: Optional[str] = None, limit: int = 50, cursor: Optional[str] = None, _=Depends(perm("audit", "view"))):
    lim, off = page_args(limit, cursor)
    items = [e async for e in get_db().admin_audit.find(_audit_filter(admin_id, action, q), {"_id": 0}).sort("time", -1).skip(off).limit(lim)]
    return {"items": items, "next_cursor": next_cursor(off, lim, len(items))}


@router.get("/audit/export.csv")
async def audit_csv(request: Request, admin_id: Optional[str] = None, action: Optional[str] = None, q: Optional[str] = None, a=Depends(perm("audit", "view"))):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["time", "admin_email", "admin_id", "action", "target", "before", "after", "ip"])
    import json
    def cell(v):
        v = "" if v is None else str(v)
        return "'" + v if v[:1] in ("=", "+", "-", "@", "\t", "\r") else v

    async for e in get_db().admin_audit.find(_audit_filter(admin_id, action, q), {"_id": 0}).sort("time", -1).limit(10000):
        w.writerow([cell(x) for x in [e["time"].isoformat(), e.get("admin_email"), e.get("admin_id"), e["action"], e["target"], json.dumps(e.get("before"), default=str), json.dumps(e.get("after"), default=str), e.get("ip")]])
    await audit(request, a, "audit.export", "audit_log", None, {"filters": {"admin_id": admin_id, "action": action, "q": q}})
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=rr-audit.csv"})
