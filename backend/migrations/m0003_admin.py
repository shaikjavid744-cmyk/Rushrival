"""Phase 5/6: admin realm, audit, config versions, content, deletion requests."""
ID = "0003_admin"


async def up(db):
    await db.admins.create_index("admin_id", unique=True, name="uniq_admin_id")
    await db.admins.create_index("email", unique=True, name="uniq_admin_email")
    await db.admin_sessions.create_index("token_hash", unique=True, name="uniq_token_hash")
    await db.admin_sessions.create_index([("admin_id", 1), ("revoked", 1)], name="by_admin")
    await db.admin_sessions.create_index("created_at", expireAfterSeconds=13 * 3600, name="ttl_sessions")
    await db.admin_audit.create_index([("time", -1)], name="by_time")
    await db.admin_audit.create_index([("admin_id", 1), ("time", -1)], name="by_admin_time")
    await db.config_versions.create_index("version", unique=True, name="uniq_version")
    await db.config_versions.create_index("status", name="by_status")
    await db.news.create_index("slug", unique=True, name="uniq_slug")
    await db.news.create_index([("status", 1), ("published_at", -1)], name="by_published")
    await db.faq.create_index([("status", 1), ("order", 1)], name="by_order")
    await db.deletion_requests.create_index("request_id", unique=True, name="uniq_request")
    await db.tickets.create_index([("status", 1), ("created_at", -1)], name="by_status_time")


async def down(db):
    for coll, idx in (("admins", ["uniq_admin_id", "uniq_admin_email"]), ("admin_sessions", ["uniq_token_hash", "by_admin", "ttl_sessions"]),
                      ("admin_audit", ["by_time", "by_admin_time"]), ("config_versions", ["uniq_version", "by_status"]), ("news", ["uniq_slug", "by_published"]),
                      ("faq", ["by_order"]), ("deletion_requests", ["uniq_request"]), ("tickets", ["by_status_time"])):
        for i in idx:
            try:
                await db[coll].drop_index(i)
            except Exception:
                pass
