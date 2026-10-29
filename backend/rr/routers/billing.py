"""Phase 4: purchase verification, entitlements, RTDN webhook, rewarded-ad grants."""
from __future__ import annotations

import base64
import json
import os
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from .. import billing as B
from .. import catalog as C
from ..core import ApiError, current_user, day_key, gameplay_rate, get_db, idem_key, idempotent, now, optional_user
from ..economy import apply

router = APIRouter(tags=["billing"])


def owner_of(request: Request, user: Optional[dict]) -> str:
    if user:
        return user["user_id"]
    dev = request.headers.get("X-Device-Id", "").strip()
    if not (8 <= len(dev) <= 64):
        raise ApiError(400, "device_id_required", "X-Device-Id header is required for guest purchases")
    return f"dev:{dev}"


class VerifyReq(BaseModel):
    product_id: str = Field(max_length=64)
    purchase_token: str = Field(min_length=6, max_length=4096)


@router.post("/purchases/verify")
async def verify(body: VerifyReq, request: Request, user: Optional[dict] = Depends(optional_user)):
    return await B.verify(owner_of(request, user), user, body.product_id, body.purchase_token)


@router.get("/entitlements")
async def entitlements(request: Request, user: Optional[dict] = Depends(optional_user)):
    ents = await B.entitlements(owner_of(request, user))
    return {"entitlements": ents, "remove_ads": "remove_ads" in ents}


@router.get("/purchases/mine")
async def mine(u: dict = Depends(current_user)):
    """Purchases by user (the Phase 6 admin lists these per user too)."""
    items = [p async for p in get_db().iap_purchases.find({"owner": u["user_id"]}, {"_id": 0, "grant": 0}).sort("created_at", -1).limit(100)]
    return {"items": items}


# ---- Real-time Developer Notifications (Pub/Sub authenticated push) ----------------
def verify_pubsub_jwt(authorization: str) -> dict:
    aud, email = os.environ.get("PUBSUB_AUDIENCE"), os.environ.get("PUBSUB_PUSH_SERVICE_ACCOUNT")
    if not (aud and email):
        raise ApiError(503, "verification_unavailable", "RTDN is not configured")
    if not authorization.startswith("Bearer "):
        raise ApiError(401, "unauthorized", "Missing Pub/Sub token")
    from google.auth.transport.requests import Request as GRequest
    from google.oauth2 import id_token

    try:
        claims = id_token.verify_oauth2_token(authorization[7:], GRequest(), audience=aud)
    except Exception:
        raise ApiError(401, "unauthorized", "Invalid Pub/Sub token")
    if claims.get("email") != email or claims.get("email_verified") is not True:
        raise ApiError(401, "unauthorized", "Unexpected Pub/Sub identity")
    return claims


@router.post("/billing/rtdn")
async def rtdn(request: Request):
    verify_pubsub_jwt(request.headers.get("Authorization", ""))
    env = await request.json()
    msg = env.get("message") or {}
    mid = msg.get("messageId") or msg.get("message_id")
    if not mid:
        raise ApiError(400, "validation_error", "Missing messageId")
    try:
        await get_db().rtdn_messages.insert_one({"message_id": mid, "created_at": now()})
    except DuplicateKeyError:
        return {"ok": True, "duplicate": True}
    try:
        ev = json.loads(base64.b64decode(msg.get("data", "")))
    except Exception:
        raise ApiError(400, "validation_error", "Invalid message data")
    if ev.get("packageName") != os.environ.get("ANDROID_PACKAGE_NAME"):
        raise ApiError(400, "validation_error", "Wrong package")
    revoked = False
    if v := ev.get("voidedPurchaseNotification"):
        revoked = await B.revoke(v["purchaseToken"], "rtdn_voided")
    elif (o := ev.get("oneTimeProductNotification")) and o.get("notificationType") == 2:  # ONE_TIME_PRODUCT_CANCELED
        revoked = await B.revoke(o["purchaseToken"], "rtdn_canceled")
    return {"ok": True, "revoked": revoked}


# ---- Rewarded ads (signed-in grants; guests use the local ledger) -------------------
class AdReward(BaseModel):
    placement: Literal["revive", "double_coins", "unlock"]
    event_id: str = Field(min_length=8, max_length=128)
    run_id: Optional[str] = Field(default=None, max_length=64)
    item_kind: Optional[Literal["character", "board"]] = None
    item_id: Optional[str] = Field(default=None, max_length=32)


@router.post("/ads/reward")
async def ad_reward(body: AdReward, request: Request, u: dict = Depends(gameplay_rate)):
    key = idem_key(request)

    async def run():
        db = get_db()
        if await db.ad_rewards.count_documents({"user_id": u["user_id"], "day": day_key()}) >= C.AD_REWARDS_PER_DAY:
            raise ApiError(429, "ad_reward_cap", "Daily rewarded-ad limit reached")
        if body.placement in ("revive", "double_coins") and not body.run_id:
            raise ApiError(400, "validation_error", "run_id required")
        if body.placement == "unlock" and (C.ITEMS.get(body.item_kind or "", {}).get(body.item_id or "") != "ad"):
            raise ApiError(400, "validation_error", "Item isn't unlockable by ads")
        dedupe = f"{body.placement}:{body.run_id}" if body.run_id and body.placement != "unlock" else f"ev:{body.event_id}"
        coins = 0
        if body.placement == "double_coins":
            led = await db.ledger.find_one({"user_id": u["user_id"], "ref": body.run_id, "reason": {"$in": ["run_online", "run_offline"]}}, {"_id": 0})
            if not led:
                raise ApiError(404, "run_not_found", "Finish (sync) the run first")
            coins = int(led["delta"].get("coins", 0))
        try:
            await db.ad_rewards.insert_one({"user_id": u["user_id"], "event_id": body.event_id, "dedupe": dedupe, "placement": body.placement, "day": day_key(), "created_at": now()})
        except DuplicateKeyError:
            raise ApiError(409, "already_claimed", "Reward already claimed")
        res = {"ok": True, "placement": body.placement}
        if coins:
            res["wallet"] = await apply(u["user_id"], {"coins": coins}, "ad_double_coins", body.run_id)
        if body.placement == "unlock":
            f = f"ad_progress.{body.item_kind}.{body.item_id}"
            doc = await db.users.find_one_and_update({"user_id": u["user_id"]}, {"$inc": {f: 1}}, projection={"_id": 0, "ad_progress": 1}, return_document=True)
            prog = int(doc["ad_progress"][body.item_kind][body.item_id])
            if prog >= C.AD_UNLOCK_TARGET:
                await db.users.update_one({"user_id": u["user_id"]}, {"$addToSet": {f"inventory.{body.item_kind}": body.item_id}})
            res.update(progress=min(prog, C.AD_UNLOCK_TARGET), target=C.AD_UNLOCK_TARGET, unlocked=prog >= C.AD_UNLOCK_TARGET)
        return res

    return await idempotent(u["user_id"], key, f"ad:{body.placement}:{body.event_id}", run)
