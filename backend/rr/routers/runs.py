"""Runs: signed single-use run tokens + server-side plausibility; offline runs with capped grants (no leaderboard)."""
from __future__ import annotations

import math
import secrets
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from .. import catalog as C
from ..core import RUN_SECRET, ApiError, day_key, gameplay_rate, get_db, idem_key, idempotent, new_id, now, week_key
from ..economy import apply

router = APIRouter(prefix="/runs", tags=["runs"])


def dist_at(t: float) -> float:
    """∫ base speed curve (mirrors distanceAt in constants.ts)."""
    tc = (C.MAX_SPEED - C.START_SPEED) / C.ACCEL
    if t <= tc:
        return C.START_SPEED * t + 0.5 * C.ACCEL * t * t
    return C.START_SPEED * tc + 0.5 * C.ACCEL * tc * tc + C.MAX_SPEED * (t - tc)


class StartReq(BaseModel):
    world: str = "city"


class Report(BaseModel):
    run_id: str
    run_token: Optional[str] = None
    seed: int
    duration: float = Field(ge=0, le=7200)
    distance: float = Field(ge=0)
    coins: int = Field(ge=0)
    score: int = Field(ge=0)
    powerups_used: int = Field(ge=0, le=500, default=0)
    revives: int = Field(ge=0, le=5, default=0)
    world: str = "city"
    event_tokens: int = Field(ge=0, default=0)


def plausibility(r: Report, server_elapsed: Optional[float]) -> list[str]:
    """Never trust client totals: every reported value must fit the game's physics + scoring."""
    bad = []
    if server_elapsed is not None and r.duration > server_elapsed + 10:
        bad.append("duration_exceeds_server_time")
    boost_extra = (C.BOOST - 1) * C.MAX_SPEED * C.BOOST_S * (r.powerups_used + 1)
    if r.distance > dist_at(r.duration) * 1.05 + boost_extra + 5:
        bad.append("distance_exceeds_speed_curve")
    if r.coins > r.duration * 4 + 15 or r.coins > r.distance * 0.8 + 15:
        bad.append("coin_rate_exceeded")
    lo, hi = math.floor(r.distance) + 10 * r.coins, 2 * (r.distance + 10 * r.coins)
    if not (lo - 1 <= r.score <= hi + 1):
        bad.append("score_formula_mismatch")
    if r.event_tokens > r.coins:
        bad.append("event_tokens_exceed_coins")
    return bad


@router.post("/start")
async def start(body: StartReq, u: dict = Depends(gameplay_rate)):
    run_id, seed = new_id("run"), secrets.randbelow(2**31)
    token = jwt.encode({"run_id": run_id, "sub": u["user_id"], "seed": seed, "iat": int(now().timestamp())}, RUN_SECRET, algorithm="HS256")
    await get_db().runs.insert_one({"run_id": run_id, "user_id": u["user_id"], "seed": seed, "world": body.world, "status": "started", "mode": "online", "started_at": now(), "created_at": now()})
    return {"run_id": run_id, "seed": seed, "run_token": token}


async def _settle(u: dict, r: Report, coins: int, leaderboard: bool) -> dict:
    db = get_db()
    today = day_key()
    w = await apply(u["user_id"], {"coins": coins, "xp": int(r.distance // 10)}, "run_online" if leaderboard else "run_offline", r.run_id)
    await db.users.update_one({"user_id": u["user_id"]}, {"$inc": {"stats.total_runs": 1, "stats.total_coins": coins, f"day_stats.{today}.runs": 1, f"day_stats.{today}.coins": coins, f"day_stats.{today}.distance": int(r.distance)},
                                                         "$max": {"stats.best_score": r.score, "best_score": r.score}})
    if leaderboard:
        await db.scores.insert_one({"user_id": u["user_id"], "name": u["name"], "score": r.score, "run_id": r.run_id, "day": today, "week": week_key(), "created_at": now()})
    # active events in this world: progress = best tokens in one run
    async for ev in db.events.find({"world": r.world, "starts_at": {"$lte": now()}, "ends_at": {"$gt": now()}}, {"_id": 0}):
        await db.event_progress.update_one({"user_id": u["user_id"], "event_id": ev["event_id"]}, {"$max": {"progress": r.event_tokens}, "$setOnInsert": {"created_at": now()}}, upsert=True)
    return {"accepted": True, "granted": {"coins": coins}, "wallet": w, "leaderboard": leaderboard}


@router.post("/finish")
async def finish(body: Report, request: Request, u: dict = Depends(gameplay_rate)):
    key = idem_key(request)

    async def run():
        db = get_db()
        try:
            p = jwt.decode(body.run_token or "", RUN_SECRET, algorithms=["HS256"])
        except jwt.InvalidTokenError:
            raise ApiError(400, "run_invalid", "Run report rejected", {"reasons": ["bad_token"]})
        if p.get("run_id") != body.run_id or p.get("sub") != u["user_id"] or p.get("seed") != body.seed:
            raise ApiError(400, "run_invalid", "Run report rejected", {"reasons": ["token_mismatch"]})
        doc = await db.runs.find_one({"run_id": body.run_id, "user_id": u["user_id"]})
        if not doc:
            raise ApiError(400, "run_invalid", "Run report rejected", {"reasons": ["unknown_run"]})
        started = doc["started_at"].replace(tzinfo=now().tzinfo) if doc["started_at"].tzinfo is None else doc["started_at"]
        reasons = plausibility(body, (now() - started).total_seconds())
        if reasons:
            await db.runs.update_one({"run_id": body.run_id, "status": "started"}, {"$set": {"status": "rejected", "reasons": reasons}})
            raise ApiError(400, "run_invalid", "Run report rejected", {"reasons": reasons})
        claimed = await db.runs.update_one({"run_id": body.run_id, "status": "started"}, {"$set": {"status": "finished", "report": body.model_dump(exclude={"run_token"}), "finished_at": now()}})
        if claimed.modified_count != 1:
            raise ApiError(400, "run_invalid", "Run report rejected", {"reasons": ["token_used"]})
        return await _settle(u, body, body.coins, True)

    return await idempotent(u["user_id"], key, f"run:{body.run_id}", run)


@router.post("/offline")
async def offline(body: Report, request: Request, u: dict = Depends(gameplay_rate)):
    """Queued run played offline: same plausibility (no server clock), coins capped, never on the leaderboard."""
    key = idem_key(request)

    async def run():
        db = get_db()
        reasons = plausibility(body, None)
        today = day_key()
        if await db.runs.count_documents({"user_id": u["user_id"], "mode": "offline", "day": today}) >= C.OFFLINE_RUNS_PER_DAY:
            reasons.append("offline_daily_cap")
        if reasons:
            raise ApiError(400, "run_invalid", "Run report rejected", {"reasons": reasons})
        try:
            await db.runs.insert_one({"run_id": body.run_id, "user_id": u["user_id"], "seed": body.seed, "world": body.world, "status": "finished", "mode": "offline", "day": today, "report": body.model_dump(exclude={"run_token"}), "created_at": now(), "started_at": now()})
        except Exception:
            raise ApiError(400, "run_invalid", "Run report rejected", {"reasons": ["duplicate_run"]})
        return await _settle(u, body, min(body.coins, C.OFFLINE_COIN_CAP), False)

    return await idempotent(u["user_id"], key, f"run:{body.run_id}", run)
