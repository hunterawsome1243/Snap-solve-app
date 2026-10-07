"""SnapSolve backend: holds the Anthropic API key, talks to Claude, verifies with SymPy."""
import base64
import json
import os
import re
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from verify import verify

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5")
ALLOWED_MEDIA = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024

app = FastAPI(title="SnapSolve")
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


def ask_claude(system: str, content, max_tokens: int = 2500) -> dict:
    try:
        msg = client().messages.create(
            model=MODEL,
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
Reply with ONLY a JSON object: {"readable": boolean, "latex": string, "message": string}

Rules:
- Transcribe exactly what is written. Never solve it, never "fix" it, never guess.
- If the image is blurry, too dark, cut off, has no math, or you are not confident about the
  symbols, set "readable": false, "latex": "" and write a short, friendly "message" saying what
  is wrong and asking the user to retake the photo (e.g. better light, closer, hold steady).
- If the problem has several lines (e.g. a system of equations), join them with \\\\ inside
  \\begin{cases} ... \\end{cases}.
- Use \\times for multiplication signs and the letter x for the variable. Use \\frac, \\sqrt, ^, _,
  \\int, \\frac{d}{dx}, \\sin, \\log, \\ln as appropriate.
- If readable, "message" is an empty string, or a brief note if one symbol is ambiguous."""


class ReadRequest(BaseModel):
    image: str = Field(description="base64 image data (no data: prefix)")
    media_type: str = "image/jpeg"


@app.post("/api/read")
def read_image(req: ReadRequest):
    if req.media_type not in ALLOWED_MEDIA:
        raise HTTPException(400, "Unsupported image type.")
    try:
        raw = base64.b64decode(req.image, validate=True)
    except Exception:
        raise HTTPException(400, "Image data was not valid base64.")
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Image is too large. Try cropping it more.")
    data = ask_claude(
        READ_SYSTEM,
        [
            {"type": "image", "source": {"type": "base64", "media_type": req.media_type, "data": req.image}},
            {"type": "text", "text": "Transcribe the math in this image."},
        ],
        max_tokens=800,
    )
    latex = str(data.get("latex") or "").strip()
    readable = bool(data.get("readable")) and bool(latex)
    message = str(data.get("message") or "").strip()
    if not readable and not message:
        message = "I couldn't read that. Please retake the photo with good light, held steady and close."
    return {"readable": readable, "latex": latex if readable else "", "message": message}


# --------------------------------------------------------------------- solve

SOLVE_SYSTEM = """You are a careful math tutor. Solve the problem given in LaTeX.
Reply with ONLY one JSON object (no prose, no code fences) with exactly these keys:

{
 "answer_latex": "final answer in LaTeX, e.g. x = 2 \\\\text{ or } x = 3",
 "steps": [{"latex": "one line of work", "explain": "one short sentence on what was done"}],
 "check": {"steps": [{"latex": "...", "explain": "..."}], "conclusion": "one sentence"},
 "problem": { ... machine-readable version of the problem, see below ... },
 "answer": { ... machine-readable version of your final answer, see below ... }
}

"problem" / "answer" are checked by a computer algebra system (SymPy), so write every expression
as a SymPy-parsable string: use ** or ^ for powers, * for multiplication, sqrt(), log(x) for the
natural log and log(x, 10) for base 10, ln() is allowed, sin/cos/tan/asin/acos/atan, pi, E.
Trig is in radians; if the problem uses degrees write sin(30*pi/180).
Pick ONE shape:
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
 - anything else (e.g. a word problem): problem {"kind": "other"}  answer {"value": "..."}

Writing the work:
- "steps": one line per step, in order; each "latex" is a single clean line of math (no prose inside
  except \\text{}); each "explain" is one short sentence.
- "check": plug the answer back into the ORIGINAL problem and show the arithmetic so the user can
  see it works (for derivatives/integrals, differentiate back / compare to a quick sanity value).
- Never put markdown or $ delimiters in any field."""

SIMPLE_ADDENDUM = """
EXPLAIN LIKE I'M 12: write every "explain" and the check "conclusion" in very simple, friendly
language a 12-year-old would understand. Short words, tiny sentences, a quick everyday analogy when
it helps. The math lines stay the same; only the wording changes."""


class SolveRequest(BaseModel):
    latex: str = Field(min_length=1, max_length=2000)
    simple: bool = False


def _clean_steps(raw) -> list[dict]:
    out = []
    for s in raw or []:
        if isinstance(s, dict) and s.get("latex"):
            out.append({"latex": str(s["latex"]), "explain": str(s.get("explain") or "")})
    return out


@app.post("/api/solve")
def solve(req: SolveRequest):
    system = SOLVE_SYSTEM + (SIMPLE_ADDENDUM if req.simple else "")
    data = ask_claude(system, f"Problem (LaTeX):\n{req.latex}", max_tokens=4000)
    steps = _clean_steps(data.get("steps"))
    answer_latex = str(data.get("answer_latex") or "").strip()
    if not steps or not answer_latex:
        raise HTTPException(502, "The AI didn't return a complete solution. Please try again.")
    check = data.get("check") if isinstance(data.get("check"), dict) else {}
    problem = data.get("problem") if isinstance(data.get("problem"), dict) else {}
    answer = data.get("answer") if isinstance(data.get("answer"), dict) else {}
    verification = verify(problem, answer)
    return {
        "answer_latex": answer_latex,
        "steps": steps,
        "check": {
            "steps": _clean_steps(check.get("steps")),
            "conclusion": str(check.get("conclusion") or ""),
        },
        "verification": verification,
        "kind": problem.get("kind", "other"),
    }


# ------------------------------------------------------------------ practice

PRACTICE_SYSTEM = """You write practice problems for a math student. Given a problem in LaTeX,
write ONE new problem of the same type and similar difficulty with different numbers. It must have a
clean, well-defined answer. Reply with ONLY JSON: {"latex": "the new problem in LaTeX"}"""


class PracticeRequest(BaseModel):
    latex: str = Field(min_length=1, max_length=2000)


@app.post("/api/practice")
def practice(req: PracticeRequest):
    data = ask_claude(PRACTICE_SYSTEM, f"Original problem:\n{req.latex}", max_tokens=400)
    latex = str(data.get("latex") or "").strip()
    if not latex:
        raise HTTPException(502, "Couldn't make a practice problem. Please try again.")
    return {"latex": latex}


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
            return FileResponse(f)
        return FileResponse(DIST / "index.html")
