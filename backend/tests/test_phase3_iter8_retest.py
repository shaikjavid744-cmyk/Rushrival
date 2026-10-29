# Iteration 8 retest: server-priced revive (per-run count, ref suffix ignored), XFF-rotation rate limit, device-link wallet isolation
import os
import time
import uuid

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

BASE = dotenv_values("/app/mobile/.env")["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api/v1"
BENV = dotenv_values("/app/backend/.env")
DB = MongoClient(BENV["MONGO_URL"])[BENV["DB_NAME"]]


def auth_post(url, **kw):
    for _ in range(10):
        r = requests.post(url, **kw)
        if r.status_code != 429:
            return r
        time.sleep(r.json()["error"].get("details", {}).get("retry_after_s", 10) + 1)
    return r


def k():
    return "TESTKEY_" + uuid.uuid4().hex


def h(tok, idem=None):
    d = {"Authorization": f"Bearer {tok}"}
    if idem:
        d["Idempotency-Key"] = idem
    return d


@pytest.fixture(scope="module")
def user():
    email = f"test_{uuid.uuid4().hex[:8]}@rushrivals.test"
    r = auth_post(f"{BASE}/auth/register", json={"email": email, "password": "TestPass123!", "name": "TEST_iter8"})
    assert r.status_code == 201, r.text
    d = r.json()
    yield {"email": email, **d}
    requests.post(f"{BASE}/auth/delete-account", json={"confirm": "DELETE"}, headers=h(d["access_token"]))


# Revive pricing: 5, 10, then revive_limit, independent of the client's ref suffix
class TestRevivePricing:
    def test_revive_price_sequence(self, user):
        t = user["access_token"]
        uid = requests.get(f"{BASE}/me", headers=h(t)).json()["user"]["user_id"]
        DB.users.update_one({"user_id": uid}, {"$set": {"wallet.gems": 100}})
        run = "TEST_run_" + uuid.uuid4().hex[:6]
        g = requests.get(f"{BASE}/me", headers=h(t)).json()["user"]["wallet"]["gems"]
        assert g == 100, g
        costs = []
        for ref in (f"{run}:0", f"{run}:0x", f"{run}:999"):
            r = requests.post(f"{BASE}/me/spend", json={"sink": "revive", "ref": ref}, headers=h(t, k()))
            if r.status_code == 200:
                ng = r.json()["wallet"]["gems"]
                costs.append(g - ng)
                g = ng
            else:
                costs.append(r.json()["error"]["code"])
        print("revive costs", costs)
        assert costs == [5, 10, "revive_limit"], costs
        # bare run id (no suffix) counts too
        r = requests.post(f"{BASE}/me/spend", json={"sink": "revive", "ref": run}, headers=h(t, k()))
        assert r.status_code == 400 and r.json()["error"]["code"] == "revive_limit", r.text
        # new run starts at 5 again
        r = requests.post(f"{BASE}/me/spend", json={"sink": "revive", "ref": f"{run}b:1"}, headers=h(t, k()))
        assert r.status_code == 200 and g - r.json()["wallet"]["gems"] == 5, r.text

    def test_revive_idempotent_replay(self, user):
        t = user["access_token"]
        run = "TEST_run_" + uuid.uuid4().hex[:6]
        key = k()
        r1 = requests.post(f"{BASE}/me/spend", json={"sink": "revive", "ref": f"{run}:0"}, headers=h(t, key))
        r2 = requests.post(f"{BASE}/me/spend", json={"sink": "revive", "ref": f"{run}:0"}, headers=h(t, key))
        assert r1.status_code == 200, r1.text
        assert r2.json()["wallet"] == r1.json()["wallet"]


# Rate limit: rotating spoofed X-Forwarded-For must still hit 429 (run last; consumes the IP's auth budget)
class TestZRateLimit:
    def test_xff_rotation_429(self):
        time.sleep(61)
        codes = []
        for i in range(13):
            r = requests.post(f"{BASE}/auth/login", json={"email": "nobody@rushrivals.test", "password": "wrongpass1"},
                              headers={"X-Forwarded-For": f"203.0.113.{i + 1}"})
            codes.append(r.status_code)
        print("codes", codes)
        assert 429 in codes, codes
        assert codes.index(429) <= 10, codes
        r = requests.post(f"{BASE}/auth/login", json={"email": "nobody@rushrivals.test", "password": "wrongpass1"},
                          headers={"X-Forwarded-For": "1.2.3.4, 5.6.7.8, 9.9.9.9"})
        assert r.status_code == 429, r.status_code
        assert r.json()["error"]["code"] == "rate_limited"
