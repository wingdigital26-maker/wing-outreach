"""Stories chip + Roof report + Nimbus Ask panel check (10-11): one headless Chromium (swiftshader) on :4886, 1440 and 390.
3312 Caleo Ct (m164153) has the full facet report (meta/roof-detail); m1 has none (the fallback). Short runs: the LiDAR batch owns the CPU."""
import pathlib, json, time
from playwright.sync_api import sync_playwright
OUT = pathlib.Path(__file__).parent
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]
BASE = "http://127.0.0.1:4886/tour/product.html?dev=1&nosw=1&noprefetch=1&nointro=1"
T0 = time.time()
def step(m): print(f"  [{time.time()-T0:6.1f}s] {m}", flush=True)
def frame(page, part): return next((f for f in page.frames if part in f.url), None)
def wait(page, part, expr, max_s=90):
    for _ in range(max_s * 2):
        fr = frame(page, part)
        if fr:
            try:
                if fr.evaluate(expr): return fr
            except Exception: pass
        page.wait_for_timeout(500)
    return frame(page, part)
R = {}
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    import os
    VIEWS = () if os.environ.get("STORM_ONLY") else ((1440, 900, False), (390, 844, True))
    if os.environ.get("STORM_ONLY") and (OUT / "result.json").exists(): R = json.loads((OUT / "result.json").read_text(encoding="utf-8"))
    for W, H, MOB in VIEWS:
        r = R[W] = {}; errs = []
        ctx = b.new_context(viewport={"width": W, "height": H}, timezone_id="America/Chicago", device_scale_factor=1, is_mobile=MOB, has_touch=MOB)
        ctx.route("**/formsubmit.co/**", lambda x: x.abort())
        ctx.route("**/st-data-dfw/private/**", lambda x: x.fulfill(status=404, body=""))
        ctx.add_init_script("try{ sessionStorage.setItem('rc.introSeen','1'); localStorage.setItem('rc.t.stormSeen', JSON.stringify('2099-01-01')); }catch(e){}")
        page = ctx.new_page(); page.set_default_timeout(60000)
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:200]))
        page.on("console", lambda m: errs.append("console: " + m.text[:200]) if m.type == "error" and "favicon" not in m.text and "404" not in m.text else None)
        # ---------- CRM home record: Caleo ----------
        page.goto(BASE + "#/crm/home/m164153", wait_until="domcontentloaded", timeout=90000)
        step(f"{W} record loading")
        fr = wait(page, "c5-home", "!!(window.HOME && HOME.roof && document.querySelector('#rsub .rc-story')) && !!window.__ready", 90)
        page.wait_for_timeout(2500)
        r["chip"] = fr.evaluate("(document.querySelector('#rsub .rc-story')||{}).textContent||''") if fr else ""
        r["chip_tip"] = fr.evaluate("(document.querySelector('#rsub .rc-story')||{}).title||''") if fr else ""
        r["roof"] = fr.evaluate("HOME.roof && {sq:HOME.roof.sq, stories:HOME.roof.stories, conf:HOME.roof.storyConf, facets:HOME.roof.nFacets, pitch:HOME.roof.pitch}") if fr else None
        r["tabs"] = fr.evaluate("[...document.querySelectorAll('#tabs button')].map(b=>b.textContent.trim())") if fr else []
        r["nimbus_fixed"] = page.evaluate("(()=>{const d=document.querySelector('.nb-dock'); if(!d) return null; const b=d.getBoundingClientRect(); return {right:Math.round(innerWidth-b.right), bottom:Math.round(innerHeight-b.bottom), pos:getComputedStyle(d).position};})()")
        page.screenshot(path=str(OUT / f"01-record-2story-{W}.png"))
        # the 3D stage alone (walls two stories tall)
        if fr:
            try: fr.locator("#stage").screenshot(path=str(OUT / f"02-stage-{W}.png"))
            except Exception as e: r["stage_shot_err"] = str(e)[:120]
        # Roof report tab
        if fr:
            fr.evaluate("(()=>{const b=document.querySelector('#ptab [data-p=\"home\"]'); if(b) b.click();})()"); page.wait_for_timeout(600)
            fr.evaluate("(()=>{const b=document.querySelector('#tabs [data-t=\"report\"]'); if(b) b.click();})()"); page.wait_for_timeout(1500)
            fr.evaluate("document.querySelector('#report') && document.querySelector('#report').scrollIntoView({block:'start'})")
            page.wait_for_timeout(600)
            r["report"] = fr.evaluate("(()=>{const e=document.querySelector('#report'); if(!e) return null; return {diag:!!e.querySelector('.rr-diag'), facets:e.querySelectorAll('.rr-diag path').length, edges:e.querySelectorAll('.rr-diag line').length, kpis:[...e.querySelectorAll('.rr-kpis b')].map(b=>b.textContent), rows:e.querySelectorAll('.rr-t tr').length, verify:/Verify on site/.test(e.textContent), emdash:/\\u2014/.test(e.textContent.replace(/\\u2014(?=<)/g,''))};})()")
            page.screenshot(path=str(OUT / f"03-report-{W}.png"))
            try: fr.locator("#report").screenshot(path=str(OUT / f"04-report-full-{W}.png"))
            except Exception as e: r["report_shot_err"] = str(e)[:120]
        # ---------- Nimbus orb -> Ask panel ----------
        r["nav"] = page.evaluate("[...document.querySelectorAll('#nav button')].map(b=>b.textContent)")
        page.click(".nb-hit"); page.wait_for_timeout(800)
        step(f"{W} ask panel")
        af = wait(page, "c2-nimbus", "!!document.getElementById('akchips') && document.querySelectorAll('.chip[data-q]').length>0", 60)
        page.wait_for_timeout(2500)
        r["ask_open"] = page.evaluate("!!document.querySelector('.nb-ask.open')")
        r["ask_chips"] = af.evaluate("[...document.querySelectorAll('.chip[data-q]')].map(c=>c.textContent)") if af else []
        r["ask_intents"] = af.evaluate("window.RCAsk ? RCAsk.CHIPS.length : null") if af else None
        r["ask_box"] = page.evaluate("(()=>{const e=document.querySelector('.nb-ask'); const b=e.getBoundingClientRect(); return {w:Math.round(b.width), h:Math.round(b.height), right:Math.round(innerWidth-b.right), bottom:Math.round(innerHeight-b.bottom)};})()")
        page.screenshot(path=str(OUT / f"05-nimbus-ask-{W}.png"))
        # a chip answers inside the panel
        if af:
            try:
                af.click('.chip[data-q]:nth-of-type(2)'); page.wait_for_timeout(2500)
                r["ask_answer"] = af.evaluate("(document.getElementById('answer')||{}).textContent.slice(0,160)")
            except Exception as e: r["ask_click_err"] = str(e)[:120]
            page.screenshot(path=str(OUT / f"06-nimbus-answer-{W}.png"))
        page.keyboard.press("Escape"); page.wait_for_timeout(500)
        r["ask_closed"] = page.evaluate("!document.querySelector('.nb-ask.open')")
        # #/ask route opens the panel, no tab
        page.evaluate("location.hash='#/ask'"); page.wait_for_timeout(1200)
        r["route_ask_opens_panel"] = page.evaluate("!!document.querySelector('.nb-ask.open') && !/#\\/ask/.test(location.hash)")
        page.keyboard.press("Escape"); page.wait_for_timeout(300)
        # ---------- fallback: a home without facet data ----------
        page.evaluate("location.hash='#/crm/home/m1'"); page.wait_for_timeout(1500)
        fr = wait(page, "c5-home", "!!(window.HOME && HOME.rawId==='m1' && HOME.rec && HOME.rec.gi!=null)", 60)
        page.wait_for_timeout(2500)
        if fr:
            r["fallback_chip"] = fr.evaluate("!!document.querySelector('#rsub .rc-story')")
            fr.evaluate("(()=>{const b=document.querySelector('#ptab [data-p=\"home\"]'); if(b) b.click(); const t=document.querySelector('#tabs [data-t=\"report\"]'); if(t) t.click();})()"); page.wait_for_timeout(800)
            r["fallback_report"] = fr.evaluate("(document.querySelector('#report')||{}).textContent.slice(0,200)")
            page.screenshot(path=str(OUT / f"07-fallback-{W}.png"))
        r["errors"] = errs[:12]
        ctx.close()
        (OUT / "result.json").write_text(json.dumps(R, indent=1), encoding="utf-8")
    # ---------- Storms card for Caleo (1440 only, heavy map) ----------
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, timezone_id="America/Chicago")
    ctx.route("**/st-data-dfw/private/**", lambda x: x.fulfill(status=404, body=""))
    ctx.add_init_script("try{ sessionStorage.setItem('rc.introSeen','1'); localStorage.setItem('rc.t.stormSeen', JSON.stringify('2099-01-01')); }catch(e){}")
    page = ctx.new_page(); page.set_default_timeout(60000); errs = []
    page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:200]))
    page.goto(BASE + "#/storm", wait_until="domcontentloaded", timeout=90000)
    step("storms loading")
    sf = wait(page, "1b-storm", "typeof selectHome==='function' && window.STH && STH.lon && isFinite(STH.lon(164153))", 90)
    if sf:
        try:
            try: sf.evaluate("selectHome(164153, true)")
            except Exception: sf.evaluate("sel=164153; document.body.classList.add('sel'); paintRecord(164153)")   # before the map marker exists: the card alone
            sf = wait(page, "1b-storm", "!!document.querySelector('#p-sub .rc-story')", 40)
            page.wait_for_timeout(1500)
            R["storm"] = {"chip": sf.evaluate("(document.querySelector('#p-sub .rc-story')||{}).textContent||''"), "sub": sf.evaluate("document.getElementById('p-sub').textContent"), "errors": errs[:8]}
            page.screenshot(path=str(OUT / "08-storms-card-1440.png"))
        except Exception as e: R["storm"] = {"err": str(e)[:200], "errors": errs[:8]}
    ctx.close()
    b.close()
(OUT / "result.json").write_text(json.dumps(R, indent=1), encoding="utf-8")
print(json.dumps(R, indent=1))
