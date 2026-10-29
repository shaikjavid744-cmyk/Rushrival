import httpx, uuid, pyotp
from conftest import B, hdr, register, owner, admin, fresh_code, ip
def test_wrong_totp_and_player_jwt_rejected():
    c = httpx.Client(base_url=B, headers={"X-Forwarded-For": ip()})
    # create throwaway admin so wrong-code attempts never touch seeded staff
    o = owner(); email = f"tscheck-auth-{uuid.uuid4().hex[:6]}@rushrivals.test"
    r = o.post("/admin/admins", json={"email": email, "password": "Tscheck-Admin-2026!", "name": "tscheck", "role": "viewer"}); assert r.status_code in (200, 201), r.text
    m = c.post("/admin/auth/login", json={"email": email, "password": "Tscheck-Admin-2026!"}).json(); assert m["mfa_enrolled"] is False
    assert c.get("/admin/me").status_code == 401  # mfa token alone gives no session
    sec = c.post("/admin/auth/totp/enroll", json={"mfa_token": m["mfa_token"]}).json()["secret"]
    bad = c.post("/admin/auth/totp/verify", json={"mfa_token": m["mfa_token"], "code": "000000"}); assert bad.status_code in (400, 401), bad.text
    a = admin(email, "Tscheck-Admin-2026!", sec); assert a.get("/admin/me").status_code == 200
    _, pt = register("p6jwt")
    r = httpx.get(f"{B}/admin/me", headers=hdr(pt)); assert r.status_code in (401, 403), r.text
    r = httpx.get(f"{B}/admin/players", headers={**hdr(), "Cookie": f"rr_admin_session={pt}"}); assert r.status_code in (401, 403), r.text
def test_lockout_after_5_failures():
    o = owner(); email = f"tscheck-lock-{uuid.uuid4().hex[:6]}@rushrivals.test"
    o.post("/admin/admins", json={"email": email, "password": "Tscheck-Admin-2026!", "name": "tscheck", "role": "viewer"}).raise_for_status()
    h = {"X-Forwarded-For": ip()}
    codes = [httpx.post(f"{B}/admin/auth/login", json={"email": email, "password": "wrong-pass"}, headers=h).status_code for _ in range(5)]
    r = httpx.post(f"{B}/admin/auth/login", json={"email": email, "password": "Tscheck-Admin-2026!"}, headers=h)
    assert r.status_code == 423, (codes, r.text)
