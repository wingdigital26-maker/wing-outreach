"""Storms at phone width (10-23): is the map and the bottom sheet filled after a longer wait?"""
import asyncio, os
from playwright.async_api import async_playwright
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "phone-after")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = await ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        await pg.goto("http://127.0.0.1:4930/tour/product.html?dev=1&nointro=1&noprefetch=1&cloud=0#/storm", wait_until="load")
        for t in (10, 20):
            await pg.wait_for_timeout(10000)
            fr = next((f for f in pg.frames if "storm-theater" in f.url), None)
            txt = await fr.evaluate("document.body.innerText") if fr else ""
            print(t, "s:", txt[:300].replace(chr(10), " | ").encode("ascii", "replace").decode())
            await pg.screenshot(path=os.path.join(OUT, f"storms-phone-{t}s.png"))
        print("errors", errs); await b.close()
asyncio.run(main())
