"""Phase 3 backend tests: auth matrix, idempotency + 50-parallel concurrency, 20 forged runs, rate limits, migrations.
Run: cd /app/backend && python -m pytest tests -q"""
import asyncio
import os
import sys
import uuid

import httpx
import jwt
import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ["EXPOSE_RESET_CODE_FOR_TESTS"] = "1"

from rr import core  # noqa: E402
from rr.routers import auth as auth_mod  # noqa: E402

TEST_DB = f"rr_test_{uuid.uuid4().hex[:6]}"


@pytest_asyncio.fixture
async def client(monkeypatch):
    import server
    from migrations.runner import migrate_up

    db = core.use_db(TEST_DB)
    from pymongo.errors import AutoReconnect
    for attempt in range(3):  # pooled sockets are occasionally closed by the shared dev mongod between tests
        try:
            await migrate_up(db)
            break
        except AutoReconnect:
            await asyncio.sleep(0.5)
    core.limiter.reset()

    async def no_mail(**_kw):
        return "test"

    monkeypatch.setattr(auth_mod, "send_email", no_mail)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url="http://t") as c:
        yield c
    core.limiter.reset()
    await core._client.drop_database(TEST_DB)


async def register(c, email=None, pw="password123"):
    email = email or f"u{uuid.uuid4().hex[:8]}@test.dev"
    r = await c.post("/api/v1/auth/register", json={"email": email, "password": pw})
    assert r.status_code == 201, r.text
    d = r.json()
    core.limiter.reset()
    return {"Authorization": f"Bearer {d['access_token']}"}, d


def ik():
    return {"Idempotency-Key": uuid.uuid4().hex}


async def give(user_id, coins=0, gems=0):
    await core.get_db().users.update_one({"user_id": user_id}, {"$inc": {"wallet.coins": coins, "wallet.gems": gems}})


# ---------------------------------------------------------------- auth matrix
PROTECTED = [("get", "/api/v1/me"), ("post", "/api/v1/me/link"), ("get", "/api/v1/me/ledger"), ("post", "/api/v1/purchases"), ("post", "/api/v1/daily/claim"),
             ("get", "/api/v1/missions"), ("post", "/api/v1/missions/m_runs/claim"), ("post", "/api/v1/achievements/a_runs10/claim"), ("put", "/api/v1/me/preferences"),
             ("put", "/api/v1/me/equipped"), ("post", "/api/v1/runs/start"), ("post", "/api/v1/runs/finish"), ("post", "/api/v1/runs/offline"), ("post", "/api/v1/reports"),
             ("post", "/api/v1/events/evt/claim"), ("get", "/api/v1/inbox"), ("post", "/api/v1/inbox/m/claim"), ("post", "/api/v1/auth/logout"), ("post", "/api/v1/auth/delete-account")]


@pytest.mark.asyncio
async def test_auth_matrix_401(client):
    for m, p in PROTECTED:
        for hdr in ({}, {"Authorization": "Bearer garbage"}, {"Authorization": "Bearer " + jwt.encode({"sub": "x", "type": "access"}, "wrong", algorithm="HS256")}):
            r = await getattr(client, m)(p, headers=hdr, **({"json": {}} if m != "get" else {}))
            assert r.status_code == 401, (m, p, r.status_code)
            assert set(r.json()["error"]) >= {"code", "message"}


