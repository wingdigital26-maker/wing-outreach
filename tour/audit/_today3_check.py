"""Today v3 user path (Jack 10-08): beams, beam popover, scheduled-text reminders. Like a real user, in headless Chromium.
Run: python tour/audit/_today3_check.py <1440|390>   (server on :4886 must be running)
Clock pinned to Thu 2026-10-08 11:00 Central (calling open). formsubmit.co blocked, tel:/sms:/maps links stopped (the
href is kept for checks). Fresh context per run, test data cleared at the end. Shots: tour/audit/shots/today3-<step>-<w>.png"""
import pathlib, sys, json
from playwright.sync_api import sync_playwright

URL = "http://localhost:4886/tour/product.html?dev=1#/daily"
SHOTS = pathlib.Path(__file__).parent / "shots"; SHOTS.mkdir(exist_ok=True)
ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"]   # GPU path: swiftshader-only shots took minutes and let the 390 dialog close before #sOk
W = int(sys.argv[1]) if len(sys.argv) > 1 else 1440
H = 900 if W > 640 else 844
MOB = W < 641
fails = []
def check(c, m):
    print(("ok   " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)

STOP_LINKS = """() => document.addEventListener('click', e => { const a = e.target.closest('a[href^="tel:"],a[href^="sms:"],a[href^="mailto:"],a[href^="https://www.google.com/maps"]'); if (a){ e.preventDefault(); window.__lastHref = a.href; } }, false)"""
CARD = '.card[data-d="0"]'

def deck(page):
    for k in range(720):
        fr = next((f for f in page.frames if "deck.html" in f.url), None)
        if fr:
            try:
                if fr.evaluate("window.__mapReady === true"): return fr
                if k % 20 == 0: print("wait", k, fr.evaluate("(typeof map!=='undefined' && map && map.loaded) ? ({l:map.loaded(), s:map.isStyleLoaded(), w:innerWidth, h:innerHeight}) : 'noscript'"), flush=True)
            except Exception as e:
                if k % 20 == 0: print("wait", k, str(e)[:80], flush=True)
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
    # the fake clock goes in after the map has loaded (installed before load, maplibre never fires load in this shell)
    page.clock.install(time="2026-10-08T11:00:00-05:00"); page.wait_for_timeout(1500)
    print("clock", fr.evaluate("new Date().toString()"), flush=True)
    for _ in range(40):   # 10-09: the page builds the pinned day's own Daily 50 when the clock moves
        page.wait_for_timeout(250)
        if fr.evaluate("QDAY === new Date().toDateString()"): break
    fr.evaluate("refreshAll()")
    fr.evaluate(STOP_LINKS)
    page.wait_for_timeout(3000)
    def tap(sel):   # a real mouse click at the element: the fake clock starves Playwright's "stable" check (rAF)
        r = None
        for _ in range(60):
            r = fr.evaluate("s => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({block:'nearest'}); const b = e.getBoundingClientRect(); if (!b.width) return null; const x = b.x+b.width/2, y = b.y+b.height/2, t = document.elementFromPoint(x, y); return t && (t === e || e.contains(t)) ? {x, y} : null; }", sel)
            if r: break
            page.wait_for_timeout(250)
        if not r:
            page.screenshot(path=str(SHOTS / f"today3-zz-fail-{W}.png"), timeout=150000, animations="disabled")
            raise RuntimeError("no element " + sel + " dlg.open=" + str(fr.evaluate("dlg.open")) + " errs=" + str(errs[-5:]))
        o = fr.frame_element().bounding_box()
        page.mouse.click(o["x"] + r["x"], o["y"] + r["y"])
    def shot(step):
        page.screenshot(path=str(SHOTS / f"today3-{step}-{W}.png"), timeout=150000, animations="disabled"); print("shot", step, flush=True)
    def show_map():
        if MOB: tap("#openRoute"); page.wait_for_timeout(2500)
    def hide_map():
        if MOB: fr.evaluate("closeSheets()"); page.wait_for_timeout(600)
    def show_inbox():
        if MOB: tap("#openList"); page.wait_for_timeout(900)
        tap("#tabInbox"); page.wait_for_timeout(500)
    def hide_inbox():
        if MOB: fr.evaluate("closeSheets()"); page.wait_for_timeout(500)
        else: tap("#tabNext"); page.wait_for_timeout(300)
    off = lambda: fr.frame_element().bounding_box()
    def beam_point(sel, k=.62):
        pt = fr.evaluate("""([sel,k]) => { const p = document.querySelector(sel); if (!p) return null; const L = p.getTotalLength(), q = p.getPointAtLength(L*k);
            const m = p.getScreenCTM(); return { x: q.x*m.a + q.y*m.c + m.e, y: q.x*m.b + q.y*m.d + m.f }; }""", [sel, k])
        if not pt: return None
        o = off(); return (o["x"] + pt["x"], o["y"] + pt["y"])

    # 01 start
    shot("01-start")
    # 02 text stop 1 (10-09: text and email only, no calls anywhere): the cold day 1 draft goes to Messages
    check(not fr.evaluate(f"!!document.querySelector('{CARD} a.call, {CARD} a[href^=\"tel:\"]')"), "card: no Call button, no tel: link")
    tap(f'{CARD} [data-a="text"]'); page.wait_for_timeout(600)
    tap("#dSms"); page.wait_for_timeout(800)
    check(fr.evaluate("(window.__lastHref||'').startsWith('sms:')"), "text 1: sms: hand-off stopped, href kept")
    if fr.evaluate("dlg.open"): fr.evaluate("dlg.close()")
    shot("02-texted")
    tap(f'{CARD} [data-a="next"]'); page.wait_for_timeout(900)
    # 03 text stop 2 (cold since 10-09: the rep sends it by hand): edit the draft, open in Messages
    tap(f'{CARD} [data-a="text"]'); page.wait_for_timeout(500)
    tap("#dBody"); page.keyboard.press("Control+a"); page.keyboard.type("Hi there, this is Chris with Jackson Roofing. Test text from the audit, a weekday after 5?")
    shot("03-text")
    tap("#dSms"); page.wait_for_timeout(800)
    href = fr.evaluate("window.__lastHref||''")
    check(href.startswith("sms:") and "Test%20text%20from%20the%20audit" in href, "text: sms: href carries the edited draft")
    act = fr.evaluate("RC.activity().filter(a=>a.ch==='text')")
    check(bool(act) and "Test text from the audit" in (act[0].get("body") or ""), "text: record keeps the body")
    print("dlg open after sms:", fr.evaluate("dlg.open"), flush=True)
    if fr.evaluate("dlg.open"): fr.evaluate("dlg.close()")
    # 04 cold home: Schedule explains why it is unavailable (stop 1 is not opted in)
    fr.evaluate("go(0,true)"); page.wait_for_timeout(2500)
    tap(f'{CARD} [data-a="text"]'); page.wait_for_timeout(500)
    tap("#dSched"); page.wait_for_timeout(300)
    why = fr.evaluate("(document.querySelector('#dWhy')||{}).textContent||''")
    check("opted in" in why and "cold" in why, "schedule: cold home gets the reason, no picker")
    shot("04-schedule-cold")
    fr.evaluate("dlg.close()"); page.wait_for_timeout(300)
    # 05 schedule a text on stop 5, opted in (10-09: the Daily 50 homes are cold, so the check marks this one as opted in
    # on the check page first, the way a real opt-in would arrive; scheduling stays for opted-in homes only)
    fr.evaluate("RC.remember({id:HOMES[4].id, optin:true}); relist(false)"); page.wait_for_timeout(800)
    fr.evaluate("go(4,true)"); page.wait_for_timeout(2500)
    tap(f'{CARD} [data-a="text"]'); page.wait_for_timeout(800)
    if not fr.evaluate("dlg.open"): print("text dialog did not open on the first click; again", flush=True); tap(f'{CARD} [data-a="text"]'); page.wait_for_timeout(800)
    tap("#dSched"); page.wait_for_timeout(500)
    opts = fr.evaluate("[...document.querySelectorAll('#sTime option')].map(o=>o.textContent)")
    check(len(opts) > 0 and all(not o.startswith(("8:", "8 ")) or "am" not in o for o in opts), f"schedule: picker times inside the window ({opts[:2]}..{opts[-1:]})")
    shot("05-schedule")
    tap("#sOk"); page.wait_for_timeout(800)
    sc = fr.evaluate("RC.scheduled()")
    check(len(sc) == 1, "schedule: one reminder stored")
    due = sc[0]["due"] if sc else None
    # 06 inbox shows it with a live countdown
    show_inbox(); page.wait_for_timeout(1200)
    t1 = fr.evaluate("(document.querySelector('.srow .scd')||{}).textContent||''")
    page.clock.fast_forward(65000); page.wait_for_timeout(1300)
    t2 = fr.evaluate("(document.querySelector('.srow .scd')||{}).textContent||''")
    check(t1.startswith("Sends in") and t1 != t2, f"inbox: countdown ticks ({t1} -> {t2})")
    check("sends from your phone" in fr.evaluate("document.querySelector('.srow').textContent"), "inbox: labelled a reminder that sends from your phone")
    shot("06-inbox-scheduled")
    hide_inbox()
    # Up next row + card show it
    if not MOB:
        check("Text" in fr.evaluate("(document.querySelector('#qlist [data-go=\"4\"] .qsch')||{}).textContent||''"), "up next: row shows the scheduled text")
    check(fr.evaluate(f"!!document.querySelector('{CARD} .pill.sch')"), "card: scheduled pill")
    # 07 the messages map (Jack 10-09): every home on the list pinned, sent beams + pending beam with a countdown label,
    # the chain in message order through all 50, every home in the area as dots, legend on the left, no knock-route words
    show_map(); page.wait_for_timeout(2500)
    for _ in range(40):
        if fr.evaluate("!!(window.__mapStats && window.__mapStats.hit != null)"): break
        page.wait_for_timeout(500)
    st = fr.evaluate("""({beams:document.querySelectorAll('.reach .beam').length, pend:document.querySelectorAll('.reach .pend').length, lab:(document.querySelector('.rlab .plab')||{}).textContent||'',
        chain:(document.querySelector('.reach .chn')||{getAttribute(){return ''}}).getAttribute('d').split('L').length, pitch:map.getPitch(), pins:document.querySelectorAll('.stop').length, total:TOTAL,
        stats:window.__mapStats||null, tag:document.querySelector('.mtag').innerText, host:document.getElementById('map').parentElement.innerText,
        big:[...document.querySelectorAll('.stop.reached:not(.now)')].map(e=>e.offsetWidth), wait:[...document.querySelectorAll('.stop.wait:not(.now):not(.sched)')].map(e=>e.offsetWidth),
        sched:[...document.querySelectorAll('.stop.sched')].map(e=>e.classList.contains('now') ? 'now' : getComputedStyle(e).borderStyle),
        leg:(()=>{ const l=document.querySelector('.mleg').getBoundingClientRect(), m=document.getElementById('map').getBoundingClientRect(); return {l:l.left-m.left, w:m.width}; })()})""")
    print({k: st[k] for k in st if k not in ("host",)}, flush=True)
    check(st["beams"] == 2 and st["pend"] == 1 and "Text in" in st["lab"], "map: 2 sent beams, 1 pending beam with countdown")
    check(st["pins"] == st["total"] and st["chain"] == st["total"] + 1, f"map: every home pinned ({st['pins']} of {st['total']}), chain base -> every home in message order")
    check(35 <= st["pitch"] <= 50, "map: moderate tilt overhead")
    check(bool(st["stats"]) and st["stats"]["all"] > 200000 and st["stats"]["hit"] > 0, f"map: every home in the area as GPU dots ({st['stats']})")
    check(bool(st["big"]) and bool(st["wait"]) and min(st["big"]) > max(st["wait"]), f"map: sent pins bigger than waiting pins ({st['big']} > {st['wait'][:3]})")
    check(st["sched"] in (["dashed"], ["now"]), f"map: scheduled pin dashed, or the open home's own pin ({st['sched']})")
    check(st["leg"]["l"] < st["leg"]["w"] / 3, f"map: legend on the left ({st['leg']})")
    check(all(w in st["tag"] for w in ("Messages today", "sent", "scheduled", "to go", "Sent", "Scheduled", "Route order")), "map: message counts and the three line keys")
    check(not any(w in st["host"] for w in ("Knock", "knock", "Directions", "straight line", "open of", "on the route")), "map: no knock-route or driving words")
    shot("07-map-beams")
    # Nimbus's update bubble (shell) can sit over the map: close it like a user would
    def close_bubble():
        try:
            if page.evaluate("(()=>{const x=document.querySelector('.nb-bubble .nb-x'); if(!x) return false; const r=x.getBoundingClientRect(); return r.width>0})()"):
                page.click(".nb-bubble .nb-x", timeout=5000, force=True); page.wait_for_timeout(500)
        except Exception as e: print("bubble", str(e)[:80], flush=True)
    close_bubble()
    # 08 hover the beam to home 2 (the edited text) -> one-line tip; click it -> popover with the real message
    # (every home is pinned now, so on a phone the pins can cover a beam: walk the beam for a clear point, else tap its pin)
    id2 = fr.evaluate("HOMES[1].id")
    sel = '.reach .beam[data-id="' + id2 + '"] .bg'
    def beam_tap(hid):
        for k in (.62, .5, .7, .4, .8, .3, .85, .25, .9, .2):
            q = fr.evaluate("""([id,k])=>{ const p = document.querySelector('.reach .beam[data-id="'+id+'"] .hit'); if (!p) return null; const L = p.getTotalLength(), a = p.getPointAtLength(L*k), m = p.getScreenCTM();
                const x = a.x*m.a + a.y*m.c + m.e, y = a.x*m.b + a.y*m.d + m.f, t = document.elementFromPoint(x, y); return t && t.closest('.beam') && t.closest('.beam').dataset.id === id ? {x, y} : null; }""", [hid, k])
            if q: return (off()["x"] + q["x"], off()["y"] + q["y"])
        q = fr.evaluate("""(id)=>{ const e = [...document.querySelectorAll('.stop')].find(e => e.dataset.id === id); if (!e) return null; const b = e.getBoundingClientRect(); return {x:b.x+b.width/2, y:b.y+b.height/2}; }""", hid)
        print("beam covered: tapping the home's pin", flush=True)
        return (off()["x"] + q["x"], off()["y"] + q["y"])
    pt = beam_tap(id2)
    if not MOB:
        page.mouse.move(*pt); page.wait_for_timeout(400)
        tip = fr.evaluate("(()=>{const t=document.querySelector('.btip');return t&&!t.hidden?t.textContent:''})()")
        check(tip.startswith("Text,"), f"hover: tooltip '{tip}'")
    page.mouse.click(*pt); page.wait_for_timeout(700)
    pop = fr.evaluate("(()=>{const p=document.querySelector('.bpop');return p&&!p.hidden?p.innerText:''})()")
    print(json.dumps(pop), flush=True)
    check("Test text from the audit" in pop and "Text" in pop and "Open home" in pop, "popover: channel, body and Open home")
    check("deck.html" in fr.url and fr.evaluate("location.hash") in ("", "#"), "popover: no navigation")
    shot("08-popover")
    # 09 Esc closes
    page.keyboard.press("Escape"); page.wait_for_timeout(300)
    check(fr.evaluate("document.querySelector('.bpop').hidden"), "popover: Esc closes")
    # 09 a reached home's pin (bigger, lit) opens the same popover: the real text that went to home 1
    q = fr.evaluate("""(()=>{ const e = [...document.querySelectorAll('.stop.reached')].find(e => e.dataset.id === HOMES[0].id); if (!e) return null; const b = e.getBoundingClientRect();
        const x = b.x + b.width/2, y = b.y + b.height/2, t = document.elementFromPoint(x, y); return t && (t === e || e.contains(t)) ? {x, y} : null; })()""")
    if q: page.mouse.click(off()["x"] + q["x"], off()["y"] + q["y"]); page.wait_for_timeout(600)
    else: fr.evaluate("reach.openFor(HOMES[0].id)"); page.wait_for_timeout(600); print("pin 1 covered (uncollide nudge): opened by openFor", flush=True)
    pop2 = fr.evaluate("document.querySelector('.bpop').innerText")
    check(not fr.evaluate("document.querySelector('.bpop').hidden") and "Text" in pop2 and fr.evaluate("HOMES[0].short") in pop2, "popover: reached pin shows the text sent to that home")
    shot("09-popover-pin")
    # outside = a bare map point the popover does not cover (on a phone the popover spans most of the sheet's map)
    ox = fr.evaluate("""(()=>{ const p = document.querySelector('.bpop').getBoundingClientRect(), m = document.querySelector('.bpop').parentElement.getBoundingClientRect();
        let x = 30, y = innerHeight * .6; if (x >= p.left && x <= p.right && y >= p.top && y <= p.bottom){ x = m.left + 10; y = Math.min(m.bottom - 10, p.bottom + 14); } return {x, y}; })()""")
    page.mouse.click(off()["x"] + ox["x"], off()["y"] + ox["y"]); page.wait_for_timeout(300)
    check(fr.evaluate("document.querySelector('.bpop').hidden"), "popover: outside click closes")
    # keyboard: focus the list, Enter opens
    page.keyboard.press("Tab"); fr.evaluate("document.querySelector('.blist button').focus()"); page.keyboard.press("Enter"); page.wait_for_timeout(500)
    check(not fr.evaluate("document.querySelector('.bpop').hidden"), "keyboard: list button opens the popover")
    page.keyboard.press("Escape"); page.wait_for_timeout(300)
    # back to touch/mouse: focus leaves the keyboard list (it shows only while focused and would cover the beams)
    fr.evaluate("document.activeElement && document.activeElement.blur()"); page.wait_for_timeout(200)
    # pending beam popover
    # tap the beam where nothing sits on it (on a phone the stop pins cluster over the end of the line)
    pt = None
    for k in (.7, .6, .5, .45, .8, .35, .3):
        q = fr.evaluate("""(k)=>{ const p = document.querySelector('.reach .pend .pl'); if (!p) return null; const L = p.getTotalLength(), a = p.getPointAtLength(L*k), m = p.getScreenCTM();
            const x = a.x*m.a + a.y*m.c + m.e, y = a.x*m.b + a.y*m.d + m.f, t = document.elementFromPoint(x, y); return t && t.closest('.reach .pend') ? {x, y} : null; }""", k)
        if q: pt = (off()["x"] + q["x"], off()["y"] + q["y"]); print("pending beam tap at k", k, flush=True); break
    if not pt:   # covered all along (phone: the sent beams to nearby stops lie on it): tap its countdown chip, as a thumb would
        q = fr.evaluate("(()=>{ const e = document.querySelector('.rlab .plab'); if (!e) return null; const b = e.getBoundingClientRect(); return {x:b.x+b.width/2, y:b.y+b.height/2}; })()")
        print("pending beam covered: tapping its chip", flush=True); pt = (off()["x"] + q["x"], off()["y"] + q["y"])
    page.mouse.click(*pt); page.wait_for_timeout(500)
    pop3 = fr.evaluate("document.querySelector('.bpop').innerText")
    check("Scheduled text" in pop3 and "sends from your phone" in pop3, "popover: pending beam says reminder" + ("" if "Scheduled text" in pop3 else f" (got {pop3[:60]!r}, cur {fr.evaluate('cur')})"))
    shot("10-popover-pending")
    page.keyboard.press("Escape"); page.wait_for_timeout(300)
    hide_map()
    # 11 time comes: "Time to send" prompt, open Messages, confirm sent
    left = fr.evaluate("Date.parse(RC.scheduled()[0].due) - Date.now()")
    page.clock.fast_forward(int(left) + 2500)
    title = ''
    for _ in range(30):   # the page's own 1 s clock raises the prompt
        page.wait_for_timeout(500)
        title = fr.evaluate("dlg.open ? dlg.querySelector('h3').textContent : ''")
        if title: break
    check(title == "Time to send", f"due: prompt '{title}'")
    check(len(fr.evaluate("RC.scheduled()")) == 1, "due: still not marked sent on its own")
    shot("11-time-to-send")
    tap("#dSms"); page.wait_for_timeout(600)
    check(fr.evaluate("(window.__lastHref||'').startsWith('sms:')"), "due: Messages hand-off")
    shot("12-did-you-send")
    tap("#tYes"); page.wait_for_timeout(800)
    check(len(fr.evaluate("RC.scheduled()")) == 0 and fr.evaluate("RC.activity().some(a=>a.ch==='text' && a.scheduled)"), "due: marked sent only after Yes, body kept")
    # 13 click a beam -> Open home -> Home screen; come back
    show_map(); page.wait_for_timeout(1500); close_bubble()
    pt = beam_tap(id2)
    page.mouse.click(*pt); page.wait_for_timeout(500)
    shot("13-popover-again")
    tap(".bpop .bp-open"); page.wait_for_timeout(3500)
    check("#/home" in page.url or "home" in page.url, f"open home: shell on Home ({page.url})")
    shot("14-home")
    page.go_back(); page.wait_for_timeout(3500)
    fr = deck(page)
    check("#/daily" in page.url, f"back: on Today ({page.url})")
    shot("15-back")
    # Nimbus corner: card actions clear of the orb and the bottom-right 100x100
    orb = page.evaluate("(()=>{ const e = document.querySelector('.nb-dock'); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? {x:r.x,y:r.y,w:r.width,h:r.height} : null })()")
    o = off()
    btns = fr.evaluate(f"[...document.querySelectorAll('{CARD} .act a, {CARD} .act button')].map(b=>{{const r=b.getBoundingClientRect();return {{t:b.textContent.trim(),x:r.x,y:r.y,r:r.right,b:r.bottom}}}})")
    corner = (W - 100, H - 100)
    for bt in btns:
        bx, by = o["x"] + bt["r"], o["y"] + bt["b"]
        hit_corner = bx > corner[0] and by > corner[1]
        hit_orb = orb and (o["x"] + bt["x"] < orb["x"] + orb["w"] and bx > orb["x"] and o["y"] + bt["y"] < orb["y"] + orb["h"] and by > orb["y"])
        check(not hit_corner and not hit_orb, f"nimbus corner clear of '{bt['t']}' (orb {orb})")
    print("console errors:", errs, flush=True)
    check(not errs, "0 console errors")
    # clear test data
    fr.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('rc.')).forEach(k=>localStorage.removeItem(k))")
    print("cleared", fr.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('rc.t.att')||k.startsWith('rc.t.pipe')||k.startsWith('rc.t.sched')).length"), flush=True)
    b.close()
print("DONE", W, "fails:", len(fails), fails, flush=True)
