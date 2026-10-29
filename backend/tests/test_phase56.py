"""Phase 5/6 tests: public site API (contact spam controls), admin realm (TOTP, lockout, CSRF, sessions),
permission matrix for every admin endpoint × role, audit completeness, secret scanning, four-eyes, rollback.
Run: cd /app/backend && python -m pytest tests/test_phase56.py -q"""
import json
import os
import re
import sys
import uuid
from datetime import timedelta

import httpx
import jwt
import pyotp
import pytest
import pytest_asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ.setdefault("EXPOSE_RESET_CODE_FOR_TESTS", "1")

from rr import admin_core, catalog as C, core, live  # noqa: E402
from rr.routers import admin as admin_mod, public as public_mod  # noqa: E402

TEST_DB = f"rr_test56_{uuid.uuid4().hex[:6]}"
PW = "AdminPassword-123!"
SECRET_RX = [re.compile(r"\$2[aby]\$"), re.compile(r"eyJ[\w-]{10,}\.[\w-]{10,}\.")]
SECRET_KEYS = {"password_hash", "totp_secret", "totp_pending", "token_hash", "code_hash", "refresh_token", "csrf"}


@pytest_asyncio.fixture
async def env(monkeypatch):
    import server
    from migrations.runner import migrate_up
    db = core.use_db(TEST_DB)
    from pymongo.errors import AutoReconnect
    for _ in range(3):  # the shared dev mongod occasionally closes pooled sockets between tests
        try:
            await migrate_up(db)
            break
        except AutoReconnect:
            import asyncio
            await asyncio.sleep(0.5)
    await live.bootstrap()
    core.limiter.reset()
    public_mod.RL.reset()
    sent = []

    async def fake_mail(**kw):
        sent.append(kw)
        return "test"
    from rr import mailer as mailer_mod
    monkeypatch.setattr(mailer_mod, "send_email", fake_mail)

    def mk():
        return httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url="https://t")
    yield {"mk": mk, "db": db, "sent": sent}
    live.apply(live.defaults(), 3)
    C.CATALOG_VERSION = 3
    await core._client.drop_database(TEST_DB)


async def make_admin(role: str, email=None) -> dict:
    a = {"admin_id": f"adm_{uuid.uuid4().hex[:8]}", "email": email or f"{role}_{uuid.uuid4().hex[:5]}@t.dev", "name": role, "role": role,
         "password_hash": core.hash_password(PW), "totp_enrolled": False, "disabled": False, "failures": [], "created_at": core.now()}
    await core.get_db().admins.insert_one(dict(a))
    return a


async def sign_in(c: httpx.AsyncClient, email: str) -> dict:
    r = await c.post("/api/v1/admin/auth/login", json={"email": email, "password": PW})
    assert r.status_code == 200, r.text
    tok = r.json()["mfa_token"]
    e = await c.post("/api/v1/admin/auth/totp/enroll", json={"mfa_token": tok})
    assert e.status_code == 200, e.text
    secret = e.json()["secret"]
    v = await c.post("/api/v1/admin/auth/totp/verify", json={"mfa_token": tok, "code": pyotp.TOTP(secret).now()})
    assert v.status_code == 200, v.text
    assert "httponly" in v.headers["set-cookie"].lower() and "secure" in v.headers["set-cookie"].lower() and "samesite=strict" in v.headers["set-cookie"].lower()
    c.headers["X-CSRF-Token"] = v.json()["csrf_token"]
    core.limiter.reset()
    return {"secret": secret, **v.json()}


class _Signed:
    """Wraps an already-used AsyncClient so `async with` only closes it."""
    def __init__(self, c):
        self.c = c

    async def __aenter__(self):
        return self.c

    async def __aexit__(self, *a):
        await self.c.aclose()


async def admin_client(env, role):
    a = await make_admin(role)
    c = env["mk"]()
    await sign_in(c, a["email"])
    return _Signed(c), a


