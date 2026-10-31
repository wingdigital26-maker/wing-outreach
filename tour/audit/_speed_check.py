"""Service-worker check for the tour shell: every screen at 1440x900 and 390x844 with the worker active (zero console/page
errors), main-thread long tasks on the Storm map while homes load, a hard reload (CDP ignoreCache) still works, (version bump is checked separately, see SPEED.md). Run: python audit/_speed_check.py"""
import json, re, time
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:4885/tour/product.html?nointro=1'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
ROUTES = ['#/daily', '#/storm', '#/home/dreddirt-3', '#/ask', '#/opening/about']
LT = r"""(()=>{ if(window.top===window) return; window.__lt=[]; try{ new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__lt.push(Math.round(e.duration)))).observe({type:'longtask',buffered:true}); }catch(e){} })();"""
out = {'errors': [], 'checks': {}}

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=ARGS)
    ctx = b.new_context(viewport={'width': 1440, 'height': 900})
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: out['errors'].append(f'pageerror {e}'))
    pg.on('console', lambda m: m.type == 'error' and out['errors'].append(f'console {m.text[:200]}'))
    pg.goto(BASE + '#/storm', wait_until='commit', timeout=90000)
    pg.evaluate("Promise.race([navigator.serviceWorker.ready,new Promise(r=>setTimeout(r,120000))])")
    pg.wait_for_function("!!navigator.serviceWorker.controller", timeout=120000)
    pg.wait_for_timeout(4000)
    out['checks']['caches_first_visit'] = pg.evaluate("caches.keys().then(ks=>Promise.all(ks.map(k=>caches.open(k).then(c=>c.keys()).then(x=>k+':'+x.length))))")
    # long tasks on the Storm map (homes decode + first draw), second load so it is the warm path
    for vp in [(1440, 900), (390, 844)]:
        pg.set_viewport_size({'width': vp[0], 'height': vp[1]})
        for r in ROUTES:
            pg.goto(BASE + '&mode=' + ('phone' if vp[0] < 600 else 'desk') + r, wait_until='commit', timeout=90000)
            scr = r.split('/')[1]
            ok = False; t0 = time.time()
            while time.time() - t0 < 60 and not ok:
                time.sleep(0.5)
                try: ok = pg.evaluate("s=>{const f=document.querySelector('iframe[data-screen='+s+']'); return !!(f&&f.classList.contains('on')&&f.contentDocument&&f.contentDocument.readyState==='complete'&&f.contentDocument.URL!=='about:blank')}", scr)
                except Exception: pass
            pg.wait_for_timeout(3000)
            sw_ctl = pg.evaluate("s=>{const f=document.querySelector('iframe[data-screen='+s+']'); return !!navigator.serviceWorker.controller&&!!f.contentWindow.navigator.serviceWorker.controller}", scr)
            lt = pg.evaluate("s=>new Promise(res=>{ const w=document.querySelector('iframe[data-screen='+s+']').contentWindow; const a=[]; try{ new w.PerformanceObserver(l=>l.getEntries().forEach(e=>a.push(Math.round(e.duration)))).observe({type:'longtask',buffered:true}); }catch(e){} setTimeout(()=>res(a),300); })", scr) if ok else None
            fr = ok
            out['checks'][f'{vp[0]} {r}'] = {'loaded': bool(fr), 'controlled': sw_ctl, 'longtasks_over_100ms': [x for x in (lt or []) if x > 100]}
            print(vp, r, out['checks'][f'{vp[0]} {r}'], flush=True)
    pg.set_viewport_size({'width': 1440, 'height': 900})
    # hard reload: bypasses the worker, page must still come up
    pg.goto(BASE + '#/daily', wait_until='commit', timeout=90000); pg.wait_for_timeout(3000)
    cdp = ctx.new_cdp_session(pg)
    cdp.send('Page.reload', {'ignoreCache': True})   # (Playwright routing is only switched on after this, for the bump)
    pg.wait_for_timeout(10000)
    pg.wait_for_function("document.querySelector('iframe[data-screen=daily]')&&document.querySelector('iframe[data-screen=daily]').contentDocument&&document.querySelector('iframe[data-screen=daily]').contentDocument.readyState==='complete'", timeout=40000)
    out['checks']['hard_reload'] = {'controller_after': pg.evaluate("!!navigator.serviceWorker.controller"),
                                    'daily_text': pg.evaluate("(document.querySelector('iframe[data-screen=daily]').contentDocument.body||{innerText:''}).innerText.length")}
    # version bump: checked separately by registering a copy of sw.js with CACHE_VERSION rc-tour-v2 (old caches deleted on activate); see SPEED.md
    b.close()

print(json.dumps(out, indent=1))
json.dump(out, open('audit/speed-check.json', 'w'), indent=1)
