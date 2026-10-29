import httpx
def test_health():
    r = httpx.get("http://localhost:8001/api/health"); assert r.status_code==200 and r.json()["status"]=="ok"
