"""Today map outreach lines (c4-command-deck/reach.js): empty state, then 3 contacts made through the real card buttons.
Run: python tour/audit/_arcs_check.py   (server on :4886 must already be running)
Clock pinned to Thu 2026-10-08 11:00 Central so calling is open. tel:/sms: links are stopped, formsubmit is blocked,
any request to a host other than localhost or the basemap is logged as a failure. Contexts are fresh and cleared after."""
import pathlib, sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:4886/tour/product.html?dev=1#/daily"
SHOTS = pathlib.Path(__file__).parent / "shots"; SHOTS.mkdir(exist_ok=True)
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
OK_HOSTS = ("localhost", "127.0.0.1", "tiles.openfreemap.org", "basemap.nationalmap.gov")
fails = []
def check(c, m):
    print(("ok   " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)

STOP_LINKS = """() => document.addEventListener('click', e => { const a = e.target.closest('a[href^="tel:"],a[href^="sms:"],a[href^="mailto:"],a[href^="https://www.google.com/maps"]'); if (a){ e.preventDefault(); window.__lastHref = a.href; } }, true)"""

def deck(page):
    for _ in range(300):
        fr = next((f for f in page.frames if "deck.html" in f.url), None)
        if fr:
            try:
                if fr.evaluate("window.__mapReady === true"): return fr
            except Exception: pass
        page.wait_for_timeout(500)
    raise RuntimeError("deck frame not ready")

def run(p, w, h, mob):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mob else 1, is_mobile=mob, has_touch=mob)
    page = ctx.new_page()
    page.clock.install(time="2026-10-08T11:00:00-05:00")
    page.route("**/formsubmit.co/**", lambda r: r.abort())
    errs, foreign = [], []
    page.on("console", lambda m: errs.append(m.text + " @ " + str((m.location or {}).get("url", ""))) if m.type == "error" else None)
    page.on("requestfailed", lambda r: print("requestfailed", r.url, r.failure, flush=True))
    page.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)))
    def req(r):
        u = r.url
        if u.startswith(("data:", "blob:")): return
        host = u.split("/")[2].split(":")[0] if "://" in u else ""
        if host not in OK_HOSTS: foreign.append(r.method + " " + u)
    page.on("request", req)
    page.goto(URL, wait_until="domcontentloaded", timeout=90000)
    fr = deck(page)
    fr.evaluate(STOP_LINKS)
    tag = str(w)
    def show_map():
        if mob:
            fr.click("#openRoute"); page.wait_for_timeout(1500)
    def hide_map():
        if mob:
            fr.evaluate("closeSheets()"); page.wait_for_timeout(600)
    # (a) empty state
    show_map(); page.wait_for_timeout(10000)
    st = fr.evaluate("""() => ({ q: document.querySelectorAll('.reach .q').length, arcs: document.querySelectorAll('.reach .arc').length,
        hq: !!document.querySelector('.hqm'), note: (document.querySelector('.mleg .lnote')||{}).textContent,
        legend: (document.querySelector('.mleg .lk')||{}).textContent })""")
    print(tag, "empty", st, flush=True)
    check(st["arcs"] == 0 and st["q"] == 12 and st["hq"], f"{tag} empty: 0 arcs, 12 queued lines, base marker")
    check("Lines fill in" in (st["note"] or ""), f"{tag} empty: note says lines fill in")
    check(fr.evaluate("document.querySelectorAll('.mleg .days button').length") == 1, f"{tag} empty: day selector shows Today only")
    page.screenshot(path=str(SHOTS / f"arcs-empty-{tag}.png"), timeout=60000, animations="disabled")
    hide_map()
    # (b) three contacts through the real card buttons: call (no answer), text (opted-in stop 2), call (spoke)
    card = '.card[data-d="0"]'
    fr.click(f'{card} a.call'); page.wait_for_timeout(300)
    fr.click(f'{card} [data-out="no_answer"]'); page.wait_for_timeout(300)
    fr.click(f'{card} [data-a="next"]'); page.wait_for_timeout(900)
    fr.click(f'{card} [data-a="text"]'); page.wait_for_timeout(400)
    fr.click('#dSms'); page.wait_for_timeout(700)
    fr.evaluate("dlg.open && dlg.close()")
    fr.evaluate("go(2, true)"); page.wait_for_timeout(900)
    fr.click(f'{card} a.call'); page.wait_for_timeout(300)
    fr.click(f'{card} [data-out="spoke"]'); page.wait_for_timeout(600)
    show_map(); page.wait_for_timeout(4000)
    st = fr.evaluate("""() => ({ arcs: [...document.querySelectorAll('.reach .arc')].map(a=>a.dataset.ch), q: document.querySelectorAll('.reach .q').length,
        reached: document.querySelectorAll('.stop.reached').length, note: document.querySelector('.mleg .lnote').textContent,
        contacted: RC.contacted().map(c=>c.id+':'+c.channel), lastHref: window.__lastHref || '' })""")
    print(tag, "contacted", st, flush=True)
    check(sorted(st["arcs"]) == ["call", "call", "text"], f"{tag} contacted: 2 call arcs + 1 text arc")
    check(st["q"] == 9, f"{tag} contacted: 9 queued lines left")
    check(st["reached"] == 3, f"{tag} contacted: 3 filled pins")
    # every pin and the base inside the clear part of the frame
    vis = fr.evaluate("""() => { const host = document.getElementById('map').getBoundingClientRect(), pad = fitPad();
        const pts = markers.map(m=>{ const p = map.project(m.getLngLat()), o = m.getOffset(); return [p.x+o.x, p.y+o.y]; }); const h = map.project(reach.hqLoc); pts.push([h.x,h.y]);
        return pts.filter(([x,y]) => x < 0 || x > host.width || y < pad.top - 30 || y > host.height - pad.bottom + 30).length; }""")
    check(vis == 0, f"{tag} every pin and the base sit in the clear frame ({vis} outside)")
    page.screenshot(path=str(SHOTS / f"arcs-contacted-{tag}.png"), timeout=60000, animations="disabled")
    # day selector: an earlier-day call (test only, cleared below) adds a day chip and All days
    fr.evaluate("""() => { const k='rc.t.att', a=JSON.parse(localStorage.getItem(k)||'{}'); (a['djackson-6']=a['djackson-6']||[]).push({at:new Date(Date.now()-864e5).toISOString(), outcome:'no_answer'}); localStorage.setItem(k, JSON.stringify(a)); reach.update(); }""")
    days = fr.evaluate("[...document.querySelectorAll('.mleg .days button')].map(b=>b.textContent)")
    print(tag, "days", days, flush=True)
    check(len(days) == 3 and days[-1] == "All days", f"{tag} day selector: Today, yesterday, All days")
    fr.click('.mleg .days button:nth-child(3)'); page.wait_for_timeout(1500)
    check(len(fr.evaluate("[...document.querySelectorAll('.reach .arc')]")) == 4, f"{tag} All days shows 4 lines")
    page.screenshot(path=str(SHOTS / f"arcs-alldays-{tag}.png"), timeout=60000, animations="disabled")
    fr.click('.mleg .days button:nth-child(1)'); page.wait_for_timeout(800)
    # expand
    fr.click('#mExp'); page.wait_for_timeout(2500)
    big = fr.evaluate("(()=>{const r=document.getElementById('map').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]})()")
    print(tag, "expanded map", big, flush=True)
    check(big[0] >= w - 40, f"{tag} expand: map fills the width")
    page.screenshot(path=str(SHOTS / f"arcs-expanded-{tag}.png"), timeout=60000, animations="disabled")
    fr.click('#mExp'); page.wait_for_timeout(1500)
    # click an arc: opens that stop on the card
    if not mob:
        fr.evaluate("""() => { const a = document.querySelector('.reach .arc[data-ch="text"] .hit'); a.dispatchEvent(new MouseEvent('click', {bubbles:true})); }""")
        page.wait_for_timeout(600)
        check(fr.evaluate("HOMES[cur].n") == 2, f"{tag} clicking the text line opens stop 2 on the card")
    check(not errs, f"{tag} 0 console errors {errs[:5]}")
    check(not foreign, f"{tag} no request left localhost or the basemap {foreign[:5]}")
    # clear the test contacts from this context's storage
    fr.evaluate("""() => { ['att','pipe','d50skip'].forEach(k => localStorage.removeItem('rc.t.'+k)); localStorage.removeItem('rc.reachDay'); }""")
    left = fr.evaluate("RC.contacted({all:true}).length")
    check(left == 0, f"{tag} test contacts cleared")
    ctx.close(); b.close()

with sync_playwright() as p:
    which = sys.argv[1:] or ["1440", "390"]
    if "1440" in which: run(p, 1440, 900, False)
    if "390" in which: run(p, 390, 844, True)
print("FAILS:", len(fails)); [print(" -", f) for f in fails]