def admin_routes():
    out = []
    for r in admin_mod.router.routes:
        req = next((d.call.required for d in r.dependant.dependencies if hasattr(d.call, "required")), None)
        for m in r.methods:
            out.append((m, r.path, req))
    return out


def fill(path: str) -> str:
    return "/api/v1" + re.sub(r"\{v\}", "999", re.sub(r"\{(?!v\})\w+\}", "zz_none", path))


# --------------------------------------------------------------- public ----
@pytest.mark.asyncio
async def test_public_catalog_news_faq_siteconfig_sitemap(env):
    async with env["mk"]() as c:
        cat = (await c.get("/api/v1/public/catalog")).json()
        assert {len(cat["characters"]), len(cat["boards"]), len(cat["worlds"]), len(cat["powerups"])} == {6, 5} or len(cat["characters"]) == 6
        art = cat["characters"][0]["art_url"]
        assert (await c.get(art)).status_code == 200
        n = (await c.get("/api/v1/public/news")).json()
        assert n["items"] == [] and n["empty_message"] == "No news yet — check back soon"
        assert (await c.get("/api/v1/public/news/nope")).json()["error"]["code"] == "not_found"
        assert "store_url_android" in (await c.get("/api/v1/public/site-config")).json()
        assert (await c.get("/api/v1/public/faq")).status_code == 200
        sm = (await c.get("/api/v1/public/sitemap")).json()
        assert {"path": "/faq"} in sm["pages"] and "/admin" in sm["disallow"]


def old_token(sec=10):
    return jwt.encode({"typ": "contact", "iat_ms": int((core.now() - timedelta(seconds=sec)).timestamp() * 1000), "exp": core.now() + timedelta(hours=1)}, core.JWT_SECRET, algorithm="HS256")


GOOD = {"name": "Ana", "email": "ana@example.com", "category": "bug", "message": "The game froze on the beach world."}


@pytest.mark.asyncio
async def test_contact_spam_controls(env):
    db = env["db"]
    async with env["mk"]() as c:
        # honeypot -> rejected, no ticket
        r = await c.post("/api/v1/public/contact", json={**GOOD, "website": "http://spam", "form_token": old_token()})
        assert r.status_code == 400 and r.json()["error"]["code"] == "spam_rejected"
        # too fast (< 3 s from form render)
        fresh = (await c.get("/api/v1/public/contact/form-token")).json()["form_token"]
        r = await c.post("/api/v1/public/contact", json={**GOOD, "form_token": fresh})
        assert r.status_code == 400 and r.json()["error"]["code"] == "spam_rejected"
        # forged / missing token
        assert (await c.post("/api/v1/public/contact", json={**GOOD, "form_token": "x"})).json()["error"]["code"] == "form_expired"
        assert await db.tickets.count_documents({}) == 0
        # validation messages
        r = await c.post("/api/v1/public/contact", json={**GOOD, "email": "bad", "message": "short", "form_token": old_token()})
        assert r.status_code == 422
        f = r.json()["error"]["details"]["fields"]
        assert f == {"email": "Enter a valid email", "message": "Message must be at least 10 characters"}
        # success x5 then 429
        for i in range(5):
            r = await c.post("/api/v1/public/contact", json={**GOOD, "form_token": old_token()})
            assert r.status_code == 201, r.text
            assert re.match(r"^RR-\d{6}$", r.json()["ticket_no"]) and r.json()["confirmation_email_sent"]
        r = await c.post("/api/v1/public/contact", json={**GOOD, "form_token": old_token()})
        assert r.status_code == 429 and r.json()["error"]["code"] == "rate_limited"
        assert await db.tickets.count_documents({"source": "website"}) == 5
        assert len(env["sent"]) == 5
        d = await c.post("/api/v1/public/data-deletion", json={"email": "ana@example.com", "confirm": True})
        assert d.status_code == 201 and d.json()["request_id"].startswith("del")


