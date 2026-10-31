# Shell check for the Roof Command tour (v2 shell): routes, Back, postMessage go, Nimbus input, keys, errors,
# overlaps, tab-switch timing before (:4880 original) and after (:4885 v2), screenshots.
import sys, os, time; sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright
BASE = "http://localhost:4885/tour/"; OLD = "http://localhost:4880/"
SH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots"); os.makedirs(SH, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
OVERLAP = """(sel)=>{const roots=[...document.querySelectorAll(sel)];const els=[];
 for(const r of roots){ r.querySelectorAll('*').forEach(e=>{ if(e.children.length===0 && (e.textContent.trim()||['INPUT','BUTTON'].includes(e.tagName))){ const cs=getComputedStyle(e); if(cs.visibility!=='hidden'&&cs.display!=='none'&&+cs.opacity>0){const b=e.getBoundingClientRect(); if(b.width>0&&b.height>0) els.push({e,b});} } }); }
 const bad=[]; for(let i=0;i<els.length;i++) for(let j=i+1;j<els.length;j++){ const a=els[i],c=els[j]; if(a.e.contains(c.e)||c.e.contains(a.e)) continue;
   const w=Math.min(a.b.right,c.b.right)-Math.max(a.b.left,c.b.left), h=Math.min(a.b.bottom,c.b.bottom)-Math.max(a.b.top,c.b.top);
   if(w>0&&h>0&&w*h>4) bad.push([a.e.tagName+':'+a.e.textContent.trim().slice(0,30), c.e.tagName+':'+c.e.textContent.trim().slice(0,30), Math.round(w*h)]); }
 return bad; }"""
ACTIVE = "()=>{const f=document.querySelector('.frame.on')||document.querySelector('.frame'); try{return f.contentWindow.location.href}catch(e){return f.src}}"
fails = []
def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond: fails.append(msg)
def shot(pg, name):
    try: pg.screenshot(path=os.path.join(SH, name), timeout=90000)
    except Exception as e: print("   (screenshot skipped:", name, str(e).splitlines()[0][:80], ")")
def src(pg): return pg.evaluate(ACTIVE)
def wait_src(pg, needle, ms=60000):
    try: pg.wait_for_function("(n)=>{const f=document.querySelector('.frame.on'); try{return f&&f.contentWindow.location.href.includes(n)}catch(e){return false}}", arg=needle, timeout=ms); return True
    except Exception: return False
def h(pg): return pg.evaluate("location.hash")
def wait_text(pg, sel, needle, ms=6000):
    t = time.time()
    while time.time() - t < ms / 1000:
        if needle in pg.evaluate(f"document.querySelector('{sel}').innerText"): return True
        pg.wait_for_timeout(150)
    return False
