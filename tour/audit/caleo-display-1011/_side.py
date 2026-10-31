"""3D roof next to the top-down facet diagram for 3312 Caleo Ct (m164153), 10-11. One headless swiftshader Chromium.
The 3D is turned to look down (drag), the diagram is the report's own SVG (rc-roof.js diagramSVG, same as the Roof report tab)."""
import pathlib, json
from playwright.sync_api import sync_playwright
from PIL import Image
OUT = pathlib.Path(__file__).parent
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]
BASE = "http://127.0.0.1:4886/tour/product.html?dev=1&nosw=1&noprefetch=1&nointro=1"
def frame(page, part): return next((f for f in page.frames if part in f.url), None)
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, timezone_id="America/Chicago", device_scale_factor=1)
    ctx.route("**/formsubmit.co/**", lambda x: x.abort())
    ctx.route("**/st-data-dfw/private/**", lambda x: x.fulfill(status=404, body=""))
    ctx.add_init_script("try{ sessionStorage.setItem('rc.introSeen','1'); localStorage.setItem('rc.t.stormSeen', JSON.stringify('2099-01-01')); }catch(e){}")
    page = ctx.new_page(); page.set_default_timeout(60000)
    page.goto(BASE + "#/crm/home/m164153", wait_until="domcontentloaded", timeout=90000)
    fr = None
    for _ in range(240):
        fr = frame(page, "c5-home")
        try:
            if fr and fr.evaluate("!!(window.HOME && HOME.measure && HOME.measure.facet) && !!window.__ready"): break
        except Exception: pass
        page.wait_for_timeout(500)
    page.wait_for_timeout(3000)
    el = page.frame_locator("iframe[src*='c5-home']").first.locator("#stage") if False else None
    box = fr.frame_element().bounding_box(); sb = fr.evaluate("(()=>{const r=document.querySelector('#stage').getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}})()")
    cx, cy = box["x"] + sb["x"] + sb["w"] * .5, box["y"] + sb["y"] + sb["h"] * .45
    page.mouse.move(cx, cy); page.mouse.down(); page.mouse.move(cx, cy + 260, steps=12); page.mouse.up()
    page.wait_for_timeout(2500)
    fr.locator("#stage").screenshot(path=str(OUT / "side-3d-top-1440.png"))
    svg = fr.evaluate("RCROOF.diagramSVG(HOME.roof.report || null, 760)") or ""
    if not svg:
        d = fr.evaluate("RCROOF.detail(HOME.roof && %d).then(d=>RCROOF.diagramSVG(d,760))" % 164153)
        svg = d or ""
    dp = ctx.new_page(); dp.set_viewport_size({"width": 800, "height": 900})
    dp.set_content("<html><body style='margin:0;background:#fff'><style>.rr-el{font:600 11px system-ui;text-anchor:middle;paint-order:stroke;stroke:#fff;stroke-width:3px}.rr-fl{font:700 12px system-ui;fill:#0E1B3D;text-anchor:middle;paint-order:stroke;stroke:#fff;stroke-width:3px}svg{width:780px;height:auto;display:block;margin:10px}</style>" + svg + "</body></html>")
    dp.locator("svg").screenshot(path=str(OUT / "side-diagram.png"))
    b.close()
a = Image.open(OUT / "side-3d-top-1440.png"); d = Image.open(OUT / "side-diagram.png")
h = max(a.height, d.height); W = a.width + d.width + 30
c = Image.new("RGB", (W, h + 20), "white"); c.paste(a, (10, 10)); c.paste(d, (a.width + 20, 10)); c.save(OUT / "side-3d-vs-diagram-1440.png")
print("ok", a.size, d.size)
