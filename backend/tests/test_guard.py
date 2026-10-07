import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

client = TestClient(main.app)


def test_open_by_default():
    assert client.get("/api/config").json() == {"needs_code": False}
    assert client.post("/api/formulate", json={"text": ""}).status_code != 401


def test_access_code_blocks_until_given(monkeypatch):
    monkeypatch.setattr(main, "ACCESS_CODE", "sesame")
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/config").json() == {"needs_code": True}
    r = client.post("/api/formulate", json={"text": "x"})
    assert r.status_code == 401
    r = client.post("/api/formulate", json={"text": "x"}, headers={"x-access-code": "wrong"})
    assert r.status_code == 401
    r = client.post("/api/formulate", json={"text": "x"}, headers={"x-access-code": "sesame"})
    assert r.status_code != 401


def test_rate_limit(monkeypatch):
    monkeypatch.setattr(main, "RATE_PER_HOUR", 2)
    main._hits.clear()
    codes = [client.post("/api/formulate", json={"text": "x"}, headers={"x-forwarded-for": "9.9.9.9"}).status_code for _ in range(3)]
    assert codes[2] == 429 and 429 not in codes[:2]
    other = client.post("/api/formulate", json={"text": "x"}, headers={"x-forwarded-for": "8.8.8.8"})
    assert other.status_code != 429
