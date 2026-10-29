"""Phase 4: IAP purchases (unique purchase token), entitlements, ad rewards, RTDN de-dupe."""
ID = "0002_billing"

VALIDATOR = {"$jsonSchema": {"bsonType": "object", "required": ["purchase_token", "owner", "product_id", "revoked", "created_at"],
                             "properties": {"purchase_token": {"bsonType": "string"}, "owner": {"bsonType": "string"}, "revoked": {"bsonType": "bool"}}}}


async def up(db):
    names = await db.list_collection_names()
    if "iap_purchases" not in names:
        await db.create_collection("iap_purchases", validator=VALIDATOR, validationLevel="moderate")
    else:
        await db.command({"collMod": "iap_purchases", "validator": VALIDATOR, "validationLevel": "moderate"})
    await db.iap_purchases.create_index("purchase_token", unique=True, name="uniq_token")
    await db.iap_purchases.create_index([("owner", 1), ("created_at", -1)], name="by_owner")
    await db.entitlements.create_index([("owner", 1), ("entitlement", 1)], unique=True, name="uniq_owner_ent")
    await db.ad_rewards.create_index([("user_id", 1), ("dedupe", 1)], unique=True, name="uniq_dedupe")
    await db.ad_rewards.create_index([("user_id", 1), ("day", 1)], name="by_day")
    await db.rtdn_messages.create_index("message_id", unique=True, name="uniq_msg")


async def down(db):
    for coll, idx in (("iap_purchases", ["uniq_token", "by_owner"]), ("entitlements", ["uniq_owner_ent"]), ("ad_rewards", ["uniq_dedupe", "by_day"]), ("rtdn_messages", ["uniq_msg"])):
        for i in idx:
            try:
                await db[coll].drop_index(i)
            except Exception:
                pass
    await db.command({"collMod": "iap_purchases", "validator": {}, "validationLevel": "off"})