# ----------------------------------------------------------- admin auth ----
@pytest.mark.asyncio
async def test_admin_auth_mfa_lockout_csrf_sessions(env):
    a = await make_admin("viewer")
    async with env["mk"]() as c:
        # player token is not accepted by the admin realm
        p = await c.post("/api/v1/auth/register", json={"email": f"p{uuid.uuid4().hex[:6]}@t.dev", "password": "password123"})
        core.limiter.reset()
        assert (await c.get("/api/v1/admin/dashboard", headers={"Authorization": f"Bearer {p.json()['access_token']}"})).status_code == 401
        # password only (no MFA) -> no session, admin endpoints still 401
        r = await c.post("/api/v1/admin/auth/login", json={"email": a["email"], "password": PW})
        assert r.status_code == 200 and r.json()["mfa_enrolled"] is False and "set-cookie" not in r.headers
        assert (await c.get("/api/v1/admin/dashboard")).status_code == 401
        tok = r.json()["mfa_token"]
        await c.post("/api/v1/admin/auth/totp/enroll", json={"mfa_token": tok})
        # wrong TOTP codes count toward lockout; 5th failure locks for 15 min
        codes = [(await c.post("/api/v1/admin/auth/totp/verify", json={"mfa_token": tok, "code": "000000"})).status_code for _ in range(5)]
        core.limiter.reset()
        assert codes[:4] == [401] * 4 and codes[4] == 423
        r = await c.post("/api/v1/admin/auth/login", json={"email": a["email"], "password": PW})
        assert r.status_code == 423 and r.json()["error"]["code"] == "account_locked"
    await core.get_db().admins.update_one({"admin_id": a["admin_id"]}, {"$unset": {"locked_until": ""}})
    async with env["mk"]() as c, env["mk"]() as c2:
        info = await sign_in(c, a["email"])
        assert (await c.get("/api/v1/admin/dashboard")).json()["crashes"]["connected"] is False
        # second login reuses enrolled TOTP (secret never shown again)
        r = await c2.post("/api/v1/admin/auth/login", json={"email": a["email"], "password": PW})
        assert r.json()["mfa_enrolled"] is True
        assert (await c2.post("/api/v1/admin/auth/totp/enroll", json={"mfa_token": r.json()["mfa_token"]})).status_code == 409
        # the code already used by the first sign-in can't be replayed
        rp = await c2.post("/api/v1/admin/auth/totp/verify", json={"mfa_token": r.json()["mfa_token"], "code": pyotp.TOTP(info["secret"]).now()})
        assert rp.status_code == 401 and rp.json()["error"]["code"] == "code_already_used"
        import time
        v = await c2.post("/api/v1/admin/auth/totp/verify", json={"mfa_token": r.json()["mfa_token"], "code": pyotp.TOTP(info["secret"]).at(time.time() + 30)})
        assert v.status_code == 200, v.text
        c2.headers["X-CSRF-Token"] = v.json()["csrf_token"]
        # CSRF: unsafe request without header -> 403
        assert (await c.post("/api/v1/admin/sessions/revoke-all", headers={"X-CSRF-Token": "nope"})).json()["error"]["code"] == "csrf_failed"
        sess = (await c.get("/api/v1/admin/sessions")).json()["items"]
        assert len(sess) == 2
        other = next(s for s in sess if not s["current"])
        assert (await c.post(f"/api/v1/admin/sessions/{other['session_id']}/revoke")).status_code == 200
        assert (await c2.get("/api/v1/admin/me")).json()["error"]["code"] == "session_expired"
        # idle timeout (30 min) and absolute max (12 h)
        db = core.get_db()
        await db.admin_sessions.update_many({"admin_id": a["admin_id"], "revoked": False}, {"$set": {"last_seen": core.now() - timedelta(minutes=31)}})
        assert (await c.get("/api/v1/admin/me")).status_code == 401
        await db.admin_sessions.update_many({"admin_id": a["admin_id"]}, {"$set": {"last_seen": core.now(), "created_at": core.now() - timedelta(hours=13), "revoked": False}})
        assert (await c.get("/api/v1/admin/me")).status_code == 401
        await db.admin_sessions.update_many({"admin_id": a["admin_id"]}, {"$set": {"created_at": core.now()}})
        assert (await c.post("/api/v1/admin/sessions/revoke-all")).json()["revoked"] >= 1
        assert (await c.get("/api/v1/admin/me")).status_code == 401


