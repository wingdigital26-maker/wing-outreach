"""Computed style of the first match in a frame (polish batch 10-24).
  python -E tour/audit/visual-check-1023/fix3/css_probe.py <hash> <frame-part> <phone|desk> <selector> <prop,prop,...>"""
import asyncio, sys
from playwright.async_api import async_playwright
async def main():
    h, part, sz, sel, props = sys.argv[1:6]; mob = sz == "phone"
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844} if mob else {"width": 1440, "height": 900}, is_mobile=mob, has_touch=mob)
        pg = await ctx.new_page(); await pg.goto("http://127.0.0.1:4930/tour/product.html?dev=1&nointro=1&noprefetch=1&cloud=0#" + h, wait_until="load"); await pg.wait_for_timeout(10000)
        fr = next((f for f in pg.frames if part in f.url and f != pg.main_frame), pg.main_frame)
        print(await fr.evaluate("([s, ps]) => { const e = document.querySelector(s); if (!e) return 'none'; const c = getComputedStyle(e); return ps.split(',').map(p => p + '=' + c.getPropertyValue(p)).join('  ') + '  html.class=' + document.documentElement.className + ' body.class=' + document.body.className + ' parent=' + e.parentElement.className + ' ' + Math.round(e.parentElement.getBoundingClientRect().height) }", [sel, props]))
        await ctx.close(); await b.close()
asyncio.run(main())
