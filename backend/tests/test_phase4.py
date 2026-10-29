# Phase 4 backend: purchase verify idempotency, mock-token rejection in production, refund revocation, RTDN, ad rewards
import base64
import json
import uuid

import pytest

from rr import billing as B
from rr.routers import billing as BR

from .test_phase3 import client, ik, register  # noqa: F401  (fixture re-use)

pytestmark = pytest.mark.asyncio
V = "/api/v1"


@pytest.fixture(autouse=True)
def dev_env(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("ANDROID_PACKAGE_NAME", "com.test.rr")
    monkeypatch.delenv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", raising=False)


async def wallet(c, h):
    return (await c.get(f"{V}/me", headers=h)).json()["user"]["wallet"]


async def test_verify_grants_once_and_duplicate_token_is_noop(client):
    h, _ = await register(client)
    tok = f"mock_{uuid.uuid4().hex}"
    r1 = await client.post(f"{V}/purchases/verify", json={"product_id": "rr_gems_550", "purchase_token": tok}, headers=h)
    assert r1.status_code == 200 and r1.json()["status"] == "verified", r1.text
    assert (await wallet(client, h))["gems"] == 550
    r2 = await client.post(f"{V}/purchases/verify", json={"product_id": "rr_gems_550", "purchase_token": tok}, headers=h)
    assert r2.json()["status"] == "already_processed"
    assert (await wallet(client, h))["gems"] == 550  # unchanged


async def test_concurrent_duplicate_callbacks_grant_once(client):
    import asyncio

    h, _ = await register(client)
    tok = f"mock_{uuid.uuid4().hex}"
    rs = await asyncio.gather(*[client.post(f"{V}/purchases/verify", json={"product_id": "rr_gems_100", "purchase_token": tok}, headers=h) for _ in range(10)])
    assert sorted(r.json()["status"] for r in rs).count("verified") == 1
    assert (await wallet(client, h))["gems"] == 100


async def test_token_of_other_owner_rejected(client):
    h1, _ = await register(client)
    h2, _ = await register(client)
    tok = f"mock_{uuid.uuid4().hex}"
    await client.post(f"{V}/purchases/verify", json={"product_id": "rr_gems_100", "purchase_token": tok}, headers=h1)
    r = await client.post(f"{V}/purchases/verify", json={"product_id": "rr_gems_100", "purchase_token": tok}, headers=h2)
    assert r.status_code == 409 and r.json()["error"]["code"] == "purchase_owned_elsewhere"


async def test_mock_tokens_rejected_in_production(client, monkeypatch):
    monkeypatch.setenv("ENV", "production")
    h, _ = await register(client)
    r = await client.post(f"{V}/purchases/verify", json={"product_id": "rr_gems_100", "purchase_token": f"mock_{uuid.uuid4().hex}"}, headers=h)
    assert r.status_code == 400 and r.json()["error"]["code"] == "mock_token_rejected"
    assert (await wallet(client, h))["gems"] == 0


async def test_unconfigured_verification_never_grants(client):
    h, _ = await register(client)
    r = await client.post(f"{V}/purchases/verify", json={"product_id": "rr_gems_100", "purchase_token": "real-play-token-abc"}, headers=h)
    assert r.status_code == 503 and r.json()["error"]["code"] == "verification_unavailable"
    assert (await wallet(client, h))["gems"] == 0


async def test_pending_grants_nothing_until_purchased(client):
    h, _ = await register(client)
    r = await client.post(f"{V}/purchases/verify", json={"product_id": "rr_gems_100", "purchase_token": f"mock_pending_{uuid.uuid4().hex}"}, headers=h)
    assert r.json()["status"] == "pending"
    assert (await wallet(client, h))["gems"] == 0


async def test_guest_remove_ads_restore_and_refund_revocation(client):
    dev = {"X-Device-Id": f"device-{uuid.uuid4().hex[:12]}"}
    tok = f"mock_{uuid.uuid4().hex}"
    r = await client.post(f"{V}/purchases/verify", json={"product_id": "rr_remove_ads", "purchase_token": tok}, headers=dev)
    assert r.json()["status"] == "verified" and "remove_ads" in r.json()["entitlements"]
    # restore on a fresh session: same token -> already_processed, entitlement still active
    r2 = await client.post(f"{V}/purchases/verify", json={"product_id": "rr_remove_ads", "purchase_token": tok}, headers=dev)
    assert r2.json()["status"] == "already_processed" and "remove_ads" in r2.json()["entitlements"]
    assert (await client.get(f"{V}/entitlements", headers=dev)).json()["remove_ads"] is True
    assert await B.revoke(tok, "test_refund") is True
    assert await B.revoke(tok, "test_refund") is False  # idempotent
    assert (await client.get(f"{V}/entitlements", headers=dev)).json()["remove_ads"] is False


async def test_refund_claws_back_currency_with_ledger(client):
    h, d = await register(client)
    tok = f"mock_{uuid.uuid4().hex}"
    await client.post(f"{V}/purchases/verify", json={"product_id": "rr_gems_550", "purchase_token": tok}, headers=h)
    await B.revoke(tok, "test_refund")
    assert (await wallet(client, h))["gems"] == 0
    led = (await client.get(f"{V}/me/ledger", headers=h)).json()["items"]
    assert any(e["reason"] == "iap_refund" for e in led)


async def test_rtdn_voided_revokes_and_dedupes(client, monkeypatch):
    monkeypatch.setattr(BR, "verify_pubsub_jwt", lambda auth: {"email": "push@test"})
    dev = {"X-Device-Id": f"device-{uuid.uuid4().hex[:12]}"}
    tok = f"mock_{uuid.uuid4().hex}"
    await client.post(f"{V}/purchases/verify", json={"product_id": "rr_remove_ads", "purchase_token": tok}, headers=dev)
    data = base64.b64encode(json.dumps({"packageName": "com.test.rr", "voidedPurchaseNotification": {"purchaseToken": tok, "productType": 2}}).encode()).decode()
    body = {"message": {"messageId": uuid.uuid4().hex, "data": data}}
    r = await client.post(f"{V}/billing/rtdn", json=body, headers={"Authorization": "Bearer x"})
    assert r.json() == {"ok": True, "revoked": True}
    assert (await client.post(f"{V}/billing/rtdn", json=body, headers={"Authorization": "Bearer x"})).json()["duplicate"] is True
    assert (await client.get(f"{V}/entitlements", headers=dev)).json()["remove_ads"] is False


async def test_rtdn_unconfigured_or_bad_token(client, monkeypatch):
    r = await client.post(f"{V}/billing/rtdn", json={}, headers={"Authorization": "Bearer x"})
    assert r.status_code == 503
    monkeypatch.setenv("PUBSUB_AUDIENCE", "https://x/api/v1/billing/rtdn")
    monkeypatch.setenv("PUBSUB_PUSH_SERVICE_ACCOUNT", "push@test")
    r = await client.post(f"{V}/billing/rtdn", json={}, headers={"Authorization": "Bearer not-a-jwt"})
    assert r.status_code == 401


async def test_ad_unlock_progress_and_double_coins_once(client):
    h, _ = await register(client)
    for i in range(5):
        r = await client.post(f"{V}/ads/reward", json={"placement": "unlock", "event_id": f"evt-unlock-{i}-{uuid.uuid4().hex[:6]}", "item_kind": "board", "item_id": "galaxy"}, headers={**h, **ik()})
        assert r.status_code == 200, r.text
    assert r.json()["unlocked"] is True and r.json()["progress"] == 5
    me = (await client.get(f"{V}/me", headers=h)).json()["user"]
    assert "galaxy" in me["inventory"]["board"]
    bad = await client.post(f"{V}/ads/reward", json={"placement": "unlock", "event_id": "evt-bad-xxxx", "item_kind": "board", "item_id": "flame"}, headers={**h, **ik()})
    assert bad.status_code == 400
    # double coins needs a finished run; then only once
    s = (await client.post(f"{V}/runs/start", json={"world": "city"}, headers=h)).json()
    import asyncio
    await asyncio.sleep(0)
    fin = await client.post(f"{V}/runs/offline", json={"run_id": s["run_id"] + "x", "seed": 1, "duration": 30, "distance": 300, "coins": 20, "score": 500, "powerups_used": 0, "revives": 0, "world": "city", "event_tokens": 0}, headers={**h, **ik()})
    assert fin.status_code == 200, fin.text
    rid = s["run_id"] + "x"
    d1 = await client.post(f"{V}/ads/reward", json={"placement": "double_coins", "event_id": f"evt-dbl-{uuid.uuid4().hex}", "run_id": rid}, headers={**h, **ik()})
    assert d1.status_code == 200, d1.text
    d2 = await client.post(f"{V}/ads/reward", json={"placement": "double_coins", "event_id": f"evt-dbl-{uuid.uuid4().hex}", "run_id": rid}, headers={**h, **ik()})
    assert d2.status_code == 409 and d2.json()["error"]["code"] == "already_claimed"
