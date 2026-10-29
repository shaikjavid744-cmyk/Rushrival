"""Phase 5/6 LIVE regression tests against the public preview URL (HTTPS, real ingress).
Public website API + admin realm (TOTP, lockout, CSRF, roles, config workflow, players, news, tickets, audit).
Run: cd /app/backend && python -m pytest tests/test_phase56_live_api.py -v
Leaves env clean: maintenance off, test news deleted, catalogue rolled back, RR-DEMO01 re-opened."""
import json
import os
import re
import time
import uuid

import pyotp
import pytest
import requests
from pymongo import MongoClient


def _env(path, key):
    for line in open(path):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')
    return None


BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or _env("/app/mobile/.env", "EXPO_PUBLIC_BACKEND_URL")).rstrip("/")
API = f"{BASE}/api/v1"
MDB = MongoClient(_env("/app/backend/.env", "MONGO_URL"))[_env("/app/backend/.env", "DB_NAME")]
OWNER = ("owner@rushrivals.test", _env("/app/backend/.env", "ADMIN_OWNER_PASSWORD"))
DEMO_PW = "RushAdmin-Demo-2026!"
STAFF = {"liveops_editor": "liveops.editor@rushrivals.test", "publisher": "publisher@rushrivals.test", "support": "support@rushrivals.test",
         "finance": "finance@rushrivals.test", "moderator": "moderator@rushrivals.test", "viewer": "viewer@rushrivals.test"}
SECRETS_FILE = "/tmp/rr_admin_totp.json"
RUN = uuid.uuid4().hex[:6]


def _req(method, s, url, **kw):
    """Retry once on the auth rate limiter (10/min per IP)."""
    for _ in range(4):
        r = s.request(method, url, timeout=30, **kw)
        if r.status_code == 429 and "/contact" not in url:
            time.sleep(min(int(r.json().get("error", r.json()).get("details", {}).get("retry_after_s", 20) if isinstance(r.json(), dict) else 20), 65))
            continue
        return r
    return r


def _err(r):
    j = r.json()
    return j.get("error", j) if isinstance(j, dict) else {}


def _secrets():
    try:
        return json.load(open(SECRETS_FILE))
    except Exception:
        return {}


