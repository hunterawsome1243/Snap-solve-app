import base64
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

client = TestClient(main.app)
PNG = base64.b64encode(b"\x89PNG fake").decode()
BODY = {"image": PNG, "media_type": "image/png"}

FOOD = {
    "is_food": True, "name": "Cheese pizza slice", "confidence": "MEDIUM", "source": "estimate", "serving": "1 slice",
    "items": [{"name": "Pizza", "portion": "1 slice", "calories": 285}] * 12,
    "totals": {"calories": 285, "protein_g": 12, "carbs_g": 36, "fat_g": 10, "fiber_g": 2, "sugar_g": "lots", "sodium_mg": -5},
    "allergens": ["Milk", "wheat", "kryptonite", 7], "notes": "Mostly carbs and fat.",
}
SPECIES = {
    "found": True, "name": "Monarch butterfly", "scientific": "Danaus plexippus", "group": "Insect", "confidence": "high",
    "alternatives": [{"name": "Viceroy", "scientific": "Limenitis archippus"}] * 5,
    "danger": {"level": "harmless", "note": "No danger."}, "conservation": "Endangered",
}


def food(reply, note=""):
    main.ask_claude = lambda *a, **k: reply
    return client.post("/api/food/scan", json={**BODY, "note": note}).json()


def species(reply, note=""):
    main.ask_claude = lambda *a, **k: reply
    return client.post("/api/species/scan", json={**BODY, "note": note}).json()


def test_food_is_cleaned():
    r = food(FOOD)
    assert r["is_food"] and r["confidence"] == "medium" and r["source"] == "estimate"
    assert len(r["items"]) == 8
    assert r["totals"]["calories"] == 285 and r["totals"]["protein_g"] == 12
    assert r["totals"]["sugar_g"] is None and r["totals"]["sodium_mg"] is None  # junk numbers are dropped, not guessed
    assert r["allergens"] == ["milk", "wheat"]  # known allergens only, in a fixed order


def test_food_without_calories_or_food_asks_for_a_better_photo():
    for reply in ({"is_food": False, "message": ""}, {"is_food": True, "name": "x", "totals": {}}):
        r = food(reply)
        assert r["is_food"] is False and "photo" in r["message"]


def test_food_note_reaches_the_model():
    seen = {}
    main.ask_claude = lambda system, content, **k: seen.update(text=content[1]["text"]) or FOOD
    client.post("/api/food/scan", json={**BODY, "note": "half the plate"})
    assert "half the plate" in seen["text"]


def test_species_is_cleaned():
    r = species(SPECIES)
    assert r["found"] and r["group"] == "insect" and r["confidence"] == "high"
    assert len(r["alternatives"]) == 3 and r["danger"]["level"] == "harmless"


def test_a_fungus_is_never_called_harmless():
    r = species({**SPECIES, "group": "fungus", "name": "Fly agaric", "danger": {"level": "harmless", "note": ""}})
    assert r["group"] == "fungus" and r["danger"]["level"] == "unknown"


def test_species_not_found_and_bad_values():
    r = species({"found": False, "message": ""})
    assert r["found"] is False and "photo" in r["message"]
    r = species({"found": True, "name": "Thing", "group": "dragon", "danger": {"level": "scary"}})
    assert r["group"] == "other" and r["danger"]["level"] == "unknown" and r["confidence"] == "low"


def test_scan_endpoints_reject_bad_images():
    assert client.post("/api/food/scan", json={"image": "!!not base64!!", "media_type": "image/png"}).status_code == 400
    assert client.post("/api/species/scan", json={"image": PNG, "media_type": "text/plain"}).status_code == 400
