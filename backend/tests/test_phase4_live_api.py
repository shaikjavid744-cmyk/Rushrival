# Phase 4 live API tests (public URL): purchases verify, entitlements, ads reward, RTDN
import os
import time
import uuid

import pytest
import requests

def _base():
    url = os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    if not url:
        for line in open("/app/mobile/.env"):
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                url = line.split("=", 1)[1].strip().strip('"')
    return url.rstrip("/")

BASE = _base() + "/api/v1"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE}/auth/login", json={"email": "player@rushrivals.test", "password": "RushPlayer123!"}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code} {r.text[:200]}")
    d = r.json()
    t = d.get("access_token") or d.get("token") or (d.get("tokens") or {}).get("access_token")
    assert t, d
    return t


def H(t, **kw):
    return {"Authorization": f"Bearer {t}", **kw}


def wallet(t):
    r = requests.get(f"{BASE}/me", headers=H(t), timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    return (d.get("wallet") or d.get("user", {}).get("wallet"))


# Signed-in verify grants once
def test_signed_in_verify_grants_once(token):
    before = wallet(token)["gems"]
    tok = f"mock_{uuid.uuid4().hex}"
    r = requests.post(f"{BASE}/purchases/verify", json={"product_id": "rr_gems_100", "purchase_token": tok}, headers=H(token), timeout=20)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "verified"
    assert wallet(token)["gems"] == before + 100
    r2 = requests.post(f"{BASE}/purchases/verify", json={"product_id": "rr_gems_100", "purchase_token": tok}, headers=H(token), timeout=20)
    assert r2.status_code == 200 and r2.json()["status"] == "already_processed"
    assert wallet(token)["gems"] == before + 100


# Guest requires device id
def test_guest_device_id_required():
    r = requests.post(f"{BASE}/purchases/verify", json={"product_id": "rr_gems_100", "purchase_token": f"mock_{uuid.uuid4().hex}"}, timeout=20)
    assert r.status_code == 400 and "device_id" in r.text
    r = requests.post(f"{BASE}/purchases/verify", json={"product_id": "rr_gems_100", "purchase_token": f"mock_{uuid.uuid4().hex}"}, headers={"X-Device-Id": "short"}, timeout=20)
    assert r.status_code == 400


# Guest remove ads -> entitlements
def test_guest_remove_ads_entitlement():
    dev = {"X-Device-Id": f"TEST_dev_{uuid.uuid4().hex[:16]}"}
    r = requests.get(f"{BASE}/entitlements", headers=dev, timeout=20)
    assert r.status_code == 200 and r.json()["remove_ads"] is False
    r = requests.post(f"{BASE}/purchases/verify", json={"product_id": "rr_remove_ads", "purchase_token": f"mock_{uuid.uuid4().hex}"}, headers=dev, timeout=20)
    assert r.status_code == 200 and "remove_ads" in r.json()["entitlements"]
    r = requests.get(f"{BASE}/entitlements", headers=dev, timeout=20)
    assert r.json()["remove_ads"] is True


def test_real_token_verification_unavailable():
    r = requests.post(f"{BASE}/purchases/verify", json={"product_id": "rr_gems_100", "purchase_token": f"realtok{uuid.uuid4().hex}"}, headers={"X-Device-Id": "TEST_dev_123456"}, timeout=20)
    assert r.status_code == 503 and "verification_unavailable" in r.text


def test_unknown_product():
    r = requests.post(f"{BASE}/purchases/verify", json={"product_id": "nope", "purchase_token": f"mock_{uuid.uuid4().hex}"}, headers={"X-Device-Id": "TEST_dev_123456"}, timeout=20)
    assert r.status_code == 400 and "unknown_product" in r.text


def test_ads_reward_requires_auth():
    r = requests.post(f"{BASE}/ads/reward", json={"placement": "unlock", "event_id": uuid.uuid4().hex, "item_kind": "board", "item_id": "galaxy"}, headers={"Idempotency-Key": uuid.uuid4().hex}, timeout=20)
    assert r.status_code == 401


def test_ads_reward_requires_idempotency_key(token):
    r = requests.post(f"{BASE}/ads/reward", json={"placement": "unlock", "event_id": uuid.uuid4().hex, "item_kind": "board", "item_id": "galaxy"}, headers=H(token), timeout=20)
    assert r.status_code in (400, 422), r.text


def test_ads_reward_unlock_progress(token):
    ev = uuid.uuid4().hex
    hdr = H(token, **{"Idempotency-Key": uuid.uuid4().hex})
    body = {"placement": "unlock", "event_id": ev, "item_kind": "board", "item_id": "galaxy"}
    r = requests.post(f"{BASE}/ads/reward", json=body, headers=hdr, timeout=20)
    if r.status_code == 429:
        pytest.skip("daily ad cap reached")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["placement"] == "unlock" and d["target"] == 5 and 1 <= d["progress"] <= 5
    r2 = requests.post(f"{BASE}/ads/reward", json=body, headers=hdr, timeout=20)  # idempotent replay
    assert r2.status_code == 200 and r2.json()["progress"] == d["progress"]


def test_ads_reward_revive_needs_run_id(token):
    r = requests.post(f"{BASE}/ads/reward", json={"placement": "revive", "event_id": uuid.uuid4().hex}, headers=H(token, **{"Idempotency-Key": uuid.uuid4().hex}), timeout=20)
    assert r.status_code in (400, 429), r.text


def test_ads_reward_bad_unlock_item(token):
    r = requests.post(f"{BASE}/ads/reward", json={"placement": "unlock", "event_id": uuid.uuid4().hex, "item_kind": "board", "item_id": "classic"}, headers=H(token, **{"Idempotency-Key": uuid.uuid4().hex}), timeout=20)
    assert r.status_code in (400, 429), r.text


def test_rtdn_unconfigured():
    r = requests.post(f"{BASE}/billing/rtdn", json={"message": {"messageId": "x", "data": ""}}, timeout=20)
    assert r.status_code == 503 and "verification_unavailable" in r.text
