"""Hunter Scan backend: holds the Anthropic API key, talks to Claude, verifies with SymPy."""
import base64
import hmac
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import quote_plus, urlparse

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from verify import _parse, check_user_answer, verify, verify_steps

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5")
ALLOWED_MEDIA = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024

app = FastAPI(title="Hunter Scan")


# ---------------------------------------------- protecting a public deployment
# Anyone who finds a hosted URL could spend your Anthropic credits, so a hosted copy asks for an access code
# (ACCESS_CODE) and limits how many AI calls one visitor can make per hour (RATE_PER_HOUR). Both are off locally.
ACCESS_CODE = os.getenv("ACCESS_CODE", "").strip()
RATE_PER_HOUR = int(os.getenv("RATE_PER_HOUR", "0") or 0)
_hits: dict[str, list[float]] = {}
OPEN_PATHS = {"/api/health", "/api/config"}


@app.middleware("http")
async def guard(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/") and path not in OPEN_PATHS:
        if ACCESS_CODE and not hmac.compare_digest(request.headers.get("x-access-code", ""), ACCESS_CODE):
            return JSONResponse({"detail": "That access code is missing or wrong."}, status_code=401)
        if RATE_PER_HOUR and request.method == "POST":
            who = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0].strip()
            now = time.time()
            recent = [t for t in _hits.get(who, []) if now - t < 3600]
            if len(recent) >= RATE_PER_HOUR:
                return JSONResponse({"detail": "Too many scans this hour. Try again a bit later."}, status_code=429)
            recent.append(now)
            _hits[who] = recent
    return await call_next(request)


@app.get("/api/config")
def config():
    return {"needs_code": bool(ACCESS_CODE)}
_client: anthropic.Anthropic | None = None


def client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        key = os.getenv("ANTHROPIC_API_KEY", "").strip()
        if not key or key.startswith("paste-your"):
            raise HTTPException(
                500,
                "No Anthropic API key found. Paste it into the .env file in the project root "
                "(ANTHROPIC_API_KEY=...) and restart the server.",
            )
        _client = anthropic.Anthropic(api_key=key)
    return _client


EFFORTS = ("low", "medium", "high", "xhigh", "max")


def effort_for(endpoint: str) -> str | None:
    """Optional thinking effort for one endpoint. Unset means the model's own default, so nothing changes until
    you set EFFORT_<ENDPOINT> (e.g. EFFORT_IDENTIFY=low) or EFFORT for all of them. Watch the usage log, then keep or undo."""
    v = (os.getenv(f"EFFORT_{endpoint.upper()}") or os.getenv("EFFORT") or "").strip().lower()
    return v if v in EFFORTS else None


def log_usage(endpoint: str, msg) -> None:
    """One JSON line per model call, so token use (and what a call costs) can be read from the server logs."""
    u = getattr(msg, "usage", None)
    if u is None:
        return
    details = getattr(u, "output_tokens_details", None)
    tools = getattr(u, "server_tool_use", None)
    print("usage " + json.dumps({
        "endpoint": endpoint, "model": getattr(msg, "model", MODEL),
        "input": getattr(u, "input_tokens", 0) or 0, "output": getattr(u, "output_tokens", 0) or 0,
        "thinking": getattr(details, "thinking_tokens", None),
        "cache_read": getattr(u, "cache_read_input_tokens", 0) or 0,
        "cache_write": getattr(u, "cache_creation_input_tokens", 0) or 0,
        "searches": getattr(tools, "web_search_requests", 0) or 0,
        "effort": effort_for(endpoint),
    }), flush=True)


def create_message(endpoint: str, **kwargs):
    """The one place the app calls Claude: adds the optional effort setting and logs usage."""
    effort = effort_for(endpoint)
    if effort:
        kwargs["extra_body"] = {"output_config": {"effort": effort}}
    msg = client().messages.create(model=MODEL, **kwargs)
    log_usage(endpoint, msg)
    return msg


def ask_claude(system: str, content, max_tokens: int = 2500, endpoint: str = "other") -> dict:
    try:
        msg = create_message(
            endpoint,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": content}],
        )
    except anthropic.AuthenticationError:
        raise HTTPException(500, "Anthropic rejected the API key. Check ANTHROPIC_API_KEY in .env.")
    except anthropic.RateLimitError:
        raise HTTPException(429, "Rate limited by the Anthropic API. Wait a moment and try again.")
    except anthropic.APIError as exc:
        raise HTTPException(502, f"Anthropic API error: {exc}")
    text = "".join(b.text for b in msg.content if b.type == "text")
    return parse_json(text)


def parse_json(text: str) -> dict:
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise HTTPException(502, "The AI returned an unexpected response. Please try again.")
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        raise HTTPException(502, "The AI returned an unexpected response. Please try again.")


# ---------------------------------------------------------------- read image

READ_SYSTEM = """You transcribe handwritten or printed math from a photo into LaTeX.
Reply with ONLY a JSON object:
{"readable": boolean,
 "problems": [{"kind": "math" or "word", "latex": string, "text": string,
               "uncertain": [{"text": string, "alternatives": [string]}]}],
 "message": string}

Rules:
- Transcribe exactly what is written. Never solve it, never "fix" it, never guess.
- If the image is blurry, too dark, cut off, has no math, or you are not confident about the
  symbols, set "readable": false, "problems": [] and write a short, friendly "message" saying what
  is wrong and asking the user to retake the photo (e.g. better light, closer, hold steady).
- If the photo holds several separate problems (numbered, or clearly separate lines that are not parts
  of one system), return each as its own entry, in reading order. One system of equations is ONE problem.
- A math problem has "kind": "math", its LaTeX in "latex", and "text": "". A system of equations is one
  entry: join its lines with \\\\ inside \\begin{cases} ... \\end{cases}.
- A problem written in words (a story or sentence problem) has "kind": "word", the full wording as plain
  text in "text", and "latex": "".
- Use \\times for multiplication signs and the letter x for the variable. Use \\frac, \\sqrt, ^, _,
  \\int, \\frac{d}{dx}, \\sin, \\log, \\ln as appropriate.
- "uncertain": list each symbol you are unsure about, "text" being the exact characters as they appear in
  your latex and "alternatives" up to 3 other things it could be (e.g. {"text": "5", "alternatives": ["S", "s"]}).
  Use [] when you are confident.
- "message" is an empty string unless something needs saying."""


class ReadRequest(BaseModel):
    image: str = Field(description="base64 image data (no data: prefix)")
    media_type: str = "image/jpeg"


