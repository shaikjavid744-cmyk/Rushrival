"""Authoritative wallet: atomic $inc with >= 0 guards + append-only ledger."""
from __future__ import annotations

from .core import ApiError, get_db, new_id, now

WALLET_FIELDS = ("coins", "gems", "hoverboards", "xp")


async def apply(user_id: str, delta: dict, reason: str, ref: str) -> dict:
    """Apply a signed delta atomically. Negative parts require sufficient balance (no negatives, ever)."""
    db = get_db()
    inc = {f"wallet.{k}": int(v) for k, v in delta.items() if k in WALLET_FIELDS and int(v) != 0}
    guard = {f"wallet.{k}": {"$gte": -int(v)} for k, v in delta.items() if k in WALLET_FIELDS and int(v) < 0}
    if inc:
        u = await db.users.find_one_and_update({"user_id": user_id, **guard}, {"$inc": inc, "$set": {"updated_at": now()}}, projection={"_id": 0, "wallet": 1}, return_document=True)
        if not u:
            raise ApiError(400, "insufficient_funds", "Not enough coins or gems")
    else:
        u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "wallet": 1})
    await db.ledger.insert_one({"entry_id": new_id("led"), "user_id": user_id, "delta": {k: int(v) for k, v in delta.items() if k in WALLET_FIELDS}, "reason": reason, "ref": ref, "balance": u["wallet"], "created_at": now()})
    return u["wallet"]


def empty_wallet() -> dict:
    return {"coins": 0, "gems": 0, "hoverboards": 0, "xp": 0}
