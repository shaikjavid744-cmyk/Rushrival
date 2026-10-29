import pytest
from conftest import admin
# (role, allowed GET, forbidden GET)
CASES = [
 ("support@rushrivals.test", "/admin/tickets", "/admin/config/versions"),
 ("moderator@rushrivals.test", "/admin/reports", "/admin/purchases"),
 ("finance@rushrivals.test", "/admin/purchases", "/admin/admins"),
 ("liveops.editor@rushrivals.test", "/admin/config/versions", "/admin/purchases"),
 ("publisher@rushrivals.test", "/admin/config/versions", "/admin/admins"),
 ("viewer@rushrivals.test", "/admin/dashboard", "/admin/admins"),
]
@pytest.mark.parametrize("email,ok,no", CASES)
def test_role(email, ok, no):
    c = admin(email)
    assert c.get(ok).status_code == 200, (ok, c.get(ok).text[:200])
    r = c.get(no); assert r.status_code == 403, (no, r.status_code, r.text[:200])
def test_viewer_cannot_mutate():
    c = admin("viewer@rushrivals.test")
    r = c.post("/admin/news", json={"title": "tscheck-viewer", "slug": "tscheck-viewer", "summary": "x", "body": "x"}); assert r.status_code == 403, r.text
