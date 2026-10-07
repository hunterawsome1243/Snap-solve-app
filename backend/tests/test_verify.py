import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from verify import verify  # noqa: E402


def status(problem, answer):
    return verify(problem, answer)["status"]


def test_arithmetic():
    p = {"kind": "evaluate", "expr": "2+3*4"}
    assert status(p, {"value": "14"}) == "match"
    assert status(p, {"value": "20"}) == "mismatch"


def test_roots_and_logs():
    assert status({"kind": "evaluate", "expr": "sqrt(50)"}, {"value": "5*sqrt(2)"}) == "match"
    assert status({"kind": "evaluate", "expr": "log(8,2)"}, {"value": "3"}) == "match"
    assert status({"kind": "evaluate", "expr": "2^3^2"}, {"value": "512"}) == "match"


def test_linear():
    p = {"kind": "solve", "equation": "2x+3=11", "variable": "x"}
    assert status(p, {"values": ["4"]}) == "match"
    assert status(p, {"values": ["5"]}) == "mismatch"


def test_quadratic_requires_all_roots():
    p = {"kind": "solve", "equation": "x^2-5x+6=0", "variable": "x"}
    assert status(p, {"values": ["2", "3"]}) == "match"
    assert status(p, {"values": ["2"]}) == "mismatch"  # missing a root
    assert status(p, {"values": ["2", "4"]}) == "mismatch"


def test_system():
    p = {"kind": "system", "equations": ["x+y=3", "x-y=1"], "variables": ["x", "y"]}
    assert status(p, {"solutions": [{"x": "2", "y": "1"}]}) == "match"
    assert status(p, {"solutions": [{"x": "1", "y": "2"}]}) == "mismatch"


def test_trig_equation_substitution():
    p = {"kind": "solve", "equation": "sin(x)=1/2", "variable": "x"}
    assert status(p, {"values": ["pi/6"]}) == "match"
    assert status(p, {"values": ["pi/4"]}) == "mismatch"


def test_derivative():
    p = {"kind": "derivative", "expr": "x^3*sin(x)", "variable": "x"}
    assert status(p, {"value": "3*x^2*sin(x)+x^3*cos(x)"}) == "match"
    assert status(p, {"value": "3*x^2*cos(x)"}) == "mismatch"


def test_integral_indefinite_ignores_constant():
    p = {"kind": "integral", "expr": "2*x", "variable": "x"}
    assert status(p, {"value": "x^2 + 7"}) == "match"
    assert status(p, {"value": "x^3"}) == "mismatch"


def test_integral_definite():
    p = {"kind": "integral", "expr": "x^2", "variable": "x", "bounds": ["0", "3"]}
    assert status(p, {"value": "9"}) == "match"
    assert status(p, {"value": "8"}) == "mismatch"


def test_garbage_is_unverified_not_crash():
    assert status({"kind": "evaluate", "expr": "__import__('os')"}, {"value": "1"}) == "unverified"
    assert status({"kind": "word", "expr": ""}, {"value": "1"}) == "unverified"


from verify import check_user_answer, truth_latex, verify_steps  # noqa: E402


def test_step_check_solve_catches_bad_middle_step():
    p = {"kind": "solve", "equation": "2*x+3=11", "variable": "x"}
    a = {"values": ["4"]}
    steps = [
        {"verify": {"type": "equation", "expr": "2*x=8"}},
        {"verify": {"type": "equation", "expr": "2*x=14"}},   # wrong line, lucky answer afterwards
        {"verify": {"type": "equation", "expr": "x=4"}},
        {},
    ]
    assert verify_steps(p, a, steps) == ["ok", "bad", "ok", "unchecked"]


def test_step_check_value_and_result_kinds():
    ev = {"kind": "evaluate", "expr": "2+3*4"}
    assert verify_steps(ev, {"value": "14"}, [{"verify": {"type": "expression", "expr": "2+12"}},
                                               {"verify": {"type": "expression", "expr": "20"}}]) == ["ok", "bad"]
    d = {"kind": "derivative", "expr": "x^2*sin(x)", "variable": "x"}
    assert verify_steps(d, {"value": "x"}, [{"verify": {"type": "result", "expr": "2*x*sin(x)+x^2*cos(x)"}},
                                            {"verify": {"type": "result", "expr": "2*x*sin(x)"}}]) == ["ok", "bad"]
    sysm = {"kind": "system", "equations": ["x+y=3", "x-y=1"], "variables": ["x", "y"]}
    assert verify_steps(sysm, {}, [{"verify": {"type": "equation", "expr": "2*x=4"}},
                                   {"verify": {"type": "equation", "expr": "x=3"}}]) == ["ok", "bad"]


def test_check_user_answer_variants():
    q = {"kind": "solve", "equation": "x^2-5*x+6=0", "variable": "x"}
    assert check_user_answer(q, "x = 2 or x = 3")["correct"] is True
    assert check_user_answer(q, "2, 3")["correct"] is True
    assert check_user_answer(q, "2")["correct"] is False
    assert truth_latex(q) == "x = 2,\\ 3"
    s = {"kind": "system", "equations": ["x+y=3", "x-y=1"], "variables": ["x", "y"]}
    assert check_user_answer(s, "x=2, y=1")["correct"] is True
    assert check_user_answer(s, "x=1, y=2")["correct"] is False
    i = {"kind": "integral", "expr": "2*x", "variable": "x"}
    assert check_user_answer(i, "x^2 + C")["correct"] is True
    d = {"kind": "derivative", "expr": "x^3", "variable": "x"}
    assert check_user_answer(d, "f'(x) = 3x^2")["correct"] is True
    assert check_user_answer({"kind": "solve", "equation": "x^2+1=0", "variable": "x"}, "no real solution")["correct"] is True
