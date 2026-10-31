"""Today x CRM engine check (10-09): the Daily 50 on Today, drafts from RC.copy, cadence days, the Inbox, STOP replies.
Run: python tour/audit/_crm_today_check.py <1440|390>   (server on :4886 must be running; run widths one after another)
Headless Chromium on the GPU path, real mouse clicks. Clock pinned to Thu 2026-10-08 11:00 Central after the map loads,
then moved to day 3 with page.clock. formsubmit.co blocked; sms:/mailto:/maps (and any tel:) links stopped (href kept for checks).
Fresh context per run; rc.* storage cleared at the end. Shots: tour/audit/shots/crm-<step>-<w>.png"""
import pathlib, sys, json
from playwright.sync_api import sync_playwright

URL = "http://localhost:4886/tour/product.html?dev=1#/daily"
SHOTS = pathlib.Path(__file__).parent / "shots"; SHOTS.mkdir(exist_ok=True)
ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"]
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
    page.clock.install(time="2026-10-08T11:00:00-05:00")
    for _ in range(40):   # the page notices the new day and builds that day's own 50
        page.wait_for_timeout(500)
        if fr.evaluate("QDAY === new Date().toDateString()"): break
    print("clock", fr.evaluate("new Date().toString()"), "QDAY", fr.evaluate("QDAY"), flush=True)
    fr.evaluate(STOP_LINKS)
    page.wait_for_timeout(2500)

    def tap(sel):   # a real mouse click at the element (the fake clock starves Playwright's "stable" check)
        r = None
        for _ in range(60):
            r = fr.evaluate("s => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({block:'nearest'}); const b = e.getBoundingClientRect(); if (!b.width) return null; const x = b.x+b.width/2, y = b.y+b.height/2, t = document.elementFromPoint(x, y); return t && (t === e || e.contains(t)) ? {x, y} : null; }", sel)
            if r: break
            page.wait_for_timeout(250)
        if not r:
            page.screenshot(path=str(SHOTS / f"crm-zz-fail-{W}.png"), timeout=150000, animations="disabled")
            raise RuntimeError("no element " + sel + " errs=" + str(errs[-5:]))
        o = fr.frame_element().bounding_box()
        page.mouse.click(o["x"] + r["x"], o["y"] + r["y"])
    def typ(text): page.keyboard.type(text)
    def shot(step):
        page.screenshot(path=str(SHOTS / f"crm-{step}-{W}.png"), timeout=150000, animations="disabled"); print("shot", step, flush=True)
    def close_bubble():
        try:
            if page.evaluate("(()=>{const x=document.querySelector('.nb-bubble .nb-x'); if(!x) return false; const r=x.getBoundingClientRect(); return r.width>0})()"):
                page.click(".nb-bubble .nb-x", timeout=5000, force=True); page.wait_for_timeout(400)
        except Exception as e: print("bubble", str(e)[:80], flush=True)
    def show_list(tab):
        if MOB and not fr.evaluate("sheets.list.classList.contains('open')"): tap("#openList"); page.wait_for_timeout(900)
        tap("#tabInbox" if tab == "inbox" else "#tabNext"); page.wait_for_timeout(500)
    def hide_list():
        if MOB: fr.evaluate("closeSheets()"); page.wait_for_timeout(500)
    def inbox_filter(f):
        tap(f'.ifil [data-f="{f}"]'); page.wait_for_timeout(400)
    def inbox_ids(): return fr.evaluate("[...document.querySelectorAll('.ilist .irow')].map(r=>r.dataset.id)")

    close_bubble()
    # 01: the Daily 50 on Up next
    show_list("next")
    st = fr.evaluate("({rows:document.querySelectorAll('#qlist .qrow').length, total:TOTAL, left:document.getElementById('qLeft').textContent, pill:(document.querySelector('" + CARD + " .tr .pill')||{}).textContent||'', why:[...document.querySelectorAll('#qlist .qrow .mt')].slice(0,5).map(e=>e.textContent), picks:RC.daily().length})")
    print(json.dumps(st), flush=True)
    check(st["rows"] == 50 and st["picks"] == 50 and st["total"] == 50, "up next: 50 rows from RC.daily()")
    check(st["left"] == "50 left today", f"up next: '{st['left']}'")
    check(st["pill"] == "Home 1 of 50", f"card: '{st['pill']}'")
    check(all(("Roof" in w or "hail" in w or "squares" in w or "mi from base" in w) for w in st["why"]), "up next: each row says why (the engine's reasons)")
    shot("01-up-next")
    hide_list()
    ids = fr.evaluate("HOMES.slice(0,4).map(h=>h.id)")
    # 02: text-and-email only (10-09): no Call anywhere on the card; Text leads, then Email, then Skip
    row = fr.evaluate(f"[...document.querySelectorAll('{CARD} .act button, {CARD} .act a')].map(b=>b.textContent.trim())")
    check(row == ["Text", "Email", "Skip"], f"card: action row is Text, Email, Skip ({row})")
    check(fr.evaluate(f"!document.querySelector('{CARD} a[href^=\"tel:\"]') && !/call/i.test(document.querySelector('{CARD} .calls').textContent)"), "card: no tel: link, no call counts")
    check(fr.evaluate(f"document.querySelector('{CARD} .act [data-a=\"text\"]').classList.contains('pri')"), "card: Text is the primary button")
    tap(f'{CARD} [data-a="text"]'); page.wait_for_timeout(600)
    check(fr.evaluate("dlg.open && !!document.querySelector('#dSms')"), "text: one tap opens the draft dialog")
    tap("#dSms"); page.wait_for_timeout(800)
    check("sms:" in fr.evaluate("window.__lastHref||''"), "text: sms: hand-off stopped, href kept")
    c = fr.evaluate(f"RC.activity().filter(a=>a.id==='{ids[0]}' && a.ch==='text')")
    check(len(c) == 1, "text: logged on the record")
    check(fr.evaluate(f"RC.stageName(RC.stage('{ids[0]}'))") == "Contacted", "text: home moves to Contacted")
    check(fr.evaluate("document.getElementById('qLeft').textContent") == "49 left today" or MOB, "up next: 49 left after the text")
    shot("02-texted")
    if fr.evaluate("dlg.open"): fr.evaluate("dlg.close()"); page.wait_for_timeout(300)   # the "did it send" prompt stays open after the hand-off; a user closes it
    tap(f'{CARD} [data-a="next"]'); page.wait_for_timeout(900)
    # 03: text stop 2: the draft is RC.copy's day 1 cold text
    tap(f'{CARD} [data-a="text"]'); page.wait_for_timeout(600)
    exp = fr.evaluate(f"RC.copy.next(copyFacts(HOMES.find(h=>h.id==='{ids[1]}')), 0, 'cold', 'text').body")
    got = fr.evaluate("(document.querySelector('#dBody')||{}).value||''")
    check(bool(exp) and got == exp, "text: draft = RC.copy.next(..., day 1, 'cold', 'text')")
    dtext = fr.evaluate("dlg.innerText")
    check("free roof inspection" not in dtext.lower() and "Texting is allowed for past customers" not in dtext, "text: no 'free roof inspection', no 'allowed for past customers'")
    check("Cold homeowner" in dtext, "text: says cold homeowner, sent by hand")
    shot("03-text-draft")
    tap("#dSms"); page.wait_for_timeout(800)
    href = fr.evaluate("window.__lastHref||''")
    check(href.startswith("sms:"), "text: sms: hand-off")
    t = fr.evaluate(f"RC.activity().filter(a=>a.id==='{ids[1]}' && a.ch==='text')")
    check(len(t) == 1 and t[0].get("body") == exp, "text: record keeps the exact draft")
    if fr.evaluate("dlg.open"): fr.evaluate("dlg.close()")
    # past customer wording (no text without their yes)
    past = fr.evaluate(f"(()=>{{ const h = Object.assign({{}}, HOMES[2], {{past:true}}); return textState(h, draftFor(h,'text')); }})()")
    check("say yes to texts" in past and "allowed" not in past, "text: past customers need their yes")
    # 04: email on stop 3: draft with subject; blocked honestly (no mailing address on file)
    fr.evaluate("go(2,true)"); page.wait_for_timeout(1500)
    tap(f'{CARD} [data-a="email"]'); page.wait_for_timeout(500)
    e = fr.evaluate(f"RC.copy.next(copyFacts(HOMES.find(h=>h.id==='{ids[2]}')), 0, 'cold', 'email')")
    ui = fr.evaluate("({s:(document.querySelector('#eSubj')||{}).value, b:(document.querySelector('#eBody')||{}).value, why:(document.querySelector('#eWhy')||{}).textContent||'', off:(document.querySelector('#dMail')||{}).getAttribute && document.querySelector('#dMail').getAttribute('aria-disabled')})")
    check(ui["s"] == e.get("subject") and ui["b"] == e.get("body"), "email: subject and body = RC.copy.next(..., 'email')")
    if e.get("blocked"):
        check("mailing address" in ui["why"] and ui["off"] == "true", "email: blocked reason shown, Open in Mail disabled")
    shot("04-email")
    fr.evaluate("dlg.close()"); page.wait_for_timeout(300)
    # 05: day 3: the two homes reached come due, first on Up next and in Inbox > Due today
    page.clock.fast_forward("48:00:00")
    for _ in range(40):
        page.wait_for_timeout(500)
        if fr.evaluate("QDAY === new Date().toDateString()"): break
    page.wait_for_timeout(1500)
    print("clock", fr.evaluate("new Date().toString()"), flush=True)
    top = fr.evaluate("HOMES.slice(0,2).map(h=>({id:h.id, reason:h.pick.reason, why:h.pick.why[0]}))")
    print(top, flush=True)
    check({x["id"] for x in top} == {ids[0], ids[1]} and all(x["reason"] == "cadence" and x["why"].startswith("Day 3 follow-up") for x in top), "day 3: both homes lead Up next as Day 3 follow-ups")
    show_list("next")
    q = fr.evaluate("[...document.querySelectorAll('#qlist .qrow')].slice(0,2).map(r=>(r.querySelector('.qdue')||{}).textContent||'')")
    check(q == ["Day 3 follow-up, due today", "Day 3 follow-up, due today"], f"day 3: rows say {q}")
    check(fr.evaluate("document.querySelectorAll('#qlist .qrow').length") == 50, "day 3: still 50 rows")
    shot("05-day3-up-next")
    show_list("inbox")
    inbox_filter("due")
    due = inbox_ids()
    check(set(due) == {ids[0], ids[1]}, f"inbox: Due today = the two homes ({due})")
    row = fr.evaluate(f"(document.querySelector('.irow[data-id=\"{ids[1]}\"]')||{{}}).innerText||''")
    check("2 days ago" in row and "Day 3 follow-up due today" in row, "inbox: row shows last contact and the cadence step")
    shot("06-inbox-due")
    # 07: thread: history + the next touch drafted; one tap hands off and logs
    tap(f'.irow[data-id="{ids[1]}"]'); page.wait_for_timeout(700)
    th = fr.evaluate("document.querySelector('.ithread').innerText")
    check(exp[:40] in th, "thread: history shows the day 1 text")
    # day 1 was the text; every follow-up is an email (Jack 10-09): the thread opens on the day 3 email, held back honestly
    exp3 = fr.evaluate(f"RC.copy.next(copyFacts(homeAny('{ids[1]}')), 1, 'cold', 'email')")
    nx = fr.evaluate("({ d:(document.querySelector('.idraft')||{}).value||'', lab:(document.querySelector('.inext .ilab')||{}).innerText||'', note:(document.querySelector('.inext .inote')||{}).innerText||'', off:!!document.querySelector('.inext .dbtn.off'), sms:!!document.querySelector('.inext a[href^=\"sms:\"]') })")
    check(nx["d"] == exp3["body"] and "Day 3 email" in nx["lab"], f"thread: next touch = RC.copy day 3 email ({nx['lab'][:40]})")
    check(nx["off"] and "mailing address" in nx["note"] and not nx["sms"], "thread: the day 3 email is held back (no mailing address on file), no text offered")
    tap('.inext [data-ch="text"]'); page.wait_for_timeout(400)
    tn = fr.evaluate("({ note:(document.querySelector('.inext .inote')||{}).innerText||'', sms:!!document.querySelector('.inext a[href^=\"sms:\"]'), d:!!document.querySelector('.idraft') })")
    check(not tn["sms"] and not tn["d"] and "goes by email" in tn["note"], f"thread: a day 3 text is refused ({tn['note'][:60]})")
    shot("07-thread")
    # once the roofer's mailing address is on file the email goes; here the hand-off is logged directly
    fr.evaluate(f"RC.logEmail('{ids[1]}', 'Email drafted', {{ subject: 'Following up' }})"); page.wait_for_timeout(500)
    check(fr.evaluate(f"RC.activity().filter(a=>a.id==='{ids[1]}' && (a.ch==='text'||a.ch==='email')).length") == 2, "thread: the day 3 email is logged")
    check("Day 7 follow-up due" in fr.evaluate("document.querySelector('.ithread .ith-m').innerText"), "thread: cadence moves to day 7")
    # 08: log a reply "Who is this?" -> suggested answer from the library
    tap('[data-t="reply"]'); page.wait_for_timeout(300)
    tap('#iRep'); typ("Who is this?"); tap('[data-t="rsave"]'); page.wait_for_timeout(600)
    sug = fr.evaluate("(document.querySelector('.isdraft')||{}).value||''")
    want = fr.evaluate(f"RC.copy.render('reply.who', copyFacts(homeAny('{ids[1]}'))).body")
    check(sug == want and "Asked who this is" in fr.evaluate("document.querySelector('.isugg').innerText"), "reply: 'who is this' gets the library answer")
    shot("08-reply-who")
    tap('[data-t="back"]'); page.wait_for_timeout(400)
    inbox_filter("reply")
    check(inbox_ids() == [ids[1]], "inbox: Replied filter has the home")
    # 09: STOP: opted out, off the list, cannot be scheduled
    fr.evaluate(f"RC.remember({{id:'{ids[1]}', optin:true}})")   # as if they had opted in on the check page: scheduling would be open
    check(fr.evaluate(f"RC.canSchedule('{ids[1]}').ok"), "stop: before, the opted-in home can be scheduled")
    tap(f'.irow[data-id="{ids[1]}"]'); page.wait_for_timeout(500)
    tap('[data-t="reply"]'); page.wait_for_timeout(300)
    tap('#iRep'); typ("STOP"); tap('[data-t="rsave"]'); page.wait_for_timeout(900)
    check(fr.evaluate(f"RC.optedOut('{ids[1]}')"), "stop: RC.optOut called")
    conf = fr.evaluate("(document.querySelector('.isdraft')||{}).value||''")
    check("opted out" in conf, f"stop: confirmation draft ({conf[:50]})")
    cs = fr.evaluate(f"RC.canSchedule('{ids[1]}')")
    check(not cs["ok"] and "opted out" in cs["reason"], "stop: can't schedule")
    check(fr.evaluate(f"RC.copy.next(copyFacts(homeAny('{ids[1]}')), 2, 'cold', 'text').blocked") == "opted out", "stop: drafts blocked")
    check(not fr.evaluate(f"HOMES.some(h=>h.id==='{ids[1]}')") and not fr.evaluate(f"!!document.querySelector('#qlist [data-id=\"{ids[1]}\"]')"), "stop: left today's list")
    shot("09-stop")
    tap('[data-t="back"]'); page.wait_for_timeout(400)
    inbox_filter("out")
    check(inbox_ids() == [ids[1]], "inbox: Opted out filter")
    shot("10-opted-out")
    inbox_filter("late"); check(inbox_ids() == [], "inbox: Overdue empty")
    inbox_filter("all")
    check(len(inbox_ids()) == 2, "inbox: All = 2 homes")
    # search
    word = fr.evaluate(f"homeAny('{ids[0]}').addr.split(' ').slice(0,2).join(' ')")
    tap('.isearch input'); typ(word); page.wait_for_timeout(400)
    check(inbox_ids() == [ids[0]] or ids[0] in inbox_ids(), f"inbox: search '{word}'")
    shot("11-search")
    fr.evaluate("(()=>{ const i = document.querySelector('.isearch input'); i.value=''; i.dispatchEvent(new Event('input')); })()")
    # 12: open home on Homes
    tap(f'.irow[data-id="{ids[0]}"]'); page.wait_for_timeout(500)
    tap('[data-t="home"]'); page.wait_for_timeout(3500)
    check("home" in page.url, f"open home: shell on Home ({page.url})")
    shot("12-home")
    page.go_back(); page.wait_for_timeout(3000)
    print("console errors:", errs, flush=True)
    check(not errs, "0 console errors")
    fr = deck(page)
    fr.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('rc.')).forEach(k=>localStorage.removeItem(k))")
    print("cleared", fr.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('rc.')).length"), flush=True)
    b.close()
print("DONE", W, "fails:", len(fails), fails, flush=True)
