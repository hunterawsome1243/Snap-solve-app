"""Independent verification of Claude's answer with SymPy.

Claude returns a structured description of the problem (`problem`) and its
answer (`answer`). We re-solve the problem with SymPy and compare, so the final
answer never rests on the model's arithmetic alone.

problem shapes (all expressions are SymPy-parsable strings):
  {"kind": "evaluate" | "simplify", "expr": "2+3*4"}
  {"kind": "solve", "equation": "x**2-5*x+6=0", "variable": "x"}
  {"kind": "system", "equations": ["x+y=3", "x-y=1"], "variables": ["x", "y"]}
  {"kind": "derivative", "expr": "x**3*sin(x)", "variable": "x"}
  {"kind": "integral", "expr": "2*x", "variable": "x", "bounds": ["0", "1"]}   # bounds optional

answer shapes:
  evaluate/simplify/derivative/integral: {"value": "14"}
  solve:  {"values": ["2", "3"]}
  system: {"solutions": [{"x": "2", "y": "1"}]}
"""
import re
from typing import Any

import sympy as sp
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

_TRANSFORMS = standard_transformations + (implicit_multiplication_application, convert_xor)
_SAFE = re.compile(r"^[A-Za-z0-9_+\-*/^().,=\s<>]*$")
_LOCALS = {
    "e": sp.E, "pi": sp.pi, "ln": sp.log, "arcsin": sp.asin, "arccos": sp.acos,
    "arctan": sp.atan, "abs": sp.Abs,
}
TOL = 1e-6


class VerifyError(Exception):
    pass


def _parse(s: Any) -> sp.Expr:
    s = str(s).strip()
    if not s or not _SAFE.match(s) or "__" in s:
        raise VerifyError(f"cannot parse {s!r}")
    try:
        return parse_expr(s, transformations=_TRANSFORMS, local_dict=dict(_LOCALS), evaluate=True)
    except Exception as exc:  # noqa: BLE001
        raise VerifyError(f"cannot parse {s!r}: {exc}") from exc


def _parse_eq(s: str) -> sp.Eq:
    if "=" not in s:
        raise VerifyError(f"not an equation: {s!r}")
    lhs, rhs = s.split("=", 1)
    return sp.Eq(_parse(lhs), _parse(rhs))


def _sym(name: str) -> sp.Symbol:
    return sp.Symbol(str(name).strip())


def _num(x: sp.Expr) -> complex:
    return complex(sp.N(x, 30))


def _is_zero(d: sp.Expr) -> bool:
    """True if expression d is identically ~0 (symbolic, then numeric sampling)."""
    try:
        if sp.simplify(d) == 0:
            return True
    except Exception:  # noqa: BLE001
        pass
    free = sorted(d.free_symbols, key=str)
    if not free:
        try:
            return abs(_num(d)) < TOL
        except Exception:  # noqa: BLE001
            return False
    pts = [0.37, 1.13, 1.91, 2.62]
    ok = 0
    for i in range(len(pts)):
        sub = {s: pts[(i + j) % len(pts)] for j, s in enumerate(free)}
        try:
            v = complex(sp.N(d.subs(sub), 20))
        except Exception:  # noqa: BLE001
            continue
        if v != v:  # nan
            continue
        if abs(v) > TOL:
            return False
        ok += 1
    return ok >= 2


def _equivalent(a: sp.Expr, b: sp.Expr) -> bool:
    return _is_zero(a - b)


def _satisfies(eq: sp.Eq, sub: dict) -> bool:
    try:
        resid = _num((eq.lhs - eq.rhs).subs(sub))
    except Exception:  # noqa: BLE001
        return False
    return abs(resid) < TOL


def _fmt(x: Any) -> str:
    try:
        return sp.latex(x)
    except Exception:  # noqa: BLE001
        return str(x)


def _has_periodic(expr: sp.Basic) -> bool:
    return expr.has(sp.sin, sp.cos, sp.tan, sp.cot, sp.sec, sp.csc)


def _contains_all(found: list[complex], expected: list[complex]) -> bool:
    return all(any(abs(f - e) < TOL for f in found) for e in expected)


