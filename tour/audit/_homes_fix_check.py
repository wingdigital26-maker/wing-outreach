"""Homes fix check (10-09): pipeline board fit, storm dates with the year, Book end to end. (10-09 later: the tab is CRM;
this runs the single-home record view, #/home/<id> = #/crm/home/<id>, and checks the nav label.)
python tour/audit/_homes_fix_check.py   (the loop's server on :4886 must already be running; this never starts one)

At 1440x900 and 390x844, inside the product shell (product.html?dev=1#/home/<id>, the CRM's record view):
 1. Board: in the side panel two whole stage columns show and the next one peeks under a fade with an arrow; columns
    snap; the first card is fully visible; a column with more cards fades at its foot and ends with "End of ...";
    Full board shows all five stages without sideways scroll (desktop).
 2. Storm dates: the storm (Aug 12, 2025) is never shown as a bare "Aug 12" on Homes (strip, crumb, card chip).
 3. Book like a user (real mouse): Book -> dialog (min = today, a past time is refused) -> Book it -> toast, strip,
    Next task, card in Inspection booked (in view), timeline line, Add to calendar (.ics) downloads a valid file from
    the card and from Next task, Move to Inspection booked on another card books it too, and it all survives reload.
Console errors must be 0. tel:/sms:/mailto: clicks are intercepted, formsubmit.co is route-blocked. RC state is
cleared at the end. Shots: tour/audit/shots/fix-homes-*.png"""
import datetime, os, re, sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4886/tour/product.html?dev=1#/home/"
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")
os.makedirs(SHOTS, exist_ok=True)
ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"]
NOW = datetime.datetime(2026, 10, 9, 15, 0, 0, tzinfo=datetime.timezone.utc)   # 10:00 in Plano
GUARD = """document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href^="tel:"],a[href^="sms:"],a[href^="mailto:"]');
  if (a) { e.preventDefault(); (window.__blocked = window.__blocked || []).push(a.href); } }, true);"""
CLEAR = "Object.keys(localStorage).filter(k => k.startsWith('rc.')).forEach(k => localStorage.removeItem(k))"
fails, notes = [], []


def ok(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg, flush=True)
    if not cond: fails.append(msg)


def shot(pg, name):
    p = os.path.join(SHOTS, name)
    for i in range(3):
        try: pg.screenshot(path=p, timeout=90000); print("  shot", name, flush=True); return
        except Exception as e: print("  shot retry", name, str(e)[:60], flush=True)


def home_frame(pg):
    for i in range(60):
        fr = next((f for f in pg.frames if "c5-home" in f.url), None)
        if fr:
            try:
                if fr.evaluate("document.querySelectorAll('#pcols .pc').length") > 0: return fr
            except Exception: pass
        pg.wait_for_timeout(500)
    raise SystemExit("Homes frame never showed cards")


BOARD = r"""() => { const cols = document.querySelector('#pcols'), r = cols.getBoundingClientRect(), wrap = cols.parentElement;
  const vis = [...cols.querySelectorAll('.pcol')].map(c => { const q = c.getBoundingClientRect(); return { k: c.dataset.drop, l: q.left - r.left, rr: q.right - r.left, w: q.width }; });
  const pls = cols.querySelector('.pcol[data-drop="new"] .pls'), lr = pls.getBoundingClientRect(), card = pls.querySelector('.pc').getBoundingClientRect();
  const nr = wrap.querySelector('.pnav.r');
  return { cw: cols.clientWidth, sw: cols.scrollWidth, sl: cols.scrollLeft, snap: getComputedStyle(cols).scrollSnapType, wrapCls: wrap.className,
    navR: !!nr && !nr.hidden && getComputedStyle(nr).display !== 'none', vis, cardTop: card.top - lr.top, cardBot: card.bottom - lr.top, plsH: lr.height,
    fb: pls.classList.contains('fb'), pend: (pls.querySelector('.pend') || {}).textContent || '' }; }"""


