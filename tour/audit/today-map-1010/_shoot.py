"""Today map shots for the 10-10 map work (lines fanning out from the base, numbered pins, Daily 50 spread).
Run: python tour/audit/today-map-1010/_shoot.py <1440|390> <before|after> [frames]   (server on :4886 must be running)
Shots: tour/audit/today-map-1010/<tag>-<w>.png; with "frames" also <tag>-frame-{1,2,3}-<w>.png (the lines drawing out,
reach.fan.seek(ms) pins the intro clock so each frame is deterministic). Prints the Daily 50 spread (cities, neighbourhoods,
2 km cells) as JSON. formsubmit.co blocked, sms:/mailto: stopped. rc.* storage cleared at the end. ONE browser, closed after."""
import pathlib, sys, json
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4886/tour/product.html?dev=1#/daily"
HERE = pathlib.Path(__file__).parent
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"]
W = int(sys.argv[1]) if len(sys.argv) > 1 else 1440
TAG = sys.argv[2] if len(sys.argv) > 2 else "before"
FRAMES = "frames" in sys.argv[3:]
H = 900 if W > 640 else 844
MOB = W < 641
STOP_LINKS = """() => document.addEventListener('click', e => { const a = e.target.closest('a[href^="tel:"],a[href^="sms:"],a[href^="mailto:"]'); if (a){ e.preventDefault(); window.__lastHref = a.href; } }, true)"""
SPREAD = """(() => { const d = RC.daily(), cell = h => Math.floor(h.lat/0.02)+'_'+Math.floor(h.lon/0.02);
  const cnt = (f) => { const m = {}; d.forEach(h => { const k = f(h) || '?'; m[k] = (m[k]||0)+1; }); return m; };
  const st = RC.queueStats();
  return { n: d.length, cities: cnt(h=>h.city), neighbourhoods: Object.keys(cnt(h=>h.neighbourhood||h.subdivision)).length, cells2km: Object.keys(cnt(cell)).length,
    streets: Object.keys(cnt(h=>h.street ? h.street.replace(/^\\d+\\s+/, '')+'|'+h.city : null)).length, storms: cnt(h=>h.storm), spread: st.spread || null, storm: st.storm, source: st.source,
    lonSpan: +(Math.max(...d.map(h=>h.lon)) - Math.min(...d.map(h=>h.lon))).toFixed(3), latSpan: +(Math.max(...d.map(h=>h.lat)) - Math.min(...d.map(h=>h.lat))).toFixed(3) }; })()"""

def deck(page):
    for _ in range(600):
        fr = next((f for f in page.frames if "deck.html" in f.url), None)
        if fr:
            try:
                if fr.evaluate("window.__mapReady === true && typeof QREADY !== 'undefined' && QREADY"): return fr
            except Exception: pass
        page.wait_for_timeout(500)
    raise RuntimeError("deck frame not ready")

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    try:
        ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=2 if MOB else 1, is_mobile=MOB, has_touch=MOB)
        page = ctx.new_page()
        page.route("**/formsubmit.co/**", lambda r: r.abort())
        errs = []
        page.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)[:200]))
        page.goto(URL, wait_until="domcontentloaded", timeout=120000)
        fr = deck(page)
        for _ in range(80):
            page.wait_for_timeout(500)
            if fr.evaluate("!!(window.__mapStats && window.__mapStats.hit != null)"): break
        fr.evaluate(STOP_LINKS)
        page.wait_for_timeout(1500)
        print(json.dumps(fr.evaluate(SPREAD)), flush=True)
        def close_bubble():
            try:
                if page.evaluate("(()=>{const x=document.querySelector('.nb-bubble .nb-x'); if(!x) return false; return x.getBoundingClientRect().width>0})()"):
                    page.click(".nb-bubble .nb-x", timeout=5000, force=True); page.wait_for_timeout(400)
            except Exception as e: print("bubble", str(e)[:60])
        if MOB:
            fr.evaluate("openSheet('route')"); page.wait_for_timeout(2500)
        close_bubble()
        page.wait_for_timeout(1200)
        st = fr.evaluate("""({ pins: document.querySelectorAll('.stop').length, numbered: [...document.querySelectorAll('.stop')].slice(0,5).map(e=>e.textContent),
            mnext: !!document.getElementById('mnext'), mnextText: (document.getElementById('mnext')||{}).innerText || null,
            fan: !!(typeof reach !== "undefined" && reach && reach.fan), legend: (document.querySelector('.mleg')||{}).innerText || null,
            cam: map ? {z:+map.getZoom().toFixed(2), p:map.getPitch(), b:map.getBearing()} : null })""")
        print(json.dumps(st), flush=True)
        if FRAMES and st.get("fan"):
            for k, ms in enumerate([700, 2200, 4600], 1):
                fr.evaluate(f"reach.fan.seek({ms})"); page.wait_for_timeout(250)
                f = HERE / f"{TAG}-frame-{k}-{W}.png"; page.screenshot(path=str(f), timeout=150000); print("shot", f.name, flush=True)
            fr.evaluate("reach.fan.seek(99999)"); page.wait_for_timeout(300)
        elif st.get("fan"):
            fr.evaluate("reach.fan.seek(99999)"); page.wait_for_timeout(300)
        f = HERE / f"{TAG}-{W}.png"; page.screenshot(path=str(f), timeout=150000); print("shot", f.name, flush=True)
        if st.get("fan") and not MOB:
            # click pin 3: the home popover (details only on click)
            r = fr.evaluate("(()=>{ const e=[...document.querySelectorAll('.stop')].find(x=>x.textContent==='3'); if(!e) return null; const b=e.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2}; })()")
            if r:
                o = fr.frame_element().bounding_box(); page.mouse.click(o["x"] + r["x"], o["y"] + r["y"]); page.wait_for_timeout(900)
                print("popover", json.dumps(fr.evaluate("(()=>{ const p=document.querExistsFix; return null; })()") if False else fr.evaluate("(()=>{ const p=[...document.querySelectorAll('.bpop')].find(x=>!x.hidden); return p ? p.innerText.replace(/\\n/g,' | ').slice(0,200) : null; })()")), flush=True)
                f = HERE / f"{TAG}-pin-popover-{W}.png"; page.screenshot(path=str(f), timeout=150000); print("shot", f.name, flush=True)
        print("errors", json.dumps(errs[:8]), flush=True)
        fr.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('rc.')).forEach(k=>localStorage.removeItem(k))")
    finally:
        b.close()
