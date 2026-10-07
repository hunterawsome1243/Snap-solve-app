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
