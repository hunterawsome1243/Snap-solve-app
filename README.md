# SnapSolve

Snap a photo of a handwritten math problem → crop → Claude reads it as LaTeX → you can fix it →
step-by-step solution with a "Check" section. Every answer is re-checked with **SymPy**; if the two
disagree you'll see **"Double-check this one."**

Frontend: React + Vite + KaTeX. Backend: Python (FastAPI) — it holds your API key, so the key never
reaches the browser.

## 1. Paste your API key

Open the file **`.env`** in the project root (the same folder as this README; if it's missing, copy
`.env.example` to `.env`) and put your key after the `=`:

```
ANTHROPIC_API_KEY=sk-ant-...your key here...
```

Get a key at <https://console.anthropic.com/settings/keys>. `.env` is git-ignored. Restart the server
after changing it.

## 2. Run it on your computer

You need Python 3.10+ and Node 18+.

```bash
npm run setup   # one time: installs Python + Node dependencies
npm run dev     # starts the API (port 8000) and the web app (port 5173)
```

Open <http://localhost:5173>.

## 3. Open it on your phone (same Wi-Fi)

1. Connect the phone to the same Wi-Fi as your computer.
2. Find your computer's local IP:
   - macOS: `ipconfig getifaddr en0`
   - Windows: `ipconfig` → "IPv4 Address"
   - Linux: `hostname -I`
3. On the phone, open `http://<that-ip>:5173` (e.g. `http://192.168.1.23:5173`).
4. Tap **Snap Equation** — it opens the camera. (The file-input camera works over plain http, so no
   HTTPS setup is needed.)

If it won't load, allow Node/Python through your computer's firewall, and make sure the Wi-Fi doesn't
have "client isolation" on (common on guest networks).

Optional single-server mode: `npm start` builds the frontend and serves everything from port 8000.

## Tests

`npm test` — checks the SymPy verifier (arithmetic, quadratics incl. missing roots, systems, trig,
derivatives, integrals) and the API behaviour with a stubbed AI.

## How verification works

Claude returns the worked solution plus a machine-readable version of the problem and its answer.
The backend re-solves the problem with SymPy (substituting answers back in, checking all roots are
present, differentiating antiderivatives, etc.). Mismatch → warning banner. Problem types SymPy can't
check (e.g. word problems) are labelled "couldn't be verified".

Note: SymPy checks the problem *as Claude restated it*, so always glance at the recognised equation
before solving. If the photo is blurry or unreadable, the app asks you to retake it instead of guessing.

## Snap Buy

The **Snap Buy** tab: photograph a product, confirm or edit what Claude thinks it is, and get the best
current offers. The backend asks Claude to search the web (Anthropic's server-side web search tool), then
keeps only offers whose link actually appeared in the search results and sorts them by price. It then
**recommends one store** automatically: each offer is scored on price versus the cheapest, in stock or not,
new versus used or refurbished, and whether the seller is well known, so a cheap out-of-stock or used listing
won't beat a slightly pricier new one you can actually buy. If no priced offers are found, it recommends the
store most likely to carry that kind of item (labelled as not confirmed in stock). It also gives store-search links (Google Shopping sorted low to high,
Amazon, eBay, plus Walmart, Best Buy and Target in the US).

- Web search must be enabled for your Anthropic organization (Console settings), and each Snap Buy search
  uses web-search calls, which are billed separately.
- Prices are a snapshot from a web search, not a live feed. The page tells you to confirm on the store.
- The single-file artifact in `artifact/` can't search the web, so its Snap Buy identifies the product and
  opens store searches instead of showing prices.

## Features

Camera / upload / drag-and-drop · crop tool · editable KaTeX preview with symbol shortcuts ·
"Explain like I'm 12" toggle · "Practice a similar one" · on-device history (localStorage) · dark mode.
