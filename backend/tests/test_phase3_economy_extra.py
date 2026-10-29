# Phase 3 extra: event claim-once, purchase replay with funds, concurrent purchases never go negative
import subprocess, uuid, concurrent.futures as cf
import requests
from dotenv import dotenv_values


def auth_post(url, **kw):
    """Auth calls share one real IP (spoofed X-Forwarded-For no longer bypasses the limiter): wait out 429s."""
    import time
    for _ in range(8):
        r = requests.post(url, **kw)
        if r.status_code != 429:
            return r
        time.sleep(r.json()["error"].get("details", {}).get("retry_after_s", 10) + 1)
    return r

B = dotenv_values("/app/mobile/.env")["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api/v1"


def mongo(js):
    return subprocess.run(["mongosh", "test_database", "--quiet", "--eval", js], capture_output=True, text=True).stdout


def test_event_claim_once_and_purchase_replay_and_no_negative():
    email = f"test_x_{uuid.uuid4().hex[:6]}@rushrivals.test"
    d = auth_post(f"{B}/auth/register", json={"email": email, "password": "TestPass123!", "name": "TEST_X"}, headers={"X-Forwarded-For": f"10.8.8.{uuid.uuid4().int % 250}"}).json()
    h = {"Authorization": f"Bearer {d['access_token']}"}
    uid = d["user"]["user_id"]
    try:
        # event: not reached -> rejected
        r0 = requests.post(f"{B}/events/evt_temple_rush/claim", headers={**h, "Idempotency-Key": uuid.uuid4().hex})
        assert r0.status_code >= 400, r0.text
        mongo(f"db.event_progress.updateOne({{user_id:'{uid}',event_id:'evt_temple_rush'}},{{$set:{{progress:60}}}},{{upsert:true}})")
        r1 = requests.post(f"{B}/events/evt_temple_rush/claim", headers={**h, "Idempotency-Key": uuid.uuid4().hex})
        assert r1.status_code == 200, r1.text
        r2 = requests.post(f"{B}/events/evt_temple_rush/claim", headers={**h, "Idempotency-Key": uuid.uuid4().hex})
        assert r2.status_code == 409, r2.text
        w = requests.get(f"{B}/me", headers=h).json()["user"]["wallet"]
        assert w["gems"] == 25 and w["coins"] == 2000, w
        # purchase replay
        k = uuid.uuid4().hex
        p1 = requests.post(f"{B}/purchases", json={"kind": "shop", "item_id": "hb-3"}, headers={**h, "Idempotency-Key": k})
        p2 = requests.post(f"{B}/purchases", json={"kind": "shop", "item_id": "hb-3"}, headers={**h, "Idempotency-Key": k})
        assert p1.status_code == 200 and p2.status_code == 200, (p1.text, p2.text)
        w = requests.get(f"{B}/me", headers=h).json()["user"]["wallet"]
        assert w["coins"] == 500 and w["hoverboards"] == 3, w
        # concurrent different keys: only 0 more can succeed (500 < 1500); then gems 25 -> concurrent revives (5 each) max 5
        with cf.ThreadPoolExecutor(10) as ex:
            res = list(ex.map(lambda i: requests.post(f"{B}/me/spend", json={"sink": "revive", "ref": f"r{i}:0"}, headers={**h, "Idempotency-Key": uuid.uuid4().hex}).status_code, range(8)))
        w = requests.get(f"{B}/me", headers=h).json()["user"]["wallet"]
        print("concurrent revive codes", res, w)
        assert w["gems"] >= 0 and res.count(200) == 5
    finally:
        requests.post(f"{B}/auth/delete-account", json={"confirm": "DELETE"}, headers=h)