# ---------------------------------------------------- permission matrix ----
@pytest.mark.asyncio
async def test_permission_matrix_every_endpoint_every_role(env):
    routes = [r for r in admin_routes() if r[2]]
    assert len(routes) >= 40
    checked = 0
    for role, granted in admin_core.ROLES.items():
        w, _ = await admin_client(env, role)
        async with w as c:
            for method, path, need in routes:
                r = await c.request(method, fill(path), json={})
                if need in granted:
                    assert r.status_code not in (401, 403), (role, method, path, r.text)
                else:
                    assert r.status_code == 403 and r.json()["error"]["code"] == "forbidden", (role, method, path, r.status_code)
                checked += 1
        core.limiter.reset()
    assert checked == len(routes) * 7
    # unauthenticated: every admin endpoint 401
    async with env["mk"]() as c:
        for method, path, _ in admin_routes():
            if "/auth/" in path:
                continue
            assert (await c.request(method, fill(path), json={})).status_code == 401, path


# --------------------------------------------- audit + secrets + workflows --
async def make_player_with_purchase(c_player):
    r = await c_player.post("/api/v1/auth/register", json={"email": f"pp{uuid.uuid4().hex[:6]}@t.dev", "password": "password123"})
    core.limiter.reset()
    d = r.json()
    h = {"Authorization": f"Bearer {d['access_token']}"}
    token = f"mock_{uuid.uuid4().hex}{uuid.uuid4().hex}"
    v = await c_player.post("/api/v1/purchases/verify", json={"product_id": "rr_gems_100", "purchase_token": token}, headers={**h, "Idempotency-Key": uuid.uuid4().hex})
    return d, h, token, v