def check_image(req: "ReadRequest") -> None:
    if req.media_type not in ALLOWED_MEDIA:
        raise HTTPException(400, "Unsupported image type.")
    try:
        raw = base64.b64decode(req.image, validate=True)
    except Exception:
        raise HTTPException(400, "Image data was not valid base64.")
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Image is too large. Try cropping it more.")


def _clean_uncertain(raw) -> list[dict]:
    out = []
    for u in raw or []:
        if isinstance(u, dict) and str(u.get("text") or "").strip():
            alts = [str(a).strip()[:20] for a in (u.get("alternatives") or []) if str(a).strip()][:4]
            out.append({"text": str(u["text"]).strip()[:20], "alternatives": alts})
    return out[:10]


def clean_problems(raw) -> list[dict]:
    out = []
    for p in raw or []:
        if not isinstance(p, dict):
            continue
        latex = str(p.get("latex") or "").strip()
        text = str(p.get("text") or "").strip()
        if not latex and not text:
            continue
        kind = "word" if (text and not latex) or p.get("kind") == "word" and not latex else "math"
        out.append({"kind": kind, "latex": latex, "text": text if kind == "word" else "",
                    "uncertain": _clean_uncertain(p.get("uncertain")) if kind == "math" else []})
    return out[:12]


@app.post("/api/read")
def read_image(req: ReadRequest):
    check_image(req)
    data = ask_claude(
        READ_SYSTEM,
        [
            {"type": "image", "source": {"type": "base64", "media_type": req.media_type, "data": req.image}},
            {"type": "text", "text": "Transcribe the math in this image."},
        ],
        max_tokens=2500,
        endpoint="read",
    )
    problems = clean_problems(data.get("problems"))
    if not problems and str(data.get("latex") or "").strip():  # older single-problem shape
        problems = clean_problems([{"kind": "math", "latex": data["latex"], "uncertain": data.get("uncertain")}])
    readable = bool(data.get("readable")) and bool(problems)
    message = str(data.get("message") or "").strip()
    if not readable and not message:
        message = "I couldn't read that. Please retake the photo with good light, held steady and close."
    first = problems[0] if problems else None
    return {
        "readable": readable,
        "problems": problems if readable else [],
        "latex": first["latex"] if readable and first and first["kind"] == "math" else "",
        "uncertain": first["uncertain"] if readable and first else [],
        "message": message,
    }


# ------------------------------------------------------------- word problems

FORMULATE_SYSTEM = """You turn a word problem into an equation so it can be solved.
Reply with ONLY a JSON object:
{"variables": [{"name": string, "meaning": string}], "equation_latex": string, "question": string, "message": string}

Rules:
- Define each variable in plain words with units (e.g. {"name": "x", "meaning": "number of apples Sam has"}).
- Write ONE equation in LaTeX that captures the story, or a system inside \\begin{cases} ... \\end{cases}
  when there are two unknowns. Use x (and y) for variables. Do not solve it.
- "question" restates in a few words what the problem asks for.
- If the text is not a solvable math problem, or it is missing information, set "equation_latex": "" and
  explain in "message". Otherwise "message" is an empty string."""


class FormulateRequest(BaseModel):
    text: str = Field(min_length=3, max_length=3000)


@app.post("/api/formulate")
def formulate(req: FormulateRequest):
    data = ask_claude(FORMULATE_SYSTEM, f"Word problem:\n{req.text}", max_tokens=1200, endpoint="formulate")
    eq = str(data.get("equation_latex") or "").strip()
    variables = [
        {"name": str(v.get("name") or "").strip()[:12], "meaning": str(v.get("meaning") or "").strip()[:120]}
        for v in (data.get("variables") or [])
        if isinstance(v, dict) and str(v.get("name") or "").strip()
    ][:6]
    message = str(data.get("message") or "").strip()
    if not eq and not message:
        message = "I couldn't turn that into an equation. Add the missing numbers or rephrase it."
    return {"variables": variables, "equation_latex": eq, "question": str(data.get("question") or "").strip(), "message": message}


# --------------------------------------------------------------------- solve

SHAPES = """Pick ONE shape:
 - arithmetic / simplify an expression:
     problem {"kind": "evaluate" or "simplify", "expr": "2+3*4"}   answer {"value": "14"}
 - one equation:
     problem {"kind": "solve", "equation": "x**2-5*x+6=0", "variable": "x"}
     answer {"values": ["2", "3"]}   (list EVERY solution; use [] if there is none)
 - system of equations:
     problem {"kind": "system", "equations": ["x+y=3", "x-y=1"], "variables": ["x", "y"]}
     answer {"solutions": [{"x": "2", "y": "1"}]}
 - derivative:  problem {"kind": "derivative", "expr": "x**3", "variable": "x"}  answer {"value": "3*x**2"}
 - integral:    problem {"kind": "integral", "expr": "2*x", "variable": "x"}  answer {"value": "x**2"}
                (definite: add "bounds": ["0", "1"]; omit the + C in "value")
"""

SOLVE_SYSTEM = """You are a careful math tutor. Solve the problem given in LaTeX.
Reply with ONLY one JSON object (no prose, no code fences) with these keys:

{
 "answer_latex": "final answer in LaTeX, e.g. x = 2 \\\\text{ or } x = 3",
 "answer_text": "only when the problem came from a word problem, see below; otherwise omit",
 "steps": [{"latex": "one line of work", "explain": "one short sentence on what was done",
            "verify": {"type": "...", "expr": "..."}}],
 "check": {"steps": [{"latex": "...", "explain": "..."}], "conclusion": "one sentence"},
 "problem": { ... machine-readable version of the problem, see below ... },
 "answer": { ... machine-readable version of your final answer, see below ... },
 "graph": { ... optional picture of the problem, see below ... }
}

"problem" / "answer" are checked by a computer algebra system (SymPy), so write every expression
as a SymPy-parsable string: use ** or ^ for powers, * for multiplication, sqrt(), log(x) for the
natural log and log(x, 10) for base 10, ln() is allowed, sin/cos/tan/asin/acos/atan, pi, E.
Trig is in radians; if the problem uses degrees write sin(30*pi/180).
""" + SHAPES + """ - anything else: problem {"kind": "other"}  answer {"value": "..."}

Writing the work:
- "steps": one line per step, in order; each "latex" is a single clean line of math (no prose inside
  except \\\\text{}); each "explain" is one short sentence.
- "verify" on a step lets a computer test that very line. Add it when the line is testable and omit it otherwise:
    solve / system problems: {"type": "equation", "expr": "2*x=8"}, the single equation that line shows (one
       equation that every true solution satisfies; never "x=2 or x=3", never text).
    evaluate / simplify problems: {"type": "expression", "expr": "2+12"}, the expression that line shows,
       equal in value to the original expression.
    derivative / integral problems: {"type": "result", "expr": "..."}, only on a line that shows the finished
       result or an equivalent form of it, never partial pieces such as one product-rule term.
- "check": plug the answer back into the ORIGINAL problem and show the arithmetic so the user can
  see it works (for derivatives/integrals, differentiate back / compare to a quick sanity value).
- "graph" (include it when a picture helps: equations, systems of two unknowns, functions, derivatives,
  definite integrals; omit it for plain arithmetic):
    {"series": [{"label": "y = 2x + 3", "expr": "2*x+3"}], "points": [{"x": "4", "series": 0, "label": "x = 4"}],
     "shade": {"from": "0", "to": "3", "series": 0}, "xmin": -10, "xmax": 10}
  Every "expr" is a math.js expression in x only, written as y = f(x) (a line 2y = x + 1 becomes "(x+1)/2").
  One-variable equation f(x) = g(x): series are the two sides (a constant side is just a number such as "11")
  and points are the solutions (x values, series 0). System of two unknowns: one series per equation solved for
  y, and one point at the intersection. Derivative: series [f, f']. Definite integral: series [f] plus "shade".
  Up to 3 series. Choose xmin/xmax so the interesting part is visible.
- Never put markdown or $ delimiters in any field."""

