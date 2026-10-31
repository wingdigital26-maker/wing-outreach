"""Daily 50 always-on "likely to say yes" check (10-11). One headless swiftshader Chromium at 1440 (server :4886 running).
Rebuilds today's list (RC.daily(null, {rebuild:true})), prints stats + every pick's reasons to result.json, shoots Today
(list + map) and the Ask answer "why is #1 on today's list". formsubmit.co blocked, sms:/mailto:/tel: stopped, rc.* cleared after."""
import pathlib, json
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4886/tour/product.html?dev=1#/daily"
HERE = pathlib.Path(__file__).parent
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"]
STOP = """() => document.addEventListener('click', e => { const a = e.target.closest('a[href^="tel:"],a[href^="sms:"],a[href^="mailto:"]'); if (a) e.preventDefault(); }, true)"""
DUMP = """(() => { const d = RC.daily(), st = RC.queueStats(), cell = h => Math.floor(h.lat/0.02)+'_'+Math.floor(h.lon/0.02);
  const cnt = f => { const m = {}; d.forEach(h => { const k = f(h) || '?'; m[k] = (m[k]||0)+1; }); return m; };
  return { n: d.length, source: st.source, fileBuilt: st.fileBuilt, fileStale: st.fileStale, mode: st.mode, homesScored: st.homesScored, candidates: st.candidates,
    excluded: st.excluded, factors: st.factors, fromStorm: st.fromStorm, spread: st.spread, cities: cnt(h=>h.city),
    neighbourhoods: Object.keys(cnt(h=>h.neighbourhood)).length, cells2km: Object.keys(cnt(cell)).length,
    lonSpan: +(Math.max(...d.map(h=>h.lon)) - Math.min(...d.map(h=>h.lon))).toFixed(3), latSpan: +(Math.max(...d.map(h=>h.lat)) - Math.min(...d.map(h=>h.lat))).toFixed(3),
    picks: d.map((h,i) => ({ n: i+1, address: h.address, nb: h.neighbourhood, score: h.score, parts: h.parts, why: h.why, hail: h.hail, roofYear: h.roofYear, squares: h.squares, neighbours: h.neighbours, ownerOccupied: h.ownerOccupied })) }; })()"""

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
        ctx = b.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.route("**/formsubmit.co/**", lambda r: r.abort())
        errs = []
        page.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)[:200]))
        page.goto(URL, wait_until="domcontentloaded", timeout=120000)
        fr = deck(page)
        fr.evaluate("RC.daily(null, {rebuild:true}); 0")   # today's list from this engine version (a kept v2 list is ignored anyway)
        page.reload(wait_until="domcontentloaded"); fr = deck(page)
        for _ in range(60):
            page.wait_for_timeout(500)
            if fr.evaluate("!!(window.__mapStats && window.__mapStats.hit != null)"): break
        fr.evaluate(STOP)
        page.wait_for_timeout(8000)
        res = fr.evaluate(DUMP)
        try:
            if page.evaluate("(()=>{const x=document.querySelector('.nb-bubble .nb-x'); return !!(x && x.getBoundingClientRect().width>0)})()"):
                page.click(".nb-bubble .nb-x", timeout=5000, force=True)
        except Exception: pass
        page.wait_for_timeout(1000)
        page.screenshot(path=str(HERE / "today-1440.png"))
        res["rowText"] = fr.evaluate("[...document.querySelectorAll('#qlist .qrow')].slice(0,8).map(r=>r.innerText.replace(/ +/g,' ').trim())")
        page.evaluate("Nimbus.ask(true, \"why is #1 on today's list\")")
        page.wait_for_timeout(8000)
        res["askText"] = ""
        for f in page.frames:
            try: t = f.evaluate("[...document.querySelectorAll('.ak-why, .ak-src')].map(x=>x.innerText).join(' | ').slice(0,1500)")
            except Exception: t = ""
            if t: res["askText"] = t; break
        (HERE / "result.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
        try: page.screenshot(path=str(HERE / "ask-why-1-1440.png"), timeout=150000, animations="disabled")
        except Exception as e: print("ask shot", str(e)[:120])
        res["errors"] = errs
        (HERE / "result.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
        print(json.dumps({k: res[k] for k in ("n", "source", "fileStale", "homesScored", "cities", "neighbourhoods", "cells2km", "factors", "fromStorm", "excluded", "rowText", "askText", "errors")}, indent=1))
        page.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('rc.')).forEach(k=>localStorage.removeItem(k))")
    finally:
        b.close()
