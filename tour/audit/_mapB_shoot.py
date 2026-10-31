"""Direction B build shots (10-09): loads Today, seeds two texts and one scheduled text (so Sent, Scheduled and Route order
all show), shoots the map at the given width, measures frame time during a camera ease, opens a beam popover and shoots it.
Run: python tour/audit/_mapB_shoot.py <1440|390> [step]   (server on :4886 must be running)
Shots: tour/audit/shots/mapB-<step>-<w>.png. With 1440 it also builds mapB-vs-pick.png (dir-map-2.png beside the build).
formsubmit.co blocked, sms:/mailto: stopped. rc.* storage cleared at the end."""
import pathlib, sys, json, time
from playwright.sync_api import sync_playwright

URL = "http://localhost:4886/tour/product.html?dev=1#/daily"
HERE = pathlib.Path(__file__).parent
SHOTS = HERE / "shots"; SHOTS.mkdir(exist_ok=True)
ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"]
W = int(sys.argv[1]) if len(sys.argv) > 1 else 1440
STEP = sys.argv[2] if len(sys.argv) > 2 else "final"
H = 900 if W > 640 else 844
MOB = W < 641
STOP_LINKS = """() => document.addEventListener('click', e => { const a = e.target.closest('a[href^="tel:"],a[href^="sms:"],a[href^="mailto:"],a[href^="https://www.google.com/maps"]'); if (a){ e.preventDefault(); window.__lastHref = a.href; } }, false)"""
CARD = '.card[data-d="0"]'

