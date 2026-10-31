"""Storms -> neighbourhood -> home -> record (10-22). Screenshots to after/storm-*.png"""
import asyncio, os
from playwright.async_api import async_playwright
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "after")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        pg = await (await b.new_context(viewport={"width": 1440, "height": 900})).new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        await pg.goto("http://127.0.0.1:4930/tour/product.html?dev=1&nointro=1&noprefetch=1&cloud=0#/storm", wait_until="load"); await pg.wait_for_timeout(9000)
        fr = next(f for f in pg.frames if "storm-theater" in f.url)
        await fr.get_by_text("Richardson Heights").first.click(); await pg.wait_for_timeout(4000)
        await pg.screenshot(path=os.path.join(OUT, "storm-1-neighbourhood.png"))
        t = await fr.evaluate("document.body.innerText"); i = t.find("Richardson Heights"); print("after pick:", t[i:i + 700].replace("\n", " | ").encode("ascii", "replace").decode())
        await fr.get_by_text("504 Hyde Park Dr").first.click(); await pg.wait_for_timeout(3000)
        await pg.screenshot(path=os.path.join(OUT, "storm-2-home.png"))
        print("hash:", await pg.evaluate("location.hash"))
        t = await fr.evaluate("document.body.innerText"); i = t.find("504 Hyde Park"); print("home pick:", t[i:i + 500].replace(chr(10), " | ").encode("ascii", "replace").decode())
        print("errors", errs); await b.close()
asyncio.run(main())
