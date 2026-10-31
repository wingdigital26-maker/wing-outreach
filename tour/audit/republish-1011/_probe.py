"""Roof geometry probe (ROOF-GEOM-1011): the 3D roof + top-down diagram for homes drawn from meta/roof-geom packs. usage: _probe.py TAG m164152 [m... ]"""
import pathlib, json, sys, time
from playwright.sync_api import sync_playwright
OUT = pathlib.Path(__file__).parent
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]
BASE = "http://127.0.0.1:4886/tour/product.html?dev=1&nosw=1&noprefetch=1&nointro=1"
TAG = sys.argv[1]; IDS = sys.argv[2:] or ["m164152"]
def frame(page, part): return next((f for f in page.frames if part in f.url), None)
def wait(page, part, expr, max_s=90):
    for _ in range(max_s * 2):
        fr = frame(page, part)
        if fr:
            try:
                if fr.evaluate(expr): return fr
            except Exception: pass
        page.wait_for_timeout(500)
    return frame(page, part)
TXT = """(()=>{const q=s=>{const e=document.querySelector(s);return e?e.innerText.replace(/\s+/g,' ').trim():null};
return {titleH:q('#titleH'),titleP:q('#titleP'),focus:q('#focus'),tfoot:q('#table tfoot'),rows:document.querySelectorAll('#table tbody tr').length,
rsub:q('#rsub'),tag:q('#tag'),report:(q('#report')||'').slice(0,700),proposal:q('#proposal'),next:q('#next'),stamp:q('.rb-stamp, .roof-stamp, [class*=stamp]'),
roof:window.HOME&&HOME.roof&&{sq:HOME.roof.sq,p:HOME.roof.pitch,p2:HOME.roof.pitch2,f:HOME.roof.nFacets,st:HOME.roof.stories,detail:HOME.roof.detail},measure:window.HOME&&HOME.measure}})()"""
R = {}
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for HID in IDS:
      for W, H, MOB in ((1440, 900, False),):
        r = R[HID] = {}; errs = r["errs"] = []
        ctx = b.new_context(viewport={"width": W, "height": H}, timezone_id="America/Chicago", device_scale_factor=1, is_mobile=MOB, has_touch=MOB)
        ctx.route("**/formsubmit.co/**", lambda x: x.abort())
        ctx.route("**/st-data-dfw/private/**", lambda x: x.fulfill(status=404, body=""))
        ctx.add_init_script("try{ sessionStorage.setItem('rc.introSeen','1'); localStorage.setItem('rc.t.stormSeen', JSON.stringify('2099-01-01')); }catch(e){}")
        page = ctx.new_page(); page.set_default_timeout(60000)
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:200]))
        page.goto(BASE + "#/crm/home/" + HID, wait_until="domcontentloaded", timeout=90000)
        fr = wait(page, "c5-home", "!!(window.HOME && HOME.roof && HOME.measure) && !!window.__ready", 120)
        page.wait_for_timeout(4000)
        r["rec"] = fr.evaluate(TXT) if fr else None
        page.screenshot(path=str(OUT / f"{TAG}-{HID}-record.png"))
        if fr:
            try: fr.locator("#stage").screenshot(path=str(OUT / f"{TAG}-{HID}-3d.png"))
            except Exception as e: r["stage_err"] = str(e)[:120]
            fr.evaluate("(()=>{const b=document.querySelector('#ptab [data-p=\"home\"]'); if(b) b.click();})()"); page.wait_for_timeout(500)
            fr.evaluate("(()=>{const b=document.querySelector('#tabs [data-t=\"report\"]'); if(b) b.click();})()"); page.wait_for_timeout(1500)
            r["report"] = fr.evaluate("(()=>{const e=document.querySelector('#report'); return e? e.innerText.replace(/\s+/g,' ').slice(0,900):null})()")
            try: fr.locator("#report").screenshot(path=str(OUT / f"{TAG}-{HID}-report.png"))
            except Exception as e: r["report_err"] = str(e)[:120]
        ctx.close()
    b.close()
(OUT / f"{TAG}.json").write_text(json.dumps(R, indent=1), encoding="utf-8")
print(json.dumps(R, indent=1)[:6000])
