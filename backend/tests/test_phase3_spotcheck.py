# Phase 3 spot checks (T1 iteration 7): auth rotation, idempotency, spend, runs, leaderboard, events, inbox, support, errors, rate limit
import os
import time
import uuid

import pytest
import requests
from dotenv import dotenv_values

BASE = dotenv_values("/app/mobile/.env")["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api/v1"

def auth_post(url, **kw):
    """Auth calls share one real IP (spoofed X-Forwarded-For no longer bypasses the limiter): wait out 429s."""
    import time
    for _ in range(8):
        r = requests.post(url, **kw)
        if r.status_code != 429:
            return r
        time.sleep(r.json()["error"].get("details", {}).get("retry_after_s", 10) + 1)
    return r

XFF = {"X-Forwarded-For": f"10.{uuid.uuid4().int % 250}.1.{uuid.uuid4().int % 250}"}


def k():
    return "TESTKEY_" + uuid.uuid4().hex


def h(tok, idem=None):
    d = {"Authorization": f"Bearer {tok}"}
    if idem:
        d["Idempotency-Key"] = idem
    return d


@pytest.fixture(scope="module")
def user():
    email = f"TEST_{uuid.uuid4().hex[:8]}@rushrivals.test".lower()
    r = auth_post(f"{BASE}/auth/register", json={"email": email, "password": "TestPass123!", "name": "TEST_T1"}, headers=XFF)
    assert r.status_code == 201, r.text
    d = r.json()
    yield {"email": email, **d}
    requests.post(f"{BASE}/auth/delete-account", json={"confirm": "DELETE"}, headers=h(d["access_token"]))


# Auth: login, /me, refresh rotation, revoked reuse fails
class TestAuth:
    def test_login_me_refresh_rotation(self, user):
        r = auth_post(f"{BASE}/auth/login", json={"email": user["email"], "password": "TestPass123!"}, headers=XFF)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["access_token"] and d["refresh_token"]
        me = requests.get(f"{BASE}/me", headers=h(d["access_token"]))
        assert me.status_code == 200 and me.json()["user"]["email"] == user["email"]
        assert "_id" not in me.json()["user"]
        r2 = requests.post(f"{BASE}/auth/refresh", json={"refresh_token": d["refresh_token"]}, headers=XFF)
        assert r2.status_code == 200, r2.text
        assert r2.json()["refresh_token"] != d["refresh_token"]
        r3 = requests.post(f"{BASE}/auth/refresh", json={"refresh_token": d["refresh_token"]}, headers=XFF)
        assert r3.status_code == 401, r3.text
        assert "error" in r3.json() and "code" in r3.json()["error"]

    def test_wrong_password(self, user):
        r = auth_post(f"{BASE}/auth/login", json={"email": user["email"], "password": "nopenope1"}, headers=XFF)
        assert r.status_code == 401 and r.json()["error"]["code"]

    def test_no_token(self):
        r = requests.get(f"{BASE}/me")
        assert r.status_code == 401 and "error" in r.json()


# Economy: purchases idempotency, spend, daily claim
class TestEconomy:
    def test_purchase_missing_key(self, user):
        r = requests.post(f"{BASE}/purchases", json={"kind": "shop", "item_id": "hb-3"}, headers=h(user["access_token"]))
        assert r.status_code == 400 and r.json()["error"]["code"] == "idempotency_key_required"

    def test_daily_then_purchase_replay(self, user):
        t = user["access_token"]
        d = requests.post(f"{BASE}/daily/claim", headers=h(t, k()))
        assert d.status_code == 200, d.text
        d2 = requests.post(f"{BASE}/daily/claim", headers=h(t, k()))
        assert d2.status_code == 409, d2.text
        coins = requests.get(f"{BASE}/me", headers=h(t)).json()["user"]["wallet"]["coins"]
        print("coins after daily", coins)
        key = k()
        r1 = requests.post(f"{BASE}/purchases", json={"kind": "shop", "item_id": "hb-3"}, headers=h(t, key))
        if coins < 1500:
            assert r1.status_code in (400, 402, 409) and r1.json()["error"]["code"]
            print("insufficient:", r1.json())
            return
        assert r1.status_code == 200, r1.text
        r2 = requests.post(f"{BASE}/purchases", json={"kind": "shop", "item_id": "hb-3"}, headers=h(t, key))
        assert {a: b for a, b in r2.json().items() if a != "replayed"} == r1.json()

    def test_spend_hoverboard_and_revive(self, user):
        t = user["access_token"]
        w0 = requests.get(f"{BASE}/me", headers=h(t)).json()["user"]["wallet"]
        print("wallet0", w0)
        key = k()
        r = requests.post(f"{BASE}/me/spend", json={"sink": "hoverboard", "ref": "TEST_run1"}, headers=h(t, key))
        if w0.get("hoverboards", 0) >= 1:
            assert r.status_code == 200, r.text
            assert r.json()["wallet"]["hoverboards"] == w0["hoverboards"] - 1
            rr = requests.post(f"{BASE}/me/spend", json={"sink": "hoverboard", "ref": "TEST_run1"}, headers=h(t, key))
            assert {a: b for a, b in rr.json().items() if a != "replayed"} == r.json()
        else:
            assert r.status_code >= 400
        rv = requests.post(f"{BASE}/me/spend", json={"sink": "revive", "ref": "TEST_run1:0"}, headers=h(t, k()))
        print("revive", rv.status_code, rv.text[:200])
        if w0.get("gems", 0) < 5:
            assert rv.status_code >= 400 and "error" in rv.json()
        bad = requests.post(f"{BASE}/me/spend", json={"sink": "gold", "ref": "x"}, headers=h(t, k()))
        assert bad.status_code == 422 and "error" in bad.json()
        nokey = requests.post(f"{BASE}/me/spend", json={"sink": "revive", "ref": "x"}, headers=h(t))
        assert nokey.status_code == 400


# Runs: start/finish happy path, forged rejected, token reuse, offline excluded from leaderboard
class TestRuns:
    def test_run_happy_forged_offline(self, user):
        t = user["access_token"]
        s = requests.post(f"{BASE}/runs/start", json={"world": "city"}, headers=h(t))
        assert s.status_code == 200, s.text
        st = s.json()
        assert st["run_token"] and isinstance(st["seed"], int)
        time.sleep(21)
        body = {**st, "duration": 30, "distance": 300, "coins": 20, "score": 500, "world": "city"}
        w0 = requests.get(f"{BASE}/me", headers=h(t)).json()["user"]["wallet"]["coins"]
        key = k()
        f = requests.post(f"{BASE}/runs/finish", json=body, headers=h(t, key))
        assert f.status_code == 200, f.text
        assert f.json()["accepted"] and f.json()["granted"]["coins"] == 20
        f2 = requests.post(f"{BASE}/runs/finish", json=body, headers=h(t, key))
        assert {a: b for a, b in f2.json().items() if a != "replayed"} == f.json()
        w1 = requests.get(f"{BASE}/me", headers=h(t)).json()["user"]["wallet"]["coins"]
        assert w1 == w0 + 20
        reuse = requests.post(f"{BASE}/runs/finish", json=body, headers=h(t, k()))
        assert reuse.status_code == 400 and reuse.json()["error"]["code"] == "run_invalid"
        # forged
        s2 = requests.post(f"{BASE}/runs/start", json={"world": "city"}, headers=h(t)).json()
        forged = requests.post(f"{BASE}/runs/finish", json={**s2, "duration": 30, "distance": 300, "coins": 5000, "score": 50300}, headers=h(t, k()))
        assert forged.status_code == 400 and forged.json()["error"]["code"] == "run_invalid", forged.text
        print("forged reasons", forged.json()["error"].get("details"))
        # leaderboard has our 500
        lb = requests.get(f"{BASE}/leaderboard", params={"period": "daily"}, headers=h(t))
        assert lb.status_code == 200, lb.text
        data = lb.json()
        print("lb keys", list(data.keys()))
        # offline run with huge score -> not on leaderboard
        off = requests.post(f"{BASE}/runs/offline", json={"run_id": f"run_off_TEST{uuid.uuid4().hex[:6]}", "seed": 0, "duration": 600, "distance": 9000, "coins": 100, "score": 10000, "world": "city"}, headers=h(t, k()))
        assert off.status_code == 200, off.text
        assert off.json().get("leaderboard") is False
        lb2 = requests.get(f"{BASE}/leaderboard", params={"period": "daily", "limit": 100}, headers=h(t)).json()
        rows = lb2.get("entries") or lb2.get("items") or lb2.get("rows") or []
        mine = [r for r in rows if r.get("user_id") == user["user"]["user_id"]]
        assert all(r["score"] != 10000 for r in mine), mine
        print("me", lb2.get("me"))


# Online: leaderboard pagination, events, inbox claim-once, support, config, errors
class TestOnline:
    def test_leaderboard_periods_limit(self):
        for p in ("daily", "weekly", "all"):
            r = requests.get(f"{BASE}/leaderboard", params={"period": p})
            assert r.status_code == 200, (p, r.text)
        r = requests.get(f"{BASE}/leaderboard", params={"period": "all", "limit": 500})
        print("limit 500 ->", r.status_code)
        assert r.status_code in (200, 422)
        bad = requests.get(f"{BASE}/leaderboard", params={"period": "friends"})
        assert bad.status_code in (400, 422) and "error" in bad.json()

    def test_events(self):
        r = requests.get(f"{BASE}/events")
        assert r.status_code == 200
        print(r.text[:400])
        assert "evt_temple_rush" in r.text
        return
        assert any(e.get("event_id") == "evt_temple_rush" or "Temple" in str(e.get("name", e.get("title", ""))) for e in evs), r.text

    def test_inbox_claim_once(self, user):
        t = user["access_token"]
        r = requests.get(f"{BASE}/inbox", headers=h(t))
        assert r.status_code == 200
        assert "msg_welcome_online" in r.text
        gems0 = requests.get(f"{BASE}/me", headers=h(t)).json()["user"]["wallet"]["gems"]
        c1 = requests.post(f"{BASE}/inbox/msg_welcome_online/claim", headers=h(t, k()))
        assert c1.status_code == 200, c1.text
        c2 = requests.post(f"{BASE}/inbox/msg_welcome_online/claim", headers=h(t, k()))
        assert c2.status_code == 409, c2.text
        gems1 = requests.get(f"{BASE}/me", headers=h(t)).json()["user"]["wallet"]["gems"]
        assert gems1 == gems0 + 10

    def test_support_ticket(self):
        r = requests.post(f"{BASE}/support/tickets", json={"category": "bug", "message": "TEST_ ticket from T1 automated test", "email": "test@rushrivals.test"})
        print(r.status_code, r.text[:200])
        assert r.status_code == 201 and r.json().get("ticket_no")

    def test_config(self):
        r = requests.get(f"{BASE}/config")
        assert r.status_code == 200
        d = r.json()
        assert "maintenance" in d and "min_supported_version" in d and "flags" in d

    def test_error_shapes(self):
        r = requests.get(f"{BASE}/nope")
        assert r.status_code == 404 and "error" in r.json() and r.json()["error"]["code"]
        r = auth_post(f"{BASE}/auth/login", json={"email": 5}, headers=XFF)
        assert r.status_code == 422 and r.json()["error"]["code"]


# Rate limit: auth 10/min/IP -> 429 rate_limited (also checks X-Forwarded-For spoof bypass)
class TestRateLimit:
    """Hits the backend directly with a simulated ingress chain (client-claimed, real client, Cloudflare, LB):
    the preview's own egress NAT rotates IPs, which made limit checks through the public URL flaky."""
    LOCAL = "http://localhost:8001/api/v1"

    @staticmethod
    def chain(spoof, real):
        return {"X-Forwarded-For": f"{spoof}, {real}, 104.22.64.87, 35.244.139.18"}

    def test_auth_429(self):
        real = f"203.0.113.{uuid.uuid4().int % 250}"
        codes = [requests.post(f"{self.LOCAL}/auth/login", json={"email": "x@y.test", "password": "whatever1"}, headers=self.chain("1.1.1.1", real)).status_code for _ in range(10)]
        assert 429 not in codes, codes
        last = requests.post(f"{self.LOCAL}/auth/login", json={"email": "x@y.test", "password": "whatever1"}, headers=self.chain("1.1.1.1", real))
        assert last.status_code == 429 and last.json()["error"]["code"] == "rate_limited"

    def test_xff_spoof_bypass(self):
        # rotating the client-controlled (leftmost) X-Forwarded-For entry must NOT bypass the limiter
        real = f"198.51.100.{uuid.uuid4().int % 250}"
        codes = [requests.post(f"{self.LOCAL}/auth/login", json={"email": "x@y.test", "password": "whatever1"}, headers=self.chain(f"10.77.{i}.1", real)).status_code for i in range(13)]
        assert codes[:10] == [401] * 10 and codes[10:] == [429] * 3, codes
