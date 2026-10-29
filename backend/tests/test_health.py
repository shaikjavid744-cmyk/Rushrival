# Rush Rivals Phase 1 backend: health + OpenAPI
import os
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL').rstrip('/')


def test_health_ok():
    r = requests.get(f"{BASE_URL}/api/health", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "ok"
    assert d["service"] == "rush-rivals-api"


def test_openapi_json():
    r = requests.get(f"{BASE_URL}/api/openapi.json", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "openapi" in d and "/api/health" in d["paths"]


def test_root():
    r = requests.get(f"{BASE_URL}/api/", timeout=15)
    assert r.status_code == 200
    assert r.json()["message"] == "Rush Rivals API"
