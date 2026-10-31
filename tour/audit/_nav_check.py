"""Round 0 nav check for the tour shell: frames keep the URL in sync without reloads, one pipeline on every screen.
Run: python tour/audit/_nav_check.py   (server on :4885 must already be running). Also re-shoots desktop storm/daily/home."""
import sys, os, re, pathlib; sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright
BASE = "http://localhost:4885/tour/"
SH = pathlib.Path(__file__).parent / "shots"; SH.mkdir(exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
fails = []
def check(c, m):
    print(("ok   " if c else "FAIL ") + m)
    if not c: fails.append(m)
FR = "(s)=>{const f=[...document.querySelectorAll('.frame')].find(f=>f.dataset.screen===s); return f&&f.contentWindow}"
def fw(pg, s, js):
    return pg.evaluate("([s,js])=>{const f=[...document.querySelectorAll('.frame')].find(f=>f.dataset.screen===s); if(!f) return null; try{ return f.contentWindow.eval(js) }catch(e){ return 'ERR '+e.message } }", [s, js])
def wait_frame(pg, s, js, ms=90000):
    pg.wait_for_function("([s,js])=>{const f=[...document.querySelectorAll('.frame')].find(f=>f.dataset.screen===s); if(!f) return false; try{ return !!f.contentWindow.eval(js) }catch(e){ return false } }", arg=[s, js], timeout=ms)
def h(pg): return pg.evaluate("location.hash")
def shot(pg, name):
    try: pg.screenshot(path=str(SH / name), timeout=300000)
    except Exception as e: print('   (screenshot skipped:', name, str(e).splitlines()[0][:60], ')')

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS, headless=True)
    for vp, tag in [({"width": 1440, "height": 900}, "desktop"), ({"width": 390, "height": 844}, "phone")]:
        ctx = b.new_context(viewport=vp, device_scale_factor=1, is_mobile=tag == "phone", has_touch=tag == "phone", timezone_id="America/Chicago")
        ctx.route("**/formsubmit.co/**", lambda r: r.abort())
        pg = ctx.new_page(); pg.set_default_timeout(120000); pg.set_default_navigation_timeout(120000)
        pg.clock.install(time="2026-10-05T10:00:00-05:00")
        errs = []
        pg.on("pageerror", lambda e: errs.append("page: " + str(e)[:160]))
        pg.on("console", lambda m: errs.append(m.text[:160] + " @ " + ((m.location or {}).get("url", "") or "")[-50:]) if m.type == "error" else None)
        pg.goto(BASE + "product.html?nointro=1", wait_until="domcontentloaded")
        pg.evaluate("() => { Object.keys(localStorage).filter(k=>k.startsWith('rc.t.')).forEach(k=>localStorage.removeItem(k)); }")
        pg.goto(BASE + "product.html?nointro=1#/daily", wait_until="domcontentloaded")
        wait_frame(pg, "daily", "typeof HOMES!=='undefined' && HOMES.length>0 && !!document.querySelector('.card[data-d=\"0\"]')")
        pg.wait_for_timeout(800)
        fw(pg, "daily", "window.__mark='alive'")
        # 1. the Daily 50 moves a stop on its own: the shell hash follows, no reload
        fw(pg, "daily", "go(2,true)"); pg.wait_for_timeout(400)
        check(h(pg) == "#/daily/3", f"{tag} stop 3 -> hash #/daily/3 ({h(pg)})")
        fw(pg, "daily", "go(3,true)"); pg.wait_for_timeout(400)
        check(h(pg) == "#/daily/4" and fw(pg, "daily", "window.__mark") == "alive", f"{tag} stop 4 -> #/daily/4, frame not reloaded")
        hist0 = pg.evaluate("history.length")
        # counts agree: ring total = queue = footer
        tot = fw(pg, "daily", "TOTAL"); ring = fw(pg, "daily", "document.getElementById('pRingTxt').textContent")
        foot = fw(pg, "daily", "document.getElementById('pline').textContent")
        check(str(tot) in ring and f"these {tot} homes" in foot, f"{tag} Daily 50 counts agree: ring '{ring}', footer '{foot[:48]}'")
        # 2. Open home for stop 4, then stop 5 from the deck: Home frame survives
        pg.evaluate("()=>document.querySelector('.frame.on').contentWindow.parent.postMessage({type:'go',screen:'home',params:{id:'dreddirt-4'}},location.origin)")
        wait_frame(pg, "home", "window.HOME && HOME.rawId==='dreddirt-4' && document.querySelector('#addr') && document.querySelector('#addr').textContent.length>3")
        pg.wait_for_timeout(600)
        fw(pg, "home", "window.__mark='alive'")
        addr4 = fw(pg, "home", "document.querySelector('#addr').textContent")
        check(h(pg) == "#/home/dreddirt-4", f"{tag} Open home -> #/home/dreddirt-4 ({addr4[:30]})")
        pg.go_back(wait_until="commit"); pg.wait_for_timeout(500)
        check(h(pg) == "#/daily/4", f"{tag} Back from Home returns to #/daily/4 ({h(pg)})")
        fw(pg, "daily", "go(4,true)"); pg.wait_for_timeout(300)
        pg.evaluate("()=>document.querySelector('.frame.on').contentWindow.parent.postMessage({type:'go',screen:'home',params:{id:'dreddirt-5'}},location.origin)")
        wait_frame(pg, "home", "window.HOME && HOME.rawId==='dreddirt-5'")
        pg.wait_for_timeout(500)
        addr5 = fw(pg, "home", "document.querySelector('#addr').textContent")
        check(fw(pg, "home", "window.__mark") == "alive" and addr5 != addr4, f"{tag} Home switched to stop 5 in place, no reload ({addr5[:30]})")
        # Home's own Next stop button: hash follows, frame alive, no extra history entries from the frame
        hb = pg.evaluate("history.length")
        fw(pg, "home", "document.querySelector('[data-go=\"next\"]').click()"); pg.wait_for_timeout(500)
        check(h(pg) == "#/home/dreddirt-6" and fw(pg, "home", "window.__mark") == "alive" and pg.evaluate("history.length") == hb, f"{tag} Home Next stop -> #/home/dreddirt-6 by replaceState, frame alive ({h(pg)}, history {hb}->{pg.evaluate('history.length')})")
        # 4. opt-in state agrees between deck and Home (stop 2 is opted in, stop 1 is not; sample)
        o2 = fw(pg, "daily", "HOMES[1].optin"); r2 = pg.evaluate("JSON.parse(localStorage.getItem('rc.t.homes'))['dreddirt-2']")
        check(o2 is True and r2.get("optIn") is True and r2.get("pastCustomer") is False, f"{tag} RC.remember carries optIn/pastCustomer ({r2.get('optIn')}, {r2.get('pastCustomer')})")
        pg.evaluate("()=>document.querySelector('.frame.on').contentWindow.parent.postMessage({type:'go',screen:'home',params:{id:'dreddirt-2'}},location.origin)")
        wait_frame(pg, "home", "window.HOME && HOME.rawId==='dreddirt-2'"); pg.wait_for_timeout(400)
        kv = fw(pg, "home", "document.getElementById('kv').textContent")
        check("Opted in" in kv, f"{tag} Home shows 'Opted in' for stop 2")
        # Home: honest stage and empty states with a clean pipeline (default house too)
        pg.evaluate("()=>document.querySelector('.frame.on').contentWindow.parent.postMessage({type:'go',screen:'home',params:{}},location.origin)")
        wait_frame(pg, "home", "window.HOME && HOME.rawId===''"); pg.wait_for_timeout(500)
        body = fw(pg, "home", "document.body.innerText")
        check("voicemail" not in body and "Two trucks" not in body and "Oct 8" not in body, f"{tag} default Home has no invented history")
        check(fw(pg, "home", "RC.stage(HOME.id)") == "new", f"{tag} default Home stage = RC.stage = new")
        # 3. storm: timeline pick -> hash, pipeline strip from RC
        pg.evaluate("()=>document.querySelector('.frame.on').contentWindow.parent.postMessage({type:'go',screen:'storm',params:{}},location.origin)")
        wait_frame(pg, "storm", "typeof ST!=='undefined' && ST.storms && ST.storms.length>0 && typeof map!=='undefined' && map.loaded && map.loaded()", 150000)
        pg.wait_for_timeout(1500)
        fw(pg, "storm", "window.__mark='alive'")
        ph = fw(pg, "storm", "document.getElementById('ph').textContent"); pipe = fw(pg, "storm", "[...document.querySelectorAll('#pipe .stage b')].map(b=>b.textContent)")
        check(ph.startswith("Your pipeline") and all(x == "0" for x in pipe[1:]), f"{tag} storm strip '{ph}': {pipe}")
        fw(pg, "storm", "selectStorm(ST.storms.length-1,true)"); pg.wait_for_timeout(1500)
        check(h(pg) == "#/storm/2026-09-12" and fw(pg, "storm", "window.__mark") == "alive", f"{tag} storm pick -> #/storm/2026-09-12 without reload ({h(pg)})")
        pipe = fw(pg, "storm", "[...document.querySelectorAll('#pipe .stage b')].map(b=>b.textContent)")
        check(pipe[0] == "1,611" and all(x == "0" for x in pipe[1:]), f"{tag} Sep 12 strip from RC: {pipe}")
        if tag == "desktop" and os.environ.get("SHOTS"):
            pg.wait_for_timeout(1200); shot(pg, "r0-storm-1440.png")
            pg.evaluate("()=>document.querySelector('.frame.on').contentWindow.parent.postMessage({type:'go',screen:'daily',params:{n:1}},location.origin)"); pg.wait_for_timeout(1500)
            shot(pg, "r0-daily-1440.png")
            pg.evaluate("()=>document.querySelector('.frame.on').contentWindow.parent.postMessage({type:'go',screen:'home',params:{}},location.origin)"); pg.wait_for_timeout(2500)
            shot(pg, "r0-home-1440.png")
        # 3b. RC.go outside the shell writes ?home= (fresh page: the shell page is heavy after three screens)
        pg.close(); pg = ctx.new_page(); pg.set_default_timeout(120000); pg.set_default_navigation_timeout(120000); pg.clock.install(time="2026-10-05T10:00:00-05:00")
        pg.on("pageerror", lambda e: errs.append("page: " + str(e)[:160]))
        for k in range(3):
            try: pg.goto(BASE + "c4-command-deck/deck.html", wait_until="domcontentloaded"); break
            except Exception as ex: print("   retry goto", str(ex).splitlines()[0][:60]); pg.wait_for_timeout(1500)
        pg.wait_for_function("()=>typeof HOMES!=='undefined'&&HOMES.length>0"); pg.wait_for_timeout(300)
        pg.evaluate("RC.go('home',{id:'dreddirt-3'})"); pg.wait_for_url(re.compile(r"c5-home/index\.html\?home=dreddirt-3"), timeout=60000)
        check("?home=dreddirt-3" in pg.url, f"{tag} RC.go('home') outside the shell -> {pg.url[-40:]}")
        pg.wait_for_function("()=>window.HOME&&HOME.rawId==='dreddirt-3'");
        check(pg.evaluate("document.querySelector('#addr').textContent").strip() != "", f"{tag} Home read ?home=")
        pg.goto(BASE + "c5-home/index.html?id=dreddirt-2", wait_until="domcontentloaded"); pg.wait_for_function("()=>window.HOME&&HOME.rawId==='dreddirt-2'")
        check(True, f"{tag} Home reads ?id= too")
        bad = [e for e in errs if "favicon" not in e and "unpkg" not in e.lower() and "net::ERR" not in e]
        check(bad == [], f"{tag} console/page errors: {bad[:4]}")
        ctx.close()
    b.close()
print("\nRESULT:", "ALL PASS" if not fails else f"{len(fails)} FAIL")
