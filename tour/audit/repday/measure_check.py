"""LiDAR measurements view (Jack 10-23): click the chip on the record, screenshot the tab, desktop + phone.
  python -E tour/audit/repday/measure_check.py <row> ..."""
import asyncio, os, sys
from playwright.async_api import async_playwright
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "after")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        for row in sys.argv[1:]:
            for name, w, h, mob in (("desk", 1440, 900, False), ("phone", 390, 844, True)):
                ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mob else 1, is_mobile=mob, has_touch=mob)
                pg = await ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
                await pg.goto(f"http://127.0.0.1:4930/tour/product.html?dev=1&nointro=1&noprefetch=1&cloud=0#/crm/home/m{row}", wait_until="load"); await pg.wait_for_timeout(9000)
                fr = next(f for f in pg.frames if "c5-home" in f.url)
                await fr.click("#bMeasure"); await pg.wait_for_timeout(5000)
                el = await fr.query_selector("#report")
                txt = (await el.inner_text())[:300].replace(chr(10), " | ") if el else "-"
                if el: await el.screenshot(path=os.path.join(OUT, f"measure-{row}-{name}.png"))
                print(row, name, txt.encode("ascii", "replace").decode(), errs); await ctx.close()
        await b.close()
asyncio.run(main())
