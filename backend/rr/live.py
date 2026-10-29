"""Published live config (Phase 6): one immutable, versioned document drives remote config, catalogue
prices/unlocks, missions, achievements, daily rewards and events. Publishing applies it in-process
(mutating the catalog module tables in place, so every router sees it) and syncs events + remote_config."""
from __future__ import annotations

import copy
from datetime import datetime, timezone

from . import catalog as C
from .core import get_db, now

UNLOCK_LEVELS = {"beach": 3, "snow": 6, "night": 9, "temple": 12, "lava": 15}
_BASE = {"items": copy.deepcopy(C.ITEMS), "missions": copy.deepcopy(C.MISSIONS), "achievements": copy.deepcopy(C.ACHIEVEMENTS), "daily": copy.deepcopy(C.DAILY_REWARDS), "remote": copy.deepcopy(C.DEFAULT_CONFIG)}
current_version = 0


def _price_out(p):
    return None if p is None else ("ad" if p == "ad" else {"currency": p[0], "amount": p[1]})


def defaults() -> dict:
    r = _BASE["remote"]
    return {
        "remote": {"maintenance": r["maintenance"], "min_supported_version": r["min_supported_version"], "latest_version": r["latest_version"], "store_url": r["store_url"],
                   "store_url_android": None, "release_notes": "", "flags": dict(r["flags"])},
        "catalog": {k: {i: {"price": _price_out(p), "unlock_level": UNLOCK_LEVELS.get(i), "enabled": True} for i, p in v.items()} for k, v in _BASE["items"].items()},
        "missions": copy.deepcopy(_BASE["missions"]), "achievements": copy.deepcopy(_BASE["achievements"]), "daily_rewards": copy.deepcopy(_BASE["daily"]), "events": [],
    }


def _iso(d):
    return d.astimezone(timezone.utc).isoformat() if isinstance(d, datetime) else d


def _dt(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")) if isinstance(s, str) else s


def apply(data: dict, version: int) -> None:
    """Make `data` the live config in this process."""
    global current_version
    for kind, items in data["catalog"].items():
        tbl = C.ITEMS.setdefault(kind, {})
        tbl.clear()
        for i, it in items.items():
            if not it.get("enabled", True):
                continue  # disabled items can't be bought / unlocked
            p = it.get("price")
            tbl[i] = None if p is None else ("ad" if p == "ad" else (p["currency"], int(p["amount"])))
    C.UNLOCK_LEVELS = {k: {i: it.get("unlock_level") for i, it in v.items() if it.get("unlock_level")} for k, v in data["catalog"].items()}
    C.MISSIONS[:] = data["missions"]
    C.ACHIEVEMENTS[:] = data["achievements"]
    C.DAILY_REWARDS[:] = data["daily_rewards"]
    C.DEFAULT_CONFIG.update({k: v for k, v in data["remote"].items()}, version=version)
    C.CATALOG_VERSION = version
    current_version = version


async def sync_db(data: dict, version: int) -> None:
    db = get_db()
    await db.remote_config.replace_one({"_id": "active"}, {**data["remote"], "version": version, "updated_at": now()}, upsert=True)
    ids = []
    for e in data.get("events", []):
        ids.append(e["event_id"])
        await db.events.update_one({"event_id": e["event_id"]}, {"$set": {**e, "starts_at": _dt(e["starts_at"]), "ends_at": _dt(e["ends_at"]) if e.get("enabled", True) else now(), "source": "config"},
                                                                 "$setOnInsert": {"created_at": now()}}, upsert=True)
    await db.events.update_many({"source": "config", "event_id": {"$nin": ids}}, {"$set": {"ends_at": now()}})  # removed from config -> ended


async def published() -> dict:
    pub = await get_db().config_versions.find_one({"status": "published"}, {"_id": 0}, sort=[("version", -1)])
    if not pub:  # fresh database (e.g. tests): create v1 lazily
        await bootstrap()
        pub = await get_db().config_versions.find_one({"status": "published"}, {"_id": 0}, sort=[("version", -1)])
    return pub


async def bootstrap() -> None:
    """At startup: create v1 from defaults + existing events if nothing was ever published; then apply."""
    db = get_db()
    pub = await db.config_versions.find_one({"status": "published"}, {"_id": 0}, sort=[("version", -1)])
    if not pub:
        data = defaults()
        data["remote"].update({k: v for k, v in (await db.remote_config.find_one({"_id": "active"}, {"_id": 0, "updated_at": 0, "version": 0}) or {}).items() if k in data["remote"]})
        data["events"] = [{"event_id": e["event_id"], "name": e.get("name"), "world": e.get("world"), "description": e.get("description", ""), "art": e.get("art"),
                           "rule": e.get("rule"), "rewards": e.get("rewards"), "starts_at": _iso(e["starts_at"]), "ends_at": _iso(e["ends_at"]), "enabled": True}
                          async for e in db.events.find({}, {"_id": 0})]
        try:
            await db.config_versions.insert_one({"version": 1, "status": "published", "data": data, "note": "Bootstrap from bundled defaults", "author": "system",
                                                 "approver": "system", "publisher": "system", "created_at": now(), "published_at": now()})
        except Exception:  # concurrent bootstrap
            pass
        pub = await db.config_versions.find_one({"status": "published"}, {"_id": 0}, sort=[("version", -1)])
    apply(copy.deepcopy(pub["data"]), pub["version"])
    await sync_db(pub["data"], pub["version"])
