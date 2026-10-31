"""Small fixes 10-11: before/after shots at 390x844 for (1) Today map pins vs legend, (2) Storms stat card text,
(3) Ask Send button vs the Nimbus orb. Run: python tour/audit/smallfix-1011/_shoot.py <before|after>  (server :4886 running)."""
import pathlib, sys, json
from playwright.sync_api import sync_playwright

TAG = sys.argv[1] if len(sys.argv) > 1 else "before"
HERE = pathlib.Path(__file__).parent
BASE = "http://127.0.0.1:4886/tour/product.html?dev=1"
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]
W, H = 390, 844

def frame(page, part, ready):
    for _ in range(600):
        fr = next((f for f in page.frames if part in f.url), None)
        if fr:
            try:
                if fr.evaluate(ready): return fr
            except Exception: pass
        page.wait_for_timeout(400)
    raise RuntimeError("frame not ready " + part)

def close_bubble(page):
    try:
        if page.evaluate("(()=>{const x=document.querySelector('.nb-bubble .nb-x'); if(!x) return false; return x.getBoundingClientRect().width>0})()"):
            page.click(".nb-bubble .nb-x", timeout=4000, force=True); page.wait_for_timeout(300)
    except Exception: pass

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.route("**/formsubmit.co/**", lambda r: r.abort())
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    out = {}

    # 1. Today map
    page.goto(BASE + "#/daily", wait_until="domcontentloaded", timeout=90000)
    fr = frame(page, "deck.html", "window.__mapReady === true && typeof QREADY !== 'undefined' && QREADY")
    for _ in range(60):
        page.wait_for_timeout(500)
        if fr.evaluate("!!(window.__mapStats && window.__mapStats.hit != null)"): break
    page.wait_for_timeout(1000)
    r = fr.evaluate("(()=>{const e=document.getElementById('openRoute'); if(!e) return null; const b=e.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2}})()")
    o = fr.frame_element().bounding_box()
    page.mouse.click(o["x"] + r["x"], o["y"] + r["y"]); page.wait_for_timeout(3000)
    close_bubble(page)
    fr.evaluate("fitAll(true)"); page.wait_for_timeout(1500)
    out["today"] = fr.evaluate("""(()=>{ const m=document.getElementById('map').getBoundingClientRect(), lg=document.querySelector('.mtag .mleg'), tag=document.querySelector('.mtag');
        const lr=lg?lg.getBoundingClientRect():null, tr=tag?tag.getBoundingClientRect():null;
        const pins=[...document.querySelectorAll('.stop,.hqm')].map(e=>{const r=e.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2-m.x), y:Math.round(r.y+r.height/2-m.y), w:Math.round(r.width)}});
        const xs=pins.map(p=>p.x), ys=pins.map(p=>p.y);
        const under=pins.filter(p=>{ if(!lr) return false; const X=p.x+m.x, Y=p.y+m.y; return X>lr.left-8 && X<lr.right+8 && Y>lr.top-8 && Y<lr.bottom+8; }).length;
        const underTag=pins.filter(p=>{ if(!tr) return false; const X=p.x+m.x, Y=p.y+m.y; return X>tr.left-8 && X<tr.right+8 && Y>tr.top-8 && Y<tr.bottom+8; }).length;
        return {map:{w:Math.round(m.width),h:Math.round(m.height)}, pins:pins.length, minX:Math.min(...xs), maxX:Math.max(...xs), minY:Math.min(...ys), maxY:Math.max(...ys),
          offRight:pins.filter(p=>p.x>m.width-24).length, offLeft:pins.filter(p=>p.x<24).length, offTop:pins.filter(p=>p.y<24).length, offBottom:pins.filter(p=>p.y>m.height-24).length,
          underLegend:under, underTag:underTag, leg:lr?{l:Math.round(lr.left-m.x),t:Math.round(lr.top-m.y),r:Math.round(lr.right-m.x),b:Math.round(lr.bottom-m.y),vis:lr.width>0}:null,
          tag:tr?{l:Math.round(tr.left-m.x),t:Math.round(tr.top-m.y),r:Math.round(tr.right-m.x),b:Math.round(tr.bottom-m.y)}:null, pad:fitPad(), z:+map.getZoom().toFixed(2)}; })()""")
    page.screenshot(path=str(HERE / f"today-390-{TAG}.png"), animations="disabled", timeout=120000)

    # 2. Storms
    page.goto(BASE + "#/storm", wait_until="domcontentloaded", timeout=90000)
    fr = frame(page, "1b-storm-theater.html", "document.body.classList.contains('loaded')")
    page.wait_for_timeout(1500)
    fr.evaluate("(()=>{ const s=ST.storms; window.__pick(s[s.length-1].i); })()"); page.wait_for_timeout(2500)
    close_bubble(page)
    out["storm"] = fr.evaluate("""(()=>{ const st=document.querySelector('.stat'); const bands=[...document.querySelectorAll('#s-bands span')].map(e=>e.textContent);
        return {stat:(st?st.innerText:'').replace(/\\n+/g,' | '), bandLabels:bands, bandsH:document.querySelector('.bands .h')?document.querySelector('.bands .h').innerText.replace(/\\n+/g,' | '):null,
          leak:[...document.querySelectorAll('.stat *')].filter(e=>/taller|by home/i.test(e.textContent)&&e.children.length===0).map(e=>e.className+': '+e.textContent)}; })()""")
    page.screenshot(path=str(HERE / f"storm-390-{TAG}.png"), animations="disabled", timeout=120000)

    # 3. Ask
    page.goto(BASE + "#/ask", wait_until="domcontentloaded", timeout=90000)
    fr = frame(page, "c2-nimbus/index.html", "!!document.querySelector('.send')")
    page.wait_for_timeout(3500)
    close_bubble(page)
    fo = fr.frame_element().bounding_box()
    inner = fr.evaluate("""()=>{ const s=document.querySelector('.send'), dk=document.querySelector('.dock'), sh=document.querySelector('.sheet'); const sr=s.getBoundingClientRect(), dr=dk.getBoundingClientRect();
        return {send:{l:sr.left,t:sr.top,r:sr.right,b:sr.bottom}, dock:{l:dr.left,t:dr.top,r:dr.right,b:dr.bottom}, sheet:sh?sh.dataset.state:null, dockPad:getComputedStyle(dk).padding}; }""")
    orb = page.evaluate("()=>{ const d=document.querySelector('.nb-dock'); if(!d) return null; const o=d.getBoundingClientRect(); return {l:o.left,t:o.top,r:o.right,b:o.bottom}; }")
    def shift(r): return {k: round(v + (fo["x"] if k in "lr" else fo["y"])) for k, v in r.items()}
    S, D = shift(inner["send"]), shift(inner["dock"])
    ov = bool(orb) and S["r"] > orb["l"] and S["l"] < orb["r"] and S["b"] > orb["t"] and S["t"] < orb["b"]
    out["ask"] = {"orb": orb and {k: round(v) for k, v in orb.items()}, "send": S, "dock": D, "overlap": ov, "sheet": inner["sheet"], "dockPad": inner["dockPad"]}
    page.screenshot(path=str(HERE / f"ask-390-{TAG}.png"), animations="disabled", timeout=120000)
    for _ in range(2): page.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('rc.')).forEach(k=>localStorage.removeItem(k))")
    b.close()
print(json.dumps(out, indent=1))
print("pageerrors:", errs)
