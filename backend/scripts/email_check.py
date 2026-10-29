"""Real transactional-email check against the preview (Phase 7). Uses Resend's test inbox delivered@resend.dev."""
import json
import os
import time
import uuid

import httpx
import jwt
import pyotp
from dotenv import dotenv_values

BASE = dotenv_values("/app/mobile/.env")["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api/v1"
benv = dotenv_values("/app/backend/.env")
TO = "delivered@resend.dev"
out = {}
with httpx.Client(timeout=60) as c:
    # 1) password reset
    r = c.post(f"{BASE}/auth/register", json={"email": TO, "password": "ResendTest123!"})
    out["register"] = r.status_code
    r = c.post(f"{BASE}/auth/forgot-password", json={"email": TO})
    out["forgot_password"] = (r.status_code, {k: v for k, v in r.json().items() if k != "debug_code"})
    # 2) website contact confirmation
    tok = jwt.encode({"typ": "contact", "iat_ms": int((time.time() - 10) * 1000), "exp": int(time.time()) + 3600}, benv["JWT_SECRET"], algorithm="HS256")
    r = c.post(f"{BASE}/public/contact", json={"name": "Resend Test", "email": TO, "category": "other", "message": "Phase 7 email delivery check.", "form_token": tok})
    out["contact"] = (r.status_code, r.json())
    no = r.json().get("ticket_no")
    # 3) admin ticket reply (owner)
    secrets = json.load(open("/tmp/rr_admin_totp.json"))
    r = c.post(f"{BASE}/admin/auth/login", json={"email": benv["ADMIN_OWNER_EMAIL"], "password": benv["ADMIN_OWNER_PASSWORD"]})
    mt = r.json()["mfa_token"]
    code = pyotp.TOTP(secrets[benv["ADMIN_OWNER_EMAIL"]]).at(time.time() + 30)
    v = c.post(f"{BASE}/admin/auth/totp/verify", json={"mfa_token": mt, "code": code})
    csrf = v.json().get("csrf_token")
    r = c.post(f"{BASE}/admin/tickets/{no}/reply", json={"message": "Thanks — this is a real reply test."}, headers={"X-CSRF-Token": csrf})
    out["ticket_reply"] = (r.status_code, {k: r.json().get(k) for k in ("email_sent", "email_error", "inbox")})
    c.post(f"{BASE}/admin/tickets/{no}/close", headers={"X-CSRF-Token": csrf})
    # 4) blocked recipient now reports WHY
    r = c.post(f"{BASE}/admin/tickets/RR-DEMO01/reply", json={"message": "Reply to a demo (.test) address."}, headers={"X-CSRF-Token": csrf})
    out["demo_ticket_reply"] = (r.status_code, {k: r.json().get(k) for k in ("email_sent", "email_error")})
print(json.dumps(out, indent=1))
