"""Close views of one home's 3D roof (2x DPR): default, top-down, and two turns. python _views.py <tag> <gi> [name]"""
import pathlib, sys, json
from playwright.sync_api import sync_playwright
OUT = pathlib.Path(__file__).parent; TAG, GI = sys.argv[1], sys.argv[2]; NAME = sys.argv[3] if len(sys.argv) > 3 else GI
BASE = "http://127.0.0.1:4886/tour/c5-home/index.html?dev=1&nosw=1&id=m" + GI
with sync_playwright() as p:
    import os
    HEADED = os.environ.get("HEADED") == "1"   # HEADED=1: a real (GPU) Chromium window; software GL loses its context on big scenes
    b = p.chromium.launch(headless=False, args=["--window-position=2000,2000"]) if HEADED else p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
    ctx = b.new_context(viewport={"width": 1200, "height": 900}, device_scale_factor=1)
    ctx.route("**/st-data-dfw/private/**", lambda x: x.fulfill(status=404, body=""))
    pg = ctx.new_page(); pg.goto("http://127.0.0.1:4886/tour/product.html?dev=1&nosw=1&noprefetch=1&nointro=1#/crm/home/m" + GI, wait_until="domcontentloaded")
    fr = None
    for _ in range(240):
        fr = next((f for f in pg.frames if "c5-home" in f.url), None)
        try:
            if fr and fr.evaluate("!!(window.HOME&&HOME.measure&&window.__ready&&window.__three)"): break
        except Exception: pass
        pg.wait_for_timeout(500)
    pg.wait_for_timeout(3500)
    for v, (dx, dy, dz) in {"top": (0.01, 1, 0.01), "sw": (-1, .45, 1), "ne": (1, .9, -1), "nw": (-1, .9, -1)}.items():
        fr.evaluate("""([dx,dy,dz])=>{const {camera,controls}=window.__three;const t=controls.target;const r=camera.position.distanceTo(t);
          const l=Math.hypot(dx,dy,dz);camera.position.set(t.x+dx/l*r,t.y+dy/l*r,t.z+dz/l*r);controls.update();}""", [dx, dy, dz])
        pg.wait_for_timeout(1800)
        pg.screenshot(path=str(OUT / f"{TAG}-{v}.png"), clip=fr.locator("#stage").bounding_box(), timeout=180000)
    pins = fr.evaluate("(()=>{const ps=[...document.querySelectorAll('#labels .pin')].filter(e=>e.style.visibility==='visible').map(e=>e.getBoundingClientRect());let n=0;for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){const a=ps[i],c=ps[j];if(a.left<c.right&&c.left<a.right&&a.top<c.bottom&&c.top<a.bottom)n++;}return {shown:ps.length,overlaps:n}})()")
    print("pins", pins)
    fr.evaluate("(()=>{const b=document.querySelector('#ptab [data-p=\"home\"]'); if(b) b.click();})()"); pg.wait_for_timeout(400)
    fr.evaluate("(()=>{const b=document.querySelector('#tabs [data-t=\"report\"]'); if(b) b.click();})()"); pg.wait_for_timeout(1500)
    try: fr.locator("#report .rr-diag").first.screenshot(path=str(OUT / f"{TAG}-diagram.png"), timeout=180000)
    except Exception as e: print("diag", str(e)[:100])
    b.close()
