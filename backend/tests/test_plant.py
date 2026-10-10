import base64
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

client = TestClient(main.app)
PNG = base64.b64encode(b"\x89PNG fake").decode()
GOOD = {
    "is_plant": True, "name": "Monstera", "scientific": "Monstera deliciosa", "confidence": "HIGH", "kind": "houseplant",
    "alternatives": [{"name": "Philodendron", "scientific": "Philodendron bipinnatifidum"}] * 5,
    "health": {"status": "healthy", "summary": "Mostly fine.", "issues": [
        {"name": "Yellow leaf", "signs": "one lower leaf", "cause": "overwatering", "fix": "let soil dry", "severity": "bogus"}]},
    "care": {"light": "bright indirect", "water": "when top 5 cm dry", "water_every_days": 7, "soil": "airy", "temperature": "18-27C",
             "humidity": "average", "feeding": "monthly in summer"},
    "pets": {"status": "toxic", "note": "Toxic to cats and dogs."}, "fun_fact": "Leaves split as they age.", "photo_tips": "",
}


def scan(reply, note=""):
    main.ask_claude = lambda *a, **k: reply
    return client.post("/api/plant/scan", json={"image": PNG, "media_type": "image/png", "note": note}).json()


def test_clean_keeps_good_answers_and_fixes_values():
    r = scan(GOOD)
    assert r["is_plant"] and r["name"] == "Monstera" and r["confidence"] == "high"
    assert len(r["alternatives"]) == 3
    assert r["health"]["status"] == "needs_attention"  # an issue was listed, so it is not "healthy"
    assert r["health"]["issues"][0]["severity"] == "mild"  # unknown severity falls back
    assert r["care"]["water_every_days"] == 7 and r["pets"]["status"] == "toxic"


def test_not_a_plant_gives_a_friendly_message():
    r = scan({"is_plant": False, "message": ""})
    assert r["is_plant"] is False and "closer photo" in r["message"]
    r = scan({"is_plant": True, "name": "", "scientific": ""})
    assert r["is_plant"] is False


def test_odd_values_are_made_safe():
    bad = dict(GOOD, confidence="certain", pets={"status": "edible!", "note": "x" * 999},
               care=dict(GOOD["care"], water_every_days=9999))
    r = scan(bad)
    assert r["confidence"] == "low"
    assert r["pets"]["status"] == "unknown" and len(r["pets"]["note"]) == 300
    assert r["care"]["water_every_days"] is None


def test_note_reaches_the_model_and_bad_images_are_refused():
    seen = {}
    main.ask_claude = lambda system, content, max_tokens=0, **k: seen.update(content=content) or GOOD
    client.post("/api/plant/scan", json={"image": PNG, "media_type": "image/png", "note": "leaves turning yellow"})
    assert "leaves turning yellow" in seen["content"][1]["text"]
    r = client.post("/api/plant/scan", json={"image": PNG, "media_type": "text/plain"})
    assert r.status_code == 400