@pytest.mark.asyncio
async def test_other_users_run_token_403_and_owned_items(client):
    a, _ = await register(client)
    b, _ = await register(client)
    s = (await client.post("/api/v1/runs/start", headers=a, json={})).json()
    rep = {"run_id": s["run_id"], "run_token": s["run_token"], "seed": s["seed"], "duration": 1, "distance": 8, "coins": 0, "score": 8}
    r = await client.post("/api/v1/runs/finish", headers={**b, **ik()}, json=rep)  # B submits A's run
    assert r.status_code == 400 and r.json()["error"]["code"] == "run_invalid"
    r = await client.put("/api/v1/me/equipped", headers=b, json={"kind": "character", "item_id": "kai"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "not_owned"


@pytest.mark.asyncio
async def test_register_login_refresh_rotation_logout(client):
    email = f"r{uuid.uuid4().hex[:6]}@test.dev"
    _, d = await register(client, email)
    assert (await client.post("/api/v1/auth/register", json={"email": email, "password": "password123"})).json()["error"]["message"] == "Email already registered"
    assert (await client.post("/api/v1/auth/register", json={"email": "x" + email, "password": "short"})).json()["error"]["message"] == "Password must be at least 8 characters"
    bad = await client.post("/api/v1/auth/login", json={"email": email, "password": "nope12345"})
    assert bad.status_code == 401 and bad.json()["error"]["message"] == "Sign-in failed. Check your details and try again."
    r1 = (await client.post("/api/v1/auth/refresh", json={"refresh_token": d["refresh_token"]})).json()
    assert "access_token" in r1
    reuse = await client.post("/api/v1/auth/refresh", json={"refresh_token": d["refresh_token"]})  # rotated token reused
    assert reuse.status_code == 401
    fam = await client.post("/api/v1/auth/refresh", json={"refresh_token": r1["refresh_token"]})  # whole family revoked
    assert fam.status_code == 401


@pytest.mark.asyncio
async def test_password_reset_code(client):
    email = f"p{uuid.uuid4().hex[:6]}@test.dev"
    await register(client, email)
    code = (await client.post("/api/v1/auth/forgot-password", json={"email": email})).json()["debug_code"]
    wrong = await client.post("/api/v1/auth/reset-password", json={"email": email, "code": "000000" if code != "000000" else "111111", "new_password": "newpass123"})
    assert wrong.json()["error"]["code"] == "invalid_code"
    ok = await client.post("/api/v1/auth/reset-password", json={"email": email, "code": code, "new_password": "newpass123"})
    assert ok.status_code == 200
    again = await client.post("/api/v1/auth/reset-password", json={"email": email, "code": code, "new_password": "other1234"})
    assert again.status_code == 400  # single use
    await core.get_db().reset_codes.update_many({}, {"$set": {"expires_at": core.now()}})
    assert (await client.post("/api/v1/auth/login", json={"email": email, "password": "newpass123"})).status_code == 200


@pytest.mark.asyncio
async def test_delete_account_requires_DELETE(client):
    h, d = await register(client)
    assert (await client.post("/api/v1/auth/delete-account", headers=h, json={"confirm": "delete"})).status_code == 400
    assert (await client.post("/api/v1/auth/delete-account", headers=h, json={"confirm": "DELETE"})).status_code == 200
    assert await core.get_db().users.find_one({"user_id": d["user"]["user_id"]}) is None
    assert (await client.get("/api/v1/me", headers=h)).status_code == 401


@pytest.mark.asyncio
async def test_link_conflict_sets_not_adds(client):
    h, _ = await register(client)
    local = {"coins": 500, "gems": 7, "hoverboards": 1, "xp": 10, "best_score": 900, "inventory": {"character": ["rush", "zoe"]}, "equipped": {}}
    r = await client.post("/api/v1/me/link", headers=h, json={"local": local})
    assert r.json()["user"]["wallet"]["coins"] == 500
    conflict = await client.post("/api/v1/me/link", headers=h, json={"local": {**local, "coins": 50}})
    assert conflict.status_code == 409 and conflict.json()["error"]["details"]["cloud"]["coins"] == 500
    dev = await client.post("/api/v1/me/link", headers=h, json={"local": {**local, "coins": 50}, "choice": "device"})
    assert dev.json()["user"]["wallet"]["coins"] == 50
    cloud = await client.post("/api/v1/me/link", headers=h, json={"local": {**local, "coins": 9999}, "choice": "cloud"})
    assert cloud.json()["user"]["wallet"]["coins"] == 50


# ------------------------------------------------------- idempotency + concurrency
@pytest.mark.asyncio
async def test_idempotency_required_and_replay(client):
    h, d = await register(client)
    await give(d["user"]["user_id"], gems=100)
    assert (await client.post("/api/v1/purchases", headers=h, json={"kind": "shop", "item_id": "coins-5k"})).json()["error"]["code"] == "idempotency_key_required"
    k = ik()
    r1 = (await client.post("/api/v1/purchases", headers={**h, **k}, json={"kind": "shop", "item_id": "coins-5k"})).json()
    r2 = (await client.post("/api/v1/purchases", headers={**h, **k}, json={"kind": "shop", "item_id": "coins-5k"})).json()
    assert r1["wallet"] == r2["wallet"] and r2["replayed"] is True
    me = (await client.get("/api/v1/me", headers=h)).json()["user"]["wallet"]
    assert me["gems"] == 50 and me["coins"] == 5000


@pytest.mark.asyncio
async def test_50_parallel_same_key_and_distinct_keys_no_negative(client):
    h, d = await register(client)
    uid = d["user"]["user_id"]
    await give(uid, gems=120)  # enough for exactly 2 purchases of 50
    same = ik()
    rs = await asyncio.gather(*[client.post("/api/v1/purchases", headers={**h, **same}, json={"kind": "shop", "item_id": "coins-5k"}) for _ in range(50)])
    assert sum(1 for r in rs if r.status_code == 200 and not r.json().get("replayed")) == 1
    core.limiter.reset()
    rs = await asyncio.gather(*[client.post("/api/v1/purchases", headers={**h, **ik()}, json={"kind": "shop", "item_id": "coins-5k"}) for _ in range(50)])
    core.limiter.reset()
    ok = [r for r in rs if r.status_code == 200]
    w = (await client.get("/api/v1/me", headers=h)).json()["user"]["wallet"]
    assert w["gems"] >= 0 and w["gems"] == 120 - 50 * (1 + len(ok))
    assert len(ok) == 1  # 70 gems left after first → only one more fits
    assert await core.get_db().ledger.count_documents({"user_id": uid, "reason": "shop"}) == 2


@pytest.mark.asyncio
async def test_daily_claim_once_concurrent(client):
    h, _ = await register(client)
    rs = await asyncio.gather(*[client.post("/api/v1/daily/claim", headers={**h, **ik()}) for _ in range(20)])
    assert sum(r.status_code == 200 for r in rs) == 1


@pytest.mark.asyncio
async def test_inbox_attachment_claim_once_two_devices(client):
    h, d = await register(client)
    await core.get_db().messages.insert_one({"msg_id": "m1", "user_id": None, "title": "Hi", "body": "Gems", "attachment": {"gems": 10}, "created_at": core.now()})
    dev2 = {"Authorization": "Bearer " + core.make_access(d["user"]["user_id"])}
    rs = await asyncio.gather(*[client.post("/api/v1/inbox/m1/claim", headers={**(h if i % 2 else dev2), **ik()}) for i in range(10)])
    assert sum(r.status_code == 200 for r in rs) == 1
    assert (await client.get("/api/v1/me", headers=h)).json()["user"]["wallet"]["gems"] == 10


# ------------------------------------------------------------------- runs
async def start(client, h):
    return (await client.post("/api/v1/runs/start", headers=h, json={"world": "city"})).json()


def good(s, **kw):
    base = {"run_id": s["run_id"], "run_token": s["run_token"], "seed": s["seed"], "duration": 2, "distance": 17.5, "coins": 2, "score": 37}
    base.update(kw)
    return base


@pytest.mark.asyncio
async def test_valid_run_grants_exact_coins_and_replay(client):
    h, _ = await register(client)
    s = await start(client, h)
    await asyncio.sleep(2.1)
    k = ik()
    r = await client.post("/api/v1/runs/finish", headers={**h, **k}, json=good(s))
    assert r.status_code == 200, r.text
    assert r.json()["wallet"]["coins"] == 2
    r2 = await client.post("/api/v1/runs/finish", headers={**h, **k}, json=good(s))
    assert r2.json()["replayed"] and r2.json()["wallet"]["coins"] == 2
    lb = (await client.get("/api/v1/leaderboard?period=daily", headers=h)).json()
    assert lb["me"]["score"] == 37 and lb["items"][0]["me"]


@pytest.mark.asyncio
async def test_20_forged_reports_rejected(client):
    h, d = await register(client)
    other, _ = await register(client)
    forged = []
    for case in range(20):
        s = await start(client, h)
        g = good(s)
        mods = [
            {"distance": 5000},                       # impossible distance for 2 s
            {"coins": 500, "score": 5017},             # coin rate
            {"score": 999999},                         # score formula (too high)
            {"score": 1},                              # score formula (too low)
            {"duration": 3600, "distance": 50000, "coins": 100, "score": 51000},  # longer than server time
            {"seed": s["seed"] + 1},                   # wrong seed
            {"run_token": "x.y.z"},                    # garbage token
            {"run_token": jwt.encode({"run_id": s["run_id"], "sub": d["user"]["user_id"], "seed": s["seed"]}, "forged", algorithm="HS256")},
            {"run_id": "run_doesnotexist"},            # token/run mismatch
            {"run_token": None},                       # missing token
            {"coins": 40, "distance": 30, "score": 430},  # coins > distance-based cap
            {"distance": 2000, "score": 2037},
            {"score": 37, "coins": 0},                 # coins dropped but score kept
            {"event_tokens": 99},                      # event tokens > coins
            {"duration": 1000, "distance": 9000, "score": 9020},
            {"coins": 300, "score": 3017, "distance": 17.5},
            {"score": 100000, "distance": 50000},
            {"distance": 900, "score": 920},
            {"run_token": jwt.encode({"run_id": s["run_id"], "sub": "usr_other", "seed": s["seed"]}, core.RUN_SECRET, algorithm="HS256")},
            {},                                        # reused token (submitted twice below)
        ][case]
        if case == 19:
            await asyncio.sleep(2.1)
            ok = await client.post("/api/v1/runs/finish", headers={**h, **ik()}, json=g)
            assert ok.status_code == 200, ok.text
        r = await client.post("/api/v1/runs/finish", headers={**h, **ik()}, json={**g, **mods})
        core.limiter.reset()
        forged.append((case, r.status_code, r.json().get("error", {}).get("code")))
    bad = [f for f in forged if not (f[1] == 400 and f[2] == "run_invalid")]
    assert not bad, bad
    w = (await client.get("/api/v1/me", headers=h)).json()["user"]["wallet"]
    assert w["coins"] == 2  # only the one valid run granted
    assert len((await client.get("/api/v1/leaderboard?period=all")).json()["items"]) == 1


@pytest.mark.asyncio
async def test_offline_run_capped_and_off_leaderboard(client):
    h, _ = await register(client)
    rep = {"run_id": "run_off_" + uuid.uuid4().hex[:6], "seed": 1, "duration": 200, "distance": 3500, "coins": 700, "score": 10500}
    r = await client.post("/api/v1/runs/offline", headers={**h, **ik()}, json=rep)
    assert r.status_code == 200, r.text
    assert r.json()["granted"]["coins"] == 300 and r.json()["leaderboard"] is False
    assert (await client.get("/api/v1/leaderboard?period=all")).json()["items"] == []


@pytest.mark.asyncio
async def test_banned_excluded(client):
    h, d = await register(client)
    s = await start(client, h)
    await asyncio.sleep(2.1)
    await client.post("/api/v1/runs/finish", headers={**h, **ik()}, json=good(s))
    await core.get_db().users.update_one({"user_id": d["user"]["user_id"]}, {"$set": {"banned": True}})
    assert (await client.get("/api/v1/leaderboard?period=all")).json()["items"] == []


# ------------------------------------------------------------- rate limits
@pytest.mark.asyncio
async def test_login_rate_limit_11th_is_429(client):
    codes = [(await client.post("/api/v1/auth/login", json={"email": "a@b.co", "password": "x"})).status_code for _ in range(11)]
    assert codes[:10] == [401] * 10 and codes[10] == 429


@pytest.mark.asyncio
async def test_gameplay_rate_limit(client):
    h, _ = await register(client)
    codes = [(await client.post("/api/v1/runs/start", headers=h, json={})).status_code for _ in range(31)]
    assert codes[:30] == [200] * 30
    last = await client.post("/api/v1/runs/start", headers=h, json={})
    assert last.status_code == 429 and last.json()["error"]["code"] == "rate_limited"


# ---------------------------------------------------------- misc + migrations
@pytest.mark.asyncio
async def test_pagination_cap_and_error_shape(client):
    r = await client.get("/api/v1/leaderboard?limit=1000")
    assert r.status_code == 200
    assert (await client.get("/api/v1/leaderboard?cursor=@@@")).json()["error"]["code"] == "bad_cursor"
    assert (await client.get("/api/v1/nope")).json()["error"]["code"] == "not_found"


@pytest.mark.asyncio
async def test_validator_blocks_negative_wallet(client):
    _, d = await register(client)
    from pymongo.errors import WriteError
    with pytest.raises(WriteError):
        await core.get_db().users.update_one({"user_id": d["user"]["user_id"]}, {"$set": {"wallet.coins": -5}})


@pytest.mark.asyncio
async def test_migrations_up_down_up():
    from migrations.runner import migrate_down, migrate_up
    db = core.use_db(TEST_DB + "_mig")
    assert await migrate_up(db) == ["0001_init", "0002_billing", "0003_admin"]
    assert await migrate_up(db) == []
    assert "email_1" in await db.users.index_information()
    assert "uniq_token" in await db.iap_purchases.index_information()
    assert await migrate_down(db) == ["0003_admin"]
    assert "uniq_slug" not in await db.news.index_information()
    assert await migrate_down(db) == ["0002_billing"]
    assert "uniq_token" not in await db.iap_purchases.index_information()
    assert await migrate_down(db) == ["0001_init"]
    assert "email_1" not in await db.users.index_information()
    assert await migrate_up(db) == ["0001_init", "0002_billing", "0003_admin"]
    await core._client.drop_database(TEST_DB + "_mig")
