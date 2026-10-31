"""Open one product screen and dump, for every frame: errors caught by window.onerror, body data-view, and a JS probe.
  python -E tour/audit/repday/probe2.py '<hash or path>' '<js expression>'"""
import asyncio, sys
from playwright.async_api import async_playwright
URL = sys.argv[1]; JS = sys.argv[2] if len(sys.argv) > 2 else "document.body.dataset.view"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"]); ctx = await b.new_context(viewport={"width": 1440, "height": 900})
        if 0: await ctx.add_init_script("window.__errs=[];addEventListener('error',e=>__errs.push(String(e.message)+' @'+(e.filename||'').split('/').pop()+':'+e.lineno));addEventListener('unhandledrejection',e=>__errs.push('rej '+String(e.reason&&e.reason.stack||e.reason).slice(0,300)));")
        pg = await ctx.new_page()
        await pg.goto(URL if URL.startswith("http") else "http://127.0.0.1:4930/tour/product.html?dev=1&nointro=1&noprefetch=1&cloud=0" + URL, wait_until="load")
        await pg.wait_for_timeout(9000)
        for f in pg.frames:
            try: print("FRAME", f.url[-70:], await f.evaluate("window.__errs"), "|", await f.evaluate(JS))
            except Exception as e: print("FRAME", f.url[-70:], "err", str(e)[:200])
        await b.close()
asyncio.run(main())
