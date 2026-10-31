"""Radar tab load probe (fix batch 10-24): phone, open Today, open Radar, time turnover*.json requests and the list appearing.
  python -E tour/audit/visual-check-1023/fix2/radar_probe.py [phone|desk]"""
import asyncio, sys, time
from playwright.async_api import async_playwright
U = "http://127.0.0.1:4930/tour/product.html?dev=1&nointro=1&noprefetch=1&cloud=0#/daily"
async def main():
    mob = (sys.argv[1] if len(sys.argv) > 1 else "phone") == "phone"
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844} if mob else {"width": 1440, "height": 900}, is_mobile=mob, has_touch=mob)
        pg = await ctx.new_page(); t0 = time.time(); log = []
        pg.on("request", lambda r: log.append((round(time.time() - t0, 2), "req", r.url.split("/tour/")[-1][:70])) if "turnover" in r.url else None)
        pg.on("requestfinished", lambda r: log.append((round(time.time() - t0, 2), "done", r.url.split("/tour/")[-1][:70])) if "turnover" in r.url else None)
        await pg.goto(U, wait_until="load", timeout=90000); print("load", round(time.time() - t0, 2))
        await pg.wait_for_timeout(9000)
        fr = next(f for f in pg.frames if "deck" in f.url)
        if mob and await fr.is_visible("#openList"): await fr.click("#openList"); await pg.wait_for_timeout(600)
        t1 = time.time(); await fr.click("#tabRadar"); print("radar click at", round(t1 - t0, 2))
        for i in range(60):
            if await fr.locator(".rd-sh").count(): print("list shown after", round(time.time() - t1, 2), "s"); break
            await pg.wait_for_timeout(500)
        else: print("list NOT shown in 30 s")
        for l in log: print(l)
        await ctx.close(); await b.close()
asyncio.run(main())
