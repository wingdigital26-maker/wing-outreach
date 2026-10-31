"""Ask screen, the eight approved questions (10-10), on the real data. Run: python tour/audit/_ask1010_shoot.py [1440|390]
Server on :4886 must be running; the voice draft server (python scripts/voice/server.py, :4912) for question 2.
Fresh headless context, one browser. formsubmit.co blocked; sms:/mailto:/tel: links stopped.
Question 1 is asked twice: first with nothing on the device (the honest empty state), then after a TEST reply is logged
on this headless device only (one outbound text + one homeowner reply on Daily 50 #1, both marked TEST) so the
Send to Chris handoff, the draft and the history can be shown. rc.* storage is cleared at the end.
Shots: tour/audit/ask-1010/<n>-<name>-<w>.png"""
import pathlib, sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:4886/tour/product.html?dev=1&nosw=1#/ask"
OUT = pathlib.Path(__file__).parent / "ask-1010"; OUT.mkdir(exist_ok=True)
ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"]
W = int(sys.argv[1]) if len(sys.argv) > 1 else 1440
H = 900 if W > 640 else 844
fails = []
def check(c, m):
    print(("ok   " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)
GUARD = """document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href^="tel:"],a[href^="sms:"],a[href^="mailto:"]');
  if (a) { e.preventDefault(); } }, true);"""

def frame_of(page, part, ready, tries=600):
    for _ in range(tries):
        fr = next((f for f in page.frames if part in f.url), None)
        if fr:
            try:
                if fr.evaluate(ready): return fr
            except Exception: pass
        page.wait_for_timeout(500)
    raise RuntimeError("frame not ready: " + part)
def ask_frame(page): return frame_of(page, "c2-nimbus", "!!window.RCAsk && !!document.querySelector('#composer[data-live]') && window.__ready === true")

def ask(page, fr, q, name, wait_sel=".ak-card", timeout=120000):
    fr.evaluate("q => { const i = document.getElementById('ask'); i.value = q; document.getElementById('composer').requestSubmit(); }", q)
    fr.wait_for_function("s => document.querySelector('#akx ' + s) && !document.querySelector('#akx .ak-wait')", arg=wait_sel, timeout=timeout)
    page.wait_for_timeout(1400)
    fr.evaluate("document.getElementById('akx').scrollIntoView({block:'start'})"); page.wait_for_timeout(300)
    head = fr.evaluate("document.getElementById('answer').textContent")
    body = fr.evaluate("document.getElementById('akx').innerText")
    print("  Q:", q, "\n  A:", head, "|", body[:220].replace("\n", " / "), flush=True)
    page.screenshot(path=str(OUT / f"{name}-{W}.png"))
    return head, body

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
    ctx.route("**/formsubmit.co/**", lambda r: r.abort())
    ctx.add_init_script(GUARD)
    page = ctx.new_page()
    page.set_default_timeout(120000); page.goto(URL, wait_until="commit", timeout=180000)
    fr = ask_frame(page)
    fr.evaluate("RC.queueReady")
    h, t = ask(page, fr, "Who replied today and wants a quote?", "1a-replies-empty")
    check("No replies yet today" in h, "1 empty state says No replies yet today")
    # TEST data on this headless device only: one text out + one reply on Daily 50 #1
    tid = fr.evaluate("""() => { const p = RC.daily()[0]; RC.remember({ id: p.id, addr: p.street, city: p.city, zip: p.zip, lon: p.lon, lat: p.lat, hail: p.hail, storm: p.storm, gi: p.gi });
      RC.logText(p.id, 'Text drafted in Messages', { body: 'TEST: Hi, this is Jackson Roofing. Radar showed hail at your address. Want a free roof inspection? Reply STOP to opt out.' });
      RC.logReply(p.id, 'TEST: Yes, can you come give me a quote on the roof this week?', 'text');
      localStorage.setItem('rc.t.lastThread', JSON.stringify(p.id)); return p.id + '|' + p.street; }""")
    tid, taddr = tid.split("|")
    h, t = ask(page, fr, "Who replied today and wants a quote?", "1b-replies-quote")
    check("asking for a quote" in h, "1 lists the quote reply")
    fr.click("#akx [data-ak=handoff]")
    fr.wait_for_selector("#akx .ak-hand dl", timeout=20000); fr.evaluate("document.querySelector('#akx .ak-hand').scrollIntoView({block:'start'})"); page.wait_for_timeout(800)
    page.screenshot(path=str(OUT / f"1c-sent-to-chris-{W}.png"))
    check(fr.evaluate("id => RC.stage(id)", tid) == "handoff", "1 stage moved to handoff (Sent to Chris)")
    h, t = ask(page, fr, "Draft a reply to this homeowner", "2a-draft", wait_sel=".ak-draftbody, #akx .ak-empty", timeout=300000)
    ok2 = fr.evaluate("!!document.querySelector('#akx .ak-draftbody')")
    check(ok2, "2 draft came back from the voice server")
    if ok2:
        fr.click("#akx [data-ak=thread]")
        c = frame_of(page, "c5-home", "!!document.querySelector('#clist') && !!document.querySelector('.cdraft')")
        page.wait_for_timeout(2500)
        txt = c.evaluate("(document.querySelector('.cdraft')||{}).value || ''")
        check(len(txt) > 20 and not txt.startswith('TEST'), "2 draft sits in the thread composer")
        page.screenshot(path=str(OUT / f"2b-draft-in-thread-{W}.png"))
        page.evaluate("location.hash = '#/ask'"); fr = ask_frame(page)
    h, t = ask(page, fr, "Plan me a 3-hour knock route in Plano tomorrow", "3-knock-route")
    check("doors in Plano" in h, "3 route has doors in Plano")
    h, t = ask(page, fr, f"What did we say to {taddr}?", "4-history")
    check("messages with" in h or "message with" in h, "4 history shows the thread")
    h, t = ask(page, fr, "How many leads did we get Chris this month?", "5-month-report")
    check("In " in t and "contacted" in t, "5 report sentence")
    h, t = ask(page, fr, "Which streets got the biggest hail in the last 30 days that we haven't contacted?", "6-big-hail-streets")
    check("30 days" in t, "6 says whether a storm landed in 30 days")
    h, t = ask(page, fr, "Find roofs over 20 years old near Chris's last jobs", "7-old-roofs", timeout=180000)
    check("20" in h, "7 old roofs answer")
    h, t = ask(page, fr, "Why is #2 on today's list?", "8-why-on-list")
    check("score" in h, "8 score breakdown")
    fr.evaluate("Object.keys(localStorage).filter(k => k.startsWith('rc.')).forEach(k => localStorage.removeItem(k))")
    b.close()
print("FAILS:", fails if fails else "none")
