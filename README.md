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

## Host it on Render and install it on your iPhone

This puts the whole app (website + API) on a public HTTPS address, so the live camera works on your phone and your
computer doesn't need to be on.

1. Push this repository to GitHub (it already is).
2. On <https://render.com>: **New > Blueprint**, choose this repository, and Render reads `render.yaml`.
3. When asked, paste your **`ANTHROPIC_API_KEY`**. Render makes a random **`ACCESS_CODE`** for you automatically.
4. Wait for the first build (a few minutes), then open the `https://hunter-scan-xxxx.onrender.com` address it gives you.
5. The first time you scan, the app asks for the access code once. Read it in the Render dashboard under
   **Environment > ACCESS_CODE**. It is remembered on that device.
6. **iPhone:** open the address in Safari, tap **Share**, then **Add to Home Screen**. It opens full screen with its own icon.
   **Android/Chrome:** menu, then **Install app**.

Notes:
- The access code and `RATE_PER_HOUR` (60 AI calls per visitor per hour, in `render.yaml`) are there because anyone who finds a
  public address could otherwise spend your Anthropic credits. Locally both are off.
- Render's free plan sleeps after 15 minutes without visits, so the first open after a break takes about a minute. The
  `starter` plan keeps it awake.
- Once opened, the app itself loads offline (history and the screens work), but reading and solving need a connection.
- After a new deploy, installed copies pick up the update the next time they are opened online.

## Live scanning (phone)

Tap **Snap Equation** and a viewfinder opens. It outlines the page it finds, flattens the perspective, evens out
shadows, and takes the photo by itself once the page is steady and in focus (or tap the shutter). A photo you
upload or take with your camera app gets the same cleanup, and the crop screen lets you flip between
**Flattened and cleaned** and **Original**. It works best with a lighter page on a darker surface; if no page is
found it keeps the whole frame and only fixes the lighting.

Phones only allow the live camera on a secure connection. Over plain `http://<your-ip>:5173` the app automatically
uses your camera app instead (still cleaned up). For the full viewfinder on your phone, run the HTTPS version:

```bash
npm run dev:https
```

and open `https://<your-ip>:5173`. The certificate is self-signed, so the phone shows a warning once (iPhone: Show
Details, then visit this website). `localhost` on your computer is already secure and needs nothing.

The page-finding code (`frontend/src/lib/scanner.js`) is plain JavaScript with no OpenCV, shared by the React app
and the phone artifact. The artifact can't open a live camera (artifacts have no camera access), so it cleans up
photos you take or upload.

## Tests and CI

```bash
npm test            # backend tests (SymPy checks, API) + frontend unit tests (scanner, tokens, graphs, ...)
npm run test:e2e    # browser tests (Playwright) for the React app and the phone artifact
npm run test:all    # everything
```

The browser tests use a fake backend, a fake Claude for the artifact, and a fake camera that plays a video of a
skewed sheet of paper, so they need no API key and no network. The first run needs
`npx playwright install chromium` (inside `frontend/`).

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and on pushes to `main`: backend tests, frontend unit tests
and build, the browser tests, and a check that `artifact/hunter-scan.html` is up to date with its source (rebuild it
with `python artifact/build.py` after editing `artifact/hunter-scan.src.html` or `frontend/src/lib/scanner.js`).

## Watching and trimming API cost

Every call to Claude prints one line to the server log (Render: **Logs**):

```
usage {"endpoint": "solve", "model": "claude-sonnet-5-5", "input": 412, "output": 1830, "thinking": 900, "cache_read": 0, "cache_write": 0, "searches": 0, "effort": null}
```

Price a call as `input x input rate + output x output rate` (thinking counts as output) plus `searches x $10 / 1,000`;
rates are on <https://platform.claude.com/docs/en/about-claude/pricing>. The endpoints are `read`, `solve`,
`formulate`, `practice`, `identify`, `plant` and `prices` (Snap Buy; this is the only one that uses web search).

Two optional settings let you trade cost for thoroughness without touching code (set them in `.env` or in Render under
**Environment**; unset means no change):

- `EFFORT` or `EFFORT_<NAME>` (for example `EFFORT_IDENTIFY=low`): how hard the model thinks. Lower effort means fewer
  output tokens. Change one endpoint at a time and compare the `output` and `thinking` numbers and the answers.
- `WEB_SEARCH_MAX_USES` (default 5): searches allowed per Snap Buy price check.

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
- **Live scanning**: a viewfinder outlines the page, flattens it, removes shadows, and takes the photo when it is
  steady and sharp (see above). Uploaded photos get the same cleanup, with the original one tap away.
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
- "Explain like I'm 12" toggle, history on the device, and **themes in four categories**. The theme picker shows just the
  categories (the one you are using says so); tap one for a wider view of its themes.
  **Everyday** (Match device, Light, Dark), **Nature** (Ocean, Forest, Sunset), **Fun** (Science, with a spinning atom,
  a sweeping laser and drifting periodic-table tiles; Tropical, with a swaying pineapple and falling fruit) and
  **Holidays**, in the order the year brings them: New Year's, Lunar New Year, Valentine's Day, St. Patrick's Day, Easter,
  4th of July, Halloween (falling pumpkins), Thanksgiving and Christmas. Each holiday theme has its own colours, a logo
  emoji, and emoji that fall or float up the screen. They are defined once in `frontend/src/lib/themes.js` (their CSS is
  generated from it, and a test checks every one for readable contrast), and the phone artifact uses the same
  definitions. All motion respects "reduce motion".

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

**Extras tab: Plant Scan.** Snap a leaf or the whole plant (optionally add what looks wrong, like "yellow leaves") and
Claude tells you what it is with an honest confidence ("Pretty sure", "Likely" or "Best guess", plus up to three
look-alikes), whether it looks healthy, what is wrong and what to do, how to care for it, and whether it is toxic to
pets. Save it to **My Plants** to get a watering schedule: it shows what is overdue, and "Watered" restarts the count.
Saved plants live on the device. It never says a wild plant or mushroom is safe to eat. Endpoint: `POST /api/plant/scan`.
The phone artifact has the same tab: it asks Claude through your account, so there is no server, and it cleans the answer with the same shared code (`frontend/src/lib/plants.js`).

**The artifact version** (`artifact/`) has the same Solve features, plus barcode scanning and shared history. Its
Snap Buy cannot search the web, so filters, price tracking and stale-price warnings do not apply there.
