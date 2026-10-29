import httpx
from conftest import B, hdr, register, local
REP = dict(duration=5, distance=30, coins=5, score=80, world="city")
def test_run_grant_idempotent_and_forged():
    _, t = register("runs"); httpx.post(f"{B}/me/link", json={"local": local(0)}, headers=hdr(t))
    s = httpx.post(f"{B}/runs/start", json={"world": "city"}, headers=hdr(t)).json()
    h = hdr(t, idem=True); body = {**REP, "run_id": s["run_id"], "seed": s["seed"], "run_token": s["run_token"]}
    f = httpx.post(f"{B}/runs/finish", json=body, headers=h); assert f.status_code == 200, f.text
    assert httpx.get(f"{B}/me", headers=hdr(t)).json()["user"]["wallet"]["coins"] == 5
    f2 = httpx.post(f"{B}/runs/finish", json=body, headers=h); j2 = f2.json(); j2.pop("replayed", None); assert j2 == f.json()
    f3 = httpx.post(f"{B}/runs/finish", json=body, headers=hdr(t, idem=True)); assert f3.status_code == 400 and f3.json()["error"]["code"] == "run_invalid"
    assert httpx.get(f"{B}/me", headers=hdr(t)).json()["user"]["wallet"]["coins"] == 5
    lb = httpx.get(f"{B}/leaderboard?period=all&limit=100", headers=hdr(t)).json(); assert lb["me"] and lb["me"]["score"] >= 80
    s2 = httpx.post(f"{B}/runs/start", json={}, headers=hdr(t)).json()
    forged = {"run_id": s2["run_id"], "seed": s2["seed"], "run_token": s2["run_token"], "duration": 5, "distance": 99999, "coins": 9999, "score": 999999}
    r = httpx.post(f"{B}/runs/finish", json=forged, headers=hdr(t, idem=True)); assert r.status_code == 400 and r.json()["error"]["code"] == "run_invalid", r.text
def test_offline_run_not_on_leaderboard():
    _, t = register("offrun")
    o = httpx.post(f"{B}/runs/offline", json={**REP, "run_id": "tscheck-off-" + t[-10:], "seed": 1}, headers=hdr(t, idem=True))
    assert o.status_code == 200 and o.json()["leaderboard"] is False, o.text
