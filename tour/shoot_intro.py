import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=["--use-angle=d3d11","--enable-gpu","--ignore-gpu-blocklist"],headless=True)
        pg=await b.new_page(viewport={"width":1440,"height":900})
        pg.on("pageerror", lambda e: print("ERR",e))
        await pg.goto("http://localhost:4880/1a-storm-intro.html")
        await pg.wait_for_function("window.__revealT && window.__map",timeout=60000)
        for ms in (200,600,1000,1500,2200):
            await pg.wait_for_function(f"performance.now()-window.__revealT>{ms}")
            await pg.screenshot(path=f"shots/_1a_{ms}.png")
        await b.close()
asyncio.run(main())
