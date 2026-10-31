"""Proposal check (10-22): open a home's proposal, type a price per square, read the total, screenshot screen + print view.
  python -E tour/audit/repday/proposal_check.py <row> [rate]   -> tour/audit/repday/after/proposal-<row>-*.png"""
import asyncio, os, sys
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "after"); os.makedirs(OUT, exist_ok=True)
row = sys.argv[1]; rate = sys.argv[2] if len(sys.argv) > 2 else "450"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        for name, w, h, mob in (("desk", 1440, 900, False), ("phone", 390, 844, True)):
            ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mob else 1, is_mobile=mob)
            pg = await ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
            await pg.goto(f"http://127.0.0.1:4930/tour/c5-home/proposal.html?dev=1&id=m{row}", wait_until="load")
            await pg.wait_for_timeout(6000)
            if await pg.is_visible("#fRate"):
                await pg.fill("#fRate", rate); await pg.wait_for_timeout(400)
            print(name, "loading:", (await pg.inner_text("#loading")) if await pg.is_visible("#loading") else "-",
                  "| price:", await pg.inner_text("#price") if await pg.is_visible("#price") else "-", "|", await pg.inner_text("#priceHow") if await pg.is_visible("#priceHow") else "")
            await pg.screenshot(path=os.path.join(OUT, f"proposal-{row}-{name}.png"), full_page=True)
            if name == "desk":
                await pg.emulate_media(media="print"); await pg.screenshot(path=os.path.join(OUT, f"proposal-{row}-print.png"), full_page=True)
                await pg.pdf(path=os.path.join(OUT, f"proposal-{row}.pdf")) if False else None
            await ctx.close()
        print("errors", errs); await b.close()
asyncio.run(main())
