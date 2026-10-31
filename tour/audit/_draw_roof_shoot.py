"""Draw the roof (10-10): a home with no outline on file (default m707, Collin, built 2025) in the CRM home record.
python tour/audit/_draw_roof_shoot.py [homeId] [width]   (server on :4886, one headless Chromium, swiftshader).
Flow: empty state -> Draw the roof -> four corners -> close -> Use this outline -> drawn roof; then Remove drawing.
Shots: tour/audit/draw-roof-1010/<step>-<width>.png. Prints the stage title, the saved key and console errors."""
import pathlib, sys, json
from playwright.sync_api import sync_playwright
HID = sys.argv[1] if len(sys.argv) > 1 else "m707"
W = int(sys.argv[2]) if len(sys.argv) > 2 else 1440
MOB = W < 700
H = 844 if MOB else 900
OUT = pathlib.Path(__file__).parent / "draw-roof-1010"; OUT.mkdir(exist_ok=True)
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]
def shot(page, name): page.screenshot(path=str(OUT / f"{name}-{W}.png"))
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": W, "height": H}, timezone_id="America/Chicago", device_scale_factor=2 if MOB else 1, is_mobile=MOB, has_touch=MOB)
    ctx.route("**/formsubmit.co/**", lambda r: r.abort())
    ctx.route("**/st-data-dfw/private/**", lambda r: r.fulfill(status=404, body=""))
    page = ctx.new_page(); errs = []
    page.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)[:200]))
    page.goto(f"http://localhost:4886/tour/product.html?dev=1&nosw=1&noprefetch=1#/crm/home/{HID}", wait_until="domcontentloaded", timeout=90000)
    fr = None
    for _ in range(360):
        fr = next((f for f in page.frames if "c5-home" in f.url), None)
        if fr:
            try:
                if fr.evaluate("!!document.getElementById('titleH') && document.getElementById('titleH').textContent.length > 0 && !!window.HOME"): break
            except Exception: pass
        page.wait_for_timeout(500)
    fr.evaluate("localStorage.removeItem('rc.t.drawn.' + HOME.rawId)")
    page.wait_for_timeout(1500)
    fr.evaluate("window.__switchHome && __switchHome()")
    page.wait_for_timeout(4000)
    print("title:", fr.evaluate("document.getElementById('titleH').textContent"))
    # the stage is inside the iframe: scroll it into view at phone width
    fr.evaluate("document.getElementById('stage').scrollIntoView({block:'start'})"); page.wait_for_timeout(400)
    shot(page, "01-empty")
    fr.click("#bDraw"); page.wait_for_timeout(800)
    try: fr.wait_for_selector(".dr:not(.loading)", timeout=45000)
    except Exception: print("imagery still loading")
    page.wait_for_timeout(600)
    shot(page, "02-drawing")
    # corners: a rectangle around the image centre (the home pin), in page coordinates
    r = fr.evaluate("(() => { const q = document.querySelector('.dr').getBoundingClientRect(); return [q.left, q.top, q.width, q.height]; })()")
    fb = page.evaluate("(() => { const f = document.querySelector('iframe[data-screen=\"home\"], iframe.frame'); const q = f.getBoundingClientRect(); return [q.left, q.top]; })()")
    cx, cy = fb[0] + r[0] + r[2] / 2, fb[1] + r[1] + r[3] / 2
    hw, hh = (70, 46) if MOB else (110, 70)
    pts = [(cx - hw, cy - hh), (cx + hw, cy - hh), (cx + hw, cy + hh), (cx - hw, cy + hh)]
    for (x, y) in pts:
        if MOB: page.touchscreen.tap(x, y)
        else: page.mouse.click(x, y)
        page.wait_for_timeout(250)
    shot(page, "03-corners")
    if MOB: page.touchscreen.tap(*pts[0])
    else: page.mouse.click(*pts[0])
    page.wait_for_timeout(400)
    print("closed:", fr.evaluate("document.querySelector('.dr-info') && document.querySelector('.dr-info').textContent"))
    shot(page, "04-closed")
    fr.click(".dr-use"); page.wait_for_timeout(4500)
    info = fr.evaluate("""() => ({ title: document.getElementById('titleH').textContent, p: document.getElementById('titleP').textContent,
      tag: (document.getElementById('stageTag')||{}).textContent, saved: localStorage.getItem('rc.t.drawn.' + HOME.rawId), measure: HOME.measure,
      focus: (document.getElementById('focus')||{}).textContent })""")
    print(json.dumps(info, indent=1)[:1200])
    shot(page, "05-drawn")
    # the record's measurements tab under the stage (desktop) or the full record (phone)
    if not MOB: page.screenshot(path=str(OUT / f"06-drawn-full-{W}.png"), full_page=True)
    fr.click('#stageTag [data-t="remove"]'); page.wait_for_timeout(3500)
    print("after remove:", fr.evaluate("document.getElementById('titleH').textContent"), fr.evaluate("localStorage.getItem('rc.t.drawn.' + HOME.rawId)"))
    print("errors", errs[:8])
    b.close()
