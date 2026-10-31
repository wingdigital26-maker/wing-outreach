"""Owner names before / after messaging + the squares line (Jack 10-23). Record + Today at desktop and phone, then a text
logged on the home (Add phone, Open in Messages) and the record again: the full name should show.
  python -E tour/audit/repday/names_check.py <row>   -> after/names-*.png"""
import asyncio, os, sys
from playwright.async_api import async_playwright
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "after"); row = sys.argv[1]
Q = "http://127.0.0.1:4930/tour/product.html?dev=1&nointro=1&noprefetch=1&cloud=0"
async def frame(pg, key):
    for _ in range(40):
        f = next((f for f in pg.frames if key in f.url), None)
        if f: return f
        await pg.wait_for_timeout(300)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        for name, w, h, mob in (("desk", 1440, 900, False), ("phone", 390, 844, True)):
            ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mob else 1, is_mobile=mob, has_touch=mob)
            await ctx.route("sms:*", lambda r: r.abort())
            pg = await ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
            await pg.goto(Q + "#/daily", wait_until="load", timeout=90000); await pg.wait_for_timeout(9000)
            await pg.screenshot(path=os.path.join(OUT, f"names-today-{name}.png"))
            await pg.goto(Q + f"#/crm/home/m{row}", wait_until="load", timeout=90000); await pg.wait_for_timeout(9000)
            fr = await frame(pg, "c5-home")
            print(name, "before:", await fr.evaluate("document.getElementById('keyf').innerText.replace(/\\n/g,' | ')"))
            await pg.screenshot(path=os.path.join(OUT, f"names-record-{name}.png"))
            if name == "desk":
                await fr.locator('[data-act="addphone"]').first.click(); await pg.wait_for_timeout(300)
                await fr.fill("#phIn", "2145551234"); await fr.click("#phSave"); await pg.wait_for_timeout(500)
                await fr.locator('[data-act="text"]').first.click(); await pg.wait_for_timeout(400)
                await fr.evaluate("document.getElementById('smsGo').addEventListener('click', e => e.preventDefault())")
                await fr.click("#smsGo"); await pg.wait_for_timeout(500)
                await pg.reload(wait_until="load", timeout=90000); await pg.wait_for_timeout(9000); fr = await frame(pg, "c5-home")
                print(name, "after text:", await fr.evaluate("document.getElementById('keyf').innerText.replace(/\\n/g,' | ')"))
                await pg.screenshot(path=os.path.join(OUT, f"names-record-messaged-{name}.png"))
            print("errors", errs); await ctx.close()
        await b.close()
asyncio.run(main())
