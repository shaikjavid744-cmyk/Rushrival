"""Phase 7: email failure reason surfaced (admin ticket reply) + real contact confirmation send."""
import json
import os
import time

import pyotp
import pytest
import requests

BASE_URL = [l.split("=", 1)[1].strip() for l in open("/app/mobile/.env") if l.startswith("EXPO_PUBLIC_BACKEND_URL=")][0].rstrip("/")
OWNER = ("owner@rushrivals.test", "RR-Owner-f6i4j5Pe27Cu")


@pytest.fixture(scope="module")
def owner():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/v1/admin/auth/login", json={"email": OWNER[0], "password": OWNER[1]})
    assert r.status_code == 200, r.text
    tok = r.json()["mfa_token"]
    secret = json.load(open("/tmp/rr_admin_totp.json"))[OWNER[0]]
    for code in (pyotp.TOTP(secret).now(), pyotp.TOTP(secret).at(time.time() + 30)):
        v = s.post(f"{BASE_URL}/api/v1/admin/auth/totp/verify", json={"mfa_token": tok, "code": code})
        if v.status_code == 200:
            s.headers["X-CSRF-Token"] = v.json()["csrf_token"]
            return s
    pytest.skip(f"TOTP verify failed: {v.status_code} {v.text}")


# Admin ticket reply → demo ticket's .test address is undeliverable; reason surfaced
def test_admin_reply_returns_email_error(owner):
    r = owner.post(f"{BASE_URL}/api/v1/admin/tickets/RR-DEMO01/reply", json={"message": "TEST_ phase7 reply check"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["email_sent"] is False
    assert d["email_error"] == "undeliverable_recipient"
    last = d["ticket"]["replies"][-1]
    assert last.get("email_error") == "undeliverable_recipient"


# Public contact form → real send to Resend test inbox succeeds
def test_contact_real_send():
    t = requests.get(f"{BASE_URL}/api/v1/public/contact/form-token").json()["form_token"]
    time.sleep(3.5)
    r = requests.post(f"{BASE_URL}/api/v1/public/contact", json={"name": "TEST_ P7", "email": "delivered@resend.dev", "category": "feedback",
                                                                 "message": "TEST_ phase 7 contact confirmation check", "form_token": t})
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["ticket_no"].startswith("RR-")
    assert d["confirmation_email_sent"] is True
