import base64
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

client = TestClient(main.app)
PNG = base64.b64encode(b"\x89PNG fake").decode()


def fake(reply):
    main.ask_claude = lambda *a, **k: reply


def test_read_unreadable_asks_for_retake():
    fake({"readable": False, "latex": "", "message": "Too blurry, please retake."})
    r = client.post("/api/read", json={"image": PNG, "media_type": "image/png"}).json()
    assert r == {"readable": False, "latex": "", "message": "Too blurry, please retake."}


def test_read_ok():
    fake({"readable": True, "latex": "2x+3=11", "message": ""})
    r = client.post("/api/read", json={"image": PNG, "media_type": "image/png"}).json()
    assert r["readable"] and r["latex"] == "2x+3=11"


def test_read_rejects_bad_type():
    assert client.post("/api/read", json={"image": PNG, "media_type": "text/html"}).status_code == 400


SOLUTION = {
    "answer_latex": "x = 4",
    "steps": [{"latex": "2x = 8", "explain": "Subtract 3."}, {"latex": "x = 4", "explain": "Divide by 2."}],
    "check": {"steps": [{"latex": "2(4)+3=11", "explain": "Works."}], "conclusion": "It checks out."},
    "problem": {"kind": "solve", "equation": "2x+3=11", "variable": "x"},
}


def test_solve_verified():
    fake({**SOLUTION, "answer": {"values": ["4"]}})
    r = client.post("/api/solve", json={"latex": "2x+3=11"}).json()
    assert r["verification"]["status"] == "match"


def test_solve_flags_wrong_answer():
    fake({**SOLUTION, "answer": {"values": ["5"]}})
    r = client.post("/api/solve", json={"latex": "2x+3=11"}).json()
    assert r["verification"]["status"] == "mismatch"
