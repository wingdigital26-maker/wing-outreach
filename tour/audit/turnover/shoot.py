"""Back-test page shots, desktop + phone (10-23).  python -E tour/audit/turnover/shoot.py"""
import asyncio, os
from playwright.async_api import async_playwright
OUT = os.path.dirname(os.path.abspath(__file__))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, w, h, mob in (("desk", 1280, 900, False), ("phone", 390, 844, True)):
            ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mob else 1, is_mobile=mob)
            pg = await ctx.new_page(); await pg.goto("http://127.0.0.1:4930/tour/audit/turnover/index.html", wait_until="load")
            await pg.screenshot(path=os.path.join(OUT, f"backtest-{name}.png"), full_page=True)
            print(name, await pg.evaluate("document.documentElement.scrollWidth"), "wide"); await ctx.close()
        await b.close()
asyncio.run(main())
