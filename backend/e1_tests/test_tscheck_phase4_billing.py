import uuid, httpx
from conftest import B, hdr, register

def me_wallet(tok):
    return httpx.get(f"{B}/me", headers=hdr(tok)).json()["user"]["wallet"]

def test_verify_idempotent_grant_once():
    _, tok = register("p4verify")
    t = f"mock_tscheck_{uuid.uuid4().hex}"
    r1 = httpx.post(f"{B}/purchases/verify", json={"product_id": "rr_gems_550", "purchase_token": t}, headers=hdr(tok))
    assert r1.status_code == 200 and r1.json()["status"] == "verified", r1.text
    g = me_wallet(tok)["gems"]
    r2 = httpx.post(f"{B}/purchases/verify", json={"product_id": "rr_gems_550", "purchase_token": t}, headers=hdr(tok))
    assert r2.json()["status"] == "already_processed", r2.text
    assert me_wallet(tok)["gems"] == g

def test_non_mock_token_unavailable_no_grant():
    _, tok = register("p4unconf")
    before = me_wallet(tok)["gems"]
    r = httpx.post(f"{B}/purchases/verify", json={"product_id": "rr_gems_100", "purchase_token": "realtoken_" + uuid.uuid4().hex}, headers=hdr(tok))
    assert r.status_code == 503 and r.json()["error"]["code"] == "verification_unavailable", r.text
    assert me_wallet(tok)["gems"] == before

def test_guest_remove_ads_entitlement_and_restore():
    dev = {"X-Device-Id": "tscheck-" + uuid.uuid4().hex[:12]}
    t = f"mock_tscheck_{uuid.uuid4().hex}"
    r = httpx.post(f"{B}/purchases/verify", json={"product_id": "rr_remove_ads", "purchase_token": t}, headers={**hdr(), **dev})
    assert r.status_code == 200, r.text
    e = httpx.get(f"{B}/entitlements", headers={**hdr(), **dev})
    assert e.json()["remove_ads"] is True, e.text

def test_rtdn_unconfigured_rejected():
    r = httpx.post(f"{B}/billing/rtdn", json={"message": {"messageId": "x"}}, headers=hdr())
    assert r.status_code == 503, r.text

def test_ad_unlock_galaxy_at_5():
    _, tok = register("p4adunlock")
    last = None
    for i in range(5):
        r = httpx.post(f"{B}/ads/reward", json={"placement": "unlock", "event_id": f"tscheck-{uuid.uuid4().hex}", "item_kind": "board", "item_id": "galaxy"}, headers=hdr(tok, idem=True))
        assert r.status_code == 200, r.text
        last = r.json()
        assert last["progress"] == i + 1
    assert last["unlocked"] is True
