import httpx
from conftest import B, hdr, register
def test_leaderboard_tabs():
    for p in ("daily", "weekly", "all"): assert httpx.get(f"{B}/leaderboard?period={p}", headers=hdr()).status_code == 200
    assert httpx.get(f"{B}/leaderboard?period=friends", headers=hdr()).status_code in (400, 422)
def test_event_reward_once():
    _, t = register("event")
    ev = [e for e in httpx.get(f"{B}/events", headers=hdr(t)).json()["items"] if e["name"] == "Temple Rush"][0]
    s = httpx.post(f"{B}/runs/start", json={"world": "temple"}, headers=hdr(t)).json()
    httpx.post(f"{B}/runs/offline", json={"run_id": "tscheck-ev-" + s["run_id"], "seed": 1, "duration": 60, "distance": 300, "coins": 55, "score": 850, "world": "temple", "event_tokens": 55}, headers=hdr(t, idem=True)).raise_for_status()
    c1 = httpx.post(f"{B}/events/{ev['event_id']}/claim", headers=hdr(t, idem=True)); assert c1.status_code == 200, c1.text
    c2 = httpx.post(f"{B}/events/{ev['event_id']}/claim", headers=hdr(t, idem=True)); assert c2.status_code == 409
def test_inbox_claim_once():
    _, t = register("inbox")
    c1 = httpx.post(f"{B}/inbox/msg_welcome_online/claim", headers=hdr(t, idem=True)); assert c1.status_code == 200, c1.text
    c2 = httpx.post(f"{B}/inbox/msg_welcome_online/claim", headers=hdr(t, idem=True)); assert c2.status_code in (400, 409), c2.text
def test_config():
    c = httpx.get(f"{B}/config").json(); assert {"maintenance", "min_supported_version", "latest_version"} <= c.keys()
