"""Messages map smoke + perf (10-09): loads Today, waits for the map and the bulk home layers, sends two texts and schedules one
(so sent, scheduled and route-order lines all show), screenshots, measures frame time while the map eases, dumps the
real 50 for the direction tiles (tour/audit/dirs/sample-today.json). Run: python tour/audit/_map_smoke.py <1440|390>
Server on :4886 must be running. formsubmit.co blocked, sms:/mailto: stopped. rc.* storage cleared at the end."""
import pathlib, sys, json, time
from playwright.sync_api import sync_playwright

URL = "http://localhost:4886/tour/product.html?dev=1#/daily"
HERE = pathlib.Path(__file__).parent
SHOTS = HERE / "shots"; SHOTS.mkdir(exist_ok=True)
ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"]
W = int(sys.argv[1]) if len(sys.argv) > 1 else 1440
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
    t0 = time.time()
    page.goto(URL, wait_until="domcontentloaded", timeout=90000)
    fr = deck(page)
    t_ready = round(time.time() - t0, 2)
    for _ in range(60):
        page.wait_for_timeout(500)
        if fr.evaluate("!!(window.__mapStats && window.__mapStats.hit != null)"): break
    t_bulk = round(time.time() - t0, 2)
    fr.evaluate(STOP_LINKS)
    page.wait_for_timeout(1500)
    def tap(sel):
        r = fr.evaluate("s => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({block:'nearest'}); const b = e.getBoundingClientRect(); if (!b.width) return null; return {x:b.x+b.width/2, y:b.y+b.height/2}; }", sel)
        if not r: raise RuntimeError("no element " + sel)
        o = fr.frame_element().bounding_box(); page.mouse.click(o["x"] + r["x"], o["y"] + r["y"])
    def shot(step):
        page.screenshot(path=str(SHOTS / f"map-{step}-{W}.png"), timeout=150000, animations="disabled"); print("shot", step, flush=True)
    def show_map():
        if MOB: tap("#openRoute"); page.wait_for_timeout(2500)
    def hide_map():
        if MOB: fr.evaluate("closeSheets()"); page.wait_for_timeout(600)
    print("ready s", t_ready, "bulk s", t_bulk, fr.evaluate("window.__mapStats"), flush=True)
    show_map(); page.wait_for_timeout(800)
    print("cam", fr.evaluate("({z:+map.getZoom().toFixed(2), p:map.getPitch(), b:map.getBearing(), pins:document.querySelectorAll('.stop').length, chain:(document.querySelector('.reach .chn')||{getAttribute(){return ''}}).getAttribute('d').split('L').length, tag:document.querySelector('.mtag').innerText.replace(/\\n/g,' | ')})"), flush=True)
    shot("01-start")
    hide_map()
    # two texts, one scheduled
    tap(f'{CARD} [data-a="text"]'); page.wait_for_timeout(600); tap("#dSms"); page.wait_for_timeout(700)
    if fr.evaluate("dlg.open"): fr.evaluate("dlg.close()")
    tap(f'{CARD} [data-a="next"]'); page.wait_for_timeout(900)
    tap(f'{CARD} [data-a="text"]'); page.wait_for_timeout(600); tap("#dSms"); page.wait_for_timeout(700)
    if fr.evaluate("dlg.open"): fr.evaluate("dlg.close()")
    fr.evaluate("RC.remember({id:HOMES[4].id, optin:true}); relist(false)"); page.wait_for_timeout(800)
    fr.evaluate("go(4,true)"); page.wait_for_timeout(1500)
    tap(f'{CARD} [data-a="text"]'); page.wait_for_timeout(800); tap("#dSched"); page.wait_for_timeout(500); tap("#sOk"); page.wait_for_timeout(800)
    show_map(); page.wait_for_timeout(1500)
    try:
        if page.evaluate("(()=>{const x=document.querySelector('.nb-bubble .nb-x'); if(!x) return false; const r=x.getBoundingClientRect(); return r.width>0})()"):
            page.click(".nb-bubble .nb-x", timeout=5000, force=True); page.wait_for_timeout(400)
    except Exception as e: print("bubble", str(e)[:60])
    st = fr.evaluate("({beams:document.querySelectorAll('.reach .beam').length, pend:document.querySelectorAll('.reach .pend').length, tag:document.querySelector('.mtag').innerText.replace(/\\n/g,' | '), card:document.getElementById('mnext').innerText.replace(/\\n/g,' | '), big:[...document.querySelectorAll('.stop.reached')].map(e=>e.offsetWidth), wait:[...document.querySelectorAll('.stop.wait')].slice(0,3).map(e=>e.offsetWidth), legL:document.querySelector('.mleg').getBoundingClientRect().left, mapW:document.getElementById('map').getBoundingClientRect().width})")
    print(json.dumps(st), flush=True)
    shot("02-sent")
    # perf: frame time while the map eases around (rAF deltas)
    perf = fr.evaluate("""() => new Promise(res => { const d = []; let last = performance.now(), n = 0; const c = map.getCenter();
        map.easeTo({ zoom: map.getZoom() + 1.2, pitch: 45, bearing: map.getBearing() + 25, duration: 1600 });
        (function f(t){ d.push(t - last); last = t; if (++n < 100) requestAnimationFrame(f); else { d.shift(); d.sort((a,b)=>a-b); res({ avg: +(d.reduce((a,b)=>a+b,0)/d.length).toFixed(1), p95: +d[Math.floor(d.length*.95)].toFixed(1), max: +d[d.length-1].toFixed(1), frames: d.length }); } })(last); })""")
    print("frame ms during ease (271k dots + hit layer on)", perf, flush=True)
    # the same ease with the bulk layers off, for the before/after
    fr.evaluate("map.jumpTo({zoom: map.getZoom() - 1.2, pitch: 44, bearing: map.getBearing() - 25}); overlay.setProps({layers: []})"); page.wait_for_timeout(600)
    perf0 = fr.evaluate("""() => new Promise(res => { const d = []; let last = performance.now(), n = 0;
        map.easeTo({ zoom: map.getZoom() + 1.2, pitch: 45, bearing: map.getBearing() + 25, duration: 1600 });
        (function f(t){ d.push(t - last); last = t; if (++n < 100) requestAnimationFrame(f); else { d.shift(); d.sort((a,b)=>a-b); res({ avg: +(d.reduce((a,b)=>a+b,0)/d.length).toFixed(1), p95: +d[Math.floor(d.length*.95)].toFixed(1), max: +d[d.length-1].toFixed(1) }); } })(last); })""")
    print("frame ms during ease (bulk layers off)", perf0, flush=True)
    fr.evaluate("fpRedraw()"); page.wait_for_timeout(300)
    page.wait_for_timeout(400)
    shot("03-eased")
    # zoom in on the open home: outlines should rise
    fr.evaluate("map.jumpTo({center: HOMES[cur].loc, zoom: 16.2, pitch: 44})"); page.wait_for_timeout(2500)
    print("outlines", fr.evaluate("({z:+map.getZoom().toFixed(1), fp:fpItems.length})"), flush=True)
    shot("04-zoomed")
    fr.evaluate("fitAll(true)"); page.wait_for_timeout(1200)
    # sample for the direction tiles: the real 50 + state
    sample = fr.evaluate("({hq: reach.hqLoc, homes: HOMES.map(h=>({n:h.n, id:h.id, loc:h.loc, addr:h.short, sent: reachedToday(h.id) ? (RC.activity().find(a=>a.id===h.id&&a.dir==='out')||{}).ch||'text' : null, sched: !!RC.scheduledFor(h.id)})), hitBox: BULK.hitBox, storm: stormIso(), cam:{center:[map.getCenter().lng, map.getCenter().lat], zoom:map.getZoom(), pitch:map.getPitch(), bearing:map.getBearing()}})")
    if not MOB:
        (HERE / "dirs").mkdir(exist_ok=True)
        (HERE / "dirs" / "sample-today.json").write_text(json.dumps(sample), encoding="utf-8")
    print("console errors:", errs, flush=True)
    for _ in range(2): fr.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('rc.')).forEach(k=>localStorage.removeItem(k))"); page.wait_for_timeout(300)
    print("cleared", fr.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('rc.')).length"), flush=True)
    b.close()
print("DONE", W, "errors:", len(errs))
