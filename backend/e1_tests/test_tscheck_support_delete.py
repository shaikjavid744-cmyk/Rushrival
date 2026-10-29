import httpx
from conftest import B, hdr, register
def test_ticket_and_delete():
    email, t = register("delete")
    tk = httpx.post(f"{B}/support/tickets", json={"category": "bug", "message": "tscheck ticket"}, headers=hdr(t)); assert tk.status_code == 201, tk.text
    print(tk.json())
    assert httpx.post(f"{B}/auth/delete-account", json={"confirm": "nope"}, headers=hdr(t)).status_code == 400
    assert httpx.post(f"{B}/auth/delete-account", json={"confirm": "DELETE"}, headers=hdr(t)).status_code == 200
    assert httpx.post(f"{B}/auth/login", json={"email": email, "password": "Tscheck123!"}, headers=hdr()).status_code == 401
