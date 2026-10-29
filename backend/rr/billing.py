"""Phase 4 billing service: Google Play purchase verification, grants, entitlements, refund revocation.

Never auto-grants: without GOOGLE_PLAY_SERVICE_ACCOUNT_JSON + ANDROID_PACKAGE_NAME real tokens get
`verification_unavailable`. Tokens prefixed "mock_" are accepted only when ENV=development.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Optional

import httpx
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from .catalog import PRODUCTS
from .core import ApiError, get_db, new_id, now
from .economy import apply

log = logging.getLogger("rr.billing")
API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications"
SCOPE = "https://www.googleapis.com/auth/androidpublisher"


def is_dev() -> bool:
    return os.environ.get("ENV", "production").lower() == "development"


def play_configured() -> bool:
    return bool(os.environ.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON") and os.environ.get("ANDROID_PACKAGE_NAME"))


def _access_token() -> str:
    from google.auth.transport.requests import Request as GRequest
    from google.oauth2 import service_account

    info = json.loads(os.environ["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"])
    creds = service_account.Credentials.from_service_account_info(info, scopes=[SCOPE])
    creds.refresh(GRequest())
    return creds.token


async def _play_get(path: str, params: Optional[dict] = None) -> dict:
    token = await asyncio.to_thread(_access_token)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{API}/{os.environ['ANDROID_PACKAGE_NAME']}/{path}", params=params, headers={"Authorization": f"Bearer {token}"})
    if r.status_code in (400, 404, 410):
        raise ApiError(400, "invalid_purchase", "Google Play doesn't recognise this purchase")
    if r.status_code >= 300:
        raise ApiError(503, "verification_unavailable", "Google Play verification failed, try again later", {"status": r.status_code})
    return r.json()


async def provider_state(product_id: str, token: str) -> dict:
    """-> {state: purchased|pending|canceled, order_id}"""
    if token.startswith("mock_"):
        if not is_dev():
            raise ApiError(400, "mock_token_rejected", "Test purchases are not accepted in production")
        return {"state": "pending" if token.startswith("mock_pending_") else "purchased", "order_id": f"MOCK.{token[-12:]}", "mock": True}
    if not play_configured():
        raise ApiError(503, "verification_unavailable", "Purchase verification is not configured yet — we'll finish your purchase shortly")
    d = await _play_get(f"purchases/products/{product_id}/tokens/{token}")
    return {"state": {0: "purchased", 1: "canceled", 2: "pending"}.get(d.get("purchaseState"), "canceled"), "order_id": d.get("orderId")}


async def verify(owner: str, user: Optional[dict], product_id: str, token: str) -> dict:
    p = PRODUCTS.get(product_id)
    if not p:
        raise ApiError(400, "unknown_product", "Unknown product")
    db = get_db()
    existing = await db.iap_purchases.find_one({"purchase_token": token}, {"_id": 0})
    if existing:  # REQ-177: same token twice -> nothing granted again
        if existing["owner"] != owner:
            if p["consumable"]:
                raise ApiError(409, "purchase_owned_elsewhere", "This purchase belongs to another player")
            # restore of a non-consumable on a new install / after sign-in: entitlement only, never currency again
            for ent in p["grant"].get("entitlements", []):
                if not existing.get("revoked"):
                    await db.entitlements.update_one({"owner": owner, "entitlement": ent}, {"$set": {"active": True, "purchase_token": token, "updated_at": now()}, "$setOnInsert": {"created_at": now()}}, upsert=True)
            if user and not existing.get("revoked"):
                for kind, ids in (p["grant"].get("items") or {}).items():
                    await db.users.update_one({"user_id": user["user_id"]}, {"$addToSet": {f"inventory.{kind}": {"$each": ids}}})
        return {"status": "already_processed", "product_id": product_id, "consumable": p["consumable"], "revoked": bool(existing.get("revoked")), "entitlements": await entitlements(owner)}
    st = await provider_state(product_id, token)
    if st["state"] == "pending":
        return {"status": "pending", "product_id": product_id}
    if st["state"] != "purchased":
        raise ApiError(400, "purchase_not_completed", "This purchase was cancelled")
    try:
        await db.iap_purchases.insert_one({"purchase_id": new_id("iap"), "purchase_token": token, "owner": owner, "user_id": user["user_id"] if user else None, "product_id": product_id,
                                          "order_id": st["order_id"], "consumable": p["consumable"], "grant": p["grant"], "mock": bool(st.get("mock")), "revoked": False, "created_at": now()})
    except DuplicateKeyError:  # concurrent duplicate callback
        return {"status": "already_processed", "product_id": product_id, "consumable": p["consumable"], "revoked": False, "entitlements": await entitlements(owner)}
    g = p["grant"]
    wallet = None
    if user:
        delta = {k: g[k] for k in ("coins", "gems", "hoverboards") if g.get(k)}
        if delta:
            wallet = await apply(user["user_id"], delta, "iap", token)
        for kind, ids in (g.get("items") or {}).items():
            await db.users.update_one({"user_id": user["user_id"]}, {"$addToSet": {f"inventory.{kind}": {"$each": ids}}})
    for ent in g.get("entitlements", []):
        await db.entitlements.update_one({"owner": owner, "entitlement": ent}, {"$set": {"active": True, "purchase_token": token, "updated_at": now()}, "$setOnInsert": {"created_at": now()}}, upsert=True)
    return {"status": "verified", "product_id": product_id, "consumable": p["consumable"], "grant": g, "wallet": wallet, "entitlements": await entitlements(owner)}


async def entitlements(owner: str) -> list[str]:
    return [e["entitlement"] async for e in get_db().entitlements.find({"owner": owner, "active": True}, {"_id": 0})]


async def revoke(token: str, reason: str) -> bool:
    """Refund/void: deactivate entitlements, claw back unspent currency (never below 0), ledger it. Idempotent."""
    db = get_db()
    p = await db.iap_purchases.find_one_and_update({"purchase_token": token, "revoked": False}, {"$set": {"revoked": True, "revoked_reason": reason, "revoked_at": now()}}, return_document=ReturnDocument.AFTER)
    if not p:
        return False
    for ent in p["grant"].get("entitlements", []):
        await db.entitlements.update_one({"owner": p["owner"], "entitlement": ent, "purchase_token": token}, {"$set": {"active": False, "updated_at": now()}})
    if p.get("user_id"):
        u = await db.users.find_one({"user_id": p["user_id"]}, {"_id": 0, "wallet": 1})
        if u:
            delta = {k: -min(int(p["grant"].get(k) or 0), int(u["wallet"].get(k, 0))) for k in ("coins", "gems", "hoverboards")}
            delta = {k: v for k, v in delta.items() if v}
            if delta:
                await apply(p["user_id"], delta, "iap_refund", token)
            else:
                await db.ledger.insert_one({"entry_id": new_id("led"), "user_id": p["user_id"], "delta": {}, "reason": "iap_refund", "ref": token, "balance": u["wallet"], "created_at": now()})
    log.info("revoked purchase %s (%s)", p["purchase_id"], reason)
    return True


async def poll_voided(days: int = 2) -> dict:
    """Voided Purchases API poll (last `days`, overlapping; revoke is idempotent)."""
    if not play_configured():
        return {"skipped": "verification_unavailable"}
    start = int((now().timestamp() - days * 86400) * 1000)
    revoked, page = 0, None
    while True:
        params = {"startTime": str(start), "maxResults": "1000", **({"token": page} if page else {})}
        d = await _play_get("purchases/voidedpurchases", params)
        for v in d.get("voidedPurchases", []):
            revoked += await revoke(v["purchaseToken"], "voided_poll")
        page = (d.get("tokenPagination") or {}).get("nextPageToken")
        if not page:
            return {"revoked": revoked}


async def voided_loop():
    while True:
        try:
            r = await poll_voided()
            log.info("voided poll: %s", r)
        except Exception as e:  # never crash the server
            log.warning("voided poll failed: %s", e)
        await asyncio.sleep(6 * 3600)
