import uuid, httpx, pytest
B = "http://localhost:8001/api/v1"
def ip(): return f"10.{uuid.uuid4().int%250}.{uuid.uuid4().int%250}.{uuid.uuid4().int%250}"
def hdr(tok=None, xff=None, idem=False):
    h = {"X-Forwarded-For": xff or f"{ip()},p1,p2"}
    if tok: h["Authorization"] = f"Bearer {tok}"
    if idem: h["Idempotency-Key"] = "tscheck-" + uuid.uuid4().hex
    return h
def register(slug):
    email = f"tscheck-{slug}-{uuid.uuid4().hex[:8]}@rushrivals.test"
    r = httpx.post(f"{B}/auth/register", json={"email": email, "password": "Tscheck123!", "name": "tscheck"}, headers=hdr())
    assert r.status_code == 201, r.text
    return email, r.json()["access_token"]
def local(coins=0, gems=0):
    return {"coins": coins, "gems": gems, "hoverboards": 0, "xp": 0, "best_score": 0, "inventory": {}, "equipped": {}}

# ---- Phase 6 admin helpers ----
import json as _json, os as _os, time as _time, pyotp as _pyotp
TOTP = _json.load(open('/tmp/rr_admin_totp.json')) if _os.path.exists('/tmp/rr_admin_totp.json') else {}
DEMO_PW = "RushAdmin-Demo-2026!"
OWNER = ("owner@rushrivals.test", _os.environ.get("RR_OWNER_PW", "RR-Owner-f6i4j5Pe27Cu"))
_USED = "/tmp/rr_totp_used.json"
def fresh_code(secret):
    """TOTP codes are single-use: wait for an unused 30s window."""
    while True:
        u = _json.load(open(_USED)) if _os.path.exists(_USED) else {}
        step = int(_time.time() // 30)
        if u.get(secret, 0) < step and _time.time() % 30 < 27: break
        _time.sleep(1)
    u[secret] = step; _json.dump(u, open(_USED, "w"))
    return _pyotp.TOTP(secret).now()
def admin(email, pw=DEMO_PW, secret=None):
    c = httpx.Client(base_url=B, headers={"X-Forwarded-For": ip()}, timeout=30)
    r = c.post("/admin/auth/login", json={"email": email, "password": pw}); assert r.status_code == 200, r.text
    r = c.post("/admin/auth/totp/verify", json={"mfa_token": r.json()["mfa_token"], "code": fresh_code(secret or TOTP[email])})
    assert r.status_code == 200, r.text
    c.headers["X-CSRF-Token"] = r.json()["csrf_token"]
    c.headers["Cookie"] = "rr_admin_session=" + r.cookies.get("rr_admin_session")
    return c
def owner(): return admin(*OWNER)
