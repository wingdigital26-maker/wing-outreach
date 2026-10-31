"""Capture every frame for a round: python shoot_all.py <round-dir>"""
import sys, asyncio, os, shutil
from playwright.async_api import async_playwright
BASE = "http://localhost:4880/c4-command-deck/"
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
SHOTS = [
    ("4-command-deck.png", "deck.html", 1440, 900, 1, False),
    ("4-1280.png", "deck.html", 1280, 800, 1, False),
    ("4-1366.png", "deck.html", 1366, 768, 1, False),
    ("4-phone.png", "deck.html", 390, 844, 2, True),
    ("4-phone-430.png", "deck.html", 430, 932, 2, True),
    ("4-phone-route.png", "deck.html?sheet=route", 390, 844, 2, True),
    ("4-phone-roof.png", "deck.html?sheet=roof", 390, 844, 2, True),
    ("5-crm-record.png", "record.html", 1440, 900, 1, False),
    ("5-record-hover.png", "record.html?hover=S", 1440, 900, 1, False),
    ("5-record-edges.png", "record.html?mode=edges", 1440, 900, 1, False),
    ("5-record-hail.png", "record.html?hail=1&mode=planes", 1440, 900, 1, False),
    ("5-phone-record.png", "record.html", 390, 844, 2, True),
    ("5-phone-plane.png", "record.html?plane=N", 390, 844, 2, True),
    ("5-phone-430.png", "record.html", 430, 932, 2, True),
    ("6-personalized.png", "personalized.html", 2400, 900, 1, False),
]
only = sys.argv[2:]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        for name, url, w, h, dpr, mob in SHOTS:
            if only and not any(o in name for o in only): continue
            ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=dpr, is_mobile=mob, has_touch=mob)
            pg = await ctx.new_page(); msgs = []
            await pg.route("**/formsubmit.co/**", lambda r: r.abort())
            pg.on("console", lambda m: msgs.append(m.type + ": " + m.text) if m.type == "error" else None)
            pg.on("pageerror", lambda e: msgs.append("PAGEERR: " + str(e)))
            await pg.goto(BASE + url, wait_until="load", timeout=60000)
            try: await pg.wait_for_function("window.__mapReady===true || window.__ready===true", timeout=30000)
            except Exception: msgs.append("READY TIMEOUT")
            await pg.wait_for_timeout(1800)
            sw = await pg.evaluate("document.documentElement.scrollWidth > window.innerWidth")
            await pg.screenshot(path=os.path.join(out, name))
            print(name, "hscroll!" if sw else "", *msgs[:4])
            await ctx.close()
        await b.close()
asyncio.run(main())
for f in os.listdir(out):
    if f.endswith(".png"): shutil.copy(os.path.join(out, f), f"shots/{f}")