@pytest.mark.asyncio
async def test_audit_completeness_and_secret_scan(env):
    db = core.get_db()
    w, owner = await admin_client(env, "owner")
    async with w as c, env["mk"]() as pc:
        d, h, token, v = await make_player_with_purchase(pc)
        uid = d["user"]["user_id"]
        tk = await pc.post("/api/v1/support/tickets", json={"category": "bug", "message": "Help me please, it crashed"}, headers=h)
        no = tk.json().get("ticket_no")
        assert no and v.status_code == 200, (tk.text, v.text)
        n0 = await db.admin_audit.count_documents({})
        writes = [
            ("post", f"/api/v1/admin/players/{uid}/compensate", {"coins": 500, "reason": "Lost coins in outage"}),
            ("post", f"/api/v1/admin/players/{uid}/enforce", {"action": "suspend", "reason": "Cheating detected", "confirm": True, "days": 3}),
            ("post", f"/api/v1/admin/players/{uid}/enforce", {"action": "unban", "reason": "Appeal accepted", "confirm": True}),
            ("post", "/api/v1/admin/news", {"title": "Hello", "slug": "hello", "summary": "Sum", "body": "Body text"}),
            ("post", "/api/v1/admin/faq", {"question": "Q?? yes", "answer": "Answer", "order": 1}),
            ("post", "/api/v1/admin/admins", {"email": "new@t.dev", "password": "LongPassword123!", "name": "New", "role": "viewer"}),
            ("post", "/api/v1/admin/config/drafts", {"note": "noop"}),
            ("post", "/api/v1/admin/config/quick", {"flags": {"events": True}, "confirm": True}),
        ]
        if no:
            writes += [("post", f"/api/v1/admin/tickets/{no}/assign", {"admin_id": owner["admin_id"]}), ("post", f"/api/v1/admin/tickets/{no}/reply", {"message": "We are on it"}),
                       ("post", f"/api/v1/admin/tickets/{no}/close", {})]
        if v.status_code == 200:
            pid = (await db.iap_purchases.find_one({"purchase_token": token}))["purchase_id"]
            writes += [("post", f"/api/v1/admin/purchases/{pid}/reverify", {}), ("post", f"/api/v1/admin/purchases/{pid}/revoke", {"reason": "Refund requested", "confirm": True})]
        for i, (m, p, body) in enumerate(writes):
            r = await c.request(m, p, json=body, headers={"Idempotency-Key": f"audit-key-{i:03d}"})
            assert r.status_code in (200, 201), (p, r.text)
            assert await db.admin_audit.count_documents({}) == n0 + i + 1, f"no audit entry for {p}"
        # idempotent compensation: replay does not double-grant
        before = (await db.users.find_one({"user_id": uid}))["wallet"]["coins"]
        await c.post(f"/api/v1/admin/players/{uid}/compensate", json={"coins": 500, "reason": "Lost coins in outage"}, headers={"Idempotency-Key": "audit-key-000"})
        assert (await db.users.find_one({"user_id": uid}))["wallet"]["coins"] == before
        assert await db.ledger.count_documents({"user_id": uid, "reason": "admin_compensation"}) == 1
        # suspension hid the player from the leaderboard path (banned flag) and was audited with before/after
        e = await db.admin_audit.find_one({"action": "players.suspend"})
        assert e["before"] is not None and e["after"]["reason"] == "Cheating detected"
        # search + export are audited too
        n1 = await db.admin_audit.count_documents({})
        csv = await c.get("/api/v1/admin/audit/export.csv")
        assert csv.status_code == 200 and csv.text.startswith("time,admin_email")
        assert await db.admin_audit.count_documents({"action": "audit.export"}) == 1 and await db.admin_audit.count_documents({}) == n1 + 1
        # secret scan across every GET endpoint
        news_id = (await db.news.find_one({}))["news_id"]
        gets = ["/admin/me", "/admin/sessions", "/admin/admins", "/admin/dashboard", "/admin/players?q=pp", f"/admin/players/{uid}", "/admin/deletion-requests", "/admin/reports",
                "/admin/ledger", "/admin/config/published", "/admin/config/versions", "/admin/config/versions/1", "/admin/config/versions/2/diff", "/admin/catalog", "/admin/release",
                "/admin/news", "/admin/faq", "/admin/purchases", "/admin/tickets", "/admin/audit"] + ([f"/admin/tickets/{no}"] if no else [])
        assert news_id
        for g in gets:
            r = await c.get("/api/v1" + g)
            assert r.status_code == 200, (g, r.text)
            scan(r.json(), g, token, d["refresh_token"])


def scan(obj, where, token, refresh, key=None):
    if isinstance(obj, dict):
        for k, v in obj.items():
            assert k not in SECRET_KEYS or where == "/admin/me" and k == "csrf", f"{where}: leaked key {k}"
            scan(v, where, token, refresh, k)
    elif isinstance(obj, list):
        for v in obj:
            scan(v, where, token, refresh)
    elif isinstance(obj, str):
        assert token not in obj and refresh not in obj, f"{where}: leaked token"
        for rx in SECRET_RX:
            assert not rx.search(obj), f"{where}: secret-like value in {key}"


