import httpx, uuid
from conftest import B, hdr, register
def test_no_token_401_and_shape():
    r = httpx.get(f"{B}/me", headers=hdr()); assert r.status_code == 401; e = r.json()["error"]; assert e["code"] and e["message"]
def test_other_users_run_token_rejected():
    _, a = register("authza"); _, b = register("authzb")
    s = httpx.post(f"{B}/runs/start", json={}, headers=hdr(a)).json()
    r = httpx.post(f"{B}/runs/finish", json={"run_id": s["run_id"], "seed": s["seed"], "run_token": s["run_token"], "duration": 5, "distance": 30, "coins": 5, "score": 80}, headers=hdr(b, idem=True))
    assert r.status_code in (400, 403), r.text
def test_rate_limit_not_bypassed_by_spoof():
    real = f"10.200.{uuid.uuid4().int%250}.{uuid.uuid4().int%250}"
    codes = [httpx.post(f"{B}/auth/login", json={"email": "nobody-tscheck@x.test", "password": "xxxxxxxx"}, headers={"X-Forwarded-For": f"spoof{i}.1.1.1,{real},p1,p2"}).status_code for i in range(11)]
    assert codes[-1] == 429, codes
