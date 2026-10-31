"""Load-speed probe for the Roof Command tour shell.
For #/daily, #/storm, #/home/dreddirt-3: cold (fresh context) and repeat (same context, second navigation),
median of N runs. Times are ms from shell navigation start:
  shell   = shell first contentful paint
  paint   = the active screen frame's first contentful paint
  ready   = screen interactive (storm: homes decoded + map loaded; daily: map loaded; home: three scene __ready)
Bytes = transfer size of every response (shell + frames), requests = count. ?noprefetch=1 so each screen is measured alone.
Run: python audit/_speed.py [label] [runs]"""
import json, statistics, sys, time
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:4885/tour/product.html?nointro=1&noprefetch=1'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
LABEL = sys.argv[1] if len(sys.argv) > 1 else 'run'
WAIT_SW = LABEL != 'before'
RUNS = int(sys.argv[2]) if len(sys.argv) > 2 else 3
SCREENS = {
    'daily': ('#/daily', 'c4-command-deck/deck.html', "document.readyState==='complete'&&typeof map!=='undefined'&&map&&map.loaded&&map.loaded()"),
    'storm': ('#/storm', '1b-storm-theater.html', "document.readyState==='complete'&&window.STH&&STH.n>0&&typeof map!=='undefined'&&map.loaded&&map.loaded()"),
    'home': ('#/home/dreddirt-3', 'c5-home/index.html', "document.readyState==='complete'&&window.__ready===true"),
}
INIT = r"""(()=>{ if(!window.top||window.top===window&&!/product\.html/.test(location.pathname)) return;
  const key=window.top===window?'shell':location.pathname.split('/tour/')[1];
  const rec=(k,v)=>{ try{ const t=window.top; t.__spd=t.__spd||{}; t.__spd[key]=t.__spd[key]||{}; if(t.__spd[key][k]==null) t.__spd[key][k]=v-t.performance.timeOrigin; }catch(e){} };
  try{ new PerformanceObserver(l=>l.getEntries().forEach(e=>{ if(e.name==='first-contentful-paint') rec('paint',performance.timeOrigin+e.startTime); })).observe({type:'paint',buffered:true}); }catch(e){}
  const R=window.__READY_JS||{}; const fn=Object.keys(R).find(k=>location.pathname.endsWith(k));
  if(fn){ const id=setInterval(()=>{ try{ if((0,eval)(R[fn])){ rec('ready',performance.timeOrigin+performance.now()); clearInterval(id); } }catch(e){} },50); }
})();"""


def one(ctx, screen, errors, wait_sw=False):
    hashp, page_name, ready_js = SCREENS[screen]
    page = ctx.new_page()
    page.set_viewport_size({'width': 1440, 'height': 900})
    stats = {'bytes': 0, 'reqs': 0, 'sw': 0, 'third': 0}

    def on_fin(req):
        try:
            s = req.sizes()
            stats['bytes'] += s.get('responseBodySize', 0) + s.get('responseHeadersSize', 0)
        except Exception:
            pass
        stats['reqs'] += 1
        if 'localhost' not in req.url: stats['third'] += 1
        try:
            r = req.response()
            if r and r.from_service_worker: stats['sw'] += 1
        except Exception:
            pass
    page.on('requestfinished', on_fin)
    page.on('pageerror', lambda e: errors.append(f'{screen}: pageerror {e}'))
    page.on('console', lambda m: m.type == 'error' and errors.append(f'{screen}: console {m.text[:160]}'))
    page.goto(BASE + hashp, wait_until='commit')
    t_end = time.time() + 60
    out = {'shell': None, 'paint': None, 'ready': None}
    while time.time() < t_end:
        try:
            d = page.evaluate('window.__spd||{}')
            out['shell'] = (d.get('shell') or {}).get('paint')
            fr = d.get(page_name) or {}
            out['paint'] = fr.get('paint'); out['ready'] = fr.get('ready')
        except Exception:
            pass
        if all(v is not None for v in out.values()): break
        time.sleep(0.1)
    page.wait_for_timeout(1500)   # let trailing requests (tiles) finish so bytes are counted
    if wait_sw:
        try: page.evaluate("Promise.race([navigator.serviceWorker.ready.then(()=>new Promise(r=>setTimeout(r,8000))),new Promise(r=>setTimeout(r,30000))])")
        except Exception: pass
    page.close()
    return {**{k: round(v) if v is not None else None for k, v in out.items()}, **stats}


def med(rows, k):
    vals = [r[k] for r in rows if r[k] is not None]
    return round(statistics.median(vals)) if vals else None


def main():
    res = {}; errors = []
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, args=ARGS)
        ready_map = json.dumps({v[1]: v[2] for v in SCREENS.values()})
        for screen in SCREENS:
            cold, warm = [], []
            for i in range(RUNS):
                ctx = b.new_context()
                ctx.add_init_script('window.__READY_JS=' + ready_map + ';' + INIT)
                cold.append(one(ctx, screen, errors, wait_sw=WAIT_SW))
                warm.append(one(ctx, screen, errors))
                ctx.close()
                print(screen, i, cold[-1], warm[-1], flush=True)
            res[screen] = {'cold': {k: med(cold, k) for k in cold[0]}, 'repeat': {k: med(warm, k) for k in warm[0]}}
        b.close()
    print(json.dumps(res, indent=1))
    print('errors:', len(errors)); [print(' ', e) for e in errors[:20]]
    with open(f'audit/speed-{LABEL}.json', 'w') as f: json.dump({'res': res, 'errors': errors}, f, indent=1)


main()
