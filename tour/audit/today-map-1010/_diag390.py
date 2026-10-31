"""Phone map diagnostic (10-10): why is the 390 map blank? Opens the route sheet and reports the map box, canvas size,
style/loaded state, first pin positions and failed requests. One browser, closed after."""
import json, sys
from playwright.sync_api import sync_playwright
URL = "http://127.0.0.1:4886/tour/product.html?dev=1#/daily"
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"]
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    try:
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = ctx.new_page(); fails = []
        page.on("requestfailed", lambda r: fails.append(r.url[:120] + " " + str(r.failure)))
        page.on("pageerror", lambda e: fails.append("PAGEERR " + str(e)[:200]))
        page.goto(URL, wait_until="domcontentloaded", timeout=120000)
        fr = None
        for _ in range(400):
            fr = next((f for f in page.frames if "deck.html" in f.url), None)
            if fr:
                try:
                    if fr.evaluate("window.__mapReady === true && typeof QREADY !== 'undefined' && QREADY"): break
                except Exception: pass
            page.wait_for_timeout(500)
        fr.evaluate("openSheet('route')"); page.wait_for_timeout(4000)
        print(json.dumps(fr.evaluate("""(()=>{ const m=document.getElementById('map'), r=m.getBoundingClientRect(), c=map.getCanvas();
          const pins=[...document.querySelectorAll('.stop')].slice(0,3).map(e=>{ const b=e.getBoundingClientRect(); return [Math.round(b.x),Math.round(b.y),Math.round(b.width)]; });
          const hq=document.querySelector('.hqm'); const hb=hq?hq.getBoundingClientRect():null;
          return { mapBox:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)], canvas:[c.width,c.height,c.style.width], loaded:map.loaded(), styleLoaded:map.isStyleLoaded(),
            cam:{c:map.getCenter(), z:map.getZoom()}, pins, hq: hb?[Math.round(hb.x),Math.round(hb.y)]:null, parent:m.parentElement.id, sheetOpen:document.getElementById('sheetRoute').classList.contains('open'),
            fan:(()=>{ const f=document.querySelector('.fan'); return f?[f.width,f.height,f.style.width]:null; })(), fitLast: fitAll.last, stats: window.__mapStats }; })()""")), flush=True)
        print("fails", json.dumps(fails[:10]), flush=True)
        page.screenshot(path=str(__import__('pathlib').Path(__file__).parent / "diag-390.png"))
    finally:
        b.close()