WORD_ADDENDUM = """
This equation came from a word problem. Original wording and variable meanings are given below.
Also return "answer_text": one short sentence that answers the original question in words, with units."""

SIMPLE_ADDENDUM = """
EXPLAIN LIKE I'M 12: write every "explain" and the check "conclusion" in very simple, friendly
language a 12-year-old would understand. Short words, tiny sentences, a quick everyday analogy when
it helps. The math lines stay the same; only the wording changes."""


class SolveRequest(BaseModel):
    latex: str = Field(min_length=1, max_length=2000)
    simple: bool = False
    context: str | None = Field(default=None, max_length=3500)


def _clean_steps(raw) -> list[dict]:
    out = []
    for s in raw or []:
        if isinstance(s, dict) and s.get("latex"):
            step = {"latex": str(s["latex"]), "explain": str(s.get("explain") or "")}
            v = s.get("verify")
            if isinstance(v, dict) and v.get("type") in ("equation", "expression", "result") and v.get("expr"):
                step["verify"] = {"type": v["type"], "expr": str(v["expr"])[:300]}
            out.append(step)
    return out


def _clean_graph(raw) -> dict | None:
    """Keep only a graph whose expressions SymPy can parse; the page re-checks them before drawing."""
    if not isinstance(raw, dict):
        return None
    series = []
    for s in raw.get("series") or []:
        if isinstance(s, dict) and s.get("expr"):
            try:
                _parse(str(s["expr"]))
            except Exception:  # noqa: BLE001
                continue
            series.append({"label": str(s.get("label") or "")[:40], "expr": str(s["expr"])[:200]})
    series = series[:3]
    if not series:
        return None
    points = []
    for p in raw.get("points") or []:
        try:
            idx = int(p.get("series", 0))
            _parse(str(p["x"]))
        except Exception:  # noqa: BLE001
            continue
        if 0 <= idx < len(series):
            points.append({"x": str(p["x"])[:60], "series": idx, "label": str(p.get("label") or "")[:30]})
    shade = raw.get("shade")
    if isinstance(shade, dict):
        try:
            idx = int(shade.get("series", 0))
            _parse(str(shade["from"]))
            _parse(str(shade["to"]))
            shade = {"from": str(shade["from"])[:60], "to": str(shade["to"])[:60], "series": idx} if 0 <= idx < len(series) else None
        except Exception:  # noqa: BLE001
            shade = None
    else:
        shade = None
    out = {"series": series, "points": points[:6], "shade": shade}
    for k in ("xmin", "xmax"):
        try:
            out[k] = float(raw[k])
        except (KeyError, TypeError, ValueError):
            pass
    if "xmin" in out and "xmax" in out and out["xmin"] >= out["xmax"]:
        del out["xmin"], out["xmax"]
    return out


@app.post("/api/solve")
def solve(req: SolveRequest):
    system = SOLVE_SYSTEM + (SIMPLE_ADDENDUM if req.simple else "") + (WORD_ADDENDUM if req.context else "")
    user = f"Problem (LaTeX):\n{req.latex}" + (f"\n\nWord problem context:\n{req.context}" if req.context else "")
    data = ask_claude(system, user, max_tokens=5000, endpoint="solve")
    steps = _clean_steps(data.get("steps"))
    answer_latex = str(data.get("answer_latex") or "").strip()
    if not steps or not answer_latex:
        raise HTTPException(502, "The AI didn't return a complete solution. Please try again.")
    check = data.get("check") if isinstance(data.get("check"), dict) else {}
    problem = data.get("problem") if isinstance(data.get("problem"), dict) else {}
    answer = data.get("answer") if isinstance(data.get("answer"), dict) else {}
    verification = verify(problem, answer)
    statuses = verify_steps(problem, answer, steps)
    for s, st in zip(steps, statuses):
        s["check"] = st
        s.pop("verify", None)
    return {
        "answer_latex": answer_latex,
        "answer_text": str(data.get("answer_text") or "").strip() if req.context else "",
        "steps": steps,
        "steps_summary": {"checked": sum(1 for x in statuses if x != "unchecked"), "bad": [i for i, x in enumerate(statuses) if x == "bad"]},
        "check": {
            "steps": [{k: v for k, v in s.items() if k != "verify"} for s in _clean_steps(check.get("steps"))],
            "conclusion": str(check.get("conclusion") or ""),
        },
        "verification": verification,
        "graph": _clean_graph(data.get("graph")),
        "kind": problem.get("kind", "other"),
    }


# ------------------------------------------------------------------ practice

TOPICS = {
    "mixed": "any one of: arithmetic with order of operations, a linear equation, a quadratic equation, a 2x2 system, exponents, radicals, logarithms, a derivative, an integral",
    "arithmetic": "arithmetic with order of operations",
    "linear": "a linear equation in x",
    "quadratic": "a quadratic equation in x",
    "system": "a system of two linear equations in x and y",
    "exponents": "an expression or equation with exponents",
    "radicals": "an expression or equation with radicals",
    "logs": "an expression or equation with logarithms",
    "derivative": "a derivative (Calculus 1)",
    "integral": "an integral (Calculus 1)",
}
LEVELS = {
    "easy": "easy: one or two steps, small whole numbers",
    "medium": "medium: a typical homework problem, a few steps",
    "hard": "hard: multi-step, needs care (negatives, fractions, or a trap), still with a clean exact answer",
}

