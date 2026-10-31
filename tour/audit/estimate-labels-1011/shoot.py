import pathlib, sys
from playwright.sync_api import sync_playwright
OUT = pathlib.Path(__file__).parent
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for W, H, MOB in ((1440, 900, False), (390, 844, True)):
        ctx = b.new_context(viewport={"width": W, "height": H}, timezone_id="America/Chicago", device_scale_factor=2 if MOB else 1, is_mobile=MOB, has_touch=MOB)
        ctx.route("**/formsubmit.co/**", lambda r: r.abort())
        ctx.route("**/st-data-dfw/private/**", lambda r: r.fulfill(status=404, body=""))
        page = ctx.new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e)[:200]))
        page.goto("http://localhost:4886/tour/product.html?dev=1&nosw=1&noprefetch=1#/crm/home/m164153", wait_until="domcontentloaded", timeout=90000)
        fr = None
        for _ in range(240):
            fr = next((f for f in page.frames if "c5-home" in f.url), None)
            if fr:
                try:
                    if fr.evaluate("!!window.HOME && !!HOME.measure && document.getElementById('titleH').textContent.length>0"): break
                except Exception: pass
            page.wait_for_timeout(500)
        page.wait_for_timeout(3000)
        print(W, "title:", fr.evaluate("document.getElementById('titleH').textContent"))
        print(W, "focus:", fr.evaluate("document.getElementById('focus')?document.getElementById('focus').innerText:''")[:200])
        page.screenshot(path=str(OUT / f"home-m164153-{W}.png"))
        fr.evaluate("document.getElementById('stage').scrollIntoView({block:'start'})"); page.wait_for_timeout(600)
        page.screenshot(path=str(OUT / f"home-m164153-roof-{W}.png"))
        page.goto("http://localhost:4886/tour/product.html?dev=1&nosw=1&noprefetch=1#/today", wait_until="domcontentloaded")
        page.wait_for_timeout(20000)
        txt = ""
        for f in page.frames:
            try: txt += f.evaluate("document.body.innerText")
            except Exception: pass
        import re
        print(W, "today est:", re.findall(r".{20}\(est\.\).{10}|.{20}sq.{10}", txt)[:5])
        page.screenshot(path=str(OUT / f"today-{W}.png"))
        print(W, "errors:", errs[:3]); ctx.close()
    b.close()
