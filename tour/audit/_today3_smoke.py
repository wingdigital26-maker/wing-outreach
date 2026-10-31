"""Quick look at the Today map beams (seeded through RC, not the user path). python tour/audit/_today3_smoke.py [w h]"""
import pathlib, sys
from playwright.sync_api import sync_playwright
URL = "http://localhost:4886/tour/product.html?dev=1#/daily"
SHOTS = pathlib.Path(__file__).parent / "shots"
ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"]
w, h = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) > 2 else (1440, 900)
mob = w < 641
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mob else 1, is_mobile=mob, has_touch=mob)
    page = ctx.new_page()
    page.clock.install(time="2026-10-08T11:00:00-05:00")
    page.route("**/formsubmit.co/**", lambda r: r.abort())
    errs = []
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)))
    print("goto", flush=True)
    page.goto(URL, wait_until="domcontentloaded", timeout=90000)
    print("loaded", flush=True)
    fr = None
    for _ in range(200):
        fr = next((f for f in page.frames if "deck.html" in f.url), None)
        if fr:
            try:
                if fr.evaluate("window.__mapReady === true"): break
            except Exception: pass
        page.wait_for_timeout(500); print(".", fr.evaluate("({l:typeof map!=='undefined'&&!!map&&typeof map.loaded==='function'&&map.loaded(), r:window.__mapReady})") if fr else None, errs[-3:], flush=True)
    print("ready", flush=True)
    # outreach is text and email only (10-09): the seeded touches are texts, emails and a logged reply
    fr.evaluate("""() => { const H = HOMES; RC.logText(H[0].id,'Text drafted in Messages',{body:'Hello from the smoke test', to:H[0].phone}); RC.logText(H[1].id,'Text drafted in Messages',{body:'Hi there, test body', to:H[1].phone});
      RC.logText(H[2].id,'Text drafted in Messages',{body:'Quote Friday?', to:H[2].phone}); RC.logReply(H[2].id,'Wants a quote Friday','text'); RC.logEmail(H[5].id,'Email drafted',{subject:'Your roof',body:'Hello'});
      RC.scheduleText(H[4].id, RC.defaultSendTime(), 'Scheduled hello', H[4].phone); }""")
    if mob:
        fr.click("#openRoute"); page.wait_for_timeout(1500)
    print("seeded", flush=True)
    page.wait_for_timeout(6000)
    page.screenshot(path=str(SHOTS / f"_smoke-{w}.png"), timeout=60000, animations="disabled")
    print(fr.evaluate("({beams:document.querySelectorAll('.reach .beam').length, pend:document.querySelectorAll('.reach .pend').length, pitch:typeof map!=='undefined'&&map&&map.getPitch?map.getPitch():null, zoom:typeof map!=='undefined'&&map&&map.getZoom?map.getZoom():null, list:document.querySelectorAll('.blist button').length})"))
    print("errors", errs)
    fr.evaluate("() => { [localStorage, sessionStorage].forEach(st => Object.keys(st).filter(k => k.indexOf('rc.') === 0 && k !== 'rc.dev').forEach(k => st.removeItem(k))); }")
    b.close()