PRACTICE_SYSTEM = """You write practice problems for a math student. Reply with ONLY one JSON object:
{"latex": string, "hint": string, "problem": {...}, "answer": {...}}
- "latex": the new problem exactly as the student should see it, in LaTeX.
- "hint": one or two sentences that nudge the first step. Never reveal the final answer.
- "problem" and "answer": a machine-readable version of the problem and its correct answer, checked later by
  SymPy. Write expressions as SymPy-parsable strings (** or ^ for powers, * for multiplication, sqrt(), log(x) is
  natural log, pi, E).
""" + SHAPES + """Rules: the problem must have a clean exact answer (no long decimals) and exactly one correct
final answer set. Avoid trig equations that have infinitely many solutions."""


class PracticeRequest(BaseModel):
    difficulty: str = "medium"
    topic: str = "mixed"
    latex: str | None = Field(default=None, max_length=2000)  # optional: "something like this one"


@app.post("/api/practice")
def practice(req: PracticeRequest):
    level = LEVELS.get(req.difficulty, LEVELS["medium"])
    topic = TOPICS.get(req.topic, TOPICS["mixed"])
    ask = f"Difficulty: {level}.\nTopic: {topic}."
    if req.latex:
        ask += f"\nMake it similar in type to this problem, with different numbers:\n{req.latex}"
    for _ in range(2):  # the stored answer must agree with SymPy, or the grading would be unfair
        data = ask_claude(PRACTICE_SYSTEM, ask, max_tokens=1500, endpoint="practice")
        problem = data.get("problem") if isinstance(data.get("problem"), dict) else {}
        answer = data.get("answer") if isinstance(data.get("answer"), dict) else {}
        latex = str(data.get("latex") or "").strip()
        if latex and verify(problem, answer)["status"] == "match":
            return {"latex": latex, "hint": str(data.get("hint") or "").strip(), "problem": problem,
                    "difficulty": req.difficulty, "topic": req.topic}
    raise HTTPException(502, "Couldn't make a reliable practice problem. Please try again.")


class PracticeCheck(BaseModel):
    problem: dict
    answer: str = Field(max_length=300)


@app.post("/api/practice/check")
def practice_check(req: PracticeCheck):
    if req.problem.get("kind") not in {"evaluate", "simplify", "solve", "system", "derivative", "integral"}:
        raise HTTPException(400, "Unknown problem type.")
    return check_user_answer(req.problem, req.answer)


# ------------------------------------------------------------------ snap buy

IDENTIFY_SYSTEM = """You identify a consumer product from a photo so the user can shop for it.
Reply with ONLY a JSON object:
{"identifiable": boolean, "name": string, "brand": string, "model": string, "category": string,
 "query": string, "message": string}

Rules:
- Read any visible brand, model name or number, size, or capacity. Prefer printed text over guessing.
- "query" is the best web search phrase to find this exact product for sale (brand + model + key spec),
  e.g. "Sony WH-1000XM5 headphones". Do not include prices or the word "buy".
- If you can only tell the general kind of item (e.g. "a black backpack") and not a specific product, still
  set "identifiable": true, give your best generic "query", and say in "message" that the match is approximate
  and the user should add the brand or model.
- If the photo is blurry, empty, or shows nothing you can name, set "identifiable": false and write a short,
  friendly "message" asking for a clearer photo (closer, better light, show the label or logo).
- Never invent a model number you cannot see."""

OFFERS_SYSTEM = """You are a careful price-comparison assistant. Use web search to find where to buy the exact
product the user names, then report the best current offers.
Rules:
- Only include an offer if you saw its price in search results and it is clearly the SAME product (not an
  accessory, a different model, or a bundle) unless the user's query is generic.
- "url" must be the product page link exactly as it appeared in the results. Never construct or guess a URL.
- Prefer well-known retailers and the manufacturer's own store. Skip results that look like scams or
  marketplaces with no real listing. Include up to 8 offers from different sellers.
- "price" is a number in "currency" (ISO code), the item price before shipping when you can tell.
- "condition" is one of new, used, refurbished, unknown. "note" is a few words at most (e.g. "free shipping", "sale").
- "in_stock" is "yes" only if the listing says it is available, "no" if it says out of stock or unavailable,
  otherwise "unknown". "free_shipping" is "yes" only if the listing says shipping is free, "no" if it shows
  a shipping charge, otherwise "unknown".
- If the user's query is or contains a barcode number (UPC/EAN, 8 to 14 digits), first work out which product it is
  from search results, then find prices for that product, and put its full name (brand, model, size) in "product".
  If you cannot tell which product the number is, leave "product" empty and say so in "summary".
- "likely_stores": up to 3 well-known retailers in the user's region that are most likely to stock this kind
  of item at a good price, best first, each with a short "why" (range, price matching, sales). This is your
  general knowledge of retailers, not live stock, so do not claim availability.
- If you cannot find reliable prices, return an empty offers list and say why in "summary".
Reply with ONLY one JSON object: {"offers":[{"retailer":string,"price":number,"currency":string,
"url":string,"condition":string,"in_stock":string,"free_shipping":string,"note":string}],"summary":string,
"likely_stores":[{"name":string,"why":string}],"product":string}"""

WEB_SEARCH_TYPES = ("web_search_20260209", "web_search_20250305")
# Each search costs a flat fee on top of the tokens its results add. Lower this (WEB_SEARCH_MAX_USES=3) to cap the cost of one price check.
WEB_SEARCH_MAX_USES = max(1, min(10, int(os.getenv("WEB_SEARCH_MAX_USES", "5") or 5)))
AMAZON_DOMAIN = {"US": "com", "GB": "co.uk", "CA": "ca", "DE": "de", "FR": "fr", "IT": "it", "ES": "es", "AU": "com.au", "JP": "co.jp", "IN": "in"}


class IdentifyRequest(ReadRequest):
    pass


@app.post("/api/buy/identify")
def buy_identify(req: IdentifyRequest):
    check_image(req)
    data = ask_claude(
        IDENTIFY_SYSTEM,
        [
            {"type": "image", "source": {"type": "base64", "media_type": req.media_type, "data": req.image}},
            {"type": "text", "text": "What product is this?"},
        ],
        max_tokens=600,
        endpoint="identify",
    )
    query = str(data.get("query") or "").strip()
    ok = bool(data.get("identifiable")) and bool(query)
    message = str(data.get("message") or "").strip()
    if not ok and not message:
        message = "I couldn't tell what that is. Try a closer photo that shows the label or logo."
    return {
        "identifiable": ok,
        "name": str(data.get("name") or "").strip() or query,
        "brand": str(data.get("brand") or "").strip(),
        "model": str(data.get("model") or "").strip(),
        "category": str(data.get("category") or "").strip(),
        "query": query if ok else "",
        "message": message,
    }


