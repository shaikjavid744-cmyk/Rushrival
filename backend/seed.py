"""Idempotent seed: test player, demo event "Temple Rush", welcome announcement, remote config. python seed.py"""
import asyncio
from datetime import timedelta

from migrations.runner import migrate_up
from rr.core import get_db, hash_password, now, week_key
from rr.routers.auth import create_user

PLAYER = ("player@rushrivals.test", "RushPlayer123!")
RIVAL = ("rival@rushrivals.test", "RushRival123!")


async def main():
    db = get_db()
    await migrate_up(db)
    for email, pw in (PLAYER, RIVAL):
        if not await db.users.find_one({"email": email}):
            await create_user(email, email.split("@")[0].title(), "password", hash_password(pw))
    await db.events.update_one({"event_id": "evt_temple_rush"}, {"$setOnInsert": {
        "event_id": "evt_temple_rush", "name": "Temple Rush", "world": "temple", "art": "world_temple",
        "description": "Collect 50 golden tokens in a single Temple run.",
        "rule": {"type": "tokens", "target": 50, "token_label": "golden tokens"},
        "rewards": {"gems": 25, "coins": 2000}, "starts_at": now() - timedelta(days=1), "ends_at": now() + timedelta(days=60), "created_at": now()}}, upsert=True)
    await db.messages.update_one({"msg_id": "welcome"}, {"$setOnInsert": {  # server twin of the bundled inbox gift (claim-once server-side)
        "msg_id": "welcome", "user_id": None, "kind": "gift", "title": "Welcome, Rival!", "body": "A gift to start your run.", "attachment": {"gems": 10}, "created_at": now() - timedelta(days=365)}}, upsert=True)
    await db.messages.update_one({"msg_id": "msg_welcome_online"}, {"$setOnInsert": {
        "msg_id": "msg_welcome_online", "user_id": None, "kind": "announcement", "title": "Rush Rivals goes online!",
        "body": "Leaderboards and events are live. Here are some gems to celebrate.", "attachment": {"gems": 10}, "created_at": now() - timedelta(minutes=1)}}, upsert=True)
    await db.remote_config.update_one({"_id": "active"}, {"$setOnInsert": {"version": 1, "maintenance": False, "min_supported_version": "1.0.0", "latest_version": "1.0.0", "flags": {"events": True, "leaderboard": True, "shop": True}}}, upsert=True)
    await seed_phase6(db)
    print("seeded")


DEMO_ADMIN_PW = "RushAdmin-Demo-2026!"  # demo staff accounts (one per role); TOTP is enrolled on first sign-in
FAQ = [("Is Rush Rivals free?", "Yes. Rush Rivals is free to play. Optional ads and in-app purchases are available."),
       ("Can I play offline?", "Yes. Runs, coins and unlocks work offline; sign in to sync progress and join leaderboards."),
       ("How do I save my progress?", "Create an account or sign in with Google from Settings → Account. Your progress syncs automatically."),
       ("How do I restore purchases?", "Open the Shop and tap Restore purchases while signed in to the same Google Play account."),
       ("How do I delete my account?", "In the app: Settings → Account → Delete account. On the web: use the Account & Data Deletion page.")]


async def seed_phase6(db):
    from rr.admin_seed import seed_owner
    from rr.core import new_id
    await seed_owner()
    for role in ("liveops_editor", "publisher", "support", "finance", "moderator", "viewer"):
        email = f"{role.replace('_', '.')}@rushrivals.test"
        await db.admins.update_one({"email": email}, {"$setOnInsert": {"admin_id": f"adm_demo_{role}", "email": email, "name": role.replace("_", " ").title(), "role": role,
                                                                      "password_hash": hash_password(DEMO_ADMIN_PW), "totp_enrolled": False, "disabled": False, "failures": [],
                                                                      "created_by": "seed", "seed": "demo", "created_at": now()}}, upsert=True)
    for i, (q, a) in enumerate(FAQ):
        await db.faq.update_one({"faq_id": f"faq_seed_{i}"}, {"$setOnInsert": {"faq_id": f"faq_seed_{i}", "question": q, "answer": a, "order": i, "status": "published",
                                                                               "created_by": "seed", "created_at": now(), "updated_at": now(), "published_at": now()}}, upsert=True)
    # Clearly-marked demo players / runs / ticket / report for the admin panel
    names = ["DemoDash", "DemoBlaze", "DemoPixel"]
    ids = []
    for n in names:
        email = f"{n.lower()}@demo.rushrivals.test"
        if not await db.users.find_one({"email": email}):
            await create_user(email, n, "password", hash_password("DemoPlayer123!"))
            await db.users.update_one({"email": email}, {"$set": {"seed": "demo"}})
        ids.append((await db.users.find_one({"email": email}, {"user_id": 1}))["user_id"])
    for k, uid in enumerate(ids):
        for j in range(3):
            rid = f"run_demo_{k}_{j}"
            await db.runs.update_one({"run_id": rid}, {"$setOnInsert": {"run_id": rid, "user_id": uid, "mode": "online", "world": "city", "status": "finished", "seed": "demo",
                                                                       "day": (now() - timedelta(days=j)).strftime("%Y-%m-%d"), "created_at": now() - timedelta(days=j),
                                                                       "finished_at": now() - timedelta(days=j), "report": {"score": 4000 + 1500 * k + 300 * j, "distance": 900 + 200 * j, "coins": 120, "duration": 75 + 10 * j}}}, upsert=True)
            day = (now() - timedelta(days=j)).strftime("%Y-%m-%d")
            await db.scores.update_one({"run_id": rid}, {"$setOnInsert": {"run_id": rid, "user_id": uid, "name": names[k], "score": 4000 + 1500 * k + 300 * j, "day": day,
                                                                         "week": week_key(now() - timedelta(days=j)), "seed": "demo", "created_at": now() - timedelta(days=j)}}, upsert=True)
    await db.tickets.update_one({"ticket_no": "RR-DEMO01"}, {"$setOnInsert": {"ticket_no": "RR-DEMO01", "user_id": ids[0], "email": "demodash@demo.rushrivals.test", "category": "purchase",
                                                                            "message": "[DEMO] I bought gems but didn't receive them.", "source": "app", "status": "open", "seed": "demo",
                                                                            "created_at": now(), "updated_at": now()}}, upsert=True)
    await db.reports.update_one({"report_id": "rep_demo01"}, {"$setOnInsert": {"report_id": "rep_demo01", "reporter_id": ids[0], "target_user_id": ids[1], "reason": "cheating",
                                                                             "details": "[DEMO] Impossible score on the weekly board.", "status": "open", "seed": "demo", "created_at": now(), "updated_at": now()}}, upsert=True)


if __name__ == "__main__":
    asyncio.run(main())
