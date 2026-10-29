"""Seed the first Owner admin from env (ADMIN_OWNER_EMAIL / ADMIN_OWNER_PASSWORD). Idempotent; never overwrites."""
import os

from .core import get_db, hash_password, new_id, now


async def seed_owner() -> None:
    email, pw = os.environ.get("ADMIN_OWNER_EMAIL"), os.environ.get("ADMIN_OWNER_PASSWORD")
    if not email or not pw:
        return
    await get_db().admins.update_one({"email": email.lower()}, {"$setOnInsert": {
        "admin_id": new_id("adm"), "email": email.lower(), "name": "Owner", "role": "owner", "password_hash": hash_password(pw),
        "totp_enrolled": False, "disabled": False, "failures": [], "created_by": "env", "created_at": now()}}, upsert=True)
