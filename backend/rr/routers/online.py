"""Leaderboard, events, remote config/catalog, support tickets, moderation reports, server inbox."""
from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from pymongo import ReturnDocument

from .. import catalog as C
from ..core import ApiError, banned_filter, current_user, day_key, gameplay_rate, get_db, idem_key, idempotent, new_id, next_cursor, now, optional_user, page_args, week_key
from ..economy import apply

router = APIRouter(tags=["online"])


# ------------------------------------------------------------ leaderboard ---
@router.get("/leaderboard")
async def leaderboard(period: Literal["daily", "weekly", "all"] = "daily", limit: int = 20, cursor: Optional[str] = None, u: Optional[dict] = Depends(optional_user)):
    db = get_db()
    lim, off = page_args(limit, cursor)
    banned = [b["user_id"] async for b in db.users.find(banned_filter(), {"user_id": 1})]
    match: dict = {"user_id": {"$nin": banned}}
    if period == "daily":
        match["day"] = day_key()
    elif period == "weekly":
        match["week"] = week_key()
    base = [{"$match": match}, {"$group": {"_id": "$user_id", "score": {"$max": "$score"}, "name": {"$last": "$name"}}}]
    rows = await db.scores.aggregate(base + [{"$sort": {"score": -1, "_id": 1}}, {"$skip": off}, {"$limit": lim}]).to_list(lim)
    items = [{"rank": off + i + 1, "user_id": r["_id"], "name": r["name"], "score": r["score"], "me": bool(u and r["_id"] == u["user_id"])} for i, r in enumerate(rows)]
    mine = None
    if u:
        best = await db.scores.aggregate(base + [{"$match": {"_id": u["user_id"]}}]).to_list(1)
        if best:
            higher = await db.scores.aggregate(base + [{"$match": {"score": {"$gt": best[0]["score"]}}}, {"$count": "n"}]).to_list(1)
            mine = {"rank": (higher[0]["n"] if higher else 0) + 1, "score": best[0]["score"], "name": u["name"]}
    return {"period": period, "items": items, "me": mine, "next_cursor": next_cursor(off, lim, len(items))}


class PlayerReport(BaseModel):
    target_user_id: str
    reason: Literal["cheating", "offensive_name", "other"]
    note: Optional[str] = Field(default=None, max_length=500)


@router.post("/reports", status_code=201)
async def report_player(body: PlayerReport, u: dict = Depends(gameplay_rate)):
    if body.target_user_id == u["user_id"]:
        raise ApiError(400, "invalid_target", "You can't report yourself")
    rid = new_id("rep")
    await get_db().reports.insert_one({"report_id": rid, "reporter_id": u["user_id"], **body.model_dump(), "status": "open", "created_at": now(), "updated_at": now()})
    return {"report_id": rid}


# ----------------------------------------------------------------- events ---
@router.get("/events")
async def events(u: Optional[dict] = Depends(optional_user)):
    db = get_db()
    t = now()
    out = []
    async for ev in db.events.find({"starts_at": {"$lte": t}, "ends_at": {"$gt": t}}, {"_id": 0}).sort("ends_at", 1):
        prog = claimed = None
        if u:
            p = await db.event_progress.find_one({"user_id": u["user_id"], "event_id": ev["event_id"]}, {"_id": 0})
            prog = (p or {}).get("progress", 0)
            claimed = bool(await db.claims.find_one({"user_id": u["user_id"], "kind": "event", "ref": ev["event_id"]}))
        ends = ev["ends_at"] if ev["ends_at"].tzinfo else ev["ends_at"].replace(tzinfo=t.tzinfo)
        out.append({**ev, "seconds_left": int((ends - t).total_seconds()), "progress": prog, "claimed": claimed})
    return {"items": out, "server_time": t.isoformat()}


