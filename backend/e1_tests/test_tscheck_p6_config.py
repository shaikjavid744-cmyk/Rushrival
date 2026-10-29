import httpx, copy
from conftest import B, admin
def cat(): return httpx.get(f"{B}/catalog").json()
def test_four_eyes_publish_rollback():
    ed = admin("liveops.editor@rushrivals.test"); pub = admin("publisher@rushrivals.test")
    base = ed.get("/admin/config/published").json(); base_v = cat()["version"]
    orig = base["data"]["catalog"]["character"]["zoe"]["price"]["amount"]
    data = copy.deepcopy(base["data"]); data["catalog"]["character"]["zoe"]["price"]["amount"] = orig + 1
    d = ed.post("/admin/config/drafts", json={"data": data, "note": "tscheck-config zoe+1"}); assert d.status_code in (200, 201), d.text
    v = d.json().get("version"); assert v
    diff = ed.get(f"/admin/config/versions/{v}/diff"); assert diff.status_code == 200 and "zoe" in diff.text, diff.text[:300]
    assert ed.post(f"/admin/config/versions/{v}/submit").status_code == 200
    self_ap = ed.post(f"/admin/config/versions/{v}/approve"); assert self_ap.status_code == 403 or self_ap.status_code == 400, self_ap.text
    early = pub.post(f"/admin/config/versions/{v}/publish", json={"confirm": True})
    ap = pub.post(f"/admin/config/versions/{v}/approve"); assert ap.status_code == 200, ap.text
    p = pub.post(f"/admin/config/versions/{v}/publish", json={"confirm": True}); assert p.status_code == 200, p.text
    assert cat()["items"]["character"]["zoe"]["amount"] == orig + 1
    rb = pub.post("/admin/config/rollback", json={"version": base["version"], "confirm": True, "note": "tscheck rollback"}); assert rb.status_code == 200, rb.text
    assert cat()["items"]["character"]["zoe"]["amount"] == orig
    print("early publish before approve:", early.status_code)
def test_maintenance_toggle_typed_confirm():
    pub = admin("publisher@rushrivals.test")
    no = pub.post("/admin/config/quick", json={"maintenance": True, "confirm": False}); assert no.status_code in (400, 422), no.text
    try:
        r = pub.post("/admin/config/quick", json={"maintenance": True, "confirm": True}); assert r.status_code == 200, r.text
        assert httpx.get(f"{B}/config").json()["maintenance"] is True
    finally:
        pub.post("/admin/config/quick", json={"maintenance": False, "confirm": True})
    assert httpx.get(f"{B}/config").json()["maintenance"] is False
