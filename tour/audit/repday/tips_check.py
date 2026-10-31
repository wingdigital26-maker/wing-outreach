"""Stat tidbits (Jack 10-23): Today header line, a card with 2+ re-roofs nearby, the Radar foot; desktop + phone.
  python -E tour/audit/repday/tips_check.py   -> after/tips-*.png"""
import asyncio, os
from playwright.async_api import async_playwright
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "after")
Q = "http://127.0.0.1:4930/tour/product.html?dev=1&nointro=1&noprefetch=1&cloud=0#/daily"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        for name, w, h, mob in (("desk", 1440, 900, False), ("phone", 390, 844, True)):
            ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mob else 1, is_mobile=mob, has_touch=mob)
            pg = await ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
            await pg.goto(Q, wait_until="load", timeout=90000); await pg.wait_for_timeout(14000)
            fr = next(f for f in pg.frames if "deck" in f.url)
            print(name, "header:", (await fr.evaluate("(document.getElementById('tipHd')||{}).innerText || '-'")).encode("ascii", "replace").decode())
            await pg.screenshot(path=os.path.join(OUT, f"tips-header-{name}.png"))
            n = await fr.evaluate("(() => { const i = HOMES.findIndex(h => h.pick && h.pick.neighbours >= 2); return i < 0 ? -1 : i; })()")
            if n >= 0:
                await fr.evaluate(f"go({n}, true)"); await pg.wait_for_timeout(2500)
                print(name, "card hint:", (await fr.evaluate("([...document.querySelectorAll('.rc-tip.in')].map(e => e.innerText)[0]) || '-'")).encode("ascii", "replace").decode())
                await pg.screenshot(path=os.path.join(OUT, f"tips-card-{name}.png"))
            if mob and await fr.is_visible("#openList"): await fr.click("#openList"); await pg.wait_for_timeout(800)
            await fr.click("#tabRadar"); await pg.wait_for_timeout(2500)
            el = await fr.query_selector("#paneRadar .rc-tip.ft")
            if el:
                await el.scroll_into_view_if_needed(); await pg.wait_for_timeout(400)
                print(name, "radar foot:", (await el.inner_text()).encode("ascii", "replace").decode()[:300])
                await pg.screenshot(path=os.path.join(OUT, f"tips-radar-{name}.png"))
            print(name, "errors", errs); await ctx.close()
        await b.close()
asyncio.run(main())
