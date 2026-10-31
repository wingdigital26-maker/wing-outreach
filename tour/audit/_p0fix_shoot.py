"""P0 fixer shots (10-10): Today skeleton + loaded + email dialog, Storms early + loaded, CRM inbox, Ask, phone text dialog
and thread header. python tour/audit/_p0fix_shoot.py <tag> [1440|390]  (server on :4886). Shots -> tour/audit/p0fix-1010/."""
import pathlib, sys, json
from playwright.sync_api import sync_playwright
TAG = sys.argv[1] if len(sys.argv) > 1 else "after"
WS = [int(sys.argv[2])] if len(sys.argv) > 2 else [1440, 390]
URL = "http://localhost:4886/tour/product.html?dev=1&nosw=1&noprefetch=1#/daily"
OUT = pathlib.Path(__file__).parent / "p0fix-1010"; OUT.mkdir(exist_ok=True)
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
GUARD = """document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href^="tel:"],a[href^="sms:"],a[href^="mailto:"]'); if (a) { e.preventDefault(); } }, true);"""
TXT = "s => { const e = document.querySelector(s); return e ? e.textContent.trim().slice(0, 120) : null; }"

def frame_of(page, part, ready, tries=200):
    for _ in range(tries):
        fr = next((f for f in page.frames if part in f.url), None)
        if fr:
            try:
                if fr.evaluate(ready): return fr
            except Exception: pass
        page.wait_for_timeout(500)
    raise RuntimeError("frame not ready: " + part)

def orb_overlaps(page, fr):
    """orb box vs every visible button/link in the frame: the controls he covers"""
    o = page.evaluate("(()=>{const d=document.querySelector('.nb-dock'); if(!d) return null; const r=d.getBoundingClientRect(); return {l:r.left,t:r.top,r:r.right,b:r.bottom,op:getComputedStyle(d).opacity,tuck:d.classList.contains('tuck')}})()")
    if not o: return "no orb"
    fb = fr.frame_element().bounding_box()
    hits = fr.evaluate("""(o)=>{const out=[]; for(const e of document.querySelectorAll('a[href],button,[role=button]')){const cs=getComputedStyle(e); if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity<.05) continue; const r=e.getBoundingClientRect(); if(!r.width) continue; const l=r.left+o.fx,t=r.top+o.fy,rr=r.right+o.fx,b=r.bottom+o.fy; const w=Math.min(rr,o.r)-Math.max(l,o.l), h=Math.min(b,o.b)-Math.max(t,o.t); if(w>6&&h>6) out.push((e.textContent||e.getAttribute('aria-label')||e.className).trim().slice(0,30));} return out;}""", dict(o, fx=fb["x"], fy=fb["y"]))
    return {"tuck": o["tuck"], "opacity": o["op"], "covers": hits[:6]}