def compare_links(query: str, country: str = "US") -> list[dict]:
    """Search links on big stores. These are searches, not prices, and are labelled that way in the UI."""
    q = quote_plus(query)
    c = (country or "US").upper()
    links = [
        {"name": "Google Shopping (low to high)", "url": f"https://www.google.com/search?tbm=shop&q={q}&tbs=p_ord:p"},
        {"name": "Amazon", "url": f"https://www.amazon.{AMAZON_DOMAIN.get(c, 'com')}/s?k={q}"},
        {"name": "eBay (lowest price first)", "url": f"https://www.ebay.com/sch/i.html?_nkw={q}&_sop=15"},
    ]
    if c == "US":
        links += [
            {"name": "Walmart", "url": f"https://www.walmart.com/search?q={q}"},
            {"name": "Best Buy", "url": f"https://www.bestbuy.com/site/searchpage.jsp?st={q}"},
            {"name": "Target", "url": f"https://www.target.com/s?searchTerm={q}"},
        ]
    return links


def _url_key(url: str) -> str:
    u = urlparse(url)
    return (u.netloc.lower().removeprefix("www.") + u.path.rstrip("/")).lower()


def _yes_no(v) -> str:
    v = str(v or "").strip().lower()
    return v if v in ("yes", "no") else "unknown"


def filter_offers(offers, allowed_urls, ages: dict | None = None) -> list[dict]:
    """Keep only offers whose link really came from a search result, with a sane price. Cheapest first.

    `ages` maps a result URL to how old the page was reported to be ("3 days ago", a date, ...).
    """
    allowed = {_url_key(u) for u in allowed_urls}
    age_by_key = {_url_key(u): a for u, a in (ages or {}).items() if a}
    out, seen = [], set()
    for o in offers or []:
        if not isinstance(o, dict):
            continue
        url = str(o.get("url") or "").strip()
        if urlparse(url).scheme not in ("http", "https") or _url_key(url) not in allowed:
            continue
        try:
            price = float(o.get("price"))
        except (TypeError, ValueError):
            continue
        if not (0 < price < 10_000_000) or _url_key(url) in seen:
            continue
        seen.add(_url_key(url))
        host = urlparse(url).netloc.lower().removeprefix("www.")
        out.append(
            {
                "retailer": str(o.get("retailer") or host).strip() or host,
                "price": round(price, 2),
                "currency": str(o.get("currency") or "USD").strip().upper()[:3] or "USD",
                "url": url,
                "condition": str(o.get("condition") or "unknown").strip().lower(),
                "in_stock": _yes_no(o.get("in_stock")),
                "free_shipping": _yes_no(o.get("free_shipping")),
                "seen": str(age_by_key.get(_url_key(url)) or "")[:40],
                "note": str(o.get("note") or "").strip()[:60],
            }
        )
    out.sort(key=lambda o: o["price"])
    # best = cheapest new item (or cheapest anything when nothing is marked new)
    best = next((o for o in out if o["condition"] in ("new", "unknown")), out[0] if out else None)
    for o in out:
        o["best"] = o is best
    return out


REPUTABLE = ("amazon.", "walmart.", "target.", "bestbuy.", "costco.", "homedepot.", "lowes.", "apple.com", "samsung.",
             "newegg.", "bhphotovideo.", "adorama.", "ebay.", "macys.", "nordstrom.", "ikea.", "wayfair.", "argos.",
             "currys.", "johnlewis.", "mediamarkt.", "sony.", "nike.", "bose.", "dell.", "hp.com", "lenovo.", "ao.com")
CONDITION_PENALTY = {"new": 0.0, "unknown": 0.05, "refurbished": 0.12, "used": 0.3}


def recommend(offers: list[dict], likely_stores, query: str, preferred: str = "") -> dict | None:
    """Pick the store most likely to give the best real deal.

    Score = price relative to the cheapest offer, plus penalties for used/refurbished items and for items
    that are out of stock (or not confirmed), minus a small bonus for well-known retailers. Lower is better.
    With no priced offers, fall back to the retailer most likely to stock this kind of item.
    """
    if offers:
        cheapest = min(o["price"] for o in offers)

        def score(o):
            host = urlparse(o["url"]).netloc.lower()
            s = o["price"] / cheapest + CONDITION_PENALTY.get(o["condition"], 0.05)
            s += {"yes": 0.0, "unknown": 0.03, "no": 100.0}[o["in_stock"]]
            if preferred and (preferred in host or preferred in o["retailer"].lower()):
                s -= 0.15  # a soft preference: it wins close calls, not clearly worse deals
            return s - (0.04 if any(r in host for r in REPUTABLE) else 0.0)

        pick = min(offers, key=score)
        cheaper = [o for o in offers if o["price"] < pick["price"]]
        if preferred and (preferred in urlparse(pick["url"]).netloc.lower() or preferred in pick["retailer"].lower()) and cheaper:
            reason = "Your preferred store, and the price is close to the best."
        elif not cheaper:
            reason = "Lowest price found" + (" for a new item that's in stock." if pick["in_stock"] == "yes" else ".")
        else:
            why = []
            if any(o["in_stock"] == "no" for o in cheaper):
                why.append("the cheaper listing is out of stock")
            if any(o["condition"] in ("used", "refurbished") for o in cheaper):
                why.append("cheaper listings are used or refurbished")
            gap = round((pick["price"] / cheapest - 1) * 100)
            reason = ("Best deal you can actually get: " + " and ".join(why) + ".") if why else f"A trusted seller within {gap}% of the lowest price."
        return {"kind": "offer", "retailer": pick["retailer"], "price": pick["price"], "currency": pick["currency"],
                "url": pick["url"], "in_stock": pick["in_stock"], "reason": reason}
    for st in likely_stores or []:
        if isinstance(st, dict) and str(st.get("name") or "").strip():
            name = str(st["name"]).strip()[:40]
            why = str(st.get("why") or "").strip()[:140]
            return {"kind": "likely", "retailer": name, "price": None, "currency": None,
                    "url": "https://www.google.com/search?q=" + quote_plus(f"{query} {name}"),
                    "in_stock": "unknown", "reason": (why + " " if why else "") + "Not confirmed in stock, so check before you go."}
    return None