@router.post("/events/{event_id}/claim")
async def claim_event(event_id: str, request: Request, u: dict = Depends(gameplay_rate)):
    key = idem_key(request)

    async def run():
        db = get_db()
        ev = await db.events.find_one({"event_id": event_id, "starts_at": {"$lte": now()}, "ends_at": {"$gt": now()}}, {"_id": 0})
        if not ev:
            raise ApiError(404, "not_found", "Event not active")
        p = await db.event_progress.find_one({"user_id": u["user_id"], "event_id": event_id})
        if (p or {}).get("progress", 0) < ev["rule"]["target"]:
            raise ApiError(400, "not_complete", "Event goal not reached yet")
        try:
            await db.claims.insert_one({"user_id": u["user_id"], "kind": "event", "ref": event_id, "day": "-", "created_at": now()})
        except Exception:
            raise ApiError(409, "already_claimed", "Already claimed")
        return {"ok": True, "reward": ev["rewards"], "wallet": await apply(u["user_id"], ev["rewards"], "event", event_id)}

    return await idempotent(u["user_id"], key, f"event:{event_id}", run)


# ----------------------------------------------------- remote config/catalog ---
@router.get("/config")
async def config():
    doc = await get_db().remote_config.find_one({"_id": "active"}, {"_id": 0})
    return {**C.DEFAULT_CONFIG, **(doc or {})}


@router.get("/catalog")
async def catalog():
    return {"version": C.CATALOG_VERSION, "items": {k: {i: (None if p is None else ("ad" if p == "ad" else {"currency": p[0], "amount": p[1]})) for i, p in v.items()} for k, v in C.ITEMS.items()},
            "shop": {k: {"currency": c, "amount": a, "grant": g} for k, (c, a, g) in C.SHOP.items()}, "daily_rewards": C.DAILY_REWARDS, "missions": C.MISSIONS, "achievements": C.ACHIEVEMENTS,
            "unlock_levels": getattr(C, "UNLOCK_LEVELS", {})}


# ---------------------------------------------------------------- support ---
class Ticket(BaseModel):
    category: Literal["bug", "account", "purchase", "other"]
    message: str = Field(min_length=5, max_length=2000)
    email: Optional[str] = Field(default=None, max_length=200)


@router.post("/support/tickets", status_code=201)
async def ticket(body: Ticket, request: Request, u: Optional[dict] = Depends(optional_user)):
    from ..core import client_ip, limiter
    limiter.check(f"ticket:{u['user_id'] if u else client_ip(request)}", 10)
    db = get_db()
    seq = await db.counters.find_one_and_update({"_id": "ticket"}, {"$inc": {"n": 1}}, upsert=True, return_document=ReturnDocument.AFTER)
    no = f"RR-{seq['n']:06d}"
    await db.tickets.insert_one({"ticket_no": no, "user_id": u["user_id"] if u else None, **body.model_dump(), "status": "open", "created_at": now(), "updated_at": now()})
    return {"ticket_no": no}


# ------------------------------------------------------------------ inbox ---
@router.get("/inbox")
async def inbox(limit: int = 20, cursor: Optional[str] = None, u: dict = Depends(current_user)):
    db = get_db()
    lim, off = page_args(limit, cursor)
    q = {"$or": [{"user_id": None}, {"user_id": u["user_id"]}], "created_at": {"$lte": now()}}
    msgs = await db.messages.find(q, {"_id": 0}).sort("created_at", -1).skip(off).limit(lim).to_list(lim)
    claimed = {c["ref"] async for c in db.claims.find({"user_id": u["user_id"], "kind": "inbox"}, {"ref": 1})}
    return {"items": [{**m, "claimed": m["msg_id"] in claimed} for m in msgs], "next_cursor": next_cursor(off, lim, len(msgs))}


@router.post("/inbox/{msg_id}/claim")
async def claim_inbox(msg_id: str, request: Request, u: dict = Depends(gameplay_rate)):
    """Attachments are claim-once server-side (unique claims index) — across all of a player's devices."""
    key = idem_key(request)

    async def run():
        db = get_db()
        m = await db.messages.find_one({"msg_id": msg_id, "$or": [{"user_id": None}, {"user_id": u["user_id"]}]}, {"_id": 0})
        if not m:
            raise ApiError(404, "not_found", "Message not found")
        if not m.get("attachment"):
            raise ApiError(400, "no_attachment", "Nothing to claim")
        try:
            await db.claims.insert_one({"user_id": u["user_id"], "kind": "inbox", "ref": msg_id, "day": "-", "created_at": now()})
        except Exception:
            raise ApiError(409, "already_claimed", "Already claimed")
        return {"ok": True, "reward": m["attachment"], "wallet": await apply(u["user_id"], m["attachment"], "inbox", msg_id)}

    return await idempotent(u["user_id"], key, f"inbox:{msg_id}", run)
