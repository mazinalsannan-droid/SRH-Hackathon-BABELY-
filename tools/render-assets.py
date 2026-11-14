"""Renders the background images and app icons with headless Chrome (Playwright).

Usage:  python3 tools/render-assets.py
Needs:  pip install playwright && playwright install chromium
        (or set CHROME=/path/to/chrome to use an installed Chrome)
"""
import asyncio, os, pathlib
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PUB = ROOT / "public" / "assets"
CHROME = os.environ.get("CHROME")

BACKGROUNDS = [("bg-portrait.jpg", 1200, 2000), ("bg-wide.jpg", 2400, 1350)]
ICONS = [("icon-192.png", 192, False), ("icon-512.png", 512, False), ("icon-maskable-512.png", 512, True), ("apple-touch-icon.png", 180, True)]


async def main():
    async with async_playwright() as p:
        kw = {"executable_path": CHROME, "args": ["--no-sandbox"]} if CHROME else {}
        b = await p.chromium.launch(**kw)
        for name, w, h in BACKGROUNDS:
            pg = await b.new_page(viewport={"width": w, "height": h})
            await pg.goto((ROOT / "tools" / "make-background.html").as_uri() + f"?w={w}&h={h}&seed=7")
            await pg.wait_for_function("document.title === 'done'")
            await pg.screenshot(path=str(PUB / name), type="jpeg", quality=82)
            await pg.close()
            print("wrote", name)
        svg = (PUB / "mascot.svg").read_text()
        for name, size, padded in ICONS:
            pg = await b.new_page(viewport={"width": size, "height": size})
            pad = int(size * 0.12) if padded else 0
            html = f"""<html><body style="margin:0;width:{size}px;height:{size}px;display:grid;place-items:center;
              background:radial-gradient(circle at 50% 30%, #3B2A1A, #1A120B)">
              <div style="width:{size - 2 * pad}px;height:{size - 2 * pad}px">{svg.replace('<svg ', '<svg width="100%" height="100%" ', 1)}</div></body></html>"""
            await pg.set_content(html)
            await pg.screenshot(path=str(PUB / "icons" / name), omit_background=False)
            await pg.close()
            print("wrote", name)
        await b.close()

asyncio.run(main())