def search_web(query: str, country: str) -> tuple[dict, set[str], dict]:
    """Ask Claude to search the web. Returns (parsed JSON answer, URLs seen in results, {url: reported page age})."""
    last_err: Exception | None = None
    for tool_type in WEB_SEARCH_TYPES:
        tool = {"type": tool_type, "name": "web_search", "max_uses": WEB_SEARCH_MAX_USES,
                "user_location": {"type": "approximate", "country": country}}
        messages = [{"role": "user", "content": f"Find the best current prices for: {query}"}]
        urls: set[str] = set()
        ages: dict[str, str] = {}
        try:
            for _ in range(4):  # a long search can pause; resume it
                msg = create_message("prices", max_tokens=4000, system=OFFERS_SYSTEM, tools=[tool], messages=messages)
                for b in msg.content:
                    if b.type == "web_search_tool_result" and isinstance(b.content, list):
                        for r in b.content:
                            if getattr(r, "url", None):
                                urls.add(r.url)
                                if getattr(r, "page_age", None):
                                    ages[r.url] = str(r.page_age)
                    for c in getattr(b, "citations", None) or []:
                        if getattr(c, "url", None):
                            urls.add(c.url)
                if msg.stop_reason != "pause_turn":
                    break
                messages = messages + [{"role": "assistant", "content": [b.model_dump(exclude_none=True) for b in msg.content]}]
            text = "".join(b.text for b in msg.content if b.type == "text")
            return parse_json(text), urls, ages
        except anthropic.BadRequestError as exc:  # tool type not available for this model/org: try the basic one
            last_err = exc
            continue
        except anthropic.AuthenticationError:
            raise HTTPException(500, "Anthropic rejected the API key. Check ANTHROPIC_API_KEY in .env.")
        except anthropic.RateLimitError:
            raise HTTPException(429, "Rate limited by the Anthropic API. Wait a moment and try again.")
        except anthropic.APIError as exc:
            raise HTTPException(502, f"Anthropic API error: {exc}")
    raise HTTPException(502, f"Web search isn't available for this API key or model ({last_err}). Enable web search in the Anthropic Console.")


class PricesRequest(BaseModel):
    query: str = Field(min_length=2, max_length=200)
    country: str = Field(default="US", min_length=2, max_length=2)


class Filters(BaseModel):
    new_only: bool = False
    free_shipping: bool = False
    max_price: float | None = Field(default=None, gt=0)
    preferred_store: str = Field(default="", max_length=40)


def apply_filters(offers: list[dict], f: Filters) -> list[dict]:
    out = []
    for o in offers:
        if f.new_only and o["condition"] not in ("new", "unknown"):
            continue
        if f.free_shipping and o["free_shipping"] != "yes":
            continue
        if f.max_price is not None and o["price"] > f.max_price:
            continue
        out.append(o)
    return out


def rank(offers: list[dict], likely_stores, query: str, f: Filters) -> dict:
    shown = apply_filters(offers, f)
    pref = f.preferred_store.strip().lower()
    rec = recommend(shown, likely_stores if not offers else [], query, pref)
    for o in offers:
        o["recommended"] = bool(rec and rec["kind"] == "offer" and o["url"] == rec["url"])
    return {"offers": shown, "hidden": len(offers) - len(shown), "recommendation": rec}


@app.post("/api/buy/prices")
def buy_prices(req: PricesRequest):
    country = req.country.upper()
    data, urls, ages = search_web(req.query.strip(), country)
    offers = filter_offers(data.get("offers"), urls, ages)
    likely = [
        {"name": str(x.get("name") or "").strip()[:40], "why": str(x.get("why") or "").strip()[:140]}
        for x in (data.get("likely_stores") or []) if isinstance(x, dict) and str(x.get("name") or "").strip()
    ][:3]
    product = str(data.get("product") or "").strip()[:120]
    ranked = rank(offers, likely, req.query.strip(), Filters())
    return {
        "query": req.query.strip(),
        "product": product,                    # what a barcode number turned out to be ("" when not looked up)
        "offers": offers,                      # every offer found; the page re-ranks with /api/buy/rank
        "recommendation": ranked["recommendation"],
        "likely_stores": likely,
        "summary": str(data.get("summary") or "").strip(),
        "compare": compare_links(product or req.query.strip(), country),
        "checked_at": int(time.time()),
    }


class RankOffer(BaseModel):
    retailer: str = Field(max_length=80)
    price: float = Field(gt=0, lt=10_000_000)
    currency: str = Field(default="USD", max_length=3)
    url: str = Field(max_length=2000)
    condition: str = "unknown"
    in_stock: str = "unknown"
    free_shipping: str = "unknown"
    note: str = ""
    seen: str = ""


class RankRequest(BaseModel):
    query: str = Field(default="", max_length=200)
    offers: list[RankOffer] = Field(max_length=30)
    likely_stores: list[dict] = Field(default_factory=list, max_length=5)
    filters: Filters = Field(default_factory=Filters)


@app.post("/api/buy/rank")
def buy_rank(req: RankRequest):
    """Re-apply filters and re-pick the recommended store from offers the page already has. No AI call."""
    offers = [
        {**o.model_dump(), "currency": o.currency.upper() or "USD", "condition": o.condition.lower(),
         "in_stock": _yes_no(o.in_stock), "free_shipping": _yes_no(o.free_shipping)}
        for o in req.offers if urlparse(o.url).scheme in ("http", "https")
    ]
    offers.sort(key=lambda o: o["price"])
    return rank(offers, req.likely_stores, req.query, req.filters)


# ---------------------------------------------------------------- plant scan

PLANT_SYSTEM = """You are a careful plant identification and plant-care assistant. Look at the photo and reply with
ONLY a JSON object:
{"is_plant": boolean, "message": string,
 "name": string, "scientific": string, "confidence": "high" | "medium" | "low", "kind": string,
 "alternatives": [{"name": string, "scientific": string}],
 "health": {"status": "healthy" | "needs_attention" | "unclear", "summary": string,
            "issues": [{"name": string, "signs": string, "cause": string, "fix": string,
                        "severity": "mild" | "moderate" | "serious"}]},
 "care": {"light": string, "water": string, "water_every_days": integer or null, "soil": string,
          "temperature": string, "humidity": string, "feeding": string},
 "pets": {"status": "toxic" | "mostly_safe" | "unknown", "note": string},
 "fun_fact": string, "photo_tips": string}

Rules:
- Only describe what you can see. Identification from one photo is a best guess: say "medium" or "low"
  confidence unless the leaves, shape and (if visible) flowers clearly match one species. Give up to 3
  "alternatives" when unsure.
- If the photo shows no plant, or is too blurry or dark, set "is_plant": false and write a short friendly
  "message" asking for a clearer, closer photo. Do not guess a species from nothing.
- Health: list issues you can actually see (yellow or brown leaves, spots, wilting, pests, mould, leggy growth).
  Give plain, practical fixes. If nothing looks wrong, say "healthy" with an empty "issues" list. If you cannot tell,
  say "unclear" and put what to photograph next in "photo_tips".
- "water_every_days" is a typical watering interval for a home plant of this kind (a whole number), or null if it
  depends too much on the setting (e.g. a tree in the ground).
- Pets: say "toxic" for plants known to be toxic to cats or dogs, "mostly_safe" only when you are confident, and
  "unknown" otherwise. Add a one-line "note", and when toxic say which pets if you know.
- NEVER say a wild plant, berry, or mushroom is safe to eat, and never recommend eating anything from a photo.
  If the photo shows a mushroom or fungus, set "is_plant": false and say mushrooms cannot be identified safely
  from a picture.
- Keep every string short (one or two sentences)."""

