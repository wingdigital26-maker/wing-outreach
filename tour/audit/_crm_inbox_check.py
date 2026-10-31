"""CRM inbox check (10-09): the Homes tab is now CRM, a three-pane inbox on the same records Today's inbox reads.
Run: python tour/audit/_crm_inbox_check.py <1440|390>   (the loop's server on :4886 must be running; one width per run)
Headless Chromium on the GPU path, real mouse clicks. Clock pinned to Thu 2026-10-08 11:00 Central (texting hours), then
moved 48 h for the Due today filter. formsubmit.co blocked; sms:/mailto:/tel:/maps links stopped (href kept for checks).
Steps: text a home on Today -> the thread is in the CRM at once; the right pane shows that home's roof; a second thread
and a message click switch the right pane; log a reply (library answer); next touch one tap; the same thread shows on
Today's inbox; opt out; filters; search; stage; Pipeline tab; a card opens the record; #/home/<id> alias; phone stack.
Fresh context; rc.* storage cleared at the end. Shots: tour/audit/shots/crmx-<step>-<w>.png"""
import pathlib, sys, json
from playwright.sync_api import sync_playwright

URL = "http://localhost:4886/tour/product.html?dev=1&nosw=1#/daily"
SHOTS = pathlib.Path(__file__).parent / "shots"; SHOTS.mkdir(exist_ok=True)
ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"]
W = int(sys.argv[1]) if len(sys.argv) > 1 else 1440
H = 900 if W > 640 else 844
MOB = W < 641
fails = []
def check(c, m):
    print(("ok   " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)

GUARD = """document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href^="tel:"],a[href^="sms:"],a[href^="mailto:"],a[href^="https://www.google.com/maps"]');
  if (a) { e.preventDefault(); window.__lastHref = a.href; (window.__blocked = window.__blocked || []).push(a.href); } }, true);"""
CLEAR = "Object.keys(localStorage).filter(k => k.startsWith('rc.')).forEach(k => localStorage.removeItem(k))"
KNOWN = "called is not a function"   # lib/nimbus-shell.js routeToday (not a CRM file): counted apart

def frame_of(page, part, ready, tries=720):
    for _ in range(tries):
        fr = next((f for f in page.frames if part in f.url), None)
        if fr:
            try:
                if fr.evaluate(ready): return fr
            except Exception: pass
        page.wait_for_timeout(500)
    raise RuntimeError("frame not ready: " + part)
def deck(page): return frame_of(page, "deck.html", "window.__mapReady === true && typeof QREADY !== 'undefined' && QREADY")
def crm(page): return frame_of(page, "c5-home", "!!window.renderCRM && !!window.HOME && !!document.querySelector('#clist')")

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=2 if MOB else 1, is_mobile=MOB, has_touch=MOB, timezone_id="America/Chicago")
    ctx.add_init_script(GUARD)
    ctx.route("**/formsubmit.co/**", lambda r: r.abort())
    page = ctx.new_page()
    errs, known = [], []
    def on_err(t):
        (known if KNOWN in t else errs).append(t)
    page.on("console", lambda m: on_err(m.text + " @ " + str((m.location or {}).get("url", ""))) if m.type == "error" else None)
    page.on("pageerror", lambda e: on_err("PAGEERR " + str(e)))
    page.goto(URL, wait_until="domcontentloaded", timeout=90000)
    fr = deck(page); fr.evaluate(CLEAR)
    page.reload(wait_until="domcontentloaded"); fr = deck(page)
    page.clock.install(time="2026-10-08T11:00:00-05:00")
    for _ in range(40):
        page.wait_for_timeout(500)
        if fr.evaluate("QDAY === new Date().toDateString()"): break
    page.wait_for_timeout(2000)

    def tap(f, sel):
        r = None
        for _ in range(60):
            r = f.evaluate("s => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({block:'nearest'}); const b = e.getBoundingClientRect(); if (!b.width) return null; const x = b.x+b.width/2, y = b.y+b.height/2, t = document.elementFromPoint(x, y); return t && (t === e || e.contains(t)) ? {x, y} : null; }", sel)
            if r: break
            page.wait_for_timeout(250)
        if not r:
            page.screenshot(path=str(SHOTS / f"crmx-zz-fail-{W}.png"), timeout=150000, animations="disabled")
            raise RuntimeError("no element " + sel + " errs=" + str(errs[-5:]))
        o = f.frame_element().bounding_box()
        page.mouse.click(o["x"] + r["x"], o["y"] + r["y"])
    def shot(step):
        page.screenshot(path=str(SHOTS / f"crmx-{step}-{W}.png"), timeout=150000, animations="disabled"); print("shot", step, flush=True)
    def close_bubble():
        try:
            if page.evaluate("(()=>{const x=document.querySelector('.nb-bubble .nb-x'); if(!x) return false; const r=x.getBoundingClientRect(); return r.width>0})()"):
                page.click(".nb-bubble .nb-x", timeout=5000, force=True); page.wait_for_timeout(400)
        except Exception as e: print("bubble", str(e)[:80], flush=True)
    def nav(screen):
        page.click(f'nav button[data-screen="{screen}"]', force=True); page.wait_for_timeout(1200)
    def text_on_today(n):   # stop n (1-based) on Today: Text -> Open in Messages (sms: stopped by the guard)
        fr.evaluate(f"go({n-1},true)"); page.wait_for_timeout(1200)
        if MOB: fr.evaluate("closeSheets()"); page.wait_for_timeout(400)
        tap(fr, '.card[data-d="0"] [data-a="text"]'); page.wait_for_timeout(600)
        tap(fr, "#dSms"); page.wait_for_timeout(800)
        if fr.evaluate("dlg.open"): fr.evaluate("dlg.close()")
    def rows(): return cf.evaluate("[...document.querySelectorAll('#clist .crow')].map(r=>r.dataset.id)")
    def filt(f): tap(cf, f'#cfil [data-f="{f}"]'); page.wait_for_timeout(400)
    def wait_roof(id_, label):
        for _ in range(80):
            st = cf.evaluate("({id:(window.HOME||{}).rawId, inPane:!!document.querySelector('#chstage #stage'), ready:!!window.__ready, title:(document.getElementById('titleH')||{}).textContent||''})")
            if st["id"] == id_ and st["inPane"] and st["ready"] and st["title"]: break
            page.wait_for_timeout(250)
        print("roof", json.dumps(st), flush=True)
        check(st["id"] == id_ and st["inPane"], f"{label}: right pane shows {id_} (3D stage inside the home pane)")
        check(bool(st["title"]) and ("squares" in st["title"] or "No outline" in st["title"]), f"{label}: roof headline '{st['title'][:50]}'")
        return st

    close_bubble()
    ids = fr.evaluate("HOMES.slice(0,3).map(h=>h.id)")
    # 01: a text on Today -> the thread is in the CRM
    text_on_today(1)
    check(fr.evaluate(f"RC.activity().filter(a=>a.id==='{ids[0]}' && a.ch==='text').length") == 1, "today: text logged for stop 1")
    nav("home")
    check(page.evaluate("location.hash") == "#/crm", f"nav: CRM tab routes to #/crm ({page.evaluate('location.hash')})")
    check(page.evaluate("[...document.querySelectorAll('nav button')].map(b=>b.textContent)") == ["Today", "Storms", "CRM", "Ask"], "nav: tab reads CRM")
    cf = crm(page); page.wait_for_timeout(1500)
    check(cf.evaluate("document.body.dataset.view") == "inbox", "crm: default view is the inbox")
    check(rows() == [ids[0]], f"inbox: the text from Today is a thread here ({rows()})")
    row = cf.evaluate(f"(document.querySelector('.crow[data-id=\"{ids[0]}\"]')||{{}}).innerText||''")
    check("just now" in row or "min ago" in row, "inbox row: last contact time")
    check("Contacted" in row and "Day 3 follow-up due" in row, "inbox row: stage and cadence step")
    if MOB:
        check(cf.evaluate("document.querySelector('#crm').dataset.screen") == "list", "phone: list screen first")
        shot("01-list"); tap(cf, f'.crow[data-id="{ids[0]}"]'); page.wait_for_timeout(600)
        check(cf.evaluate("document.querySelector('#crm').dataset.screen") == "thread", "phone: tapping a thread opens the conversation screen")
    else:
        check(rows() and cf.evaluate(f"document.querySelector('.crow[data-id=\"{ids[0]}\"]').classList.contains('sel')"), "inbox: first thread opens on its own")
    th = cf.evaluate("document.querySelector('#cvm').innerText")
    check("Text drafted in Messages" in th and "today" in th.lower(), "thread: the text from Today sits in the conversation")
    check("Next: Day 3 email" in cf.evaluate("document.querySelector('#cvf').innerText"), "thread: next touch is the day 3 email (new cadence: one text, then email)")
    if MOB:
        shot("02-thread"); tap(cf, '[data-a="house"]'); page.wait_for_timeout(900)
        check(cf.evaluate("document.querySelector('#crm').dataset.screen") == "home", "phone: House opens the home sheet")
    wait_roof(ids[0], "thread 1")
    facts = cf.evaluate("document.querySelector('#chf').innerText")
    check("Hail here" in facts and "Roof" in facts and "Squares" in facts and "Book inspection" in facts and "Contacted" in facts, "home pane: hail, roof, squares, stage strip, Book inspection")
    shot("03-inbox-first" if not MOB else "03-home-sheet")
    # 04: a second home from Today -> a second thread; clicking it switches the right pane
    nav("daily"); fr = deck(page); page.wait_for_timeout(800)
    text_on_today(2)
    nav("home"); cf = crm(page); page.wait_for_timeout(1000)
    if MOB: cf.evaluate("document.querySelector('#crm').dataset.screen='list'"); page.wait_for_timeout(300)
    check(set(rows()) == {ids[0], ids[1]} and rows()[0] == ids[1], f"inbox: two threads, newest first ({rows()})")
    tap(cf, f'.crow[data-id="{ids[1]}"]'); page.wait_for_timeout(900)
    if MOB: tap(cf, '[data-a="house"]'); page.wait_for_timeout(900)
    wait_roof(ids[1], "thread 2")
    check(page.evaluate("location.hash") == f"#/crm/inbox/{ids[1]}", f"route: #/crm/inbox/<id> ({page.evaluate('location.hash')})")
    shot("04-second-thread")
    if MOB: tap(cf, '[data-a="tothread"]'); page.wait_for_timeout(500)
    # 05: back to the first thread, click its message: the pane follows the message
    if MOB: tap(cf, '[data-a="back"]'); page.wait_for_timeout(500)
    tap(cf, f'.crow[data-id="{ids[0]}"]'); page.wait_for_timeout(900)
    tap(cf, '#cvm .msg.out'); page.wait_for_timeout(700)
    check(cf.evaluate("!!document.querySelector('#cvm .msg.on')"), "message click: the message is marked")
    if MOB: check(cf.evaluate("document.querySelector('#crm').dataset.screen") == "home", "phone: a message tap opens the home sheet")
    wait_roof(ids[0], "message click")
    check("From this message" in cf.evaluate("document.querySelector('#chf').innerText"), "home pane: names the message it came from")
    shot("05-message")
    if MOB: tap(cf, '[data-a="tothread"]'); page.wait_for_timeout(500)
    # 06: log a reply "Who is this?" -> the library's answer
    tap(cf, '[data-a="reply"]'); page.wait_for_timeout(300)
    tap(cf, '#iRep'); page.keyboard.type("Who is this?"); tap(cf, '[data-a="rsave"]'); page.wait_for_timeout(700)
    sug = cf.evaluate("(document.querySelector('.csdraft')||{}).value||''")
    want = cf.evaluate(f"RC.copy.render('reply.who', crmFacts('{ids[0]}')).body")
    check(bool(sug) and sug == want and "Asked who this is" in cf.evaluate("document.querySelector('.csugg').innerText"), "reply: 'who is this' gets the library answer")
    check("Who is this?" in cf.evaluate("document.querySelector('#cvm').innerText") and cf.evaluate("!!document.querySelector('#cvm .msg.in')"), "thread: the reply shows as an inbound bubble")
    check(cf.evaluate(f"document.querySelector('.crow[data-id=\"{ids[0]}\"]').classList.contains('rep')"), "inbox row: replied marker")
    shot("06-reply")
    # 07: next touch one tap -> sms: hand-off, logged, cadence moves on
    nx = cf.evaluate("document.querySelector('.cnext').innerText")
    check("Email" in nx and cf.evaluate("document.querySelector('.cnext .cseg [data-ch=\"email\"]').getAttribute('aria-pressed')") == "true", "next touch: the segment follows the library's channel (email on day 3)")
    check(cf.evaluate("!!document.querySelector('.cnext .csubj') && !!document.querySelector('.cnext .cdraft')"), "next touch: email subject and draft shown")
    check(cf.evaluate("!!document.querySelector('.cnext .cbtn.off')") and "mailing address" in nx, "next touch: Open in Mail is off with the mailing-address reason")
    tap(cf, '.cnext [data-ch="text"]'); page.wait_for_timeout(400)
    check("goes by email" in cf.evaluate("document.querySelector('.cnext').innerText"), "next touch: asking for a text on day 3 says it goes by email")
    check("Day 3 follow-up due" in cf.evaluate("document.querySelector('#cvh').innerText"), "next touch: still day 3")
    # 08: the same thread on Today's inbox (both read RC.activity)
    nav("daily"); fr = deck(page); page.wait_for_timeout(800)
    if MOB: tap(fr, "#openList"); page.wait_for_timeout(900)
    tap(fr, "#tabInbox"); page.wait_for_timeout(600)
    tr = fr.evaluate("[...document.querySelectorAll('.ilist .irow')].map(r=>r.dataset.id)")
    check(set(tr) == {ids[0], ids[1]}, f"today inbox: the same two threads ({tr})")
    tap(fr, f'.irow[data-id="{ids[0]}"]'); page.wait_for_timeout(600)
    tt = fr.evaluate("document.querySelector('.ithread').innerText")
    check("Who is this?" in tt and "Day 3" in tt, "today inbox: shows the CRM's reply and the same cadence step")
    shot("08-today-inbox")
    if MOB: fr.evaluate("closeSheets()")
    nav("home"); cf = crm(page); page.wait_for_timeout(800)
    if MOB: cf.evaluate("document.querySelector('#crm').dataset.screen='list'")
    tap(cf, f'.crow[data-id="{ids[0]}"]'); page.wait_for_timeout(600)
    # 09: opt out
    tap(cf, '[data-a="optout"]'); page.wait_for_timeout(600)
    check(cf.evaluate(f"RC.optedOut('{ids[0]}')"), "opt out: RC.optOut called")
    check("Opted out, no follow-ups" in cf.evaluate("document.querySelector('#cvh').innerText") and "No next touch" in cf.evaluate("document.querySelector('#cvf').innerText"), "opt out: cadence stops, no next touch")
    shot("09-opted-out")
    if MOB: tap(cf, '[data-a="back"]'); page.wait_for_timeout(400)
    # 10: filters and search
    filt("out"); check(rows() == [ids[0]], "filter: Opted out")
    filt("reply"); check(rows() == [], "filter: Replied empty after the opt out")
    filt("late"); check(rows() == [], "filter: Overdue empty")
    filt("due"); check(rows() == [], "filter: Due today empty on day 1")
    page.clock.fast_forward("48:00:00"); cf.evaluate("renderCRM()"); page.wait_for_timeout(500)
    check(rows() == [ids[1]], f"filter: Due today on day 3 = the open home ({rows()})")
    filt("all"); check(len(rows()) == 2, "filter: All = 2")
    cf.evaluate("(()=>{ const s=document.querySelector('#cstF'); s.value='called'; s.dispatchEvent(new Event('change',{bubbles:true})); })()"); page.wait_for_timeout(300)
    check(set(rows()) == {ids[0], ids[1]}, f"filter: stage Contacted = both ({rows()})")
    cf.evaluate("(()=>{ const s=document.querySelector('#cstF'); s.value='new'; s.dispatchEvent(new Event('change',{bubbles:true})); })()"); page.wait_for_timeout(300)
    check(rows() == [], "filter: stage New hit = none")
    cf.evaluate("(()=>{ const s=document.querySelector('#cstF'); s.value=''; s.dispatchEvent(new Event('change',{bubbles:true})); })()")
    word = cf.evaluate(f"(RC.recall('{ids[1]}')||{{}}).addr.split(' ').slice(0,2).join(' ')")
    tap(cf, '#cq'); page.keyboard.type(word); page.wait_for_timeout(400)
    check(ids[1] in rows() and len(rows()) <= 2, f"search '{word}' finds the home")
    shot("10-search")
    cf.evaluate("(()=>{ const i=document.querySelector('#cq'); i.value=''; i.dispatchEvent(new Event('input')); })()"); page.wait_for_timeout(300)
    # 11: stage control from the thread
    tap(cf, f'.crow[data-id="{ids[1]}"]'); page.wait_for_timeout(700)
    cf.evaluate("(()=>{ const s=document.querySelector('#cvStage'); s.value='proposal'; s.dispatchEvent(new Event('change',{bubbles:true})); })()"); page.wait_for_timeout(600)
    check(cf.evaluate(f"RC.stage('{ids[1]}')") == "proposal", "stage: select moves the home to Proposal")
    if MOB: tap(cf, '[data-a="house"]'); page.wait_for_timeout(700)
    check(cf.evaluate("(document.querySelector('#chf .cst.on')||{}).dataset && document.querySelector('#chf .cst.on').dataset.s") == "proposal", "home pane: stage strip follows")
    shot("11-stage")
    if MOB: tap(cf, '[data-a="tothread"]'); page.wait_for_timeout(300); tap(cf, '[data-a="back"]'); page.wait_for_timeout(300)
    cf.evaluate("(()=>{ const s=document.querySelector('#cstF'); s.value='proposal'; s.dispatchEvent(new Event('change',{bubbles:true})); })()"); page.wait_for_timeout(300)
    check(rows() == [ids[1]], f"filter: stage Proposal = the moved home ({rows()})")
    cf.evaluate("(()=>{ const s=document.querySelector('#cstF'); s.value=''; s.dispatchEvent(new Event('change',{bubbles:true})); })()"); page.wait_for_timeout(300)
    # 12: Pipeline tab, a card opens the record, the record keeps its 3D stage
    tap(cf, '#vtabs [data-v="pipeline"]'); page.wait_for_timeout(1200)
    check(cf.evaluate("document.body.dataset.view") == "pipeline" and page.evaluate("location.hash") == "#/crm/pipeline", f"pipeline: view + route ({page.evaluate('location.hash')})")
    pc = cf.evaluate("({n:document.querySelectorAll('#pcols .pc').length, prop:!!document.querySelector('.pcol[data-drop=\"proposal\"] .pc[data-id=\"" + ids[1] + "\"]'), vis:(()=>{const r=document.querySelector('#pcols').getBoundingClientRect(); return r.width>300 && r.height>200})()})")
    check(pc["n"] > 0 and pc["prop"] and pc["vis"], f"pipeline: board shows, the home sits in Proposal ({pc})")
    shot("12-pipeline")
    tap(cf, f'.pc[data-id="{ids[1]}"] .pco'); page.wait_for_timeout(1500)
    check(cf.evaluate("document.body.dataset.view") == "home" and page.evaluate("location.hash") == f"#/crm/home/{ids[1]}", f"card: opens the record ({page.evaluate('location.hash')})")
    check(cf.evaluate("!!document.querySelector('.left #stage') && document.querySelector('#addr').textContent.length > 3"), "record: the 3D stage is back in the record with the address")
    shot("13-record")
    # 14: the old route still works
    page.evaluate(f"location.hash = '#/home/{ids[0]}'"); page.wait_for_timeout(1500)
    check(cf.evaluate("document.body.dataset.view") == "home" and cf.evaluate("HOME.rawId") == ids[0], "alias: #/home/<id> opens that record")
    tap(cf, '#vtabs [data-v="inbox"]'); page.wait_for_timeout(900)
    check(cf.evaluate("document.body.dataset.view") == "inbox" and page.evaluate("location.hash").startswith("#/crm"), f"inbox tab: back to the inbox ({page.evaluate('location.hash')})")
    page.go_back(); page.wait_for_timeout(1200)
    check(cf.evaluate("document.body.dataset.view") == "home", "back: history steps between views")
    print("console errors:", errs, "| known (nimbus-shell, not CRM):", len(known), flush=True)
    check(not errs, f"0 console errors from the CRM ({len(errs)})")
    cf.evaluate(CLEAR); print("cleared", cf.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('rc.')).length"), flush=True)
    b.close()
print("DONE", W, "fails:", len(fails), fails, flush=True)
sys.exit(1 if fails else 0)
