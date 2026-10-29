"""Migration runner. CLI: python -m migrations.runner up|down [steps]. Applied ids live in `_migrations`."""
import asyncio
import os
import sys

from . import m0001_init, m0002_billing, m0003_admin

MIGRATIONS = [m0001_init, m0002_billing, m0003_admin]


async def migrate_up(db):
    done = {d["_id"] async for d in db["_migrations"].find({})}
    applied = []
    for m in MIGRATIONS:
        if m.ID not in done:
            await m.up(db)
            await db["_migrations"].update_one({"_id": m.ID}, {"$set": {"applied_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc)}}, upsert=True)
            applied.append(m.ID)
    return applied


async def migrate_down(db, steps: int = 1):
    done = {d["_id"] async for d in db["_migrations"].find({})}
    reverted = []
    for m in reversed(MIGRATIONS):
        if steps <= 0:
            break
        if m.ID in done:
            await m.down(db)
            await db["_migrations"].delete_one({"_id": m.ID})
            reverted.append(m.ID)
            steps -= 1
    return reverted


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
    from rr.core import get_db

    cmd = sys.argv[1] if len(sys.argv) > 1 else "up"
    res = asyncio.run(migrate_up(get_db()) if cmd == "up" else migrate_down(get_db(), int(sys.argv[2]) if len(sys.argv) > 2 else 1))
    print(cmd, res)