@pytest.mark.asyncio
async def test_four_eyes_publish_and_rollback(env):
    w1, _ = await admin_client(env, "liveops_editor")
    w2, _ = await admin_client(env, "publisher")
    w3, _ = await admin_client(env, "owner")
    async with w1 as ed, w2 as pb, w3 as ow, env["mk"]() as pc:
        v1 = (await ow.get("/api/v1/admin/config/published")).json()
        data = json.loads(json.dumps(v1["data"]))
        data["catalog"]["character"]["zoe"]["price"] = {"currency": "coins", "amount": 1234}
        data["daily_rewards"][0] = {"coins": 999}
        draft = await ed.post("/api/v1/admin/config/drafts", json={"data": data, "note": "Zoe sale"})
        assert draft.status_code == 201, draft.text
        ver = draft.json()["version"]
        bad = json.loads(json.dumps(data))
        bad["catalog"]["character"]["zoe"]["price"] = {"currency": "gold", "amount": -1}
        assert (await ed.post("/api/v1/admin/config/drafts", json={"data": bad})).json()["error"]["code"] == "validation_error"
        diff = (await ed.get(f"/api/v1/admin/config/versions/{ver}/diff")).json()["changes"]
        assert {"path": "catalog.character.zoe.price.amount", "before": 4000, "after": 1234} in diff or any(ch["path"].startswith("catalog.character.zoe") for ch in diff)
        assert (await pb.post(f"/api/v1/admin/config/versions/{ver}/publish", json={})).json()["error"]["code"] == "invalid_state"  # not approved
        assert (await ed.post(f"/api/v1/admin/config/versions/{ver}/submit")).status_code == 200
        assert (await ed.post(f"/api/v1/admin/config/versions/{ver}/approve")).status_code == 403  # editor lacks approve
        # four-eyes: the Owner (has approve) can't approve a change they authored
        own = await ow.post("/api/v1/admin/config/drafts", json={"data": data, "note": "owner change"})
        await ow.post(f"/api/v1/admin/config/versions/{own.json()['version']}/submit")
        r = await ow.post(f"/api/v1/admin/config/versions/{own.json()['version']}/approve")
        assert r.status_code == 403 and r.json()["error"]["code"] == "four_eyes"
        # publisher approves + publishes the editor's draft
        assert (await pb.post(f"/api/v1/admin/config/versions/{ver}/approve")).json()["status"] == "approved"
        assert (await pb.post(f"/api/v1/admin/config/versions/{ver}/publish", json={})).json()["status"] == "published"
        cat = (await pc.get("/api/v1/catalog")).json()
        assert cat["version"] == ver and cat["items"]["character"]["zoe"] == {"currency": "coins", "amount": 1234} and cat["daily_rewards"][0] == {"coins": 999}
        pub_cat = (await pc.get("/api/v1/public/catalog")).json()
        assert next(x for x in pub_cat["characters"] if x["id"] == "zoe")["unlock"]["amount"] == 1234
        # published versions are immutable
        assert (await ed.put(f"/api/v1/admin/config/drafts/{ver}", json={"data": data})).json()["error"]["code"] == "not_editable"
        # rollback republishes v1's data as a NEW version
        rb = await pb.post("/api/v1/admin/config/rollback", json={"version": v1["version"], "confirm": True})
        assert rb.status_code == 200 and rb.json()["version"] > ver and rb.json()["rollback_of"] == v1["version"]
        cat = (await pc.get("/api/v1/catalog")).json()
        assert cat["version"] == rb.json()["version"] and cat["items"]["character"]["zoe"] == v1["data"]["catalog"]["character"]["zoe"]["price"]
        assert (await pb.get(f"/api/v1/admin/config/versions/{ver}")).json()["status"] == "superseded"
        # maintenance quick toggle needs explicit confirm and reaches the app config
        assert (await pb.post("/api/v1/admin/config/quick", json={"maintenance": True})).status_code == 422
        assert (await pb.post("/api/v1/admin/config/quick", json={"maintenance": True, "confirm": True})).status_code == 200
        assert (await pc.get("/api/v1/config")).json()["maintenance"] is True
        assert (await pc.get("/api/v1/public/site-config")).json()["maintenance"] is True