def run(W):
    H = 900 if W > 640 else 844; MOB = W < 641
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=2 if MOB else 1, is_mobile=MOB, has_touch=MOB, timezone_id="America/Chicago")
        ctx.add_init_script(GUARD); ctx.route("**/formsubmit.co/**", lambda r: r.abort())
        page = ctx.new_page(); errs = []
        page.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)[:160]))
        page.on("console", lambda m: errs.append(m.text[:140]) if m.type == "error" else None)
        def shot(name):
            page.screenshot(path=str(OUT / f"{TAG}-{name}-{W}.png"), timeout=120000, animations="disabled"); print("shot", name, W, flush=True)
        def tap(f, sel):
            r = f.evaluate("s => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({block:'nearest'}); const b = e.getBoundingClientRect(); return b.width ? {x:b.x+b.width/2, y:b.y+b.height/2} : null; }", sel)
            if not r: print("no element", sel, flush=True); return False
            o = f.frame_element().bounding_box(); page.mouse.click(o["x"] + r["x"], o["y"] + r["y"]); page.wait_for_timeout(700); return True
        def t(f, sel): return f.evaluate(TXT, sel)
        page.goto(URL, wait_until="domcontentloaded", timeout=90000)
        # Today: early paint (skeleton) then loaded
        fr = frame_of(page, "deck.html", "!!document.getElementById('greet')", 60)
        page.wait_for_timeout(400); shot("today-skeleton")
        print("skeleton:", json.dumps({"h1": t(fr, "#hello"), "mStops": t(fr, "#mStops"), "skel": fr.evaluate("document.getElementById('mStops').classList.contains('skel')")}), flush=True)
        fr = frame_of(page, "deck.html", "window.__mapReady === true && typeof QREADY !== 'undefined' && QREADY")
        page.wait_for_timeout(2500)
        try: page.click(".nb-bubble .nb-x", timeout=1500, force=True)
        except Exception: pass
        shot("today")
        print("today:", json.dumps({"h1": t(fr, "#hello"), "mStops": t(fr, "#mStops"), "pitch": t(fr, ".deck .facts div:nth-child(3) b"), "row": t(fr, ".qlist .qrow"), "owner": t(fr, ".deck .addr p")}), flush=True)
        if tap(fr, '.deck .act button[data-act="email"], .deck .act [data-a="email"]'):
            page.wait_for_timeout(800); shot("today-email")
            print("email:", json.dumps(fr.evaluate("(()=>{const d=document.querySelector('dialog[open]'); if(!d) return 'no dialog'; const w=d.querySelector('#eWhy'); return {why:w?w.textContent:null, ro:!!d.querySelector('#eBody[readonly]'), mail:d.querySelector('#dMail')&&d.querySelector('#dMail').className}})()")), flush=True)
            print("orb/email dialog:", json.dumps(orb_overlaps(page, fr)), flush=True)
            page.keyboard.press("Escape"); page.wait_for_timeout(300)
        if MOB and tap(fr, '.deck .act button[data-act="text"]'):
            page.wait_for_timeout(900); shot("today-text"); print("orb/text dialog:", json.dumps(orb_overlaps(page, fr)), flush=True)
            page.keyboard.press("Escape"); page.wait_for_timeout(300)
        # Storms: early then loaded
        page.click('nav button[data-screen="storm"]', force=True); page.wait_for_timeout(900); shot("storms-early")
        page.wait_for_timeout(2500); shot("storms-3s")
        sf = frame_of(page, "storm-theater", "document.body.classList.contains('loaded')")
        page.wait_for_timeout(2500); shot("storms")
        hh = lambda: {"n": t(sf, "#s-n"), "hhN": t(sf, "#hh-n"), "hhMax": t(sf, "#hh-max"), "hhTop": t(sf, "#hh-top"), "wait": sf.evaluate("document.getElementById('hh').classList.contains('wait')"), "sub": t(sf, "#hh-sub")}
        if tap(sf, "#show"):
            page.wait_for_timeout(150); print("storm mid-flight:", json.dumps(hh()), flush=True)
            page.wait_for_timeout(2500); shot("storms-selected"); print("storm selected:", json.dumps(hh()), flush=True)
            print("orb/storms:", json.dumps(orb_overlaps(page, sf)), flush=True)
        # CRM
        page.click('nav button[data-screen="home"]', force=True); page.wait_for_timeout(1500)
        cf = frame_of(page, "c5-home", "!!window.renderCRM && !!document.querySelector('#clist')")
        page.wait_for_timeout(2500); shot("crm")
        print("crm:", json.dumps({"head": t(cf, "#cvh .cvt"), "sub": t(cf, "#cvh .cvsub"), "msgs": t(cf, "#cvm"), "empty": cf.evaluate("!!document.querySelector('#cvm .cempty')")}), flush=True)
        if MOB:
            if not tap(cf, "#clist .crow"):
                cf.evaluate("(()=>{const p=RC.daily().find(p=>p.status!=='closed'); if(p) location.hash='#/crm/inbox/'+p.id;})()")
                page.evaluate("(()=>{const p=document.querySelector('#f iframe[data-screen=\"home\"]'); })()")
            page.wait_for_timeout(1200); shot("crm-thread")
            print("thread row:", json.dumps(cf.evaluate("(()=>{const m=document.querySelector('.cvt-m'); if(!m) return null; const r=m.getBoundingClientRect(); const bs=[...m.querySelectorAll('.cbtn')].map(b=>Math.round(b.getBoundingClientRect().top)); return {rowH:Math.round(r.height), tops:bs, scroll:m.scrollWidth>m.clientWidth}})()")), flush=True)
            print("orb/thread:", json.dumps(orb_overlaps(page, cf)), flush=True)
        # Ask
        page.click('nav button[data-screen="ask"]', force=True); page.wait_for_timeout(2500)
        af = frame_of(page, "c2-nimbus", "!!document.getElementById('hello')", 40)
        page.wait_for_timeout(1500); shot("ask")
        print("ask:", json.dumps(af.evaluate("(()=>{const t=s=>{const e=document.querySelector(s); return e?getComputedStyle(e).display+':'+e.textContent.trim().slice(0,80):null}; return {fresh:document.body.classList.contains('fresh'), hello:t('#hello'), q:t('.sheet .q'), meta:t('#rqmeta'), chips:[...document.querySelectorAll('.chip')].map(c=>c.textContent)}})()")), flush=True)
        if tap(af, ".chip[data-streets]"):
            page.wait_for_timeout(1200); shot("ask-streets")
            print("ask streets:", json.dumps({"q": t(af, ".sheet .q"), "meta": t(af, "#rqmeta"), "ans": t(af, "#answer"), "cards": af.evaluate("document.querySelectorAll('.st').length")}), flush=True)
        if tap(af, "#ask"):
            page.keyboard.type("what is the weather tomorrow"); page.keyboard.press("Enter"); page.wait_for_timeout(1200)
            print("ask fallback:", json.dumps({"ans": t(af, "#answer"), "src": t(af, ".src")}), flush=True)
        print("errors:", errs[:8], flush=True)
        b.close()

for W in WS: run(W)