def _check_solve(problem: dict, answer: dict) -> dict:
    eq = _parse_eq(problem["equation"])
    var = _sym(problem.get("variable") or "x")
    claimed = [_parse(v) for v in answer.get("values", [])]
    for v in claimed:
        if not _satisfies(eq, {var: v}):
            return _mismatch(f"{var} = {_fmt(v)} does not satisfy the equation")
    if _has_periodic(eq.lhs) or _has_periodic(eq.rhs):
        return _match("Each answer was substituted back into the equation.")
    try:
        real = all(v.is_real is not False and abs(_num(v).imag) < TOL for v in claimed)
        sols = sp.solveset(eq, var, domain=sp.S.Reals if real else sp.S.Complexes)
    except Exception:  # noqa: BLE001
        return _match("Each answer was substituted back into the equation.")
    if not sols.is_FiniteSet:
        return _match("Each answer was substituted back into the equation.")
    sym_sols = list(sols)
    if not _contains_all([_num(v) for v in claimed], [_num(s) for s in sym_sols]):
        return _mismatch(f"SymPy found {', '.join(_fmt(s) for s in sym_sols)}", sym_sols)
    return _match("SymPy's solutions match.")


def _check_system(problem: dict, answer: dict) -> dict:
    eqs = [_parse_eq(e) for e in problem["equations"]]
    vs = [_sym(v) for v in problem["variables"]]
    claimed = answer.get("solutions", [])
    for sol in claimed:
        sub = {_sym(k): _parse(v) for k, v in sol.items()}
        if not all(_satisfies(e, sub) for e in eqs):
            return _mismatch("An answer does not satisfy every equation")
    try:
        sym_sols = sp.solve(eqs, vs, dict=True)
    except Exception:  # noqa: BLE001
        return _match("Each answer was substituted back into the system.")
    finite = all(set(s) == set(vs) and all(not s[v].free_symbols for v in vs) for s in sym_sols)
    if not finite:
        return _match("Each answer was substituted back into the system.")
    if len(sym_sols) != len(claimed):
        return _mismatch(f"SymPy found {len(sym_sols)} solution(s), not {len(claimed)}")
    return _match("SymPy's solution matches.")


def _check_value(problem: dict, answer: dict) -> dict:
    kind = problem["kind"]
    claimed = _parse(answer["value"])
    expr = _parse(problem["expr"])
    var = _sym(problem.get("variable") or "x")
    if kind == "derivative":
        truth = sp.diff(expr, var)
        ok = _equivalent(claimed, truth)
    elif kind == "integral":
        bounds = problem.get("bounds")
        if bounds:
            lo, hi = _parse(bounds[0]), _parse(bounds[1])
            truth = sp.integrate(expr, (var, lo, hi))
            if truth.has(sp.Integral):  # SymPy couldn't do it symbolically; go numeric
                truth = sp.Integral(expr, (var, lo, hi)).evalf(20)
            ok = _equivalent(claimed, truth)
        else:
            # An antiderivative is only defined up to + C: compare derivatives.
            truth = sp.integrate(expr, var)
            ok = _is_zero(sp.diff(claimed, var) - expr)
    else:  # evaluate / simplify
        truth = expr
        ok = _equivalent(claimed, truth)
    if ok:
        return _match("SymPy computed the same result.")
    return _mismatch(f"SymPy got {_fmt(truth)}", truth)


def _match(detail: str) -> dict:
    return {"status": "match", "detail": detail}


def _mismatch(detail: str, truth: Any = None) -> dict:
    out = {"status": "mismatch", "detail": detail}
    if truth is not None:
        out["sympy"] = _fmt(truth)
    return out


def verify(problem: dict, answer: dict) -> dict:
    """Return {"status": "match"|"mismatch"|"unverified", "detail": str, ...}."""
    try:
        kind = problem.get("kind")
        if kind == "solve":
            return _check_solve(problem, answer)
        if kind == "system":
            return _check_system(problem, answer)
        if kind in {"evaluate", "simplify", "derivative", "integral"}:
            return _check_value(problem, answer)
        return {"status": "unverified", "detail": "This problem type can't be checked automatically."}
    except (VerifyError, KeyError, TypeError, ValueError) as exc:
        return {"status": "unverified", "detail": f"Couldn't run the independent check ({exc})."}
    except Exception as exc:  # noqa: BLE001
        return {"status": "unverified", "detail": f"Couldn't run the independent check ({exc})."}
