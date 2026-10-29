import httpx, uuid
from conftest import B, hdr, register, local, admin, owner
REP = dict(duration=5, distance=30, coins=5, score=80, world="city")
def _uid(c, email):
    items = c.get("/admin/players", params={"q": email}).json()["items"]; assert items, email
    return items[0]["user_id"]
def test_search_detail_masked_and_compensate_once():
    c = admin("support@rushrivals.test")
    seeded = c.get("/admin/players", params={"q": "player@rushrivals.test"}).json()["items"]
    assert any(i["email"] == "player@rushrivals.test" for i in seeded)
    d = c.get(f"/admin/players/{seeded[0]['user_id']}"); assert d.status_code == 200
    assert "password" not in d.text.lower() or "hash" not in d.text.lower()
    email, t = register("p6comp"); httpx.post(f"{B}/me/link", json={"local": local(0)}, headers=hdr(t))
    uid = _uid(c, email)
    h = {"Idempotency-Key": "tscheck-" + uuid.uuid4().hex}
    r1 = c.post(f"/admin/players/{uid}/compensate", json={"coins": 100, "gems": 0, "hoverboards": 0, "reason": "tscheck comp"}, headers=h); assert r1.status_code == 200, r1.text
    r2 = c.post(f"/admin/players/{uid}/compensate", json={"coins": 100, "gems": 0, "hoverboards": 0, "reason": "tscheck comp"}, headers=h); print(r2.status_code, r2.text[:200])
    w = httpx.get(f"{B}/me", headers=hdr(t)).json()["user"]["wallet"]["coins"]; assert w == 100, w
    a = owner().get("/admin/audit", params={"q": uid}).json()["items"]; assert any("compens" in x["action"] for x in a), str(a)[:300]
def test_ban_hides_leaderboard():
    email, t = register("p6ban"); httpx.post(f"{B}/me/link", json={"local": local(0)}, headers=hdr(t))
    s = httpx.post(f"{B}/runs/start", json={"world": "city"}, headers=hdr(t)).json()
    httpx.post(f"{B}/runs/finish", json={**REP, "run_id": s["run_id"], "seed": s["seed"], "run_token": s["run_token"]}, headers=hdr(t, idem=True)).raise_for_status()
    c = admin("moderator@rushrivals.test"); uid = _uid(c, email)
    lb = lambda: httpx.get(f"{B}/leaderboard?period=all&limit=500", headers=hdr()).text
    assert uid in lb() or "tscheck" in lb()
    r = c.post(f"/admin/players/{uid}/enforce", json={"action": "ban", "reason": "tscheck ban", "confirm": True}); assert r.status_code == 200, r.text
    assert uid not in lb(), "banned user still on leaderboard"
def test_purchase_revoke_ledger_audit():
    email, t = register("p6rev")
    r = httpx.post(f"{B}/purchases/verify", json={"product_id": "rr_gems_100", "purchase_token": f"mock_tscheck_{uuid.uuid4().hex}"}, headers=hdr(t)); assert r.status_code == 200, r.text
    c = admin("finance@rushrivals.test"); uid = _uid(c, email)
    p = [x for x in c.get("/admin/purchases", params={"owner": uid}).json()["items"]][0]
    assert "mock_tscheck" not in str(p.get("purchase_token"))  # masked
    bad = c.post(f"/admin/purchases/{p['purchase_id']}/revoke", json={"reason": "", "confirm": True}); assert bad.status_code in (400, 422), bad.text
    r = c.post(f"/admin/purchases/{p['purchase_id']}/revoke", json={"reason": "tscheck refund", "confirm": True}); assert r.status_code == 200, r.text
    led = c.get("/admin/ledger", params={"user_id": uid}).json()["items"]; assert any("revoke" in str(x).lower() or "refund" in str(x).lower() for x in led), str(led)[:300]
    a = owner().get("/admin/audit", params={"q": p["purchase_id"]}).json()["items"]; assert a, "no audit for revoke"
    rv = c.post(f"/admin/purchases/{p['purchase_id']}/reverify"); print("reverify", rv.status_code, rv.text[:150])
