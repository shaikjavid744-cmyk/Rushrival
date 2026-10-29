import httpx
from conftest import B, hdr, register, local
def test_register_link_and_validation():
    email, t = register("link")
    r = httpx.post(f"{B}/me/link", json={"local": local(777, 7)}, headers=hdr(t)); assert r.status_code == 200, r.text
    me = httpx.get(f"{B}/me", headers=hdr(t)).json()["user"]; assert me["wallet"]["coins"] == 777 and me["wallet"]["gems"] == 7
    d = httpx.post(f"{B}/auth/register", json={"email": email, "password": "Tscheck123!"}, headers=hdr()); assert d.status_code in (400, 409), d.text
    s = httpx.post(f"{B}/auth/register", json={"email": "tscheck-short-x@rushrivals.test", "password": "a1"}, headers=hdr()); assert s.status_code in (400, 422), s.text
    w = httpx.post(f"{B}/auth/login", json={"email": email, "password": "Wrong999!"}, headers=hdr()); assert w.status_code == 401 and "error" in w.json(), w.text
def test_conflict_no_duplication():
    _, t = register("conflict")
    httpx.post(f"{B}/me/link", json={"local": local(500)}, headers=hdr(t))
    c = httpx.post(f"{B}/me/link", json={"local": local(300)}, headers=hdr(t)); assert c.status_code == 409 and c.json()["error"]["code"] == "progress_conflict"
    k = httpx.post(f"{B}/me/link", json={"local": local(300), "choice": "cloud"}, headers=hdr(t)); assert k.json()["user"]["wallet"]["coins"] == 500
    d = httpx.post(f"{B}/me/link", json={"local": local(300), "choice": "device"}, headers=hdr(t)); assert d.json()["user"]["wallet"]["coins"] == 300
