import httpx, uuid, time
from conftest import B, hdr
def tok(h): return httpx.get(f"{B}/public/contact/form-token", headers=h).json()
def body(t, **kw):
    b = {"name": "tscheck-contact", "email": f"tscheck-{uuid.uuid4().hex[:6]}@rushrivals.test", "category": "bug", "message": "tscheck message long enough for validation", "website": "", "form_token": t}
    b.update(kw); return b
def test_valid_submit_ticket():
    h = hdr(); t = tok(h); print(t); time.sleep(4)
    r = httpx.post(f"{B}/public/contact", json=body(t.get("form_token") or t.get("token")), headers=h)
    assert r.status_code in (200, 201), r.text; assert r.json()["ticket_no"].startswith("RR-"), r.text
def test_honeypot_and_too_fast_rejected():
    h = hdr(); t = tok(h); t = t.get("form_token") or t.get("token")
    fast = httpx.post(f"{B}/public/contact", json=body(t), headers=h); print(fast.text)
    assert fast.status_code >= 400 or not fast.json().get("ticket_no"), fast.text
    h2 = hdr(); t2 = tok(h2); t2 = t2.get("form_token") or t2.get("token"); time.sleep(4)
    hp = httpx.post(f"{B}/public/contact", json=body(t2, website="http://spam"), headers=h2); print(hp.text)
    assert hp.status_code >= 400 or not hp.json().get("ticket_no"), hp.text
def test_invalid_rejected():
    h = hdr(); t = tok(h); t = t.get("form_token") or t.get("token"); time.sleep(4)
    r = httpx.post(f"{B}/public/contact", json=body(t, email="nope", message=""), headers=h); assert r.status_code in (400, 422), r.text
def test_deletion_request():
    r = httpx.post(f"{B}/public/data-deletion", json={"email": f"tscheck-del-{uuid.uuid4().hex[:6]}@rushrivals.test", "confirm": True, "note": "tscheck"}, headers=hdr())
    assert r.status_code in (200, 201, 202), r.text; print(r.text)