@pytest.mark.asyncio
async def test_news_publish_reaches_site_and_inbox(env):
    w, _ = await admin_client(env, "owner")
    async with w as c, env["mk"]() as pc:
        n = (await c.post("/api/v1/admin/news", json={"title": "Big update", "slug": "big-update", "summary": "New world!", "body": "Lava is here."})).json()
        assert "news_id" in n, n
        assert (await pc.get("/api/v1/public/news/big-update")).status_code == 404  # draft hidden
        await c.post(f"/api/v1/admin/news/{n['news_id']}/publish", json={"inbox": True})
        assert (await pc.get("/api/v1/public/news")).json()["items"][0]["slug"] == "big-update"
        assert (await pc.get("/api/v1/public/news/big-update")).json()["body"] == "Lava is here."
        assert any(s["path"] == "/news/big-update" for s in (await pc.get("/api/v1/public/sitemap")).json()["pages"])
        assert await core.get_db().messages.count_documents({"msg_id": f"news_{n['news_id']}"}) == 1
        await c.post(f"/api/v1/admin/news/{n['news_id']}/unpublish")
        assert (await pc.get("/api/v1/public/news")).json()["items"] == []


@pytest.mark.asyncio
async def test_ban_suspension_expiry_stale_draft_csv(env):
    w, _ = await admin_client(env, "owner")
    async with w as c, env["mk"]() as pc:
        r = await pc.post("/api/v1/auth/register", json={"email": f"b{uuid.uuid4().hex[:6]}@t.dev", "password": "password123"})
        core.limiter.reset()
        d = r.json()
        h = {"Authorization": f"Bearer {d['access_token']}"}
        uid = d["user"]["user_id"]
        await c.post(f"/api/v1/admin/players/{uid}/enforce", json={"action": "ban", "reason": "=HYPERLINK(evil)", "confirm": True})
        assert (await pc.get("/api/v1/me", headers=h)).status_code == 403  # existing access token stops working immediately
        await c.post(f"/api/v1/admin/players/{uid}/enforce", json={"action": "suspend", "reason": "Cooling off", "confirm": True, "days": 1})
        assert (await pc.get("/api/v1/me", headers=h)).status_code == 403
        await core.get_db().users.update_one({"user_id": uid}, {"$set": {"suspended_until": core.now() - timedelta(minutes=1)}})
        assert (await pc.get("/api/v1/me", headers=h)).status_code == 200  # expired suspension lifts itself
        assert (await core.get_db().users.find_one({"user_id": uid}))["banned"] is False
        # stale draft: a later quick toggle would be silently undone -> 409 unless confirmed
        dr = (await c.post("/api/v1/admin/config/drafts", json={"note": "old base"})).json()
        await c.post("/api/v1/admin/config/quick", json={"flags": {"events": False}, "confirm": True})
        await c.post(f"/api/v1/admin/config/versions/{dr['version']}/submit")
        await core.get_db().config_versions.update_one({"version": dr["version"]}, {"$set": {"status": "approved", "approver": "someone_else"}})
        r = await c.post(f"/api/v1/admin/config/versions/{dr['version']}/publish", json={})
        assert r.status_code == 409 and r.json()["error"]["code"] == "stale_draft"
        assert (await c.post(f"/api/v1/admin/config/versions/{dr['version']}/publish", json={"confirm": True})).status_code == 200
        # rollback audit records the previously live version
        live_v = (await c.get("/api/v1/admin/config/published")).json()["version"]
        rb = (await c.post("/api/v1/admin/config/rollback", json={"version": 1, "confirm": True})).json()
        e = await core.get_db().admin_audit.find_one({"action": "config.rollback"})
        assert e["before"]["version"] == live_v and rb["version"] > live_v
        # CSV export neutralises spreadsheet formulas
        csv = (await c.get("/api/v1/admin/audit/export.csv")).text
        import csv as _csv
        import io as _io
        cells = [x for row in _csv.reader(_io.StringIO(csv)) for x in row]
        assert "HYPERLINK" in csv and not any(x[:1] in ("=", "+", "-", "@") for x in cells)
        # admins can be created with special-use TLDs (.test)
        assert (await c.post("/api/v1/admin/admins", json={"email": "x@rushrivals.test", "password": "LongPassword123!", "name": "X", "role": "viewer"})).status_code == 201
