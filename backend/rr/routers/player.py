"""Signed-in player: profile, guest linking/conflicts, wallet/ledger, purchases, daily, missions, achievements, prefs."""
from __future__ import annotations

import re
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from .. import catalog as C
from ..core import ApiError, current_user, day_key, new_id, gameplay_rate, get_db, idem_key, idempotent, next_cursor, now, page_args
from ..economy import apply
from .auth import public_user

router = APIRouter(tags=["player"])


@router.get("/me")
async def me(u: dict = Depends(current_user)):
    return {"user": public_user(u), "server_time": now().isoformat(), "day": day_key()}


class LocalProgress(BaseModel):
    coins: int = Field(ge=0, le=10_000_000)
    gems: int = Field(ge=0, le=100_000)
    hoverboards: int = Field(ge=0, le=1000)
    xp: int = Field(ge=0, le=100_000_000)
    best_score: int = Field(ge=0, le=100_000_000)
    inventory: dict = {}
    equipped: dict = {}


class LinkReq(BaseModel):
    local: LocalProgress
    choice: Optional[Literal["cloud", "device"]] = None


def _summary(w: dict, best: int, inv: dict) -> dict:
    return {"coins": w.get("coins", 0), "gems": w.get("gems", 0), "best_score": best, "items": sum(len(v) for v in inv.values())}


@router.post("/me/link")
async def link(body: LinkReq, request: Request, u: dict = Depends(current_user)):
    """First sign-in links guest progress. Existing cloud progress → 409 progress_conflict unless a choice is given.
    Values are SET (not added) so choosing either side can't duplicate currency."""
    db = get_db()
    loc = body.local
    if u.get("progress_initialized") and body.choice is None:
        raise ApiError(409, "progress_conflict", "This account already has cloud progress", {
            "cloud": _summary(u["wallet"], u.get("best_score", 0), u.get("inventory", {})),
            "device": _summary(loc.model_dump(), loc.best_score, loc.inventory)})
    if body.choice == "cloud":
        await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"progress_initialized": True}})
    else:
        inv = {k: sorted(set(v) | set(u["inventory"].get(k, []))) for k, v in loc.inventory.items() if k in C.ITEMS and isinstance(v, list)}
        inv = {k: [i for i in v if i in C.ITEMS[k]] for k, v in inv.items()}
        await db.users.update_one({"user_id": u["user_id"]}, {"$set": {
            "wallet": {"coins": loc.coins, "gems": loc.gems, "hoverboards": loc.hoverboards, "xp": loc.xp},
            "best_score": max(loc.best_score, u.get("best_score", 0)), "stats.best_score": max(loc.best_score, u.get("best_score", 0)),
            "inventory": {**u["inventory"], **inv}, "equipped": {**u["equipped"], **{k: v for k, v in loc.equipped.items() if k in C.ITEMS and v in C.ITEMS[k]}},
            "progress_initialized": True, "updated_at": now()}})
        await db.ledger.insert_one({"entry_id": new_id("led"), "user_id": u["user_id"], "delta": {}, "reason": "link_device_progress", "ref": body.choice or "first_link", "balance": {"coins": loc.coins, "gems": loc.gems}, "created_at": now()})
    fresh = await db.users.find_one({"user_id": u["user_id"]}, {"_id": 0})
    return {"user": public_user(fresh)}


@router.get("/me/ledger")
async def ledger(limit: int = 20, cursor: Optional[str] = None, u: dict = Depends(current_user)):
    lim, off = page_args(limit, cursor)
    items = await get_db().ledger.find({"user_id": u["user_id"]}, {"_id": 0}).sort("created_at", -1).skip(off).limit(lim).to_list(lim)
    return {"items": items, "next_cursor": next_cursor(off, lim, len(items))}


class Purchase(BaseModel):
    kind: Literal["character", "board", "world", "shop"]
    item_id: str


@router.post("/purchases")
async def purchase(body: Purchase, request: Request, u: dict = Depends(gameplay_rate)):
    key = idem_key(request)

    async def run():
        db = get_db()
        if body.kind == "shop":
            if body.item_id not in C.SHOP:
                raise ApiError(404, "unknown_item", "Unknown item")
            cur, price, grant = C.SHOP[body.item_id]
            delta = dict(grant)
            delta[cur] = delta.get(cur, 0) - price
            w = await apply(u["user_id"], delta, "shop", body.item_id)
            return {"ok": True, "wallet": w}
        price = C.ITEMS[body.kind].get(body.item_id, "missing")
        if price == "missing":
            raise ApiError(404, "unknown_item", "Unknown item")
        if price is None or price == "ad":
            raise ApiError(400, "not_purchasable", "This item can't be bought with coins or gems")
        cur, amount = price
        # claim ownership first (atomic, prevents double-charging the same item), then charge
        r = await db.users.update_one({"user_id": u["user_id"], f"inventory.{body.kind}": {"$ne": body.item_id}}, {"$addToSet": {f"inventory.{body.kind}": body.item_id}})
        if r.modified_count == 0:
            raise ApiError(409, "already_owned", "You already own this")
        try:
            w = await apply(u["user_id"], {cur: -amount}, f"buy_{body.kind}", body.item_id)
        except ApiError:
            await db.users.update_one({"user_id": u["user_id"]}, {"$pull": {f"inventory.{body.kind}": body.item_id}})
            raise
        return {"ok": True, "wallet": w, "owned": body.item_id}

    return await idempotent(u["user_id"], key, f"purchase:{body.kind}:{body.item_id}", run)


