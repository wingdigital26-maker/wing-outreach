# Proposal page captures (PROPOSAL-1014 v2, simplified): python shoot.py  (server on :4886 already running)
import asyncio, os
from playwright.async_api import async_playwright
OUT = os.path.dirname(os.path.abspath(__file__))
URL = "http://127.0.0.1:4886/tour/c5-home/proposal.html?dev=1&nosw=1&id=m164153"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, w, h, mob in [("v2-1440.png", 1440, 900, False), ("v2-375.png", 375, 812, True)]:
            ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mob else 1, is_mobile=mob, has_touch=mob)
            pg = await ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
            await pg.goto(URL, wait_until="load", timeout=60000)
            await pg.wait_for_selector("#doc:not([hidden])", timeout=30000); await pg.wait_for_timeout(500)
            await pg.screenshot(path=os.path.join(OUT, name), full_page=True); print(name, "errors:", errs)
            if not mob:
                await pg.emulate_media(media="print")
                await pg.screenshot(path=os.path.join(OUT, "v2-print-preview.png"), full_page=True)
                await pg.pdf(path=os.path.join(OUT, "v2-proposal-print.pdf"), format="Letter", print_background=True)
                # the price and note path: type a test value on screen, check it reaches the page, then clear it (no price is saved)
                await pg.emulate_media(media="screen")
                await pg.fill("#fPrice", "1"); await pg.fill("#fNotes", "test note")
                print("price shown:", await pg.inner_text("#price"), "| notes shown:", await pg.inner_text("#notes"))
                await pg.fill("#fPrice", ""); await pg.fill("#fNotes", "")
                print("cleared; price block hidden:", await pg.is_hidden("#priceBlk"), "notes hidden:", await pg.is_hidden("#notesBlk"),
                      "| stored:", await pg.evaluate("localStorage.getItem('rc.t.prop.house')"))
            await ctx.close()
        await b.close()
asyncio.run(main())
