"""console errors + a screenshot of one home's 3D stage: python _console.py <tag> <gi>"""
import pathlib, sys
from playwright.sync_api import sync_playwright
OUT = pathlib.Path(__file__).parent; TAG, GI = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
    ctx = b.new_context(viewport={"width": 1200, "height": 900}); ctx.route("**/st-data-dfw/private/**", lambda x: x.fulfill(status=404, body=""))
    pg = ctx.new_page(); msgs = []
    pg.on("console", lambda m: msgs.append(m.type + ": " + m.text[:300]) if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: msgs.append("pageerror: " + str(e)[:400]))
    pg.goto("http://127.0.0.1:4886/tour/product.html?dev=1&nosw=1&noprefetch=1&nointro=1#/crm/home/m" + GI, wait_until="domcontentloaded")
    fr = None
    for _ in range(120):
        fr = next((f for f in pg.frames if "c5-home" in f.url), None)
        try:
            if fr and fr.evaluate("!!(window.HOME&&HOME.measure&&window.__ready&&window.__three)"): break
        except Exception: pass
        pg.wait_for_timeout(500)
    pg.wait_for_timeout(3000)
    print("\n".join(msgs[:30]) or "no console errors")
    if fr:
        print(fr.evaluate("(()=>{try{const s=window.__spec||null;return JSON.stringify({planes:document.querySelectorAll('#labels .pin').length})}catch(e){return String(e)}})()"))
        pg.screenshot(path=str(OUT / f"{TAG}-check.png"), clip=fr.locator("#stage").bounding_box(), timeout=120000)
    b.close()
