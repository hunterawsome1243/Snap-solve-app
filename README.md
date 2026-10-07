# Hunter Scan

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

**Solve**
- Photograph, crop, and review the recognized equation. **Tap any symbol to fix it**: symbols the model was unsure
  about are marked ("Is S really 5 or s?"), and every symbol offers look-alike suggestions (5/S, 1/l, x/×, 0/O, ...).
- **Several problems in one photo** are listed separately; solve one at a time or all at once.
- **Word problems** are turned into an equation, shown next to the story with what each variable means, and
  you confirm or edit it before solving. The answer comes back in words with units.
- **Every line of the work is checked**, not just the final answer. A calculator tests each line it can
  (marked "checked", or flagged "A calculator disagrees with this line"), so a wrong middle step that still lands on
  the right answer gets caught.
- **Graphs** of equations, systems, functions, derivatives and definite integrals, with the solution marked.
  The curves and points are re-evaluated in the browser, so a point is drawn where the curve really is.
- **Save as PDF or image** to share or print (the share sheet on phones).
- **Practice** with Easy / Medium / Hard and a topic, a hint on demand, and a streak. Answers are graded by
  SymPy, not by the model; a problem is only used if its stored answer agrees with SymPy.
- "Explain like I'm 12" toggle, history on the device, and themes (Light, Dark, Halloween with falling
  pumpkins, Ocean, Forest, Sunset, and **Science**: a lab-blue blueprint grid, a spinning atom logo, a laser that
  sweeps across the camera button, and periodic-table tiles drifting up the screen). All motion respects "reduce motion".

**Snap Buy** (see above)
- **Barcode scanning** (EAN/UPC from a photo; built-in detector where available, ZXing elsewhere).
- **Filters**: new only, free shipping, max price, and a preferred store (a soft preference that wins close calls).
  Filtering re-ranks the offers you already have, with no extra search.
- **Price tracking**: save a product, re-check it, and see the change since you started. Optional target price.
  Alerts show while the app is open (plus a browser notification if you allow it). Background alerts would need
  a server, so a price can change between visits without a ping.
- **Stale-price honesty**: every result shows when it was checked, each offer shows how old the page was when the
  search saw it, and anything over a day old gets a warning with a one-tap re-check.
- **History** shows math and Snap Buy side by side.

**The artifact version** (`artifact/`) has the same Solve features, plus barcode scanning and shared history. Its
Snap Buy cannot search the web, so filters, price tracking and stale-price warnings do not apply there.
