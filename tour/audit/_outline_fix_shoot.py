"""Outline fix (10-10): 3312 Caleo Ct, Plano (collin-tx row 164153 = m164153) record at 1440.
python tour/audit/_outline_fix_shoot.py <tag> [homeId]   (server on :4886). Opens the record cold (no remembered home,
like a fresh hosted device) via #/crm/home/<id>; prints the roof title + stage strip rows. Shots: tour/audit/outline-fix-1010/."""
import pathlib, sys, json
from playwright.sync_api import sync_playwright
TAG = sys.argv[1] if len(sys.argv) > 1 else "before"
HID = sys.argv[2] if len(sys.argv) > 2 else "m164153"
W = int(sys.argv[3]) if len(sys.argv) > 3 else 1440
OUT = pathlib.Path(__file__).parent / "outline-fix-1010"; OUT.mkdir(exist_ok=True)
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": W, "height": 900}, timezone_id="America/Chicago")
    ctx.route("**/formsubmit.co/**", lambda r: r.abort())
    ctx.route("**/st-data-dfw/private/**", lambda r: r.fulfill(status=404, body=""))   # as the hosted build: no owner files
    page = ctx.new_page(); errs = []
    page.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)[:200]))
    page.goto(f"http://localhost:4886/tour/product.html?dev=1&nosw=1&noprefetch=1#/crm/home/{HID}", wait_until="domcontentloaded", timeout=90000)
    fr = None
    for _ in range(120):
        fr = next((f for f in page.frames if "c5-home" in f.url), None)
        if fr:
            try:
                if fr.evaluate("!!document.getElementById('titleH') && document.getElementById('titleH').textContent.length > 0 && !!window.HOME"): break
            except Exception: pass
        page.wait_for_timeout(500)
    page.wait_for_timeout(6000)
    info = fr.evaluate("""() => ({ title: document.getElementById('titleH').textContent, p: document.getElementById('titleP').textContent,
      addr: (document.getElementById('addr')||{}).textContent, rec: {lon: HOME.rec.lon, lat: HOME.rec.lat, gi: HOME.rec.gi},
      stages: [...document.querySelectorAll('.stg button, .stages button, [data-stage]')].map(e => [e.textContent.trim().slice(0,40), Math.round(e.getBoundingClientRect().top)]).slice(0,10) })""")
    print(json.dumps(info, indent=1))
    page.screenshot(path=str(OUT / f"{TAG}-caleo-{W}.png"))
    print("errors", errs[:8])
    b.close()