PLANT_ENUMS = {
    "confidence": ("high", "medium", "low"),
    "status": ("healthy", "needs_attention", "unclear"),
    "severity": ("mild", "moderate", "serious"),
    "pets": ("toxic", "mostly_safe", "unknown"),
}


def _s(v, n: int = 300) -> str:
    return str(v or "").strip()[:n]


def _pick(v, allowed: tuple, default: str) -> str:
    v = str(v or "").strip().lower().replace(" ", "_")
    return v if v in allowed else default


def clean_plant(data: dict) -> dict:
    """Make the model's answer safe and predictable for the app: known values only, trimmed text, small lists."""
    ok = bool(data.get("is_plant")) and bool(_s(data.get("name")) or _s(data.get("scientific")))
    message = _s(data.get("message"), 400)
    if not ok:
        return {
            "is_plant": False,
            "message": message or "I couldn't see a plant clearly. Try a closer photo of the leaves, in good light.",
        }
    health = data.get("health") if isinstance(data.get("health"), dict) else {}
    care = data.get("care") if isinstance(data.get("care"), dict) else {}
    pets = data.get("pets") if isinstance(data.get("pets"), dict) else {}
    issues = []
    for i in (health.get("issues") or [])[:5]:
        if isinstance(i, dict) and _s(i.get("name")):
            issues.append({
                "name": _s(i.get("name"), 80), "signs": _s(i.get("signs")), "cause": _s(i.get("cause")),
                "fix": _s(i.get("fix")), "severity": _pick(i.get("severity"), PLANT_ENUMS["severity"], "mild"),
            })
    alts = [
        {"name": _s(a.get("name"), 80), "scientific": _s(a.get("scientific"), 80)}
        for a in (data.get("alternatives") or [])[:3]
        if isinstance(a, dict) and (_s(a.get("name")) or _s(a.get("scientific")))
    ]
    days = care.get("water_every_days")
    days = int(days) if isinstance(days, (int, float)) and not isinstance(days, bool) and 1 <= days <= 60 else None
    status = _pick(health.get("status"), PLANT_ENUMS["status"], "unclear")
    if issues and status == "healthy":
        status = "needs_attention"
    return {
        "is_plant": True,
        "message": message,
        "name": _s(data.get("name"), 100) or _s(data.get("scientific"), 100),
        "scientific": _s(data.get("scientific"), 100),
        "confidence": _pick(data.get("confidence"), PLANT_ENUMS["confidence"], "low"),
        "kind": _s(data.get("kind"), 60),
        "alternatives": alts,
        "health": {"status": status, "summary": _s(health.get("summary")), "issues": issues},
        "care": {k: _s(care.get(k)) for k in ("light", "water", "soil", "temperature", "humidity", "feeding")}
        | {"water_every_days": days},
        "pets": {"status": _pick(pets.get("status"), PLANT_ENUMS["pets"], "unknown"), "note": _s(pets.get("note"))},
        "fun_fact": _s(data.get("fun_fact")),
        "photo_tips": _s(data.get("photo_tips")),
    }


class PlantRequest(ReadRequest):
    note: str = Field(default="", max_length=300)  # e.g. "leaves turning yellow since last week"


@app.post("/api/plant/scan")
def plant_scan(req: PlantRequest):
    check_image(req)
    ask = "What plant is this, and is it healthy?"
    if req.note.strip():
        ask += f" The owner says: {req.note.strip()}"
    data = ask_claude(
        PLANT_SYSTEM,
        [
            {"type": "image", "source": {"type": "base64", "media_type": req.media_type, "data": req.image}},
            {"type": "text", "text": ask},
        ],
        max_tokens=1400,
        endpoint="plant",
    )
    return clean_plant(data)


# ---------------------------------------------------------------- food scan

FOOD_SYSTEM = """You are a careful nutrition assistant. Look at the photo of a meal, snack, drink, or a nutrition facts
label and reply with ONLY a JSON object:
{"is_food": boolean, "message": string, "name": string, "confidence": "high" | "medium" | "low",
 "source": "label" | "estimate", "serving": string,
 "items": [{"name": string, "portion": string, "calories": integer}],
 "totals": {"calories": number, "protein_g": number, "carbs_g": number, "fat_g": number,
            "fiber_g": number, "sugar_g": number, "sodium_mg": number},
 "allergens": [string], "notes": string, "photo_tips": string}

Rules:
- If the photo shows a nutrition facts label, read the numbers from it ("source": "label") and say which serving
  they are for. Otherwise estimate from what you can see ("source": "estimate") and never claim precision:
  portions are a guess from one photo, so use "medium" or "low" confidence unless the food and size are obvious.
- "totals" is for the whole portion shown (or one labelled serving), and "items" lists each separate food you can see (up to 8).
- "allergens" may only use: milk, eggs, fish, shellfish, tree nuts, peanuts, wheat, soy, sesame. List the ones the food
  probably contains, and remember hidden ones can be present. Never say a food is free of an allergen.
- "notes" is one or two plain, neutral sentences (for example what drives the calories). No diet advice and no shaming.
- If the photo shows no food or label, or is too blurry or dark, set "is_food": false and write a short friendly "message"
  asking for a clearer photo.
- Keep every string short."""

ALLERGENS = ("milk", "eggs", "fish", "shellfish", "tree nuts", "peanuts", "wheat", "soy", "sesame")
MACROS = (("calories", 6000), ("protein_g", 500), ("carbs_g", 800), ("fat_g", 500), ("fiber_g", 200), ("sugar_g", 500), ("sodium_mg", 20000))


def _num(v, top: float):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or v != v or not 0 <= v <= top:
        return None
    return round(float(v), 1)


