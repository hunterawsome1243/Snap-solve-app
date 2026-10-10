"""Build artifact/hunter-scan.html: inlines KaTeX (CSS with fonts as data URIs, plus JS).

Run from the repo root after `npm install --prefix frontend`:  python artifact/build.py
The viewer's CSP only allows stylesheets from Google Fonts, so KaTeX's CSS and fonts must be inlined.
"""
import base64
import re
from pathlib import Path

root = Path(__file__).resolve().parent
dist = root.parent / "frontend" / "node_modules" / "katex" / "dist"

css = (dist / "katex.min.css").read_text()


def font(m):
    name = m.group(1)
    data = base64.b64encode((dist / "fonts" / f"{name}.woff2").read_bytes()).decode()
    return f"url(data:font/woff2;base64,{data}) format('woff2')"


# keep only the woff2 source of each @font-face (drop woff/ttf fallbacks)
css = re.sub(
    r"url\(fonts/([A-Za-z0-9_-]+)\.woff2\) format\(\"woff2\"\),url\(fonts/[^)]+\.woff\) format\(\"woff\"\),url\(fonts/[^)]+\.ttf\) format\(\"truetype\"\)",
    font,
    css,
)
assert "fonts/" not in css, "unreplaced font url in KaTeX css"

js = (dist / "katex.min.js").read_text().replace("</script>", "<\\/script>")
src = (root / "hunter-scan.src.html").read_text()
# the scanner (page detection, perspective flattening, shadow removal) is one tested module shared with the React app
scanner = (root.parent / "frontend" / "src" / "lib" / "scanner.js").read_text()
scanner = re.sub(r"^export ", "", scanner, flags=re.M)
src = src.replace("/*SCANNER_JS*/", scanner)
# plant helpers (watering schedule, cleaning the model's answer) are shared the same way; their one import is replaced by a constant in the page
plants = (root.parent / "frontend" / "src" / "lib" / "plants.js").read_text()
plants = re.sub(r"^import .*\n", "", plants, flags=re.M)
plants = re.sub(r"^export ", "", plants, flags=re.M)
src = src.replace("/*PLANTS_JS*/", plants)
out = src.replace("/*KATEX_CSS*/", css).replace("/*KATEX_JS*/", js)
(root / "hunter-scan.html").write_text(out)
print(f"wrote {root / 'hunter-scan.html'} ({len(out) / 1024:.0f} KB)")
