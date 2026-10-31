"""Rep flow on one home (10-22): add a phone, open the text draft, move the deal through every stage on the record's stage bar,
book an inspection, and read the pipeline after. Screenshots to tour/audit/repday/after/flow-*.png.
  python -E tour/audit/repday/flow_check.py <row>"""
import asyncio, os, sys
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "after"); os.makedirs(OUT, exist_ok=True)
row = sys.argv[1]; Q = "?dev=1&nointro=1&noprefetch=1&cloud=0"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        ctx = await b.new_context(viewport={"width": 1440, "height": 900}); errs = []
        await ctx.route("**/formsubmit.co/**", lambda r: r.abort())
        pg = await ctx.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        await pg.goto(f"http://127.0.0.1:4930/tour/product.html{Q}#/crm/home/m{row}", wait_until="load"); await pg.wait_for_timeout(8000)
        fr = next(f for f in pg.frames if f != pg.main_frame)
        log = lambda *a: print(*a, flush=True)
        log("callwhy:", await fr.evaluate("[...document.querySelectorAll('.callwhy')].map(e => e.hidden ? '-' : e.innerText).join(' / ')"))
        btn = fr.locator('[data-act="addphone"]').first
        if await btn.count(): 
            await btn.click(); await pg.wait_for_timeout(400)
            await fr.fill("#phIn", "214 555 1234"); await fr.click("#phSave"); await pg.wait_for_timeout(600)
        log("phone after:", await fr.evaluate("[...document.querySelectorAll('#kv > div')].filter(d => /Phone/.test(d.innerText)).map(d => d.innerText).join()"))
        await fr.locator('[data-act="text"]').first.click(); await pg.wait_for_timeout(500)
        log("text dialog:", (await fr.inner_text("#dlgBody"))[:300].replace("\n", " | "))
        await pg.screenshot(path=os.path.join(OUT, f"flow-{row}-text.png"))
        await fr.click("#dlgClose")
        steps = await fr.evaluate("[...document.querySelectorAll('[data-s]')].filter(b => b.offsetParent).map(b => b.dataset.s)")
        log("stage buttons:", steps)
        for s in ["called", "handoff", "inspection", "proposal", "won"]:
            el = fr.locator(f'[data-s="{s}"]').first
            if not await el.count(): log("no stage", s); continue
            await el.click(); await pg.wait_for_timeout(700)
            if await fr.evaluate("document.getElementById('dlg').open"):
                t = (await fr.inner_text("#dlgBody"))[:200].replace("\n", " | "); log("  dialog at", s, ":", t)
                await pg.screenshot(path=os.path.join(OUT, f"flow-{row}-{s}-dialog.png"))
                slot = fr.locator("#dlgBody button:not([disabled])").first
                if await slot.count(): await slot.click(); await pg.wait_for_timeout(500)
                ok = fr.locator("#dlgBody .pbtn:not([disabled])").first
                if await fr.evaluate("document.getElementById('dlg').open") and await ok.count(): await ok.click(); await pg.wait_for_timeout(500)
                if await fr.evaluate("document.getElementById('dlg').open"): await fr.click("#dlgClose")
            log("  stage now:", await fr.evaluate("(document.querySelector('.stagepill')||{}).textContent"), "| next:", (await fr.evaluate("(document.getElementById('next')||{}).innerText || ''"))[:120].replace("\n", " | "))
        await pg.screenshot(path=os.path.join(OUT, f"flow-{row}-won.png"))
        await pg.goto(f"http://127.0.0.1:4930/tour/product.html{Q}#/crm/pipeline", wait_until="load"); await pg.wait_for_timeout(6000)
        fr = next(f for f in pg.frames if f != pg.main_frame and "c5-home" in f.url)
        log("pipeline columns:", await fr.evaluate("[...document.querySelectorAll('#pcols > *')].map(c => (c.querySelector('h3,b,.pch')||c).innerText.split('\n').slice(0,2).join(' ')).join(' / ')"))
        await pg.screenshot(path=os.path.join(OUT, f"flow-{row}-pipeline.png"))
        log("errors", errs); await b.close()
asyncio.run(main())
