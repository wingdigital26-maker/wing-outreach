"""Mid-advance frame: click Skip at 1440 and grab at ~180ms."""
import sys, asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=d3d11","--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width":1440,"height":900})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto("http://localhost:4880/c4-command-deck/deck.html"); await pg.wait_for_timeout(3000)
        await pg.click('.card[data-d="0"] [data-a="skip"]'); await pg.wait_for_timeout(170)
        await pg.screenshot(path=sys.argv[1]+"/4-mid-advance.png")
        await pg.wait_for_timeout(1200); await pg.screenshot(path=sys.argv[1]+"/4-after-advance.png")
        print("errors:", errs); await b.close()
asyncio.run(main())
