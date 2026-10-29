"""0001: JSON-schema validators + indexes for the Phase 3 collections."""
from pymongo import ASCENDING as A, DESCENDING as D

ID = "0001_init"

TS = {"created_at": {"bsonType": "date"}}
VALIDATORS = {
    "users": {"required": ["user_id", "email", "wallet", "created_at"], "properties": {
        "user_id": {"bsonType": "string"}, "email": {"bsonType": "string", "pattern": "^[^@\\s]+@[^@\\s]+$"},
        "wallet": {"bsonType": "object", "required": ["coins", "gems"], "properties": {
            "coins": {"bsonType": ["int", "long"], "minimum": 0}, "gems": {"bsonType": ["int", "long"], "minimum": 0},
            "hoverboards": {"bsonType": ["int", "long"], "minimum": 0}, "xp": {"bsonType": ["int", "long"], "minimum": 0}}},
        "role": {"enum": ["player", "moderator", "admin"]}, **TS, "updated_at": {"bsonType": "date"}}},
    "ledger": {"required": ["entry_id", "user_id", "reason", "created_at"], "properties": {"entry_id": {"bsonType": "string"}, "user_id": {"bsonType": "string"}, "reason": {"bsonType": "string"}, **TS}},
    "idempotency": {"required": ["user_id", "key", "status", "created_at"], "properties": {"status": {"enum": ["pending", "done"]}, **TS}},
    "refresh_tokens": {"required": ["token_hash", "user_id", "family", "revoked", "expires_at"], "properties": {"revoked": {"bsonType": "bool"}, "expires_at": {"bsonType": "date"}}},
    "reset_codes": {"required": ["user_id", "code_hash", "used", "expires_at"], "properties": {"used": {"bsonType": "bool"}, "expires_at": {"bsonType": "date"}}},
    "runs": {"required": ["run_id", "user_id", "status", "mode", "created_at"], "properties": {"status": {"enum": ["started", "finished", "rejected"]}, "mode": {"enum": ["online", "offline"]}, **TS}},
    "scores": {"required": ["user_id", "score", "run_id", "day", "week", "created_at"], "properties": {"score": {"bsonType": ["int", "long"], "minimum": 0}, **TS}},
    "claims": {"required": ["user_id", "kind", "ref", "day", "created_at"], "properties": {"kind": {"enum": ["mission", "achievement", "event", "inbox"]}, **TS}},
    "events": {"required": ["event_id", "name", "world", "starts_at", "ends_at", "rule", "rewards"], "properties": {"starts_at": {"bsonType": "date"}, "ends_at": {"bsonType": "date"}}},
    "event_progress": {"required": ["user_id", "event_id"]},
    "messages": {"required": ["msg_id", "title", "body", "created_at"], "properties": {**TS}},
    "tickets": {"required": ["ticket_no", "category", "message", "status", "created_at"], "properties": {"status": {"enum": ["open", "replied", "closed"]}, **TS}},
    "reports": {"required": ["report_id", "reporter_id", "target_user_id", "reason", "status", "created_at"], "properties": {**TS}},
}
INDEXES = {
    "users": [([("user_id", A)], {"unique": True}), ([("email", A)], {"unique": True})],
    "ledger": [([("entry_id", A)], {"unique": True}), ([("user_id", A), ("created_at", D)], {})],
    "idempotency": [([("user_id", A), ("key", A)], {"unique": True}), ([("created_at", A)], {"expireAfterSeconds": 7 * 86400})],
    "refresh_tokens": [([("token_hash", A)], {"unique": True}), ([("user_id", A)], {}), ([("expires_at", A)], {"expireAfterSeconds": 0})],
    "reset_codes": [([("user_id", A), ("created_at", D)], {}), ([("expires_at", A)], {"expireAfterSeconds": 3600})],
    "runs": [([("run_id", A)], {"unique": True}), ([("user_id", A), ("mode", A), ("day", A)], {})],
    "scores": [([("day", A), ("score", D)], {}), ([("week", A), ("score", D)], {}), ([("score", D)], {}), ([("user_id", A)], {}), ([("run_id", A)], {"unique": True})],
    "claims": [([("user_id", A), ("kind", A), ("ref", A), ("day", A)], {"unique": True})],
    "events": [([("event_id", A)], {"unique": True}), ([("starts_at", A), ("ends_at", A)], {})],
    "event_progress": [([("user_id", A), ("event_id", A)], {"unique": True})],
    "messages": [([("msg_id", A)], {"unique": True}), ([("user_id", A), ("created_at", D)], {})],
    "tickets": [([("ticket_no", A)], {"unique": True})],
    "reports": [([("report_id", A)], {"unique": True}), ([("target_user_id", A)], {})],
}


async def up(db):
    existing = set(await db.list_collection_names())
    for name, schema in VALIDATORS.items():
        v = {"$jsonSchema": {"bsonType": "object", **schema}}
        if name in existing:
            await db.command({"collMod": name, "validator": v, "validationLevel": "moderate"})
        else:
            await db.create_collection(name, validator=v, validationLevel="moderate")
    for name, idxs in INDEXES.items():
        for keys, opts in idxs:
            await db[name].create_index(keys, **opts)


async def down(db):
    for name, idxs in INDEXES.items():
        for keys, _ in idxs:
            try:
                await db[name].drop_index("_".join(f"{k}_{d}" for k, d in keys))
            except Exception:
                pass
    for name in VALIDATORS:
        if name in await db.list_collection_names():
            await db.command({"collMod": name, "validator": {}, "validationLevel": "off"})
