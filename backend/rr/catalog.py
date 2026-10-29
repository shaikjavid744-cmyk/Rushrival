"""Server catalog — mirrors mobile/src/config/catalog.ts (prices, rewards). Versioned."""
CATALOG_VERSION = 3

# kind -> id -> (currency, price). price None = free/default.
ITEMS = {  # "ad" items unlock via rewarded ads (Phase 4) — not purchasable here
    "character": {"rush": None, "zoe": ("coins", 25000), "kai": ("coins", 50000), "shadow": ("gems", 150), "nova": ("gems", 300), "leo": "ad"},
    "board": {"default": None, "flame": ("coins", 10000), "neon": ("coins", 20000), "dragon": ("gems", 100), "ice": ("gems", 200), "galaxy": "ad"},
    "world": {"city": None, "beach": ("coins", 5000), "snow": ("coins", 15000), "night": ("gems", 120), "temple": ("gems", 200), "lava": ("gems", 300)},
}
SHOP = {"hb-3": ("coins", 1500, {"hoverboards": 3}), "coins-5k": ("gems", 50, {"coins": 5000}), "coins-15k": ("gems", 120, {"coins": 15000})}
DAILY_REWARDS = [{"coins": 200}, {"coins": 400}, {"gems": 5}, {"coins": 800}, {"coins": 1200}, {"gems": 15}, {"gems": 40}]
MISSIONS = [  # daily, from server-validated run stats
    {"id": "m_runs", "stat": "runs", "target": 3, "reward": {"coins": 150}, "title": "Play 3 runs"},
    {"id": "m_coins", "stat": "coins", "target": 300, "reward": {"coins": 250}, "title": "Collect 300 coins"},
    {"id": "m_dist", "stat": "distance", "target": 2000, "reward": {"gems": 2}, "title": "Run 2,000 m"},
]
ACHIEVEMENTS = [
    {"id": "a_runs10", "stat": "total_runs", "target": 10, "reward": {"gems": 5}, "title": "Run 10 times"},
    {"id": "a_coins1k", "stat": "total_coins", "target": 1000, "reward": {"coins": 500}, "title": "Collect 1,000 coins"},
    {"id": "a_score10k", "stat": "best_score", "target": 10000, "reward": {"gems": 10}, "title": "Score 10,000"},
]
DEFAULT_CONFIG = {
    "version": 1, "maintenance": False, "min_supported_version": "1.0.0", "latest_version": "1.0.0",
    "store_url": "https://play.google.com/store/apps/details?id=com.rushrivals.app",
    "flags": {"events": True, "leaderboard": True, "shop": True},
}
# Run plausibility (mirrors src/game/constants.ts TUNING)
START_SPEED, MAX_SPEED, ACCEL, BOOST, BOOST_S = 8.5, 26.0, 0.11, 1.6, 5.0
OFFLINE_COIN_CAP = 300
OFFLINE_RUNS_PER_DAY = 20


# ---- Phase 4: real-money products (Google Play one-time products) -----------------------------
# IDs are PLACEHOLDERS — configure in Play Console with exactly these IDs (or change both here and
# in mobile/src/monetization/products.ts). consumable=True -> consumed after verification.
PRODUCTS = {
    "rr_coins_10k": {"consumable": True, "grant": {"coins": 10000}},
    "rr_coins_60k": {"consumable": True, "grant": {"coins": 60000}},
    "rr_gems_100": {"consumable": True, "grant": {"gems": 100}},
    "rr_gems_550": {"consumable": True, "grant": {"gems": 550}},
    "rr_gems_1200": {"consumable": True, "grant": {"gems": 1200}},
    "rr_starter_bundle": {"consumable": False, "grant": {"coins": 20000, "gems": 100, "hoverboards": 5, "entitlements": ["starter_bundle"]}},
    "rr_bundle_neon": {"consumable": False, "grant": {"items": {"board": ["neon"], "character": ["zoe"]}, "entitlements": ["bundle_neon"]}},
    "rr_bundle_inferno": {"consumable": False, "grant": {"items": {"board": ["flame"], "character": ["shadow"]}, "entitlements": ["bundle_inferno"]}},
    "rr_remove_ads": {"consumable": False, "grant": {"entitlements": ["remove_ads"]}},
}
AD_UNLOCK_TARGET = 5       # completed rewarded views to unlock Leo / Galaxy
AD_REWARDS_PER_DAY = 40    # server cap on rewarded grants per player per day