def switch_ms(pg, name, old=False):
    """time from clicking a tab to the screen being shown and loaded"""
    t0 = time.time()
    pg.get_by_role("button", name=name, exact=True).click()
    if old:
        pg.wait_for_function("()=>{const f=document.getElementById('f'); try{return f.contentDocument&&f.contentDocument.readyState==='complete'&&f.contentWindow.location.href!=='about:blank'}catch(e){return false}}", timeout=60000)
    else:
        pg.wait_for_function("()=>{const f=document.querySelector('.frame.on'); try{return f&&f.contentDocument&&f.contentDocument.readyState==='complete'&&f.contentWindow.location.href!=='about:blank'}catch(e){return false}}", timeout=60000)
    return round((time.time() - t0) * 1000)
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS, headless=True)
    for vp, tag in [({"width": 1440, "height": 900}, "desktop"), ({"width": 390, "height": 844}, "phone")]:
        ctx = b.new_context(viewport=vp, device_scale_factor=1, is_mobile=vp["width"] < 600, has_touch=vp["width"] < 600)
        pg = ctx.new_page(); pg.set_default_navigation_timeout(120000); pg.set_default_timeout(90000); errs = []; ferrs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        def onconsole(m):
            if m.type != "error": return
            url = (m.location or {}).get("url", "") or ""
            shell = any(k in url for k in ("product.html", "nimbus-shell", "rc-state", "wing-mascot")) or url == ""
            (errs if shell else ferrs).append(m.text[:160] + " @ " + url[-60:])
        pg.on("console", onconsole)
        # 1. opening plays once, hands off to daily
        pg.goto(BASE + "product.html", wait_until="domcontentloaded", timeout=120000); pg.wait_for_timeout(700)
        check(h(pg) == "#/opening", f"{tag} first load opens the opening")
        pg.wait_for_timeout(2600)
        shot(pg, f"v2-opening-{tag}.png")
        pg.wait_for_timeout(6000)
        check(h(pg) == "#/daily", f"{tag} opening hands off to #/daily (got {h(pg)})")
        bub = pg.evaluate("()=>{const b=document.querySelector('.nb-bubble');return {on:b.classList.contains('on'),t:b.innerText}}")
        check(' called' in bub['t'] and 'Sep 12' in bub['t'], f"{tag} morning brief bubble: {bub['t'][:80]!r}")
        shot(pg, f"v2-shell-{tag}.png")
        ov = pg.evaluate(OVERLAP, "header, .nb-bubble")
        check(ov == [], f"{tag} no overlaps in header/bubble: {ov[:4]}")
        # 2. reload: no opening second time
        pg.goto(BASE + "product.html", wait_until="domcontentloaded"); pg.wait_for_timeout(600)
        check(h(pg) == "#/daily", f"{tag} second load skips the opening")
        # 3. tabs + Back, with timing (first visit = cold, second visit = kept-alive frame)
        cold = switch_ms(pg, "Storm map"); check(h(pg) == "#/storm", f"{tag} Storm tab -> #/storm (cold {cold} ms)")
        pg.get_by_role("button", name="Ask Nimbus", exact=True).click(); pg.wait_for_timeout(600)
        check(h(pg) == "#/ask", f"{tag} Ask tab -> #/ask")
        warm = switch_ms(pg, "Storm map"); inpage = pg.evaluate("window.__switch.last"); print(f"   {tag} v2 tab switch: cold {cold} ms, warm (kept-alive) {warm} ms by Playwright, {inpage} ms measured in-page")
        check(warm < cold, f"{tag} warm (kept-alive) tab switch faster than cold ({warm} vs {cold} ms; swiftshader, machine shared with other agents' runs)")
        nframes = pg.evaluate("document.querySelectorAll('.frame').length")
        check(nframes >= 3, f"{tag} frames kept alive: {nframes}")
        pg.get_by_role("button", name="Ask Nimbus", exact=True).click(); pg.wait_for_timeout(600)
        pg.go_back(wait_until="commit"); pg.wait_for_timeout(600)
        check(h(pg) == "#/storm" and "1b-storm-theater.html" in src(pg), f"{tag} Back returns to #/storm")
        for _ in range(3): pg.go_back(wait_until="commit"); pg.wait_for_timeout(500)
        check(h(pg) == "#/daily" and "product.html" in pg.url, f"{tag} Back x4 (daily, storm, ask, storm, ask) returns to #/daily, still in the app ({h(pg)})")
        pg.go_forward(wait_until="commit"); pg.wait_for_timeout(600)
        check(h(pg) == "#/storm", f"{tag} Forward returns to #/storm")
        # 4. ?tab= deep link + param routes
        pg.goto(BASE + "product.html?tab=storm", wait_until="domcontentloaded"); pg.wait_for_timeout(500)
        check(h(pg) == "#/storm", f"{tag} ?tab=storm still works")
        pg.goto(BASE + "product.html#/storm/2026-09-12", wait_until="domcontentloaded")
        check(wait_src(pg, "1b-storm-theater.html?storm=2026-09-12"), f"{tag} #/storm/<iso> passes ?storm= ({src(pg)[-40:]})")
        pg.goto(BASE + "product.html#/daily/3", wait_until="domcontentloaded")
        check(wait_src(pg, "deck.html?n=3"), f"{tag} #/daily/3 passes ?n=3")
        # 5. postMessage go from a frame opens Home
        pg.evaluate("()=>document.querySelector('.frame.on').contentWindow.parent.postMessage({type:'go',screen:'home',params:{id:'h-2417'}},location.origin)")
        pg.wait_for_timeout(300)
        check(wait_src(pg, "c5-home/index.html?home=h-2417") and h(pg) == "#/home/h-2417", f"{tag} postMessage go -> Home ({h(pg)}, {src(pg)[-34:]})")
        pg.go_back(wait_until="commit"); pg.wait_for_timeout(500)
        check(h(pg) == "#/daily/3", f"{tag} Back from Home returns to daily")
        # 6. keyboard
        pg.locator("body").click(position={"x": 5, "y": 5}); pg.keyboard.press("5"); pg.wait_for_timeout(400)
        check(h(pg) == "#/ask", f"{tag} key 5 -> Ask ({h(pg)})")
        pg.keyboard.press("3"); pg.wait_for_timeout(400)
        check(h(pg) == "#/daily", f"{tag} key 3 -> Daily 50")
        pg.keyboard.press("Control+k"); pg.wait_for_timeout(400)
        focused = pg.evaluate("()=>document.activeElement&&document.activeElement.id")
        chat_open = pg.evaluate("document.querySelector('.wmp').classList.contains('open')")
        check(focused == "findIn" or chat_open, f"{tag} Ctrl K opens search (focus={focused}, chat={chat_open})")
        pg.keyboard.press("Escape"); pg.locator("body").click(position={"x": 5, "y": 5}); pg.wait_for_timeout(300)
        # 7. Nimbus input
        pg.evaluate("()=>{ if(document.querySelector('.wmp').classList.contains('open')) Nimbus.chat.toggle(false); }"); pg.wait_for_timeout(500)
        pg.locator(".nb-dock").click(timeout=90000); pg.wait_for_timeout(600)
        inp = pg.locator(".wmp-ask input"); inp.wait_for(state="visible", timeout=20000); check(inp.is_visible(), f"{tag} chat has a real input")
        inp.fill("how many homes did sep 12 hit"); inp.press("Enter")
        ok = wait_text(pg, ".wmp-body", "1.23")
        body = pg.evaluate("document.querySelector('.wmp-body').innerText")
        check(ok and "1,611" in body, f"{tag} answer: {body[:90]!r}")
        ov = pg.evaluate(OVERLAP, "header, .wmp")
        check(ov == [], f"{tag} no overlaps in header/chat: {ov[:4]}")
        shot(pg, f"v2-nimbus-chat-{tag}.png")
        inp.fill("open the storm map"); inp.press("Enter"); pg.wait_for_timeout(1600)
        check(h(pg) == "#/storm", f"{tag} 'open the storm map' navigates")
        inp.fill("what is the moon made of"); inp.press("Enter")
        check(wait_text(pg, ".wmp-body", "do not have that one"), f"{tag} honest fallback")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        # 8. dev toggle hidden on phone
        vis = pg.evaluate("getComputedStyle(document.querySelector('.dev')).display")
        check((vis == "none") == (tag == "phone"), f"{tag} Desktop/Phone toggle display={vis}")
        # 9. nointro in a fresh session
        ctx2 = b.new_context(viewport=vp); pg2 = ctx2.new_page(); pg2.set_default_navigation_timeout(120000); pg2.goto(BASE + "product.html?nointro=1", wait_until="domcontentloaded"); pg2.wait_for_timeout(500)
        check(h(pg2) == "#/daily", f"{tag} ?nointro=1 skips the opening"); ctx2.close()
        # 10. Opening tab replays About
        pg.get_by_role("button", name="Opening", exact=True).click()
        check(wait_src(pg, "about=1") and h(pg) == "#/opening/about", f"{tag} Opening tab replays the long About")
        # 11. Ask page composer (direct)
        pg.goto(BASE + "c2-nimbus/index.html", wait_until="commit", timeout=120000); pg.locator("#ask").wait_for(state="visible", timeout=120000); pg.wait_for_function("()=>!!document.getElementById('composer').dataset.live", timeout=120000)
        a = pg.locator("#ask"); a.fill("how many homes did sep 12 hit"); a.press("Enter"); pg.wait_for_timeout(800)
        ans = pg.evaluate("document.getElementById('answer').innerText")
        check("1,611" in ans, f"{tag} Ask page composer answers: {ans[:80]!r}")
        chips = pg.evaluate("[...document.querySelectorAll('.chip')].map(c=>c.innerText)")
        check(not any('Aug 21' in c or 'picked up' in c for c in chips), f"{tag} dead chips gone: {chips}")
        check(errs == [], f"{tag} shell console/page errors: {errs[:3]}")
        print(f"   {tag} frame errors (other agents' pages, not fixed here): {len(ferrs)}", ferrs[:3])
        ctx.close()
    # before: the untouched original at :4880 (every tab switch reloads the iframe)
    try:
        ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); pg.set_default_navigation_timeout(120000)
        pg.goto(OLD + "product.html?tab=daily", wait_until="domcontentloaded", timeout=120000); pg.wait_for_timeout(1500)
        o1 = switch_ms(pg, "Storm map", old=True); pg.get_by_role("button", name="Ask Nimbus", exact=True).click(); pg.wait_for_timeout(1500)
        o2 = switch_ms(pg, "Storm map", old=True)
        print(f"   BEFORE (:4880) tab switch to Storm map: first {o1} ms, second {o2} ms (reloads every time)")
        ctx.close()
    except Exception as e: print("   before-timing skipped:", str(e).splitlines()[0][:100])
    # the header at the wide laptop size
    ctx = b.new_context(viewport={"width": 1861, "height": 867}); pg = ctx.new_page(); pg.set_default_navigation_timeout(120000)
    pg.goto(BASE + "product.html?nointro=1", wait_until="domcontentloaded"); pg.wait_for_timeout(2500)
    ov = pg.evaluate(OVERLAP, "header"); check(ov == [], f"1861 header overlaps: {ov[:4]}")
    shot(pg, "v2-shell-1861.png"); ctx.close()
    # the long About shot, desktop, mid-beat
    ctx = b.new_context(viewport={"width": 1440, "height": 900}); pg = ctx.new_page(); pg.set_default_navigation_timeout(120000)
    pg.goto(BASE + "product.html?tab=opening", wait_until="domcontentloaded"); pg.wait_for_timeout(8200)
    shot(pg, "v2-opening.png"); ctx.close()
    b.close()
print("\nRESULT:", "ALL PASS" if not fails else f"{len(fails)} FAIL")
