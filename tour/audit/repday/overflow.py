"""Phone-width overflow check (10-23): for each screen and frame, page width vs viewport and the widest offending elements.
  python -E tour/audit/repday/overflow.py"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
B = "http://127.0.0.1:4930/tour/"; Q = "?dev=1&nointro=1&noprefetch=1&cloud=0"
S = {"today": "#/daily", "storms": "#/storm", "inbox": "#/crm/inbox", "pipeline": "#/crm/pipeline", "calendar": "#/crm/calendar", "home": "#/crm/home/m92039"}
JS = """(() => { const W = document.documentElement.clientWidth, out = [];
  document.querySelectorAll('body *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && (r.right > W + 2 || r.left < -2) && getComputedStyle(e).position !== 'fixed') {
    let p = e.parentElement, clip = false; while (p) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { clip = true; break; } p = p.parentElement; }
    if (!clip) out.push((e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]) + ' ' + Math.round(r.left) + '..' + Math.round(r.right)); } });
  return { W, sw: document.documentElement.scrollWidth, bad: out.slice(0, 8) }; })()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        pages = [(k, B + "product.html" + Q + v) for k, v in S.items()] + [("proposal", B + "c5-home/proposal.html" + Q + "&id=m92039"), ("hailreport", B + "c5-home/hail-report.html" + Q + "&id=m92039")]
        for name, url in pages:
            ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1, is_mobile=True, has_touch=True)
            pg = await ctx.new_page(); await pg.goto(url, wait_until="load"); await pg.wait_for_timeout(8000)
            for f in pg.frames:
                try: r = await f.evaluate(JS)
                except Exception: continue
                if r["sw"] > r["W"] + 2 or r["bad"]: print(name, f.url.split("/")[-1][:40], r)
            await ctx.close()
        print("done"); await b.close()
asyncio.run(main())