@router.post("/daily/claim")
async def daily(request: Request, u: dict = Depends(gameplay_rate)):
    """Day boundary = server UTC day."""
    key = idem_key(request)

    async def run():
        db = get_db()
        today = day_key()
        last, streak = u["daily"].get("last_day"), u["daily"].get("streak", 0)
        from datetime import timedelta
        yesterday = day_key(now() - timedelta(days=1))
        new_streak = streak + 1 if last == yesterday else 1
        r = await db.users.update_one({"user_id": u["user_id"], "daily.last_day": {"$ne": today}}, {"$set": {"daily": {"last_day": today, "streak": new_streak}}})
        if r.modified_count == 0:
            raise ApiError(409, "already_claimed", "Today's reward is already claimed")
        reward = C.DAILY_REWARDS[(new_streak - 1) % len(C.DAILY_REWARDS)]
        w = await apply(u["user_id"], reward, "daily", today)
        return {"ok": True, "day": today, "streak": new_streak, "reward": reward, "wallet": w}

    return await idempotent(u["user_id"], key, "daily", run)


@router.get("/missions")
async def missions(u: dict = Depends(current_user)):
    today = day_key()
    st = u.get("day_stats", {}).get(today, {})
    claimed = {c["ref"] async for c in get_db().claims.find({"user_id": u["user_id"], "kind": "mission", "day": today}, {"ref": 1})}
    return {"day": today, "items": [{**m, "progress": st.get(m["stat"], 0), "claimed": m["id"] in claimed} for m in C.MISSIONS],
            "achievements": [{**a, "progress": u.get("stats", {}).get(a["stat"], 0)} for a in C.ACHIEVEMENTS]}


async def _claim(u: dict, kind: str, ref: str, day: Optional[str], reward: dict) -> dict:
    db = get_db()
    try:
        await db.claims.insert_one({"user_id": u["user_id"], "kind": kind, "ref": ref, "day": day or "-", "created_at": now()})
    except Exception:
        raise ApiError(409, "already_claimed", "Already claimed")
    w = await apply(u["user_id"], reward, kind, ref)
    return {"ok": True, "reward": reward, "wallet": w}


@router.post("/missions/{mission_id}/claim")
async def claim_mission(mission_id: str, request: Request, u: dict = Depends(gameplay_rate)):
    key = idem_key(request)
    m = next((m for m in C.MISSIONS if m["id"] == mission_id), None)
    if not m:
        raise ApiError(404, "not_found", "Unknown mission")

    async def run():
        today = day_key()
        if u.get("day_stats", {}).get(today, {}).get(m["stat"], 0) < m["target"]:
            raise ApiError(400, "not_complete", "Mission not complete yet")
        return await _claim(u, "mission", mission_id, today, m["reward"])

    return await idempotent(u["user_id"], key, f"mission:{mission_id}", run)


@router.post("/achievements/{ach_id}/claim")
async def claim_achievement(ach_id: str, request: Request, u: dict = Depends(gameplay_rate)):
    key = idem_key(request)
    a = next((a for a in C.ACHIEVEMENTS if a["id"] == ach_id), None)
    if not a:
        raise ApiError(404, "not_found", "Unknown achievement")

    async def run():
        if u.get("stats", {}).get(a["stat"], 0) < a["target"]:
            raise ApiError(400, "not_complete", "Achievement not complete yet")
        return await _claim(u, "achievement", ach_id, None, a["reward"])

    return await idempotent(u["user_id"], key, f"achievement:{ach_id}", run)


class Spend(BaseModel):
    sink: Literal["revive", "hoverboard"]
    ref: str = Field(min_length=1, max_length=128)


REVIVE_GEMS = [5, 10]


@router.post("/me/spend")
async def spend(body: Spend, request: Request, u: dict = Depends(gameplay_rate)):
    """Server-priced sinks only (client never names an amount): revive = 5 then 10 gems per run, hoverboard = 1."""
    key = idem_key(request)

    async def run():
        if body.sink == "hoverboard":
            return {"ok": True, "wallet": await apply(u["user_id"], {"hoverboards": -1}, "hoverboard", body.ref)}
        # Price is decided by the server from how many revives this run already paid for (5, then 10, max 2).
        run_part = body.ref.rsplit(":", 1)[0] if ":" in body.ref else body.ref
        idx = await get_db().ledger.count_documents({"user_id": u["user_id"], "reason": "revive", "ref": {"$regex": f"^{re.escape(run_part)}:"}})
        if idx >= len(REVIVE_GEMS):
            raise ApiError(400, "revive_limit", "No more revives for this run")
        return {"ok": True, "wallet": await apply(u["user_id"], {"gems": -REVIVE_GEMS[idx]}, "revive", f"{run_part}:{idx}")}

    return await idempotent(u["user_id"], key, f"spend:{body.sink}:{body.ref}", run)


class Prefs(BaseModel):
    notifications: bool
    ad_personalisation: bool


@router.put("/me/preferences")
async def prefs(body: Prefs, u: dict = Depends(current_user)):
    await get_db().users.update_one({"user_id": u["user_id"]}, {"$set": {"prefs": body.model_dump(), "updated_at": now()}})
    return {"prefs": body.model_dump()}


class Equip(BaseModel):
    kind: Literal["character", "board", "world"]
    item_id: str


@router.put("/me/equipped")
async def equip(body: Equip, u: dict = Depends(current_user)):
    if body.item_id not in u["inventory"].get(body.kind, []):
        raise ApiError(403, "not_owned", "You don't own this item")
    await get_db().users.update_one({"user_id": u["user_id"]}, {"$set": {f"equipped.{body.kind}": body.item_id}})
    return {"ok": True}