def run(b, w, h):
    phone = w < 641
    tag = str(w)
    print(f"== {w}x{h}", flush=True)
    ctx = b.new_context(viewport={"width": w, "height": h}, timezone_id="America/Chicago", accept_downloads=True)
    ctx.add_init_script(GUARD)
    ctx.route("**/formsubmit.co/**", lambda r: r.abort())
    pg = ctx.new_page(); pg.set_default_timeout(60000); pg.clock.set_system_time(NOW)
    errs = []
    pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE + "djackson-1", wait_until="load")
    fr = home_frame(pg); fr.evaluate(CLEAR)
    pg.reload(wait_until="load"); fr = home_frame(pg); pg.wait_for_timeout(2500)
    # ---- 0. the rename: the shell tab says CRM, the record view is open, the alias route resolved to the CRM
    ok(pg.evaluate("[...document.querySelectorAll('nav button')].map(b => b.textContent)") == ["Today", "Storms", "CRM", "Ask"], "shell nav reads Today, Storms, CRM, Ask")
    ok(fr.evaluate("document.body.dataset.view") == "home" and pg.evaluate("location.hash") == "#/crm/home/djackson-1", f"#/home/<id> opens the CRM's record view ({pg.evaluate('location.hash')})")
    ok("Homes" not in pg.evaluate("document.querySelector('nav').textContent") and "Homes" not in fr.evaluate("document.querySelector('#vtabs').textContent"), "no 'Homes' label left in the nav or the CRM tabs")

    # ---- 2. storm dates
    d = fr.evaluate("""() => ({ strip: document.querySelector('#steps .st small').textContent, crumb: document.querySelector('#crumb').textContent,
      chip: document.querySelector('.pc .phail').textContent, chipTip: document.querySelector('.pc .phail').title,
      kv: document.querySelector('#kv').textContent, tl: document.querySelector('#tl .ev.hot .dt small').textContent,
      body: document.body.innerText })""")
    print("  strip:", d["strip"].encode('ascii', 'replace').decode(), "| chip:", d["chip"].encode('ascii', 'replace').decode())
    ok("Aug 12 ’25" in d["strip"], "stage strip shows the storm year (Aug 12 '25)")
    ok("Aug 12 ’25" in d["chip"] and "2025" in d["chipTip"], "board card hail chip carries the storm day with its year")
    ok("Aug 12, 2025" in d["kv"], "Contact facts say Aug 12, 2025")
    ok("’25" in d["tl"], "timeline storm event shows the year")
    bare = re.findall(r"Aug 12(?! ’25|, 2025)", d["body"])
    ok(not bare, f"no bare 'Aug 12' anywhere on the record ({len(bare)} found)")

    # ---- 1. board fit
    if phone:
        fr.evaluate("document.querySelector('#pipePane').scrollIntoView({block:'start'})"); pg.wait_for_timeout(600)
    bd = fr.evaluate(BOARD)
    whole = [c for c in bd["vis"] if c["l"] >= -1 and c["rr"] <= bd["cw"] + 1 and c["k"] != "lost"]
    print("  board:", {k: bd[k] for k in ("cw", "sw", "snap", "wrapCls", "navR", "cardBot", "plsH", "fb")}, "whole:", [c["k"] for c in whole])
    ok("mandatory" in bd["snap"], "columns snap to their starts")
    ok("fr" in bd["wrapCls"].split(), "right edge fades while more stages are to the right")
    if phone:
        ok(len(whole) >= 1, "phone: the first column is whole, the next one peeks")
    else:
        ok(len(whole) >= 2 and bd["navR"], "desktop: two whole columns and a Later stages arrow")
        ok(bd["cardBot"] <= bd["plsH"] + 1, f"first card fully visible ({bd['cardBot']:.0f} <= {bd['plsH']:.0f})")
    ok(bd["fb"], "New hit column fades at its foot (more cards below)")
    ok(bd["pend"].startswith("End of New hit"), "column ends with 'End of New hit, N homes'")
    shot(pg, f"fix-homes-board-{tag}.png")
    # scroll the column to its end: fade goes, end line shows
    fr.evaluate("(() => { const l = document.querySelector('.pcol[data-drop=\"new\"] .pls'); l.scrollTop = l.scrollHeight; })()"); pg.wait_for_timeout(400)
    end = fr.evaluate("(() => { const l = document.querySelector('.pcol[data-drop=\"new\"] .pls'), e = l.querySelector('.pend').getBoundingClientRect(), r = l.getBoundingClientRect(); return { fb: l.classList.contains('fb'), inView: e.bottom <= r.bottom + 1 && e.top >= r.top }; })()")
    ok(not end["fb"] and end["inView"], "at the foot: no fade, 'End of' line in view")
    fr.evaluate("document.querySelector('.pcol[data-drop=\"new\"] .pls').scrollTop = 0")
    if not phone:
        fr.locator(".pnav.r").click(); pg.wait_for_timeout(900)
        s1 = fr.evaluate(BOARD)
        ok(s1["sl"] > 100 and "fl" in s1["wrapCls"].split(), "Later stages arrow steps one column, left fade + Earlier arrow appear")
        shot(pg, f"fix-homes-board-stepped-{tag}.png")
        fr.locator(".pnav.r").click(); pg.wait_for_timeout(900); fr.locator(".pnav.r").click(); pg.wait_for_timeout(900)
        s2 = fr.evaluate(BOARD)
        ok("fr" not in s2["wrapCls"].split() and not s2["navR"], "at the last stage: no right fade, no arrow")
        fr.evaluate("document.querySelector('#pcols').scrollLeft = 0"); pg.wait_for_timeout(300)
    # Full board
    fr.locator("#pfullBtn").click(); pg.wait_for_timeout(900)
    fb = fr.evaluate(BOARD)
    if not phone:
        ok(fb["sw"] <= fb["cw"] + 2, f"Full board: every stage fits without sideways scroll ({fb['sw']} <= {fb['cw']})")
    else:
        ok("mandatory" in fb["snap"] and "fr" in fb["wrapCls"].split(), "phone Full board: snap + right fade")
    shot(pg, f"fix-homes-full-{tag}.png")
    fr.locator("#pfullBtn").click(); pg.wait_for_timeout(600)

    # ---- 3. Book like a user
    fr.evaluate("window.scrollTo(0, 0)"); pg.wait_for_timeout(300)
    # ---- 3a. text and email only (10-09): no Call in the header or the phone bar; Text leads, Email, Book
    bar = ".stick" if phone else ".acts"
    labels = fr.evaluate(f"[...document.querySelectorAll('{bar} [data-act]')].map(b => b.textContent.trim())")
    ok(labels == ["Text", "Email", "Book"], f"{bar}: Text, Email, Book ({labels})")
    ok(fr.evaluate("!document.querySelector('[data-act=\"call\"], a[href^=\"tel:\"]')"), "no Call button and no tel: link on the record")
    ok(fr.evaluate(f"document.querySelector('{bar} [data-act=\"text\"]').classList.contains('p')"), "Text is the primary button")
    chips = fr.evaluate("[...document.querySelectorAll('#pcols .pch')].map(e => e.getAttribute('aria-label'))")
    ok(chips and all('call' not in (c or '') for c in chips), f"board cards count texts and emails only ({(chips or [''])[0]})")
    ok(not any('call' in (t or '').lower() for t in fr.evaluate("[...document.querySelectorAll('#steps b, #next h4, #afil button')].map(e => e.textContent)")), "stage bar, next task and activity filter never say call")
    fr.locator(f"{bar} [data-act='email']").click(); pg.wait_for_timeout(400)
    ok(fr.evaluate("document.querySelector('#dlg').open && document.querySelector('#dlgTitle').textContent") == "Email draft", "Email opens the email draft")
    fr.evaluate("document.querySelector('#dlg').close()"); pg.wait_for_timeout(200)
    btn = fr.locator(".stick [data-act='book']" if phone else ".acts [data-act='book']")
    ok(btn.inner_text().strip() == "Book", "button says Book before booking")
    btn.click(); pg.wait_for_timeout(500)
    dlg = fr.evaluate("({ open: document.querySelector('#dlg').open, title: document.querySelector('#dlgTitle').textContent, min: document.querySelector('#bkD').min, val: document.querySelector('#bkD').value })")
    ok(dlg["open"] and dlg["title"] == "Book an inspection", "Book opens the booking dialog")
    ok(dlg["min"] == "2026-10-09" and dlg["val"] == "2026-10-10", f"day picker starts tomorrow, cannot go before today ({dlg['min']}, {dlg['val']})")
    shot(pg, f"fix-homes-book-dialog-{tag}.png")
    fr.fill("#bkD", "2026-10-08"); fr.locator("#bkGo").click(); pg.wait_for_timeout(300)
    ok(fr.evaluate("document.querySelector('#dlg').open") and not fr.evaluate("RC.booking('djackson-1')"), "a past day is refused, dialog stays open")
    fr.fill("#bkD", "2026-10-12"); fr.select_option("#bkT", "10:00"); fr.locator("#bkGo").click(); pg.wait_for_timeout(1200)
    st = fr.evaluate("""() => ({ open: document.querySelector('#dlg').open, toast: document.querySelector('#toast').textContent,
      booked: RC.booking('djackson-1'), stage: RC.stage('djackson-1'), strip: document.querySelector('#steps [data-s="inspection"] small').textContent,
      pill: document.querySelector('.stagepill').textContent, lbl: document.querySelector('.acts .bookLbl').textContent,
      next: document.querySelector('#next').innerText, tl: document.querySelector('#tl').innerText,
      card: (() => { const c = document.querySelector('.pcol[data-drop="inspection"] .pc[data-id="djackson-1"]'); if (!c) return null;
        const r = c.getBoundingClientRect(), cr = document.querySelector('#pcols').getBoundingClientRect(), lr = c.closest('.pls').getBoundingClientRect();
        return { text: c.innerText, inX: r.left >= cr.left - 1 && r.right <= cr.right + 1, whole: r.top >= lr.top - 1 && r.bottom <= lr.bottom + 1 }; })() })""")
    print("  toast:", st["toast"], "| strip:", st["strip"])
    ok(not st["open"] and "Inspection booked for Mon, Oct 12, 10:00 AM" in st["toast"], "Book it closes the dialog, toast names the day and time")
    ok(st["stage"] == "inspection" and st["booked"] == "2026-10-12T15:00:00.000Z", "stage = inspection, booking saved (10:00 am Plano)")
    ok(st["strip"] == "Mon, Oct 12, 10:00 AM" and st["pill"] == "Inspection booked" and st["lbl"] == "Reschedule", "strip, stage pill and Reschedule label updated")
    ok("Mon, Oct 12, 10:00 AM" in st["next"] and "Add to calendar" in st["next"], "Next task shows the time and Add to calendar")
    ok("Inspection booked for Mon, Oct 12, 10:00 AM" in st["tl"], "timeline has the booking line")
    ok(bool(st["card"]) and "Inspect Oct 12, 10:00 AM" in st["card"]["text"], "card sits in Inspection booked with its time")
    if not phone: ok(bool(st["card"]) and st["card"]["whole"], "booked card is whole in its column (Calendar button visible)")
    ok(bool(st["card"]) and st["card"]["inX"], "board scrolled so the moved card is in view")
    if phone:
        fr.evaluate("document.querySelector('.pcol[data-drop=\"inspection\"]').scrollIntoView({block:'center', inline:'nearest'})"); pg.wait_for_timeout(500)
    shot(pg, f"fix-homes-booked-{tag}.png")
    # calendar file from the card
    with pg.expect_download(timeout=15000) as dl:
        fr.locator(".pc[data-id='djackson-1'] .pcal").click()
    path = dl.value.path(); ics = open(path, encoding="utf-8").read()
    ok(dl.value.suggested_filename.endswith(".ics") and "BEGIN:VCALENDAR" in ics and "DTSTART:20261012T150000Z" in ics and "DTEND:20261012T160000Z" in ics
       and "SUMMARY:Roof inspection\\, 3704 Morning Dove Dr" in ics and "Plano" in ics, f"card Calendar saves a valid .ics ({dl.value.suggested_filename})")
    # calendar file from Next task (This home)
    if not phone: fr.locator("#ptab [data-p='home']").click(); pg.wait_for_timeout(400)
    else: fr.evaluate("document.querySelector('#next').scrollIntoView({block:'center'})"); pg.wait_for_timeout(400)
    with pg.expect_download(timeout=15000) as dl2:
        fr.locator("#tCal").click()
    ok("DTSTART:20261012T150000Z" in open(dl2.value.path(), encoding="utf-8").read(), "Next task Add to calendar saves the same .ics")
    shot(pg, f"fix-homes-nexttask-{tag}.png")
    if not phone: fr.locator("#ptab [data-p='pipe']").click(); pg.wait_for_timeout(300)

    # Move to -> Inspection booked on another card (desktop: the board's own booking path)
    if not phone:
        fr.locator(".pc[data-id='djackson-2'] .pmv").click(); pg.wait_for_timeout(300)
        fr.locator(".pmenu [data-to='inspection']").click(); pg.wait_for_timeout(400)
        ok(fr.evaluate("document.querySelector('#dlg').open && !!document.querySelector('#bkNo')"), "Move to Inspection booked opens the picker with Cancel")
        fr.locator("#bkNo").click(); pg.wait_for_timeout(400)
        ok(fr.evaluate("RC.stage('djackson-2')") == "new", "Cancel leaves the card in New hit")
        fr.locator(".pc[data-id='djackson-2'] .pmv").click(); pg.wait_for_timeout(300)
        fr.locator(".pmenu [data-to='inspection']").click(); pg.wait_for_timeout(400)
        fr.fill("#bkD", "2026-10-13"); fr.select_option("#bkT", "14:30"); fr.locator("#bkGo").click(); pg.wait_for_timeout(800)
        ok(fr.evaluate("RC.stage('djackson-2')") == "inspection" and fr.evaluate("!!document.querySelector('.pcol[data-drop=\"inspection\"] .pc[data-id=\"djackson-2\"] .pcal')"),
           "Move to books the other home, its card gets Calendar")

    # survives reload
    pg.reload(wait_until="load"); fr = home_frame(pg); pg.wait_for_timeout(2500)
    rl = fr.evaluate("""() => ({ stage: RC.stage('djackson-1'), b: RC.booking('djackson-1'), strip: document.querySelector('#steps [data-s="inspection"] small').textContent,
      card: !!document.querySelector('.pcol[data-drop="inspection"] .pc[data-id="djackson-1"]'),
      cardInView: (() => { const c = document.querySelector('.pc[data-id="djackson-1"]'), r = c.getBoundingClientRect(), cr = document.querySelector('#pcols').getBoundingClientRect(); return r.left >= cr.left - 1 && r.right <= cr.right + 1; })(), tl: document.querySelector('#tl').innerText })""")
    ok(rl["stage"] == "inspection" and rl["b"] == "2026-10-12T15:00:00.000Z" and rl["strip"] == "Mon, Oct 12, 10:00 AM" and rl["card"]
       and "Inspection booked for Mon, Oct 12" in rl["tl"], "after reload: stage, time, strip, card and timeline all kept")
    ok(rl["cardInView"], "after reload the board opens on the open home's column")
    shot(pg, f"fix-homes-reload-{tag}.png")
    blocked = fr.evaluate("window.__blocked || []")
    ok(not errs, f"0 console errors ({len(errs)}): {errs[:3]}")
    print("  intercepted tel/sms/mailto clicks:", blocked)
    fr.evaluate(CLEAR)
    ctx.close()


with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=ARGS)
    sizes = [(1440, 900), (390, 844)]
    if len(sys.argv) > 1: sizes = [x for x in sizes if str(x[0]) == sys.argv[1]]   # one width per run
    for (w, h) in sizes:
        try: run(b, w, h)
        except SystemExit as e: fails.append(f"{w}: {e}")
    b.close()
print("\nRESULT:", "PASS" if not fails else f"FAIL ({len(fails)})")
for f in fails: print("  -", f)
sys.exit(1 if fails else 0)
