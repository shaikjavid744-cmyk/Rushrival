import httpx, uuid, time
from conftest import B, hdr, admin, owner, fresh_code, TOTP, ip, OWNER
def test_news_publish_unpublish_visible():
    c = admin("publisher@rushrivals.test"); slug = f"tscheck-news-{uuid.uuid4().hex[:6]}"
    r = c.post("/admin/news", json={"title": "tscheck news", "slug": slug, "summary": "tscheck summary", "body": "tscheck body text"}); assert r.status_code in (200, 201), r.text
    nid = r.json().get("news_id") or r.json().get("item_id") or r.json().get("id") or r.json().get("item", {}).get("item_id"); assert nid, r.text
    try:
        assert c.post(f"/admin/news/{nid}/publish", json={"inbox": False}).status_code == 200
        assert slug in httpx.get(f"{B}/public/news").text
        assert httpx.get(f"{B}/public/news/{slug}").status_code == 200
    finally:
        c.post(f"/admin/news/{nid}/unpublish")
    assert slug not in httpx.get(f"{B}/public/news").text
    assert httpx.get(f"{B}/public/news/{slug}").status_code == 404
def test_ticket_reply_close():
    h = hdr(); t = httpx.get(f"{B}/public/contact/form-token", headers=h).json()["form_token"]; time.sleep(4)
    r = httpx.post(f"{B}/public/contact", json={"name": "tscheck-ticket", "email": "tscheck-t@rushrivals.test", "category": "bug", "message": "tscheck ticket body text", "website": "", "form_token": t}, headers=h)
    no = r.json()["ticket_no"]; c = admin("support@rushrivals.test")
    rp = c.post(f"/admin/tickets/{no}/reply", json={"message": "tscheck reply"}); assert rp.status_code == 200, rp.text
    print("reply resp", rp.text[:200])
    cl = c.post(f"/admin/tickets/{no}/close"); assert cl.status_code == 200, cl.text
    assert c.get(f"/admin/tickets/{no}").json().get("status", c.get(f"/admin/tickets/{no}").json().get("ticket", {}).get("status")) == "closed"
def test_audit_before_after_csv():
    o = owner(); items = o.get("/admin/audit", params={"limit": 50}).json()["items"]; assert items
    assert any("before" in x and "after" in x for x in items), str(items[0])[:300]
    csv = o.get("/admin/audit/export.csv"); assert csv.status_code == 200 and "text/csv" in csv.headers["content-type"], csv.headers
    assert "action" in csv.text.splitlines()[0]
def test_revoked_session_401():
    a = admin("viewer@rushrivals.test"); b = admin("viewer@rushrivals.test")
    sid = [s for s in b.get("/admin/sessions").json()["items"] if s["current"]][0]["session_id"]
    assert a.post(f"/admin/sessions/{sid}/revoke").status_code == 200
    assert b.get("/admin/me").status_code == 401
    assert a.get("/admin/me").status_code == 200
