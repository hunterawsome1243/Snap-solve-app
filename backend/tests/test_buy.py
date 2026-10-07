import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

client = TestClient(main.app)


def test_filter_offers_drops_invented_urls_and_sorts():
    offers = [
        {"retailer": "A", "price": 299.99, "currency": "usd", "url": "https://www.a.com/p/1?utm=x", "condition": "new"},
        {"retailer": "B", "price": 249, "currency": "USD", "url": "https://b.com/item", "condition": "new"},
        {"retailer": "Fake", "price": 10, "currency": "USD", "url": "https://fake.example/never-seen", "condition": "new"},
        {"retailer": "C", "price": "n/a", "url": "https://c.com/x"},
        {"retailer": "D", "price": 199, "currency": "USD", "url": "https://d.com/used", "condition": "used"},
    ]
    seen = {"https://a.com/p/1", "https://b.com/item", "https://d.com/used", "https://c.com/x"}
    out = main.filter_offers(offers, seen)
    assert [o["retailer"] for o in out] == ["D", "B", "A"]            # cheapest first, fake + bad price dropped
    assert [o["best"] for o in out] == [False, True, False]            # best = cheapest NEW
    assert out[2]["currency"] == "USD"


def test_filter_offers_rejects_non_http():
    assert main.filter_offers([{"price": 5, "url": "javascript:alert(1)"}], {"javascript:alert(1)"}) == []


def test_compare_links_encode_query_and_country():
    us = main.compare_links("Sony WH-1000XM5 headphones", "US")
    assert any("amazon.com/s?k=Sony+WH-1000XM5+headphones" in l["url"] for l in us)
    assert any("p_ord:p" in l["url"] for l in us)
    assert any("walmart" in l["url"] for l in us)
    uk = main.compare_links("kettle", "GB")
    assert any("amazon.co.uk" in l["url"] for l in uk) and not any("walmart" in l["url"] for l in uk)


def test_identify_unreadable():
    main.ask_claude = lambda *a, **k: {"identifiable": False, "message": "Too dark."}
    import base64
    r = client.post("/api/buy/identify", json={"image": base64.b64encode(b"x").decode(), "media_type": "image/png"}).json()
    assert r["identifiable"] is False and r["message"] == "Too dark."


def test_prices_endpoint(monkeypatch):
    monkeypatch.setattr(
        main,
        "search_web",
        lambda q, c: (
            {"offers": [{"retailer": "Shop", "price": 99.5, "currency": "USD", "url": "https://shop.com/a", "condition": "new"},
                        {"retailer": "Ghost", "price": 1, "currency": "USD", "url": "https://ghost.com/a", "condition": "new"}],
             "summary": "ok"},
            {"https://shop.com/a"},
        ),
    )
    r = client.post("/api/buy/prices", json={"query": "widget", "country": "us"}).json()
    assert [o["retailer"] for o in r["offers"]] == ["Shop"] and r["offers"][0]["best"] is True
    assert r["compare"] and r["summary"] == "ok"


def _o(retailer, price, cond="new", stock="yes", host=None):
    h = host or retailer.lower() + ".com"
    return {"retailer": retailer, "price": price, "currency": "USD", "url": f"https://{h}/p", "condition": cond, "in_stock": stock, "note": ""}


def test_recommend_skips_cheap_out_of_stock_and_used():
    offers = [_o("Cheap", 150, stock="no"), _o("UsedCo", 170, cond="used"), _o("Amazon", 200, host="amazon.com"), _o("Shady", 195, host="shady.biz")]
    rec = main.recommend(offers, [], "widget")
    assert rec["retailer"] == "Amazon" and rec["kind"] == "offer"
    assert "out of stock" in rec["reason"]


def test_recommend_takes_cheapest_when_all_equal():
    rec = main.recommend([_o("A", 100), _o("B", 90)], [], "widget")
    assert rec["retailer"] == "B" and rec["reason"].startswith("Lowest price found")


def test_recommend_falls_back_to_likely_store():
    rec = main.recommend([], [{"name": "Home Depot", "why": "Big tool range."}], "cordless drill")
    assert rec["kind"] == "likely" and rec["retailer"] == "Home Depot"
    assert "Home+Depot" in rec["url"] and "Not confirmed in stock" in rec["reason"]
    assert main.recommend([], [], "x") is None


def test_prices_endpoint_includes_recommendation(monkeypatch):
    monkeypatch.setattr(
        main, "search_web",
        lambda q, c: ({"offers": [{"retailer": "Shop", "price": 99.5, "currency": "USD", "url": "https://shop.com/a", "condition": "new", "in_stock": "yes"}], "summary": ""}, {"https://shop.com/a"}),
    )
    r = client.post("/api/buy/prices", json={"query": "widget", "country": "US"}).json()
    assert r["recommendation"]["retailer"] == "Shop" and r["offers"][0]["recommended"] is True
