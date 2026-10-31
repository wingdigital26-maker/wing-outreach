"""Fixer B shots (10-10): CRM inbox, thread, pipeline, record, Storms at 1440 and 390, before/after.
python tour/audit/_fixb_shoot.py <tag>    (server on :4886). Seeds two threads through Today's Text flow so the CRM has data.
Shots: tour/audit/fixB-1010/<tag>-<screen>-<w>.png; prints console errors and visible overlaps per screen."""
import pathlib, sys, json
from playwright.sync_api import sync_playwright

TAG = sys.argv[1] if len(sys.argv) > 1 else "before"
URL = "http://localhost:4886/tour/product.html?dev=1&nosw=1&noprefetch=1#/daily"
OUT = pathlib.Path(__file__).parent / "fixB-1010"; OUT.mkdir(exist_ok=True)
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
GUARD = """document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href^="tel:"],a[href^="sms:"],a[href^="mailto:"],a[href^="https://www.google.com/maps"]');
  if (a) { e.preventDefault(); window.__lastHref = a.href; } }, true);"""
CLEAR = "Object.keys(localStorage).filter(k => k.startsWith('rc.')).forEach(k => localStorage.removeItem(k))"
OVERLAP_JS = open(pathlib.Path(__file__).parent / "_home_check.py", encoding="utf-8").read().split('OVERLAP_JS = r"""')[1].split('"""')[0]
OVERFLOW_JS = r"""() => { const out=[]; const vw=innerWidth; for (const e of document.querySelectorAll('body *')) { const cs=getComputedStyle(e); if(cs.display==='none'||cs.visibility==='hidden') continue; const r=e.getBoundingClientRect(); if(!r.width) continue; if(r.right>vw+1) out.push('right '+e.tagName.toLowerCase()+'.'+String(e.className).split(' ')[0]+' '+Math.round(r.right-vw)); if(cs.overflowX!=='visible'||cs.overflowY!=='visible'){} else if(e.scrollWidth>e.clientWidth+2 && e.clientWidth>0 && /^(P|SPAN|B|H1|H2|H3|DIV|BUTTON|A)$/.test(e.tagName) && [...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())) out.push('text-over '+e.tagName.toLowerCase()+'.'+String(e.className).split(' ')[0]+' "'+e.textContent.trim().slice(0,24)+'" '+(e.scrollWidth-e.clientWidth)); } return out.slice(0,25); }"""

def frame_of(page, part, ready, tries=240):
    for _ in range(tries):
        fr = next((f for f in page.frames if part in f.url), None)
        if fr:
            try:
                if fr.evaluate(ready): return fr
            except Exception: pass
        page.wait_for_timeout(500)
    raise RuntimeError("frame not ready: " + part)

def run(W):
    H = 900 if W > 640 else 844; MOB = W < 641
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=2 if MOB else 1, is_mobile=MOB, has_touch=MOB, timezone_id="America/Chicago")
        ctx.add_init_script(GUARD); ctx.route("**/formsubmit.co/**", lambda r: r.abort())
        page = ctx.new_page(); errs = []
        page.on("console", lambda m: errs.append(m.text[:160] + " @ " + str((m.location or {}).get("url", ""))[-40:]) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)[:160]))
        page.goto(URL, wait_until="domcontentloaded", timeout=90000)
        fr = frame_of(page, "deck.html", "window.__mapReady === true && typeof QREADY !== 'undefined' && QREADY")
        page.clock.install(time="2026-10-08T11:00:00-05:00")
        for _ in range(40):
            page.wait_for_timeout(500)
            if fr.evaluate("QDAY === new Date().toDateString()"): break
        page.wait_for_timeout(1500)
        def shot(name, f=None):
            page.wait_for_timeout(700)
            page.screenshot(path=str(OUT / f"{TAG}-{name}-{W}.png"), timeout=120000, animations="disabled")
            if f is not None:
                try:
                    ov = f.evaluate(OVERLAP_JS); of = f.evaluate(OVERFLOW_JS)
                    print(f"[{W}] {name}: overlaps={json.dumps(ov[:8])} overflow={json.dumps(of[:8])}", flush=True)
                except Exception as e: print(name, "measure fail", str(e)[:80])
            print("shot", name, W, flush=True)
        def tap(f, sel):
            r = f.evaluate("s => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({block:'nearest'}); const b = e.getBoundingClientRect(); return b.width ? {x:b.x+b.width/2, y:b.y+b.height/2} : null; }", sel)
            if not r: print("no element", sel, flush=True); return False
            o = f.frame_element().bounding_box(); page.mouse.click(o["x"] + r["x"], o["y"] + r["y"]); page.wait_for_timeout(600); return True
        def close_bubble():
            try:
                if page.evaluate("(()=>{const x=document.querySelector('.nb-bubble .nb-x'); if(!x) return false; return x.getBoundingClientRect().width>0})()"):
                    page.click(".nb-bubble .nb-x", timeout=3000, force=True); page.wait_for_timeout(300)
            except Exception: pass
        close_bubble()
        # seed: two threads through the state library (same records Today's Text flow writes)
        print(fr.evaluate("""() => { const m = JSON.parse(localStorage.getItem('rc.t.homes')||'{}'); const ids = Object.keys(m).slice(0,3); if (!ids.length) return 'no homes';
          RC.logText(ids[0], 'Text sent from your phone', { body: 'Hi, this is Chris with Jackson Roofing. Hail came through your street on Aug 12. We are doing free roof checks nearby this week, want one?', to: m[ids[0]].phone });
          RC.logReply(ids[0], 'Yes, Thursday afternoon works if you are around.', 'text');
          RC.logEmail(ids[1], 'Email drafted', { subject: 'Free roof check after the Aug 12 hail', body: 'Hi, this is Chris with Jackson Roofing.' , to: '' });
          return ids; }"""), flush=True)
        page.wait_for_timeout(800)
        # CRM
        page.click('nav button[data-screen="home"]', force=True); page.wait_for_timeout(1500)
        cf = frame_of(page, "c5-home", "!!window.renderCRM && !!window.HOME && !!document.querySelector('#clist')")
        page.wait_for_timeout(1500); close_bubble()
        shot("crm-inbox", cf)
        if tap(cf, '#clist .crow'):
            page.wait_for_timeout(1200); shot("crm-thread", cf)
            if MOB:
                tap(cf, 'button[data-a="house"]'); page.wait_for_timeout(1000); shot("crm-house-sheet", cf)
        else:
            shot("crm-empty", cf)
        tap(cf, '.vtabs button[data-v="pipeline"]'); page.wait_for_timeout(1200); shot("crm-pipeline", cf)
        tap(cf, '.pipe .pcard, .pipe .card, .pcol button'); page.wait_for_timeout(1200); shot("crm-record", cf)
        # Storms
        page.click('nav button[data-screen="storm"]', force=True); page.wait_for_timeout(2500)
        sf = frame_of(page, "1b-storm", "document.body.classList.contains('loaded')", tries=180); page.wait_for_timeout(2500); close_bubble()
        shot("storms", sf)
        print(f"[{W}] console errors ({len(errs)}):"); [print("   ", e) for e in errs[:12]]
        b.close()

for W in ([int(sys.argv[2])] if len(sys.argv) > 2 else [1440, 390]):
    run(W)