def deck(page):
    for k in range(720):
        fr = next((f for f in page.frames if "deck.html" in f.url), None)
        if fr:
            try:
                if fr.evaluate("window.__mapReady === true && typeof QREADY !== 'undefined' && QREADY"): return fr
            except Exception: pass
        page.wait_for_timeout(500)
    raise RuntimeError("deck frame not ready")

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=2 if MOB else 1, is_mobile=MOB, has_touch=MOB)
    page = ctx.new_page()
    page.route("**/formsubmit.co/**", lambda r: r.abort())
    errs = []
    page.on("console", lambda m: errs.append(m.text + " @ " + str((m.location or {}).get("url", ""))) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)))
    page.goto(URL, wait_until="domcontentloaded", timeout=90000)
    fr = deck(page)
    for _ in range(60):
        page.wait_for_timeout(500)
        if fr.evaluate("!!(window.__mapStats && window.__mapStats.hit != null)"): break
    fr.evaluate(STOP_LINKS)
    page.wait_for_timeout(1200)
    def tap(sel):
        r = fr.evaluate("s => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({block:'nearest'}); const b = e.getBoundingClientRect(); if (!b.width) return null; return {x:b.x+b.width/2, y:b.y+b.height/2}; }", sel)
        if not r: raise RuntimeError("no element " + sel)
        o = fr.frame_element().bounding_box(); page.mouse.click(o["x"] + r["x"], o["y"] + r["y"])
    def shot(name):
        f = SHOTS / f"mapB-{name}-{W}.png"; page.screenshot(path=str(f), timeout=150000, animations="disabled"); print("shot", f.name, flush=True); return f
    def show_map():
        if MOB: tap("#openRoute"); page.wait_for_timeout(2500)
    def hide_map():
        if MOB: fr.evaluate("closeSheets()"); page.wait_for_timeout(600)
    def close_bubble():
        try:
            if page.evaluate("(()=>{const x=document.querySelector('.nb-bubble .nb-x'); if(!x) return false; const r=x.getBoundingClientRect(); return r.width>0})()"):
                page.click(".nb-bubble .nb-x", timeout=5000, force=True); page.wait_for_timeout(400)
        except Exception as e: print("bubble", str(e)[:60])
    # two texts, one scheduled
    tap(f'{CARD} [data-a="text"]'); page.wait_for_timeout(600); tap("#dSms"); page.wait_for_timeout(700)
    if fr.evaluate("dlg.open"): fr.evaluate("dlg.close()")
    tap(f'{CARD} [data-a="next"]'); page.wait_for_timeout(900)
    tap(f'{CARD} [data-a="text"]'); page.wait_for_timeout(600); tap("#dSms"); page.wait_for_timeout(700)
    if fr.evaluate("dlg.open"): fr.evaluate("dlg.close()")
    fr.evaluate("RC.remember({id:HOMES[4].id, optin:true}); relist(false)"); page.wait_for_timeout(800)
    fr.evaluate("go(4,true)"); page.wait_for_timeout(1500)
    tap(f'{CARD} [data-a="text"]'); page.wait_for_timeout(800); tap("#dSched"); page.wait_for_timeout(500); tap("#sOk"); page.wait_for_timeout(800)
    show_map(); page.wait_for_timeout(1800); close_bubble()
    st = fr.evaluate("""({beams:document.querySelectorAll('.reach .beam').length, pend:document.querySelectorAll('.reach .pend').length, tag:document.querySelector('.mtag').innerText.replace(/\\n/g,' | '),
        card:document.getElementById('mnext').innerText.replace(/\\n/g,' | '), big:[...document.querySelectorAll('.stop.reached')].map(e=>e.offsetWidth), wait:[...document.querySelectorAll('.stop.wait')].slice(0,3).map(e=>e.offsetWidth),
        leg:(()=>{ const l=document.querySelector('.mleg').getBoundingClientRect(), m=document.getElementById('map').getBoundingClientRect(); return {l:Math.round(l.left-m.left), t:Math.round(l.top-m.top), w:Math.round(l.width), h:Math.round(l.height), mapW:Math.round(m.width)}; })(),
        grad:(()=>{ const g=document.getElementById('reachGrad'); return g ? [g.getAttribute('x1'),g.getAttribute('y1'),g.getAttribute('x2'),g.getAttribute('y2')] : null; })(),
        glow:getComputedStyle(document.querySelector('.reach .beam .bg')||document.body).stroke, hql:document.querySelector('.hqm').className,
        pinsUnderLegend:(()=>{ const l=document.querySelector('.mleg').getBoundingClientRect(); return [...document.querySelectorAll('.stop,.hqm')].filter(e=>{ const r=e.getBoundingClientRect(); return r.right>l.left && r.left<l.right && r.bottom>l.top && r.top<l.bottom; }).length; })(),
        cam:{z:+map.getZoom().toFixed(2), p:map.getPitch(), b:map.getBearing()}})""")
    print(json.dumps(st), flush=True)
    main = shot(STEP)
    if not MOB:   # Expand: the full-screen map is the closest frame to the picked prototype (shot at full width)
        tap("#mExp"); page.wait_for_timeout(1800); close_bubble()
        print("expanded", fr.evaluate("({z:+map.getZoom().toFixed(2), leg:(()=>{ const l=document.querySelector('.mleg').getBoundingClientRect(); return {w:Math.round(l.width), h:Math.round(l.height)}; })(), hqUnder:(()=>{ const l=document.querySelector('.mleg').getBoundingClientRect(); return [...document.querySelectorAll('.stop,.hqm')].filter(e=>{ const r=e.getBoundingClientRect(); return r.right>l.left && r.left<l.right && r.bottom>l.top && r.top<l.bottom; }).length; })()})"), flush=True)
        main = shot(STEP + "-expanded")
        tap("#mExp"); page.wait_for_timeout(1200)
    # perf: frame time while the map eases around (rAF deltas), bulk layers on
    perf = fr.evaluate("""() => new Promise(res => { const d = []; let last = performance.now(), n = 0;
        map.easeTo({ zoom: map.getZoom() + 1.2, pitch: 45, bearing: map.getBearing() + 25, duration: 1600 });
        (function f(t){ d.push(t - last); last = t; if (++n < 100) requestAnimationFrame(f); else { d.shift(); d.sort((a,b)=>a-b); res({ avg: +(d.reduce((a,b)=>a+b,0)/d.length).toFixed(1), p95: +d[Math.floor(d.length*.95)].toFixed(1), max: +d[d.length-1].toFixed(1), frames: d.length }); } })(last); })""")
    print("frame ms during ease (271k dots + hit layer on)", perf, flush=True)
    page.wait_for_timeout(500)
    shot(STEP + "-eased")
    fr.evaluate("fitAll(true)"); page.wait_for_timeout(1200)
    # a beam popover: the real text that went to home 1
    fr.evaluate("reach.openFor(HOMES[0].id)"); page.wait_for_timeout(600)
    print("popover", json.dumps(fr.evaluate("(document.querySelector('.bpop')||{}).innerText||''"))[:160], flush=True)
    shot(STEP + "-popover")
    page.keyboard.press("Escape"); page.wait_for_timeout(300)
    print("console errors:", errs, flush=True)
    for _ in range(2): fr.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('rc.')).forEach(k=>localStorage.removeItem(k))"); page.wait_for_timeout(300)
    print("cleared", fr.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('rc.')).length"), flush=True)
    b.close()
    if not MOB:
        try:
            from PIL import Image
            a = Image.open(SHOTS / "dir-map-2.png").convert("RGB"); c = Image.open(main).convert("RGB")
            h = max(a.height, c.height); out = Image.new("RGB", (a.width + c.width + 24, h), (255, 255, 255))
            out.paste(a, (0, 0)); out.paste(c, (a.width + 24, 0)); out.save(SHOTS / "mapB-vs-pick.png"); print("side by side: shots/mapB-vs-pick.png (pick left, build right)")
        except Exception as e: print("side by side skipped:", e)
print("DONE", W, "errors:", len(errs))
