"""Kept features check (10-11): one headless Chromium (swiftshader) on :4886, 1440 and 390.
Each kept feature is driven and shot; dropped trial features are asserted absent; console errors collected per frame."""
import pathlib, sys, json, time
from playwright.sync_api import sync_playwright
OUT = pathlib.Path(__file__).parent
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]
BASE = "http://127.0.0.1:4886/tour/product.html?dev=1&nosw=1&noprefetch=1"
T0 = time.time()
def step(m): print(f"  [{time.time()-T0:6.1f}s] {m}", flush=True)
def frame(page, part):
    return next((f for f in page.frames if part in f.url), None)
def wait(page, part, expr, max_s=120):
    for _ in range(max_s * 2):
        fr = frame(page, part)
        if fr:
            try:
                if fr.evaluate(expr): return fr
            except Exception: pass
        page.wait_for_timeout(500)
    return None
RESULT = {}
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for W, H, MOB in ((1440, 900, False), (390, 844, True)):
        R = RESULT[W] = {}
        ctx = b.new_context(viewport={"width": W, "height": H}, timezone_id="America/Chicago", device_scale_factor=1, is_mobile=MOB, has_touch=MOB)
        ctx.route("**/formsubmit.co/**", lambda r: r.abort())
        ctx.route("**/st-data-dfw/private/**", lambda r: r.fulfill(status=404, body=""))
        page = ctx.new_page(); errs = []; page.set_default_timeout(60000)
        page.on("requestfailed", lambda r: errs.append("requestfailed: " + r.url[:120]))
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:200]))
        page.on("console", lambda m: errs.append("console: " + m.text[:200]) if m.type == "error" and "favicon" not in m.text and "404" not in m.text else None)
        # an older "seen" storm on this device, so the takeover is due for the newest one
        ctx.add_init_script("try{ if(!localStorage.getItem('rc.t.stormSeen')) localStorage.setItem('rc.t.stormSeen', JSON.stringify('2000-01-01')); }catch(e){}")
        # ---------- Today ----------
        page.goto(BASE + "#/daily", wait_until="domcontentloaded", timeout=90000)
        step(f"{W} Today loading")
        fr = wait(page, "c4-command-deck", "typeof QREADY!=='undefined' && QREADY && HOMES.length>0 && typeof SHOWN!=='undefined' && SHOWN", 150)
        page.wait_for_timeout(2500)
        R["takeover_shown"] = bool(fr and fr.evaluate("!!document.querySelector('.idw.in')"))
        R["takeover_text"] = fr.evaluate("(document.querySelector('.idw h1')||{}).textContent||''") if fr else ""
        page.screenshot(path=str(OUT / f"01-new-storm-takeover-{W}.png"))
        if R["takeover_shown"]:
            fr.click(".idw [data-later]"); page.wait_for_timeout(900)
        R["stormSeen_after"] = fr.evaluate("RC_FEATURES.stormSeen.get()") if fr else None
        # briefing settles after the sheet
        page.wait_for_timeout(3500)
        R["briefing"] = fr.evaluate("(document.getElementById('rcBrief')||{}).innerText||''") if fr else ""
        R["briefing_settled"] = bool(fr and fr.evaluate("!!document.getElementById('rcBrief') && !document.getElementById('rcBrief').classList.contains('count')"))
        page.screenshot(path=str(OUT / f"02-briefing-{W}.png"))
        # time of day: the live one, then dusk and night held for the camera
        R["tod_live"] = fr.evaluate("document.documentElement.dataset.tod||''") if fr else ""
        for tod in ("dusk", "night"):
            fr.evaluate(f"RC_FEATURES.tod('{tod}')"); page.wait_for_timeout(1800)
            page.screenshot(path=str(OUT / f"03-daylight-{tod}-{W}.png"))
        fr.evaluate("RC_FEATURES.tod('')")
        # dropped on Today: welcome sheet, radar, route draw
        R["dropped_today"] = fr.evaluate("({radar:!!document.querySelector('.idradar'), welcome:[...document.querySelectorAll('.ideb')].some(e=>/Built for/.test(e.textContent)), routeDraw:!!document.querySelector('.iddraw'), ideas:!!window.RC_IDEAS, panel:!!parent.document.querySelector('.rct'), cmdk:!!parent.window.RcCmdk, proofchip:!!parent.document.querySelector('.proofchip')})")
        # once per storm: reload, the takeover must not come back
        page.goto(BASE + "#/daily", wait_until="domcontentloaded", timeout=90000)
        fr = wait(page, "c4-command-deck", "typeof QREADY!=='undefined' && QREADY && HOMES.length>0 && typeof SHOWN!=='undefined' && SHOWN", 150)
        page.wait_for_timeout(3000)
        R["takeover_again"] = bool(fr and fr.evaluate("!!document.querySelector('.idw')"))
        # ---------- Nimbus reacts (shell) ----------
        for kind in ("ping", "storm", "glow"):
            ok = page.evaluate(f"RC_FEATURES.react('{kind}')"); page.wait_for_timeout(450)
            R[f"nimbus_{kind}"] = ok and page.evaluate(f"!!document.querySelector('.nb-react.{kind}')")
            page.screenshot(path=str(OUT / f"04-nimbus-{kind}-{W}.png"))
        R["orb_fixed"] = page.evaluate("(()=>{const d=document.querySelector('.nb-dock'); if(!d) return null; const r=d.getBoundingClientRect(); return [Math.round(r.left),Math.round(r.top)];})()")
        # ---------- Storms replay ----------
        page.goto(BASE + "#/storm", wait_until="domcontentloaded", timeout=90000)
        step(f"{W} Storms loading")
        sf = wait(page, "1b-storm-theater", "window.__ready===true && !!window.__replay", 180)
        sf.evaluate("window.__show()")
        wait(page, "1b-storm-theater", "window.__hits && window.__hits()>0", 60); page.wait_for_timeout(2500)
        R["replay_btn"] = sf.evaluate("!!document.getElementById('replay')")
        for f in (0.25, 0.55, 0.85):
            sf.evaluate(f"window.__replayAt({f})"); page.wait_for_timeout(1200)
            page.screenshot(path=str(OUT / f"05-replay-{int(f*100)}-{W}.png"))
        R["replay_lit_85"] = sf.evaluate("window.__replayLit()")
        R["replay_layers"] = sf.evaluate("(()=>{try{ return layers().map(l=>l.id).filter(i=>/replay/.test(i)); }catch(e){ return String(e); }})()")
        sf.evaluate("window.__replayStop()"); page.wait_for_timeout(600)
        R["replay_after_n"] = sf.evaluate("document.getElementById('s-n').textContent")
        R["dropped_storm_proof"] = sf.evaluate("!!document.getElementById('proof')")
        # ---------- CRM record: roof builds itself + stamp ----------
        page.goto(BASE + "#/crm/home/m164153", wait_until="domcontentloaded", timeout=90000)
        step(f"{W} CRM record loading")
        hf = wait(page, "c5-home", "!!window.HOME && !!HOME.measure && !!document.querySelector('#stage .rc-built.in')", 180)
        page.wait_for_timeout(800)
        R["stamp"] = hf.evaluate("document.querySelector('#stage .rc-built').innerText.replace(/\\n+/g,' | ')") if hf else None
        R["title"] = hf.evaluate("document.getElementById('titleH').textContent") if hf else None
        if hf: hf.evaluate("document.getElementById('stage').scrollIntoView({block:'center'})"); page.wait_for_timeout(500)
        page.screenshot(path=str(OUT / f"06-roof-built-stamp-{W}.png"))
        # a rebuild mid-flight: switch the home again and catch the walls rising
        if hf:
            hf.evaluate("window.__switchHome()")
            R["building_mid"] = False
            for _ in range(40):
                page.wait_for_timeout(80)
                if hf.evaluate("document.getElementById('stage').classList.contains('building')"):
                    R["building_mid"] = True; page.screenshot(path=str(OUT / f"07-roof-building-{W}.png")); break
            wait(page, "c5-home", "!!document.querySelector('#stage .rc-built.in')", 30)
        # dropped on the record: passport, why chips, hold-to-send
        R["dropped_crm"] = hf.evaluate("({passport:!!document.querySelector('[data-rc=passport]'), why:!!document.querySelector('.rc-why'), hold:!!document.querySelector('.rc-hold'), ideas:!!window.RC_IDEAS, phys:document.documentElement.classList.contains('rc-phys')})") if hf else None
        # physical press: hold the mouse on a real button and read its transform
        if hf:
            btn = hf.query_selector("#bWhole, #bExplode, .pbtn, button")
            if btn:
                bb = btn.bounding_box()
                if bb:
                    page.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2); page.mouse.down(); page.wait_for_timeout(200)
                    R["press_transform"] = hf.evaluate("(b=>getComputedStyle(b).transform)(document.querySelector('#bWhole, #bExplode, .pbtn, button'))")
                    page.screenshot(path=str(OUT / f"08-physical-pressed-{W}.png"))
                    page.mouse.up(); page.wait_for_timeout(500)
                    R["release_transform"] = hf.evaluate("(b=>getComputedStyle(b).transform)(document.querySelector('#bWhole, #bExplode, .pbtn, button'))")
        # ---------- CRM pipeline: odometer (a fresh page, so no route change is in flight) ----------
        page.close(); page = ctx.new_page(); page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:200]))
        page.goto(BASE + "#/crm/pipeline", wait_until="domcontentloaded", timeout=90000)
        page.wait_for_timeout(4000)
        pf = wait(page, "c5-home", "!!window.RC_FEATURES && !!document.querySelector('#pcount .pcn b')", 120)
        page.wait_for_timeout(800)
        if pf:
          try:
            R["odo"] = pf.evaluate("""(async()=>{
              const sleep=ms=>new Promise(r=>setTimeout(r,ms));
              const b=document.querySelector('#pcount .pcn b'); const out={}; const n0=parseInt(b.textContent,10)||0;
              const set=v=>{ b.textContent=String(v); RC_FEATURES.rollNow(); };
              set(n0+3); await sleep(50); out.up={rolls:b.querySelectorAll('.rc-roll').length, dn:b.querySelectorAll('.rc-roll.dn').length, text:b.textContent};
              await sleep(700); set(n0+1); await sleep(50); out.down={rolls:b.querySelectorAll('.rc-roll').length, dn:b.querySelectorAll('.rc-roll.dn').length, text:b.textContent};
              await sleep(700); set(9); await sleep(650); set(10); await sleep(50); out.multi={rolls:b.querySelectorAll('.rc-roll').length, from:[...b.querySelectorAll('.rc-roll')].map(r=>r.dataset.from), text:b.textContent};
              await sleep(700); set(12); set(15); set(7); await sleep(50); out.rapid={text:b.textContent, rolls:b.querySelectorAll('.rc-roll').length};
              await sleep(700); set(n0); await sleep(50); out.back=b.textContent; return out; })()""")
            page.wait_for_timeout(100)
            pf.evaluate("(()=>{const b=document.querySelector('#pcount .pcn b'); const n=parseInt(b.textContent,10)||0; b.textContent=String(n+2); RC_FEATURES.rollNow();})()")
            page.wait_for_timeout(120)
            page.screenshot(path=str(OUT / f"09-odometer-mid-{W}.png"))
            page.wait_for_timeout(900)
          except Exception as e: R["odo"] = "error: " + str(e)[:160]
        # reduced motion: no roll
        ctx2 = b.new_context(viewport={"width": W, "height": H}, reduced_motion="reduce", is_mobile=MOB, has_touch=MOB)
        ctx2.route("**/st-data-dfw/private/**", lambda r: r.fulfill(status=404, body=""))
        p2 = ctx2.new_page(); errs2 = []; p2.on("pageerror", lambda e: errs2.append(str(e)[:200])); p2.goto(BASE + "#/crm/pipeline", wait_until="domcontentloaded", timeout=90000)
        pf2 = wait(p2, "c5-home", "!!window.RC_FEATURES && !!document.querySelector('#pcount .pcn b')", 120)
        try: R["odo_reduced"] = pf2.evaluate("(()=>{const b=document.querySelector('#pcount .pcn b'); const n=parseInt(b.textContent,10)||0; b.textContent=String(n+3); RC_FEATURES.rollNow(); return {rolls:b.querySelectorAll('.rc-roll').length, text:b.textContent};})()") if pf2 else None
        except Exception as e: R["odo_reduced"] = "error: " + str(e)[:160] + " keys=" + str(pf2.evaluate("Object.keys(window.RC_FEATURES||{})") if pf2 else None) + " errs=" + str(errs2[:3])
        ctx2.close()
        if not pf2: R["odo_reduced"] = "frame not ready"
        R["errors"] = errs[:8]
        print(W, json.dumps(R, indent=1)); ctx.close()
        (OUT / "result.json").write_text(json.dumps(RESULT, indent=1))
    b.close()
(OUT / "result.json").write_text(json.dumps(RESULT, indent=1))
