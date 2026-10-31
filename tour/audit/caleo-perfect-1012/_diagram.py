"""Top-down diagram of one home as PNG without the 3D stage: pulls the report tab's SVG and screenshots it alone.
python _diagram.py <tag> <gi>"""
import pathlib, sys
from playwright.sync_api import sync_playwright
OUT = pathlib.Path(__file__).parent; TAG, GI = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
    ctx = b.new_context(viewport={"width": 1200, "height": 900})
    ctx.route("**/st-data-dfw/private/**", lambda x: x.fulfill(status=404, body=""))
    pg = ctx.new_page(); pg.goto("http://127.0.0.1:4886/tour/product.html?dev=1&nosw=1&noprefetch=1&nointro=1#/crm/home/m" + GI, wait_until="domcontentloaded")
    fr = None
    for _ in range(240):
        fr = next((f for f in pg.frames if "c5-home" in f.url), None)
        try:
            if fr and fr.evaluate("!!(window.HOME&&HOME.measure&&window.__ready)"): break
        except Exception: pass
        pg.wait_for_timeout(500)
    pg.wait_for_timeout(2000)
    fr.evaluate("(()=>{const b=document.querySelector('#ptab [data-p=\"home\"]'); if(b) b.click();})()"); pg.wait_for_timeout(400)
    fr.evaluate("(()=>{const b=document.querySelector('#tabs [data-t=\"report\"]'); if(b) b.click();})()"); pg.wait_for_timeout(2500)
    svg = fr.evaluate("""(()=>{const d=document.querySelector('#report .rr-diag'); if(!d) return ''; const css=[...document.querySelectorAll('style')].map(s=>s.textContent).filter(t=>t.includes('rr-el')).join('\\n');
      return d.outerHTML.replace(/<svg([^>]*)>/, (m,a)=>'<svg'+a+' width="780"><style>'+css+'</style>');})()""")
    (OUT / f"{TAG}-diagram.svg").write_text(svg, encoding="utf-8")
    p2 = ctx.new_page(); p2.set_content("<html><body style='margin:0;background:#FAFAF7'>" + svg + "</body></html>"); p2.wait_for_timeout(800)
    p2.locator("svg").first.screenshot(path=str(OUT / f"{TAG}-diagram.png"), timeout=60000)
    print("diagram", len(svg)); b.close()
