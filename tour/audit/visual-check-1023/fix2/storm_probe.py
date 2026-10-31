"""Desktop Storms load probe (fix batch 10-24): time until the service-area panel and the storm timeline fill, and the slowest requests.
  python -E tour/audit/visual-check-1023/fix2/storm_probe.py [desk|phone]"""
import asyncio, sys, time
from playwright.async_api import async_playwright
U = "http://127.0.0.1:4930/tour/product.html?dev=1&nointro=1&noprefetch=1&cloud=0#/storm"
async def main():
    mob = (sys.argv[1] if len(sys.argv) > 1 else "desk") == "phone"
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844} if mob else {"width": 1440, "height": 900}, is_mobile=mob, has_touch=mob)
        pg = await ctx.new_page(); t0 = time.time(); start = {}; slow = []; errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        pg.on("request", lambda r: start.__setitem__(r.url, time.time()))
        pg.on("requestfinished", lambda r: slow.append((round(time.time() - start.get(r.url, t0), 2), round(time.time() - t0, 1), r.url.split("/tour/")[-1][:80])))
        await pg.goto(U, wait_until="load", timeout=90000)
        for i in range(90):
            fr = next((f for f in pg.frames if "storm" in f.url and f != pg.main_frame), None)
            txt = await fr.evaluate("document.body.innerText") if fr else ""
            if "homes" in txt and ("No hail" in txt or "took" in txt): print("panel filled at", round(time.time() - t0, 1), "s"); break
            await pg.wait_for_timeout(1000)
        else: print("panel NOT filled in 90 s"); print(txt[:300])
        print("frame:", fr.url[-80:] if fr else None, "errors:", errs[:5])
        for s in sorted(slow, reverse=True)[:12]: print(s)
        await pg.screenshot(path="tour/audit/visual-check-1023/fix2/storm-probe.png")
        await ctx.close(); await b.close()
asyncio.run(main())