def clean_food(data: dict) -> dict:
    """Known values only, trimmed text, numbers in a sane range. Nutrition from a photo is an estimate; the page says so."""
    totals_in = data.get("totals") if isinstance(data.get("totals"), dict) else {}
    totals = {k: _num(totals_in.get(k), top) for k, top in MACROS}
    ok = bool(data.get("is_food")) and totals["calories"] is not None
    if not ok:
        return {"is_food": False, "message": _s(data.get("message"), 400) or "I couldn't see food or a nutrition label clearly. Try a closer photo in good light."}
    items = []
    for i in (data.get("items") or [])[:8]:
        if isinstance(i, dict) and _s(i.get("name")):
            items.append({"name": _s(i.get("name"), 80), "portion": _s(i.get("portion"), 60), "calories": _num(i.get("calories"), 6000)})
    seen = {str(a or "").strip().lower() for a in (data.get("allergens") or []) if isinstance(a, str)}
    return {
        "is_food": True,
        "message": _s(data.get("message"), 400),
        "name": _s(data.get("name"), 100) or "Meal",
        "confidence": _pick(data.get("confidence"), ("high", "medium", "low"), "low"),
        "source": _pick(data.get("source"), ("label", "estimate"), "estimate"),
        "serving": _s(data.get("serving"), 80),
        "items": items,
        "totals": totals,
        "allergens": [a for a in ALLERGENS if a in seen],
        "notes": _s(data.get("notes")),
        "photo_tips": _s(data.get("photo_tips")),
    }


class FoodRequest(ReadRequest):
    note: str = Field(default="", max_length=300)  # e.g. "about half the plate"


@app.post("/api/food/scan")
def food_scan(req: FoodRequest):
    check_image(req)
    ask = "What is this food, and what is in it?"
    if req.note.strip():
        ask += f" The person says: {req.note.strip()}"
    data = ask_claude(
        FOOD_SYSTEM,
        [
            {"type": "image", "source": {"type": "base64", "media_type": req.media_type, "data": req.image}},
            {"type": "text", "text": ask},
        ],
        max_tokens=1200,
        endpoint="food",
    )
    return clean_food(data)


# ---------------------------------------------------------------- species scan

SPECIES_SYSTEM = """You are a careful wildlife identification assistant. Look at the photo of an animal, insect, bird, fish,
or fungus and reply with ONLY a JSON object:
{"found": boolean, "message": string, "name": string, "scientific": string,
 "group": "mammal" | "bird" | "reptile" | "amphibian" | "fish" | "insect" | "spider" | "other_invertebrate" | "fungus" | "other",
 "confidence": "high" | "medium" | "low",
 "alternatives": [{"name": string, "scientific": string}],
 "about": string, "habitat": string, "diet": string, "size": string,
 "danger": {"level": "harmless" | "use_caution" | "dangerous" | "unknown", "note": string},
 "conservation": string, "fun_fact": string, "photo_tips": string}

Rules:
- Only describe what you can see. Identification from one photo is a best guess: say "medium" or "low" confidence unless
  the markings and shape clearly match one species, and give up to 3 "alternatives" when unsure. Domestic pets: name the
  likely breed and say it is a guess.
- If the photo shows no animal, insect, bird, fish or fungus, or is too blurry, dark or far away, set "found": false and
  write a short friendly "message" asking for a clearer, closer photo. If it shows a plant, set "found": false and say
  Plant Scan is the better tool. Do not guess from nothing.
- "danger" is about people and pets: "dangerous" for venomous, poisonous or aggressive species, "use_caution" if it can
  bite, sting or scratch, "harmless" only when you are confident, otherwise "unknown". Say what to do in "note" (keep distance,
  do not handle). Never encourage touching or picking up a wild animal.
- NEVER say a mushroom or fungus is edible or safe to eat or touch, and never advise eating anything from a photo. For fungus,
  give a best-guess name only and say it cannot be judged safe from a picture.
- "conservation" is the IUCN status if you know it (for example "Least Concern"), otherwise empty.
- Keep every string short (one or two sentences)."""

SPECIES_GROUPS = ("mammal", "bird", "reptile", "amphibian", "fish", "insect", "spider", "other_invertebrate", "fungus", "other")


def clean_species(data: dict) -> dict:
    ok = bool(data.get("found")) and bool(_s(data.get("name")) or _s(data.get("scientific")))
    if not ok:
        return {"found": False, "message": _s(data.get("message"), 400) or "I couldn't see an animal clearly. Try a closer photo in good light."}
    danger = data.get("danger") if isinstance(data.get("danger"), dict) else {}
    alts = [
        {"name": _s(a.get("name"), 80), "scientific": _s(a.get("scientific"), 80)}
        for a in (data.get("alternatives") or [])[:3]
        if isinstance(a, dict) and (_s(a.get("name")) or _s(a.get("scientific")))
    ]
    group = _pick(data.get("group"), SPECIES_GROUPS, "other")
    level = _pick(danger.get("level"), ("harmless", "use_caution", "dangerous", "unknown"), "unknown")
    if group == "fungus" and level == "harmless":
        level = "unknown"  # a photo can never show a fungus is safe
    return {
        "found": True,
        "message": _s(data.get("message"), 400),
        "name": _s(data.get("name"), 100) or _s(data.get("scientific"), 100),
        "scientific": _s(data.get("scientific"), 100),
        "group": group,
        "confidence": _pick(data.get("confidence"), ("high", "medium", "low"), "low"),
        "alternatives": alts,
        "about": _s(data.get("about")), "habitat": _s(data.get("habitat")), "diet": _s(data.get("diet")), "size": _s(data.get("size"), 100),
        "danger": {"level": level, "note": _s(danger.get("note"))},
        "conservation": _s(data.get("conservation"), 60),
        "fun_fact": _s(data.get("fun_fact")),
        "photo_tips": _s(data.get("photo_tips")),
    }


class SpeciesRequest(ReadRequest):
    note: str = Field(default="", max_length=300)  # e.g. "found in my garden in Texas"


@app.post("/api/species/scan")
def species_scan(req: SpeciesRequest):
    check_image(req)
    ask = "What species is this?"
    if req.note.strip():
        ask += f" The person says: {req.note.strip()}"
    data = ask_claude(
        SPECIES_SYSTEM,
        [
            {"type": "image", "source": {"type": "base64", "media_type": req.media_type, "data": req.image}},
            {"type": "text", "text": ask},
        ],
        max_tokens=1200,
        endpoint="species",
    )
    return clean_species(data)


@app.get("/api/health")
def health():
    return {"ok": True, "model": MODEL}


# ---------------------------------------------- serve built frontend (optional)

DIST = ROOT / "frontend" / "dist"
if DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = (DIST / path).resolve()
        if path and f.is_file() and DIST in f.parents:
            # the service worker and manifest must always be re-fetched so updates reach installed copies
            return FileResponse(f, headers={"Cache-Control": "no-cache"} if path in ("sw.js", "manifest.webmanifest") else None)
        return FileResponse(DIST / "index.html")
