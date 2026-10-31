"""Today Radar -> 'See every re-roof on the Storms map': the dots come on, the saved choice is untouched (10-23).
  SIZES=desk|phone python -E tour/audit/repday/radar_to_storm.py"""
import asyncio, os
from playwright.async_api import async_playwright
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "after")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        for name, w, h, mob in [s for s in (("desk", 1440, 900, False), ("phone", 390, 844, True)) if s[0] in os.environ.get("SIZES", "desk")]:
            ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mob else 1, is_mobile=mob, has_touch=mob)
            pg = await ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
            await pg.goto("http://127.0.0.1:4930/tour/product.html?dev=1&nointro=1&noprefetch=1&cloud=0#/daily", wait_until="load", timeout=90000); await pg.wait_for_timeout(12000)
            fr = next(f for f in pg.frames if "deck" in f.url)
            if mob and await fr.is_visible("#openList"): await fr.click("#openList"); await pg.wait_for_timeout(800)
            await fr.click("#tabRadar"); await pg.wait_for_timeout(2500); await fr.click(".rd-map"); await pg.wait_for_timeout(16000)
            sf = next(f for f in pg.frames if "storm-theater" in f.url)
            print(name, "hash", await pg.evaluate("location.hash"), "pressed", await sf.get_attribute("#rdBtn", "aria-pressed"), "saved", await sf.evaluate("localStorage.getItem('rc.rdMap')"), "errors", errs)
            await pg.screenshot(path=os.path.join(OUT, f"radar-to-storm-{name}.png")); await ctx.close()
        await b.close()
asyncio.run(main())
