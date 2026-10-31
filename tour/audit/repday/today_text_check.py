"""Today: Text on a home with no phone -> the dialog's 'add it on the home's record' opens that home (10-22)."""
import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        pg = await (await b.new_context(viewport={"width": 1440, "height": 900})).new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        await pg.goto("http://127.0.0.1:4930/tour/product.html?dev=1&nointro=1&noprefetch=1&cloud=0#/daily", wait_until="load"); await pg.wait_for_timeout(8000)
        fr = next(f for f in pg.frames if "deck" in f.url)
        await fr.locator('.card [data-a="text"]').first.click(); await pg.wait_for_timeout(600)
        print("dialog:", (await fr.locator("dialog[open]").first.inner_text())[:260].replace("\n", " | "))
        await fr.locator("[data-openhome]").first.click(); await pg.wait_for_timeout(5000)
        print("hash after:", await pg.evaluate("location.hash"), "errors", errs); await b.close()
asyncio.run(main())
