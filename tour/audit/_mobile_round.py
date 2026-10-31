"""Phone loop shoot + checks for the tour shell. Run: python tour/audit/_mobile_round.py <round> [width height]
Shots: audit/shots/m<round>-<screen>.png at 390x844 (dpr 2). Checks per screen: console/page errors across frames,
overlapping visible leaf text/controls (0 expected), tap targets under 44 px, and the sticky bar vs content.
Clock pinned to Mon 2026-10-05 10:00 Central; rc.t.* cleared first; tel:/sms:/formsubmit never leave the page."""
import sys, os, re, json, pathlib, time; sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright
R = sys.argv[1] if len(sys.argv) > 1 else "1"
W = int(sys.argv[2]) if len(sys.argv) > 2 else 390; H = int(sys.argv[3]) if len(sys.argv) > 3 else 844
ONLY = set(os.environ.get("ONLY","opening,daily,storm,record,home,ask").split(","))   # ONLY=record,home re-runs part of a round
TAG = f"m{R}" + ("" if (W, H) == (390, 844) else f"-{W}x{H}")
BASE = "http://localhost:4885/tour/"
HERE = pathlib.Path(__file__).parent; SH = HERE / "shots"; SH.mkdir(exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
src = (HERE / "_daily_check.py").read_text(encoding="utf-8")
OVERLAP_JS = re.search(r'OVERLAP_JS = r"""(.*?)"""', src, re.S).group(1)
SMALL_JS = re.search(r'SMALL_JS = r"""(.*?)"""', src, re.S).group(1)
report = {}; fails = []
def check(c, m):
    print(("ok   " if c else "FAIL ") + m)
    if not c: fails.append(m)
def shot(pg, name):
    t = time.time()
    try: pg.screenshot(path=str(SH / f"{TAG}-{name}.png"), timeout=300000); print(f"   shot {TAG}-{name}.png ({time.time()-t:.0f}s)")
    except Exception as e: print("   (screenshot skipped:", name, str(e).splitlines()[0][:70], ")")
def frame(pg, needle):
    for f in pg.frames:
        if needle in f.url: return f
    return None
def active(pg):
    s = pg.evaluate("()=>{const f=document.querySelector('.frame.on'); return f? f.dataset.screen : ''}")
    return s
def audit(pg, name, fr=None, extra_sel=None):
    """overlaps + small targets in the active frame and the shell; records to the report"""
    res = {"screen": name}
    try:
        res["shell"] = pg.evaluate(OVERLAP_JS)["overlaps"]
    except Exception as e: res["shell"] = ["ERR " + str(e)[:60]]
    if fr:
        try:
            o = fr.evaluate(OVERLAP_JS); res["frame"] = o["overlaps"]; res["n"] = o["n"]
            res["small"] = fr.evaluate(SMALL_JS)
        except Exception as e: res["frame"] = ["ERR " + str(e)[:60]]; res["small"] = []
    report[name] = res
    check(not res["shell"], f"{name}: shell overlaps = {len(res['shell'])} {res['shell'][:3]}")
    if fr:
        check(not res.get("frame"), f"{name}: frame overlaps = {len(res.get('frame', []))} {res.get('frame', [])[:4]}")
        print(f"   {name}: {len(res.get('small', []))} targets under 44px: {res.get('small', [])[:6]}")
def go(pg, screen, params=None):
    pg.evaluate("([s,p])=>window.postMessage({type:'go',screen:s,params:p||{}},location.origin)", [screen, params or {}])
def wait_screen(pg, screen, needle, js, ms=150000):
    pg.wait_for_function("([s,n,js])=>{const f=document.querySelector('.frame.on'); if(!f||f.dataset.screen!==s) return false; try{ if(!f.contentWindow.location.href.includes(n)) return false; return !!f.contentWindow.eval(js) }catch(e){ return false } }", arg=[screen, needle, js], timeout=ms)
    pg.wait_for_timeout(700)

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS, headless=True)
    ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=2, is_mobile=True, has_touch=True, timezone_id="America/Chicago")
    ctx.route("**/formsubmit.co/**", lambda r: r.abort())
    errs = []
    pg = None
    def newpage(url, dpr=2):
        # one page per screen group: the shell keeps every frame alive, which is more than swiftshader can hold at dpr 2
        global pg, ctx
        if pg: pg.close()
        if dpr != 2 or ctx is None:
            ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=dpr, is_mobile=True, has_touch=True, timezone_id="America/Chicago")
            ctx.route("**/formsubmit.co/**", lambda r: r.abort())
        pg = ctx.new_page(); pg.set_default_timeout(150000); pg.set_default_navigation_timeout(150000)
        pg.clock.install(time="2026-10-05T10:00:00-05:00")
        pg.on("pageerror", lambda e: errs.append("page: " + str(e)[:160]))
        pg.on("console", lambda m: errs.append(m.text[:160] + " @ " + ((m.location or {}).get("url", "") or "")[-50:]) if m.type == "error" else None)
        pg.goto(url, wait_until="domcontentloaded")
        return pg
    pg = newpage(BASE + "product.html?nointro=1")
    pg.evaluate("() => { Object.keys(localStorage).filter(k=>k.startsWith('rc.t.')).forEach(k=>localStorage.removeItem(k)); sessionStorage.clear(); }")
    if 'daily' in ONLY:
        # 1. opening: the piece mid-form, then the hand-off with the brief
        if 'opening' in ONLY:
            pg.goto(BASE + "product.html", wait_until="domcontentloaded"); pg.wait_for_timeout(3200)
            shot(pg, "opening")
            try:
                pg.wait_for_function("()=>location.hash==='#/daily'", timeout=30000)
            except Exception: print("   (opening did not hand off in 30 s)")
        else:
            pg.goto(BASE + "product.html?nointro=1#/daily", wait_until="domcontentloaded")
        wait_screen(pg, "daily", "deck.html", "typeof HOMES!=='undefined' && HOMES.length>0 && !!document.querySelector('.card[data-d=\"0\"]')")
        pg.wait_for_timeout(600)
        shot(pg, "brief")
        bub = pg.evaluate("()=>{const b=document.querySelector('.nb-bubble'); return b? {on:b.classList.contains('on'), t:b.innerText, r:b.getBoundingClientRect().toJSON()} : null}")
        print("   brief bubble:", bub and bub["t"][:90], bub and {k: round(v) for k, v in bub["r"].items()})
        fr = frame(pg, "deck.html")
        audit(pg, "daily", fr)
        # Daily 50 card: address, hail, roof and Call visible without scrolling
        vis = fr.evaluate("""()=>{const c=document.querySelector('.card[data-d="0"]'); if(!c) return null; const q=s=>{const e=c.querySelector(s); if(!e) return null; const r=e.getBoundingClientRect(); return {top:Math.round(r.top),bottom:Math.round(r.bottom),h:Math.round(r.height),w:Math.round(r.width),t:(e.textContent||'').trim().slice(0,24)}};
          return {addr:q('h2'), hail:q('.tl .pill'), sq:q('.bl'), call:q('.act .call'), text:q('.act .txt'), skip:q('.act .skp'), vh:innerHeight, scroll:document.documentElement.scrollHeight}}""")
        print("   daily card:", json.dumps(vis))
        if vis:
            check(vis["call"] and vis["call"]["bottom"] <= vis["vh"] and vis["addr"] and vis["addr"]["top"] >= 0, "daily: address + Call visible without scrolling")
            check(vis["call"] and vis["call"]["h"] >= 44, f"daily: Call tap height {vis['call'] and vis['call']['h']}")
        # Daily 50 roof sheet
        fr.evaluate("()=>openRoof(HOMES[cur])"); pg.wait_for_timeout(900)
        shot(pg, "daily-roof-sheet")
        rs = fr.evaluate("""()=>{const s=document.getElementById('sheetRoof'); const r=s.getBoundingClientRect(); const cs=getComputedStyle(s); const sc=document.getElementById('scrim'); return {top:Math.round(r.top),bottom:Math.round(r.bottom),bg:cs.backgroundColor,scrim:sc?getComputedStyle(sc).opacity:null, open:s.classList.contains('open')}}""")
        print("   roof sheet:", rs)
        check(rs["open"] and rs["bg"] not in ("rgba(0, 0, 0, 0)", "transparent"), f"daily roof sheet has a background ({rs['bg']})")
        audit(pg, "daily-roof-sheet", fr)
        fr.evaluate("()=>{document.querySelector('#sheetRoof [data-close]').click()}"); pg.wait_for_timeout(500)
    if 'storm' in ONLY:
        # 2. storm map
        pg = newpage(BASE + "product.html?nointro=1&noprefetch=1#/storm"); wait_screen(pg, "storm", "1b-storm-theater", "typeof ST!=='undefined' && ST.storms && ST.storms.length>0 && typeof map!=='undefined' && map.loaded && map.loaded()")
        fr = frame(pg, "1b-storm-theater"); pg.wait_for_timeout(1500)
        shot(pg, "storm")
        audit(pg, "storm", fr)
        pg = newpage(BASE + "product.html?nointro=1&noprefetch=1#/storm/2026-09-12"); wait_screen(pg, "storm", "1b-storm-theater", "typeof ST!=='undefined' && ST.storms && ST.storms.length>0 && typeof map!=='undefined' && map.loaded && map.loaded() && !!cur", 200000)
        fr = frame(pg, "1b-storm-theater"); pg.wait_for_timeout(2500)
        shot(pg, "storm-sep12")
        audit(pg, "storm-sep12", fr)
    if 'record' in ONLY:
        # a record: the demo pick, on phone the sheet should sit above the CTA
        # (dpr 1: the record on top of the map plus the orb is more than the software GPU holds at dpr 2; the direct page shoots fine at 2)
        pg = newpage(BASE + "product.html?nointro=1&noprefetch=1#/storm/2026-09-12", dpr=1); wait_screen(pg, "storm", "1b-storm-theater", "typeof ST!=='undefined' && ST.storms && ST.storms.length>0 && typeof map!=='undefined' && map.loaded && map.loaded() && !!cur && hitIdx && hitIdx.length>0", 200000)
        fr = frame(pg, "1b-storm-theater"); pg.wait_for_timeout(2000)
        try:
            # no fly-in: the zoom-16 footprint pass is what crashes swiftshader at dpr 2; the sheet and record are the same
            fr.evaluate("()=>{const d=window.__selectDemo&&__selectDemo(); selectHome(d?d.i:hitIdx[0],false); setSheet('half');}")
        except Exception as e: print("   select failed", str(e)[:80])
        pg.wait_for_timeout(1800)
        shot(pg, "storm-record")
        audit(pg, "storm-record", fr)
        rec = fr.evaluate("""()=>{const q=s=>{const e=document.querySelector(s); if(!e) return null; const r=e.getBoundingClientRect(); const cs=getComputedStyle(e); return {top:Math.round(r.top),bottom:Math.round(r.bottom),h:Math.round(r.height),vis:cs.visibility,disp:cs.display,op:cs.opacity}};
          return {sheet:q('.sheet'), rec:q('#rec')||q('.rec')||q('#record'), cta:q('#cta')||q('.cta'), open:q('#open')}}""")
        print("   storm record:", rec)
    if 'home' in ONLY:
        # 3. home for stop 1 (the Daily 50 frame first so the stop is remembered, then Home)
        pg = newpage(BASE + "product.html?nointro=1#/daily", dpr=2); wait_screen(pg, "daily", "deck.html", "typeof HOMES!=='undefined' && HOMES.length>0")
        go(pg, "home", {"id": "dreddirt-1"}); wait_screen(pg, "home", "c5-home", "window.HOME && HOME.rawId==='dreddirt-1' && !!document.querySelector('#stage canvas')")
        fr = frame(pg, "c5-home"); pg.wait_for_timeout(2500)
        shot(pg, "home")
        audit(pg, "home", fr)
        hm = fr.evaluate("""()=>{const q=s=>{const e=document.querySelector(s); if(!e) return null; const r=e.getBoundingClientRect(); return {top:Math.round(r.top),bottom:Math.round(r.bottom),h:Math.round(r.height),w:Math.round(r.width)}}; return {stage:q('#stage')||q('canvas'), bar:q('.cta')||q('.actions')||q('.sticky'), vh:innerHeight, sh:document.documentElement.scrollHeight}}""")
        print("   home:", hm)
        # tap a plane: pick the centre of the canvas and nudge until a plane is selected
        picked = False
        try:
            cv = fr.locator("canvas").first; bb = cv.bounding_box()
            for dx, dy in [(0, 0), (-40, -20), (40, -20), (0, -60), (-60, 20), (60, 20)]:
                pg.touchscreen.tap(bb["x"] + bb["width"] / 2 + dx, bb["y"] + bb["height"] / 2 + dy); pg.wait_for_timeout(700)
                if fr.evaluate("()=>document.body.classList.contains('sheet-open')"): picked = True; break
        except Exception as e: print("   plane tap failed", str(e)[:80])
        if not picked:
            try: fr.evaluate("()=>{ if(typeof focusPlane==='function') focusPlane(0); }"); picked = fr.evaluate("()=>document.body.classList.contains('sheet-open')"); print("   (plane picked by focusPlane(0), not by tap)")
            except Exception as e: print("   focusPlane failed", str(e)[:60])
        pg.wait_for_timeout(900)
        shot(pg, "home-plane-sheet")
        print("   plane picked:", picked)
        audit(pg, "home-plane-sheet", fr)
    if 'ask' in ONLY:
        # 4. ask / nimbus: the Ask screen, then the shell chat with the input focused
        pg = newpage(BASE + "product.html?nointro=1#/ask"); wait_screen(pg, "ask", "c2-nimbus", "!!document.getElementById('composer') && !!document.getElementById('composer').dataset.live", 200000)
        fr = frame(pg, "c2-nimbus"); pg.wait_for_timeout(1500)
        shot(pg, "ask")
        audit(pg, "ask", fr)
        pg.evaluate("()=>{Nimbus.hide(); Nimbus.chat.toggle(true);}"); pg.wait_for_timeout(700)
        inp = pg.locator(".wmp-ask input"); inp.wait_for(state="visible", timeout=20000); inp.fill("how many homes did sep 12 hit"); inp.press("Enter"); pg.wait_for_timeout(1500)
        shot(pg, "nimbus")
        ch = pg.evaluate("""()=>{const w=document.querySelector('.wmp'); const i=document.querySelector('.wmp-ask input'); const r=w.getBoundingClientRect(), ir=i.getBoundingClientRect(); return {top:Math.round(r.top),bottom:Math.round(r.bottom),inTop:Math.round(ir.top),inBottom:Math.round(ir.bottom),inH:Math.round(ir.height),vh:innerHeight,vv:visualViewport.height}}""")
        print("   chat:", ch)
        check(ch["inBottom"] <= ch["vh"] and ch["inH"] >= 40, "nimbus chat input inside the viewport and tall enough")
        audit(pg, "nimbus")
    bad = [e for e in errs if "favicon" not in e and "net::ERR" not in e]
    check(bad == [], f"console/page errors across frames: {len(bad)} {bad[:5]}")
    (HERE / f"{TAG}-report.json").write_text(json.dumps({"report": report, "errors": bad, "fails": fails}, indent=1), encoding="utf-8")
    ctx.close(); b.close()
print("\nRESULT:", "ALL PASS" if not fails else f"{len(fails)} FAIL")