def admin_login(email, password):
    s = requests.Session()
    r = _req("POST", s, f"{API}/admin/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    mfa = r.json()["mfa_token"]
    if not r.json()["mfa_enrolled"]:
        e = _req("POST", s, f"{API}/admin/auth/totp/enroll", json={"mfa_token": mfa})
        assert e.status_code == 200, e.text
        sec = e.json()["secret"]
        assert e.json()["otpauth_uri"].startswith("otpauth://totp/")
        d = _secrets(); d[email] = sec; json.dump(d, open(SECRETS_FILE, "w"))
    else:
        sec = _secrets().get(email) or MDB.admins.find_one({"email": email})["totp_secret"]
    for _ in range(4):  # fresh code each try (a 429 back-off can outlive the TOTP window)
        v = s.post(f"{API}/admin/auth/totp/verify", json={"mfa_token": mfa, "code": pyotp.TOTP(sec).now()}, timeout=30)
        if v.status_code != 429:
            break
        time.sleep(min(_err(v).get("details", {}).get("retry_after_s", 20), 65))
    assert v.status_code == 200, v.text
    s.headers["X-CSRF-Token"] = v.json()["csrf_token"]
    s.last_verify = v
    return s


@pytest.fixture(scope="module")
def admins():
    out = {"owner": admin_login(*OWNER)}
    for role, email in STAFF.items():
        out[role] = admin_login(email, DEMO_PW)
    return out


@pytest.fixture(scope="module")
def demo_player(admins):
    r = admins["support"].get(f"{API}/admin/players", params={"q": "DemoBlaze"})
    assert r.status_code == 200 and r.json()["items"], r.text
    return r.json()["items"][0]


# ---------------------------------------------------------------- public ----
class TestPublic:
    def test_catalog_and_art(self):
        r = requests.get(f"{API}/public/catalog", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert [len(d[k]) for k in ("characters", "boards", "worlds", "powerups")] == [6, 6, 6, 5], {k: len(d[k]) for k in ("characters", "boards", "worlds", "powerups")}
        zoe = next(c for c in d["characters"] if c["id"] == "zoe")
        assert zoe["unlock"]["type"] == "currency"
        for item in d["characters"][:2] + d["worlds"][:1] + d["powerups"][:1]:
            a = requests.get(BASE + item["art_url"], timeout=20)
            assert a.status_code == 200 and a.headers["content-type"].startswith("image/"), item["art_url"]

    def test_news_faq_siteconfig_sitemap(self):
        n = requests.get(f"{API}/public/news", timeout=20).json()
        assert n["items"] == [] and n["empty_message"]
        assert requests.get(f"{API}/public/news/rush-rivals-run--3g5s02w8", timeout=20).status_code == 404
        f = requests.get(f"{API}/public/faq", timeout=20).json()
        assert len(f["items"]) == 5 and all(i["question"] and i["answer"] for i in f["items"])
        sc = requests.get(f"{API}/public/site-config", timeout=20).json()
        assert "store_url_android" in sc and sc["maintenance"] is False
        sm = requests.get(f"{API}/public/sitemap", timeout=20).json()
        assert "/admin" in sm["disallow"] and any(p["path"] == "/faq" for p in sm["pages"])

    def test_contact_spam_validation_rate_limit(self):
        tok = requests.get(f"{API}/public/contact/form-token", timeout=20).json()["form_token"]
        good = {"name": "TEST_bot", "email": "TEST_contact@rushrivals.test", "category": "bug", "message": "TEST message from live api tests", "form_token": tok}
        r = requests.post(f"{API}/public/contact", json={**good, "website": "http://spam"}, timeout=20)
        assert r.status_code == 400 and _err(r)["code"] == "spam_rejected", r.text
        r = requests.post(f"{API}/public/contact", json=good, timeout=20)  # < 3 s after token
        assert r.status_code == 400 and _err(r)["code"] == "spam_rejected", r.text
        r = requests.post(f"{API}/public/contact", json={**good, "email": "bad", "message": "short"}, timeout=20)
        assert r.status_code == 422 and set(_err(r)["details"]["fields"]) >= {"email", "message"}, r.text
        r = requests.post(f"{API}/public/contact", json={**good, "form_token": "garbage"}, timeout=20)
        assert r.status_code == 400 and _err(r)["code"] == "form_expired", r.text
        time.sleep(3.2)
        codes = []
        for i in range(6):
            r = requests.post(f"{API}/public/contact", json=good, timeout=30)
            codes.append(r.status_code)
            if r.status_code == 201:
                assert re.fullmatch(r"RR-\d{6}", r.json()["ticket_no"]), r.text
                assert MDB.tickets.find_one({"ticket_no": r.json()["ticket_no"]})["source"] == "website"
        assert codes[0] == 201 and codes[-1] == 429, codes
        last = requests.post(f"{API}/public/contact", json=good, timeout=20)
        assert _err(last)["code"] == "rate_limited"
        r = requests.post(f"{API}/public/contact", json=good, headers={"X-Forwarded-For": "9.9.9.9"}, timeout=20)
        assert r.status_code == 429, "spoofed XFF bypassed contact rate limit"
        MDB.tickets.delete_many({"email": "test_contact@rushrivals.test"})

    def test_data_deletion(self):
        r = requests.post(f"{API}/public/data-deletion", json={"email": "bad", "confirm": False}, timeout=20)
        assert r.status_code == 422 and set(_err(r)["details"]["fields"]) == {"email", "confirm"}
        r = requests.post(f"{API}/public/data-deletion", json={"email": "TEST_del@rushrivals.test", "confirm": True, "note": "TEST"}, timeout=20)
        assert r.status_code == 201 and r.json()["request_id"].startswith("del")
        assert MDB.deletion_requests.find_one({"request_id": r.json()["request_id"]})["email"] == "test_del@rushrivals.test"
        MDB.deletion_requests.delete_many({"email": "test_del@rushrivals.test"})


# ------------------------------------------------------------ admin auth ----
class TestAdminAuth:
    def test_cookie_flags_and_me(self, admins):
        sc = admins["owner"].last_verify.headers.get("set-cookie", "")
        low = sc.lower()
        assert "rr_admin_session=" in sc and "httponly" in low and "secure" in low and "path=/api/v1/admin" in low, sc
        me = admins["owner"].get(f"{API}/admin/me")
        assert me.status_code == 200 and me.json()["admin"]["role"] == "owner"
        assert "totp_secret" not in me.text and "password_hash" not in me.text

    def test_csrf_required(self, admins):
        s = admins["owner"]
        r = s.post(f"{API}/admin/sessions/revoke-all", headers={"X-CSRF-Token": "wrong"})
        assert r.status_code == 403 and _err(r)["code"] == "csrf_failed"

    def test_password_only_and_player_token_rejected(self):
        s = requests.Session()
        r = _req("POST", s, f"{API}/admin/auth/login", json={"email": STAFF["viewer"], "password": DEMO_PW})
        assert r.status_code == 200
        assert s.get(f"{API}/admin/dashboard").status_code == 401
        assert s.get(f"{API}/admin/dashboard", headers={"Authorization": f"Bearer {r.json()['mfa_token']}"}).status_code == 401
        p = _req("POST", requests.Session(), f"{API}/auth/login", json={"email": "player@rushrivals.test", "password": "RushPlayer123!"})
        assert p.status_code == 200, p.text
        tok = p.json().get("access_token") or p.json().get("tokens", {}).get("access_token")
        assert tok
        r = requests.get(f"{API}/admin/dashboard", headers={"Authorization": f"Bearer {tok}"}, timeout=20)
        assert r.status_code == 401
        r = _req("POST", requests.Session(), f"{API}/admin/auth/login", json={"email": "player@rushrivals.test", "password": "RushPlayer123!"})
        assert r.status_code == 401

    def test_lockout_fresh_admin(self, admins):
        email = f"test_lock_{RUN}@example.com"
        r = admins["owner"].post(f"{API}/admin/admins", json={"email": email, "password": "TEST-Lockout-Pass-1!", "name": "TEST lock", "role": "viewer"})
        assert r.status_code == 201, r.text
        aid = r.json()["admin_id"]
        try:
            s = requests.Session()
            mfa = _req("POST", s, f"{API}/admin/auth/login", json={"email": email, "password": "TEST-Lockout-Pass-1!"}).json()["mfa_token"]
            _req("POST", s, f"{API}/admin/auth/totp/enroll", json={"mfa_token": mfa})
            codes = [_req("POST", s, f"{API}/admin/auth/totp/verify", json={"mfa_token": mfa, "code": "000000"}).status_code for _ in range(5)]
            assert codes == [401, 401, 401, 401, 423], codes
            r = _req("POST", s, f"{API}/admin/auth/login", json={"email": email, "password": "TEST-Lockout-Pass-1!"})
            assert r.status_code == 423 and _err(r)["code"] == "account_locked"
        finally:
            admins["owner"].patch(f"{API}/admin/admins/{aid}", json={"disabled": True})
            MDB.admins.delete_one({"admin_id": aid})

    def test_sessions_list_and_revoke(self):
        s = admin_login(STAFF["viewer"], DEMO_PW)
        items = s.get(f"{API}/admin/sessions").json()["items"]
        cur = next(i for i in items if i["current"])
        assert "token_hash" not in json.dumps(items) and "csrf" not in json.dumps(items)
        assert s.post(f"{API}/admin/sessions/{cur['session_id']}/revoke").status_code == 200
        assert s.get(f"{API}/admin/me").status_code == 401


# ------------------------------------------------------------- roles --------
class TestRoles:
    def test_matrix_samples(self, admins, demo_player):
        uid = demo_player["user_id"]
        r = admins["viewer"].post(f"{API}/admin/players/{uid}/compensate", json={"coins": 1, "reason": "TEST viewer"}, headers={"Idempotency-Key": f"TEST-{RUN}-v"})
        assert r.status_code == 403, r.text
        assert admins["support"].post(f"{API}/admin/players/{uid}/enforce", json={"action": "unban", "reason": "TEST nope", "confirm": True}).status_code == 403
        assert admins["finance"].get(f"{API}/admin/purchases").status_code == 200
        assert admins["support"].get(f"{API}/admin/purchases").status_code == 403
        assert admins["viewer"].get(f"{API}/admin/audit").status_code == 403
        assert admins["publisher"].get(f"{API}/admin/admins").status_code == 403
        assert admins["moderator"].get(f"{API}/admin/tickets").status_code == 403
        assert admins["liveops_editor"].post(f"{API}/admin/config/quick", json={"maintenance": True, "confirm": True}).status_code == 403

    def test_dashboard_honest(self, admins):
        d = admins["viewer"].get(f"{API}/admin/dashboard").json()
        assert d["crashes"]["connected"] is False and d["ads"]["admob"]["connected"] is False and d["purchases"]["revenue_by_currency"] is None


# ------------------------------------------------------------- players ------
class TestPlayers:
    def test_detail_masked(self, admins, demo_player):
        r = admins["support"].get(f"{API}/admin/players/{demo_player['user_id']}")
        assert r.status_code == 200
        t = r.text
        assert "password_hash" not in t and "$2b$" not in t and "refresh" not in t.lower()
        assert not re.search(r"eyJ[\w-]{10,}\.", t)
        for p in r.json()["purchases"]:
            assert p["purchase_token"] is None or "…" in p["purchase_token"] or len(p["purchase_token"]) <= 12

    def test_compensation_idempotent(self, admins, demo_player):
        uid, s = demo_player["user_id"], admins["support"]
        before = s.get(f"{API}/admin/players/{uid}").json()["player"]["wallet"]["coins"]
        key = f"TEST-comp-{RUN}"
        assert s.post(f"{API}/admin/players/{uid}/compensate", json={"coins": 7, "reason": "TEST short"}).status_code == 400  # missing key
        assert s.post(f"{API}/admin/players/{uid}/compensate", json={"coins": 7, "reason": "x"}, headers={"Idempotency-Key": key + "x"}).status_code == 422
        r1 = s.post(f"{API}/admin/players/{uid}/compensate", json={"coins": 7, "reason": "TEST compensation"}, headers={"Idempotency-Key": key})
        r2 = s.post(f"{API}/admin/players/{uid}/compensate", json={"coins": 7, "reason": "TEST compensation"}, headers={"Idempotency-Key": key})
        assert r1.status_code == 200 and r2.status_code == 200, (r1.text, r2.text)
        assert r2.json().get("replayed") is True
        after = s.get(f"{API}/admin/players/{uid}").json()
        assert after["player"]["wallet"]["coins"] == before + 7
        assert any(e.get("reason") == "admin_compensation" for e in after["ledger"])

    def test_suspend_hides_from_leaderboard_then_unban(self, admins):
        m = admins["moderator"]
        uid = m.get(f"{API}/admin/players", params={"q": "rival@rushrivals.test"}).json()["items"][0]["user_id"]  # rival has leaderboard scores
        lb = requests.get(f"{API}/leaderboard", params={"period": "all", "limit": 100}, timeout=20).json()
        if not any(i["user_id"] == uid for i in lb["items"]):
            pytest.skip("demo player not on all-time leaderboard")
        assert m.post(f"{API}/admin/players/{uid}/enforce", json={"action": "suspend", "reason": "TEST suspend", "days": 1}).status_code == 422  # no confirm
        r = m.post(f"{API}/admin/players/{uid}/enforce", json={"action": "suspend", "reason": "TEST suspend", "days": 1, "confirm": True})
        assert r.status_code == 200, r.text
        try:
            lb = requests.get(f"{API}/leaderboard", params={"period": "all", "limit": 100}, timeout=20).json()
            assert not any(i["user_id"] == uid for i in lb["items"])
            p = _req("POST", requests.Session(), f"{API}/auth/login", json={"email": "rival@rushrivals.test", "password": "RushRival123!"})
            assert p.status_code == 403, p.text
        finally:
            r = m.post(f"{API}/admin/players/{uid}/enforce", json={"action": "unban", "reason": "TEST unban", "confirm": True})
            assert r.status_code == 200
        lb = requests.get(f"{API}/leaderboard", params={"period": "all", "limit": 100}, timeout=20).json()
        assert any(i["user_id"] == uid for i in lb["items"])

    def test_purchases_reverify_list(self, admins):
        r = admins["finance"].get(f"{API}/admin/purchases")
        assert r.status_code == 200
        assert "purchase_token" not in r.text or all(p["purchase_token"] is None or len(p["purchase_token"]) <= 12 or "…" in p["purchase_token"] for p in r.json()["items"])


# -------------------------------------------------------- config workflow ---
class TestConfigWorkflow:
    def test_draft_four_eyes_publish_rollback(self, admins):
        ed, pub, owner = admins["liveops_editor"], admins["publisher"], admins["owner"]
        base = ed.get(f"{API}/admin/config/published").json()
        v0 = base["version"]
        data = base["data"]
        data["catalog"]["character"]["zoe"]["price"] = {"currency": "coins", "amount": 24999}
        r = ed.post(f"{API}/admin/config/drafts", json={"data": data, "note": "TEST zoe price"})
        assert r.status_code == 201, r.text
        v = r.json()["version"]
        diff = ed.get(f"{API}/admin/config/versions/{v}/diff").json()["changes"]
        assert any(c["path"].endswith("zoe.price.amount") for c in diff), diff
        assert ed.post(f"{API}/admin/config/versions/{v}/submit").status_code == 200
        assert ed.post(f"{API}/admin/config/versions/{v}/approve").status_code == 403  # no approve perm
        # owner authors own draft -> four_eyes
        od = owner.post(f"{API}/admin/config/drafts", json={"note": "TEST owner draft"}).json()["version"]
        owner.post(f"{API}/admin/config/versions/{od}/submit")
        r = owner.post(f"{API}/admin/config/versions/{od}/approve")
        assert r.status_code == 403 and _err(r)["code"] == "four_eyes", r.text
        assert pub.post(f"{API}/admin/config/versions/{od}/reject", json={"note": "TEST cleanup"}).status_code == 200
        assert pub.post(f"{API}/admin/config/versions/{v}/publish", json={}).status_code == 409  # not approved yet
        assert pub.post(f"{API}/admin/config/versions/{v}/approve").status_code == 200
        r = pub.post(f"{API}/admin/config/versions/{v}/publish", json={})
        assert r.status_code == 200 and r.json()["status"] == "published", r.text
        cat = requests.get(f"{API}/catalog", timeout=20).json()
        assert cat["version"] == v and cat["items"]["character"]["zoe"]["amount"] == 24999, cat["items"]["character"]["zoe"]
        assert ed.put(f"{API}/admin/config/drafts/{v}", json={"data": data}).status_code == 409  # immutable
        r = pub.post(f"{API}/admin/config/rollback", json={"version": v0, "confirm": True, "note": "TEST rollback"})
        assert r.status_code == 200, r.text
        nv = r.json()["version"]
        assert nv > v
        cat = requests.get(f"{API}/catalog", timeout=20).json()
        assert cat["version"] == nv and cat["items"]["character"]["zoe"]["amount"] == 25000
        pc = requests.get(f"{API}/public/catalog", timeout=20).json()
        assert pc["version"] == nv

    def test_invalid_draft_rejected(self, admins):
        ed = admins["liveops_editor"]
        data = ed.get(f"{API}/admin/config/published").json()["data"]
        data["catalog"]["character"]["zoe"]["price"] = {"currency": "gold", "amount": -1}
        r = ed.post(f"{API}/admin/config/drafts", json={"data": data})
        assert r.status_code == 400 and _err(r)["details"]["errors"]

    def test_quick_maintenance_toggle(self, admins):
        pub = admins["publisher"]
        assert pub.post(f"{API}/admin/config/quick", json={"maintenance": True}).status_code == 422
        try:
            r = pub.post(f"{API}/admin/config/quick", json={"maintenance": True, "confirm": True})
            assert r.status_code == 200, r.text
            assert requests.get(f"{API}/config", timeout=20).json()["maintenance"] is True
            assert requests.get(f"{API}/public/site-config", timeout=20).json()["maintenance"] is True
        finally:
            r = pub.post(f"{API}/admin/config/quick", json={"maintenance": False, "confirm": True})
            assert r.status_code == 200
        assert requests.get(f"{API}/config", timeout=20).json()["maintenance"] is False


# ------------------------------------------------------------ content ------
class TestNewsAndTickets:
    def test_news_lifecycle(self, admins):
        ed, pub = admins["liveops_editor"], admins["publisher"]
        slug = f"test-news-{RUN}"
        r = ed.post(f"{API}/admin/news", json={"title": "TEST News", "slug": slug, "summary": "TEST summary", "body": "TEST body text"})
        assert r.status_code == 201, r.text
        nid = r.json()["news_id"]
        try:
            assert ed.post(f"{API}/admin/news", json={"title": "TEST News", "slug": slug, "summary": "TEST", "body": "TEST body"}).status_code == 409
            assert requests.get(f"{API}/public/news/{slug}", timeout=20).status_code == 404
            assert ed.post(f"{API}/admin/news/{nid}/publish", json={}).status_code == 403
            assert pub.post(f"{API}/admin/news/{nid}/publish", json={"inbox": True}).status_code == 200
            items = requests.get(f"{API}/public/news", timeout=20).json()["items"]
            assert any(i["slug"] == slug for i in items)
            a = requests.get(f"{API}/public/news/{slug}", timeout=20)
            assert a.status_code == 200 and a.json()["body"] == "TEST body text" and "created_by" not in a.json()
            assert any(p["path"] == f"/news/{slug}" for p in requests.get(f"{API}/public/sitemap", timeout=20).json()["pages"])
            assert MDB.messages.find_one({"msg_id": f"news_{nid}"})
            assert pub.post(f"{API}/admin/news/{nid}/unpublish").status_code == 200
            assert requests.get(f"{API}/public/news/{slug}", timeout=20).status_code == 404
            assert not MDB.messages.find_one({"msg_id": f"news_{nid}"})
        finally:
            pub.post(f"{API}/admin/news/{nid}/unpublish")
            r = pub.post(f"{API}/admin/news/{nid}/delete", json={"confirm": True})
            assert r.status_code == 200
        assert requests.get(f"{API}/public/news", timeout=20).json()["items"] == []

    def test_ticket_assign_reply_close(self, admins):
        s = admins["support"]
        try:
            t = s.get(f"{API}/admin/tickets/RR-DEMO01")
            assert t.status_code == 200
            r = s.post(f"{API}/admin/tickets/RR-DEMO01/assign", json={"admin_id": "adm_demo_support"})
            assert r.status_code == 200 and r.json()["assignee"] == "adm_demo_support"
            assert s.post(f"{API}/admin/tickets/RR-DEMO01/assign", json={"admin_id": "adm_nope"}).status_code == 404
            r = s.post(f"{API}/admin/tickets/RR-DEMO01/reply", json={"message": "TEST reply from support"})
            assert r.status_code == 200 and r.json()["ticket"]["status"] == "replied", r.text
            r = s.post(f"{API}/admin/tickets/RR-DEMO01/close")
            assert r.status_code == 200 and r.json()["status"] == "closed"
        finally:
            MDB.tickets.update_one({"ticket_no": "RR-DEMO01"}, {"$set": {"status": "open"}, "$unset": {"assignee": "", "closed_at": ""},
                                                              "$pull": {"replies": {"message": "TEST reply from support"}}})
            MDB.messages.delete_many({"body": "TEST reply from support"})


class TestAuditAndDocs:
    def test_audit_entries_and_csv(self, admins):
        o = admins["owner"]
        acts = {e["action"] for e in o.get(f"{API}/admin/audit", params={"limit": 200}).json()["items"]}
        need = {"auth.sign_in", "players.compensate", "players.suspend", "players.unban", "config.draft_create", "config.submit", "config.approve", "config.publish",
                "config.rollback", "config.quick_toggle", "config.approve_rejected_four_eyes", "news.create", "news.publish", "news.unpublish", "news.delete",
                "tickets.assign", "tickets.reply", "tickets.close", "admins.create"}
        assert need <= acts, need - acts
        r = o.get(f"{API}/admin/audit/export.csv", params={"action": "config"})
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
        assert r.text.splitlines()[0].startswith("time,admin_email") and "config.publish" in r.text
        assert "$2b$" not in r.text
        assert o.post(f"{API}/admin/audit/x").status_code in (404, 405)

    def test_openapi_paths(self):
        paths = requests.get(f"{BASE}/api/openapi.json", timeout=20).json()["paths"]
        pub = [p for p in paths if p.startswith("/api/v1/public")]
        adm = [p for p in paths if p.startswith("/api/v1/admin")]
        assert len(pub) == 9, pub
        assert len(adm) >= 50, len(adm)

    def test_regression_health_player(self):
        assert requests.get(f"{BASE}/api/health", timeout=20).status_code == 200
        p = _req("POST", requests.Session(), f"{API}/auth/login", json={"email": "player@rushrivals.test", "password": "RushPlayer123!"})
        tok = p.json().get("access_token") or p.json().get("tokens", {}).get("access_token")
        h = {"Authorization": f"Bearer {tok}"}
        for path in ("/me", "/inbox", "/events", "/config", "/catalog", "/leaderboard"):
            assert requests.get(f"{API}{path}", headers=h, timeout=20).status_code == 200, path
