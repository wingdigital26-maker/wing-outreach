"""Turnover Radar tab on Today (phase 2): open Today, click Radar, open the first street, screenshot; desktop + phone.
  python -E tour/audit/repday/radar_check.py   -> after/radar-*.png"""
import asyncio, os
from playwright.async_api import async_playwright
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "after")
Q = "http://127.0.0.1:4930/tour/product.html?dev=1&nointro=1&noprefetch=1&cloud=0#/daily"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        for name, w, h, mob in (("desk", 1440, 900, False), ("phone", 390, 844, True)):
            ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mob else 1, is_mobile=mob, has_touch=mob)
            pg = await ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
            await pg.goto(Q, wait_until="load", timeout=90000); await pg.wait_for_timeout(12000)
            fr = next(f for f in pg.frames if "deck" in f.url)
            if mob and await fr.is_visible("#openList"): await fr.click("#openList"); await pg.wait_for_timeout(800)
            await fr.click("#tabRadar"); await pg.wait_for_timeout(2500)
            await pg.screenshot(path=os.path.join(OUT, f"radar-list-{name}.png"))
            await fr.locator(".rd-sh").first.click(); await pg.wait_for_timeout(3000)
            await pg.screenshot(path=os.path.join(OUT, f"radar-street-{name}.png"))
            print(name, (await fr.inner_text("#paneRadar"))[:400].replace(chr(10), " | ").encode("ascii", "replace").decode())
            await fr.locator(".rd-home").first.click(); await pg.wait_for_timeout(4000)
            print(name, "after home click:", await pg.evaluate("location.hash"), "errors", errs); await ctx.close()
        await b.close()
asyncio.run(main())
