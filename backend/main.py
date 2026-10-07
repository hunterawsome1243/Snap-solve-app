"""SnapSolve backend: holds the Anthropic API key, talks to Claude, verifies with SymPy."""
import base64
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import quote_plus, urlparse

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


def check_image(req: "ReadRequest") -> None:
    if req.media_type not in ALLOWED_MEDIA:
        raise HTTPException(400, "Unsupported image type.")
    try:
        raw = base64.b64decode(req.image, validate=True)
    except Exception:
        raise HTTPException(400, "Image data was not valid base64.")
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Image is too large. Try cropping it more.")


@app.post("/api/read")
def read_image(req: ReadRequest):
    check_image(req)
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
- If you cannot find reliable prices, return an empty offers list and say why in "summary".
Reply with ONLY one JSON object: {"offers":[{"retailer":string,"price":number,"currency":string,
"url":string,"condition":string,"note":string}],"summary":string}"""

WEB_SEARCH_TYPES = ("web_search_20260209", "web_search_20250305")
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


def filter_offers(offers, allowed_urls: set[str]) -> list[dict]:
    """Keep only offers whose link really came from a search result, with a sane price. Cheapest first."""
    allowed = {_url_key(u) for u in allowed_urls}
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
                "note": str(o.get("note") or "").strip()[:60],
            }
        )
    out.sort(key=lambda o: o["price"])
    # best = cheapest new item (or cheapest anything when nothing is marked new)
    best = next((o for o in out if o["condition"] in ("new", "unknown")), out[0] if out else None)
    for o in out:
        o["best"] = o is best
    return out


def search_web(query: str, country: str) -> tuple[dict, set[str]]:
    """Ask Claude to search the web. Returns (parsed JSON answer, set of URLs that appeared in results)."""
    last_err: Exception | None = None
    for tool_type in WEB_SEARCH_TYPES:
        tool = {"type": tool_type, "name": "web_search", "max_uses": 5,
                "user_location": {"type": "approximate", "country": country}}
        messages = [{"role": "user", "content": f"Find the best current prices for: {query}"}]
        urls: set[str] = set()
        try:
            for _ in range(4):  # a long search can pause; resume it
                msg = client().messages.create(model=MODEL, max_tokens=4000, system=OFFERS_SYSTEM, tools=[tool], messages=messages)
                for b in msg.content:
                    if b.type == "web_search_tool_result" and isinstance(b.content, list):
                        urls.update(r.url for r in b.content if getattr(r, "url", None))
                    for c in getattr(b, "citations", None) or []:
                        if getattr(c, "url", None):
                            urls.add(c.url)
                if msg.stop_reason != "pause_turn":
                    break
                messages = messages + [{"role": "assistant", "content": [b.model_dump(exclude_none=True) for b in msg.content]}]
            text = "".join(b.text for b in msg.content if b.type == "text")
            return parse_json(text), urls
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


@app.post("/api/buy/prices")
def buy_prices(req: PricesRequest):
    country = req.country.upper()
    data, urls = search_web(req.query.strip(), country)
    offers = filter_offers(data.get("offers"), urls)
    return {
        "query": req.query.strip(),
        "offers": offers,
        "summary": str(data.get("summary") or "").strip(),
        "compare": compare_links(req.query.strip(), country),
        "checked_at": int(time.time()),
    }


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
