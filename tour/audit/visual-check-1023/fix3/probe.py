"""Polish batch 10-24 probe: element boxes on a screen at phone or desk size, plus a screenshot.
  python -E tour/audit/visual-check-1023/fix3/probe.py <hash> <frame-part> <phone|desk> <out.png> <css selectors...>"""
import asyncio, sys, json
from playwright.async_api import async_playwright
async def main():
    h, part, sz, out, sels = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5:]
    mob = sz == "phone"
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844} if mob else {"width": 1440, "height": 900}, device_scale_factor=1.5 if mob else 1, is_mobile=mob, has_touch=mob)
        pg = await ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        await pg.goto("http://127.0.0.1:4930/tour/product.html?dev=1&nointro=1&noprefetch=1&cloud=0#" + h, wait_until="load", timeout=90000)
        await pg.wait_for_timeout(int(__import__("os").environ.get("WAIT", "12000")))
        fr = next((f for f in pg.frames if part in f.url and f != pg.main_frame), pg.main_frame)
        for s in sels:
            r = await fr.evaluate("s => [...document.querySelectorAll(s)].slice(0,3).map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height), getComputedStyle(e).display] })", s)
            print(s, r)
        try: await pg.screenshot(path=out, timeout=45000)
        except Exception as e: print("shot failed", str(e)[:80])
        print("errors", errs[:3]); await ctx.close(); await b.close()
asyncio.run(main())
