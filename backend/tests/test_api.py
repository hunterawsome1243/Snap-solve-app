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
    assert r["readable"] is False and r["latex"] == "" and r["problems"] == []
    assert r["message"] == "Too blurry, please retake."


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


def test_read_multiple_problems_word_problem_and_uncertain():
    fake({"readable": True, "message": "", "problems": [
        {"kind": "math", "latex": "2x+S=11", "uncertain": [{"text": "S", "alternatives": ["5", "s"]}]},
        {"kind": "math", "latex": "x^2-4=0"},
        {"kind": "word", "text": "Sam has 3 more apples than Ann.", "latex": ""},
        {"kind": "math", "latex": "", "text": ""},
    ]})
    r = client.post("/api/read", json={"image": PNG, "media_type": "image/png"}).json()
    assert [p["kind"] for p in r["problems"]] == ["math", "math", "word"]
    assert r["latex"] == "2x+S=11" and r["uncertain"] == [{"text": "S", "alternatives": ["5", "s"]}]
    assert r["problems"][2]["text"].startswith("Sam has")


def test_read_old_single_problem_shape_still_works():
    fake({"readable": True, "latex": "1+1", "message": ""})
    r = client.post("/api/read", json={"image": PNG, "media_type": "image/png"}).json()
    assert r["readable"] and r["problems"][0]["latex"] == "1+1"


def test_formulate_word_problem():
    fake({"variables": [{"name": "x", "meaning": "Ann's apples"}], "equation_latex": "x+(x+3)=15", "question": "How many does Ann have?", "message": ""})
    r = client.post("/api/formulate", json={"text": "Sam has 3 more apples than Ann; together they have 15."}).json()
    assert r["equation_latex"] == "x+(x+3)=15" and r["variables"][0]["name"] == "x"


def test_solve_flags_bad_middle_step_and_returns_clean_graph():
    fake({
        **SOLUTION,
        "answer": {"values": ["4"]},
        "steps": [
            {"latex": "2x = 8", "explain": "Subtract 3.", "verify": {"type": "equation", "expr": "2*x=8"}},
            {"latex": "2x = 14", "explain": "Oops.", "verify": {"type": "equation", "expr": "2*x=14"}},
            {"latex": "x = 4", "explain": "Divide by 2."},
        ],
        "graph": {"series": [{"label": "2x+3", "expr": "2*x+3"}, {"label": "11", "expr": "11"}, {"label": "bad", "expr": "__import__('os')"}],
                  "points": [{"x": "4", "series": 0, "label": "x = 4"}, {"x": "oops(", "series": 0}], "xmin": -5, "xmax": 10},
        "answer_text": "ignored without context",
    })
    r = client.post("/api/solve", json={"latex": "2x+3=11"}).json()
    assert [s["check"] for s in r["steps"]] == ["ok", "bad", "unchecked"]
    assert r["steps_summary"] == {"checked": 2, "bad": [1]}
    assert "verify" not in r["steps"][0]
    assert [s["expr"] for s in r["graph"]["series"]] == ["2*x+3", "11"] and len(r["graph"]["points"]) == 1
    assert r["answer_text"] == ""


def test_solve_with_word_context_returns_answer_text():
    fake({**SOLUTION, "answer": {"values": ["4"]}, "answer_text": "Ann has 4 apples."})
    r = client.post("/api/solve", json={"latex": "2x+3=11", "context": "word problem text"}).json()
    assert r["answer_text"] == "Ann has 4 apples."


def test_practice_generates_graded_problem_and_check_endpoint():
    good = {"latex": "x^2-5x+6=0", "hint": "Factor it.", "problem": {"kind": "solve", "equation": "x^2-5*x+6=0", "variable": "x"}, "answer": {"values": ["2", "3"]}}
    bad = {**good, "answer": {"values": ["2", "4"]}}
    replies = iter([bad, good])
    main.ask_claude = lambda *a, **k: next(replies)
    r = client.post("/api/practice", json={"difficulty": "hard", "topic": "quadratic"}).json()
    assert r["latex"] == "x^2-5x+6=0" and r["problem"]["kind"] == "solve" and "answer" not in r
    ok = client.post("/api/practice/check", json={"problem": r["problem"], "answer": "x = 2 or x = 3"}).json()
    assert ok["correct"] is True and ok["correct_latex"] == "x = 2,\\ 3"
    no = client.post("/api/practice/check", json={"problem": r["problem"], "answer": "2"}).json()
    assert no["correct"] is False


def test_practice_gives_up_when_the_model_cannot_agree_with_sympy():
    wrong = {"latex": "1+1", "hint": "", "problem": {"kind": "evaluate", "expr": "1+1"}, "answer": {"value": "3"}}
    main.ask_claude = lambda *a, **k: wrong
    assert client.post("/api/practice", json={}).status_code == 502
