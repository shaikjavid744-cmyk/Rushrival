import httpx, uuid
from conftest import B, hdr
R = "http://localhost:8001"
def test_catalog_counts_and_seo():
    c = httpx.get(f"{B}/public/catalog").json()
    counts = {k: len(v) for k, v in c.items() if isinstance(v, list)}
    assert counts == {"characters": 6, "boards": 6, "worlds": 6, "powerups": 5}, counts
    sm = httpx.get(f"{B}/public/sitemap"); assert sm.status_code == 200
def test_site_config_download_honesty():
    j = httpx.get(f"{B}/public/site-config").json(); assert j["store_url_android"] is None
def test_news_empty_by_default():
    r = httpx.get(f"{B}/public/news"); assert r.status_code == 200
    assert not [i for i in r.json()["items"] if not i.get("slug","").startswith("tscheck")], r.text[:300]
