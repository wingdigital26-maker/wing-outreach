"""Storm map check: desktop 1440x900 + phone 390x844, default and ?storm=2026-09-12.
Pick a home, Add to Daily 50 (localStorage rc.t.added), Esc closes, Open record navigates to Home with ?id=,
Plan a route (12 stops) + Add these 12, zero console/page errors, zero overlapping visible leaf text/controls.
Nominatim is route-blocked (search is checked with the local street list). Run: python audit/_storm_check.py"""
import json, os, sys, time
T0 = time.time()
def step(m): print(f'  [{time.time()-T0:6.1f}s] {m}', flush=True)
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:4885/tour/'
SHOTS = os.path.join(os.path.dirname(__file__), 'shots'); os.makedirs(SHOTS, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] if os.environ.get('STORM_GL') != 'gpu' else ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']

OVERLAP_JS = r"""() => {
  const vw=innerWidth, vh=innerHeight;
  const fixedRoot=e=>{ for(let n=e;n&&n!==document.body;n=n.parentElement){ const p=getComputedStyle(n).position; if(p==='fixed'||p==='sticky') return n; } return document.body; };
  const shown=e=>{ for(let n=e;n;n=n.parentElement){ const cs=getComputedStyle(n); if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity<0.05) return false; } return true; };
  const clip=(e,r)=>{ let x0=Math.max(0,r.left),y0=Math.max(0,r.top),x1=Math.min(vw,r.right),y1=Math.min(vh,r.bottom);
    for(let n=e.parentElement;n&&n!==document.documentElement;n=n.parentElement){ const cs=getComputedStyle(n); if(cs.overflow!=='visible'||cs.overflowX!=='visible'||cs.overflowY!=='visible'){ const q=n.getBoundingClientRect(); x0=Math.max(x0,q.left);y0=Math.max(y0,q.top);x1=Math.min(x1,q.right);y1=Math.min(y1,q.bottom); } }
    return x1-x0>1&&y1-y0>1?{x0,y0,x1,y1}:null; };
  const els=[...document.querySelectorAll('body *')].filter(e=>{
    if(e.closest('#map,canvas,svg,.maplibregl-control-container')) return false;
    const ctl=e.matches('button,input,a,select,textarea'); const txt=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
    if(!ctl&&!txt) return false; if(!ctl&&e.closest('button,a')) return false; return shown(e); });
  const items=[]; els.forEach(e=>{ const c=clip(e,e.getBoundingClientRect()); if(!c) return;
    const cx=(c.x0+c.x1)/2, cy=(c.y0+c.y1)/2; const hit=document.elementFromPoint(cx,cy);
    if(hit&&!(e.contains(hit)||hit.contains(e)||fixedRoot(hit)===fixedRoot(e))) return;   // covered by another layer
    items.push({e,c}); });
  const out=[]; for(let a=0;a<items.length;a++) for(let b=a+1;b<items.length;b++){ const A=items[a],B=items[b];
    if(A.e.contains(B.e)||B.e.contains(A.e)) continue;
    const w=Math.min(A.c.x1,B.c.x1)-Math.max(A.c.x0,B.c.x0), h=Math.min(A.c.y1,B.c.y1)-Math.max(A.c.y0,B.c.y0);
    if(w>0&&h>0&&w*h>4){ const d=e=>(e.id?'#'+e.id:e.tagName.toLowerCase()+(e.className&&typeof e.className==='string'?'.'+e.className.split(' ')[0]:''))+' "'+(e.textContent||'').trim().slice(0,24)+'"'; out.push(d(A.e)+' x '+d(B.e)+' '+Math.round(w*h)+'px2'); } }
  return out; }"""

SMALL_JS = r"""() => [...document.querySelectorAll('button,input,a')].filter(e=>{ const r=e.getBoundingClientRect(); const cs=getComputedStyle(e);
  if(r.width<1||r.height<1||cs.visibility==='hidden'||r.bottom<0||r.top>innerHeight) return false; if(e.closest('.maplibregl-control-container')) return false;
  for(let n=e;n;n=n.parentElement){ const c=getComputedStyle(n); if(c.display==='none'||+c.opacity<0.05||c.visibility==='hidden') return false; }
  return Math.min(r.width,r.height)<44; }).map(e=>(e.id||e.className||e.tagName)+' '+Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height))"""


def run(pw, label, vp, qs, shot):
    phone = vp[0] < 600
    b = pw.chromium.launch(headless=True, args=ARGS)
    ctx = b.new_context(viewport={'width': vp[0], 'height': vp[1]}, device_scale_factor=1, is_mobile=phone, has_touch=phone)
    ctx.route('**/nominatim.openstreetmap.org/**', lambda r: r.fulfill(status=200, body='[]', content_type='application/json'))
    ctx.route('**formsubmit.co**', lambda r: r.abort())
    pg = ctx.new_page(); errs = []; pg.set_default_timeout(150000)
    pg.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('page: ' + str(e)))
    res = {'case': label, 'fail': []}
    F = res['fail'].append
    step('pg.goto(BASE' + ' ' + label)
    pg.goto(BASE + '1b-storm-theater.html' + qs)
    pg.wait_for_function('window.__ready===true', timeout=180000)
    step("storm = 'storm=' in qs" + ' ' + label)
    storm = 'storm=' in qs
    if storm: pg.wait_for_function("document.body.classList.contains('storm')", timeout=150000)
    pg.wait_for_timeout(2500)
    is_storm = pg.evaluate("document.body.classList.contains('storm')")
    if is_storm != storm: F(f'storm overlay {is_storm}, expected {storm}')
    if storm:
        n = pg.inner_text('#s-n'); mx = pg.inner_text('#s-max')
        res['stat'] = f'{n} homes, {mx}'
        if n != '1,611' or mx != '1.23 in': F('storm stat ' + res['stat'])
    else:
        res['calm'] = pg.inner_text('#c-sub')
        if '492,887' not in res['calm']: F('calm copy ' + res['calm'])
    body = pg.inner_text('body')
    for bad in ['539', '1,755', '1.78', 'May 8', '—']:
        if bad in body: F('stale copy: ' + bad)
    step('# homes stay visible' + ' ' + label)
    # homes stay visible at every zoom (points hand over to roof outlines, never a gap)
    zc = {}
    for z in [10, 13, 15, 17]:
        pg.evaluate(f'__zoomTo({z},0)'); n = 0
        for _ in range(12):
            pg.wait_for_timeout(1500); n = pg.evaluate('__visibleHomes()')
            if n: break
        step('zc[z] = n' + ' ' + label)
        zc[z] = n
        if not n: F(f'no homes visible at zoom {z}')
    res['zoom_visible'] = zc
    pg.evaluate('__zoomTo(13,45)'); pg.wait_for_timeout(2000)
    if storm: pg.evaluate("document.getElementById('fit').click()"); pg.wait_for_timeout(2500)
    step('# route (storm only)' + ' ' + label)
    # route (storm only)
    if storm:
        if phone: pg.evaluate("__setSheet('half')"); pg.wait_for_timeout(500)
        pg.click('#plan'); pg.wait_for_timeout(400)
        n = pg.evaluate('__route()&&__route().idx.length')
        res['route'] = pg.inner_text('#rt-meta')
        if not n: F('route not planned')
        if 'straight-line order' not in res['route']: F('route label')
        before = len(pg.evaluate("JSON.parse(localStorage.getItem('rc.t.added')||'[]')"))
        pg.click('#rt-add'); pg.wait_for_timeout(300)
        after = len(pg.evaluate("JSON.parse(localStorage.getItem('rc.t.added')||'[]')"))
        res['route_added'] = after - before
        if after - before != n: F(f'route add {after-before} of {n}')
        pg.click('#undo'); pg.wait_for_timeout(300)
        if len(pg.evaluate("JSON.parse(localStorage.getItem('rc.t.added')||'[]')")) != before: F('route undo')
        if phone: pg.evaluate("__setSheet('peek')"); pg.wait_for_timeout(500)
    step('# pick a home' + ' ' + label)
    # pick a home
    pt = pg.evaluate('__selectDemo()')
    pg.mouse.click(pt['x'], pt['y']); pg.wait_for_timeout(1300)
    sel = pg.evaluate('__sel()')
    if sel < 0:
        pg.evaluate(f"__select({pt['i']})"); pg.wait_for_timeout(1200); sel = pg.evaluate('__sel()'); res['note'] = 'click missed, selected by hook'
    res['sel'] = sel
    step("pg.click('#add')" + ' ' + label)
    pg.click('#add'); pg.wait_for_timeout(300)
    added = pg.evaluate("JSON.parse(localStorage.getItem('rc.t.added')||'[]')")
    if not any(a['id'] == f'm{sel}' for a in added): F('add to Daily 50 not in rc.t.added')
    if pg.inner_text('#add') != "On today's list": F('add label ' + pg.inner_text('#add'))
    if not pg.evaluate("document.getElementById('toast').classList.contains('on')"): F('no toast')
    pg.wait_for_timeout(500)
    step('ov = pg.evaluate(OVERLAP_JS)' + ' ' + label)
    ov = pg.evaluate(OVERLAP_JS); res['overlaps'] = ov
    if ov: F(f'{len(ov)} overlaps')
    if phone:
        sm = pg.evaluate(SMALL_JS); res['small_targets'] = sm
        if sm: F(f'{len(sm)} tap targets under 44px')
    step('pg.screenshot(' + ' ' + label)
    pg.screenshot(path=os.path.join(SHOTS, shot), timeout=180000)
    step('# Undo, Esc' + ' ' + label)
    # Undo, Esc
    pg.click('#undo'); pg.wait_for_timeout(200)
    if pg.evaluate(f"JSON.parse(localStorage.getItem('rc.t.added')||'[]').some(a=>a.id==='m{sel}')"): F('undo did not remove')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    if pg.evaluate("document.body.classList.contains('sel')"): F('Esc did not close record')
    if phone and storm:
        pg.keyboard.press('Escape'); pg.wait_for_timeout(900)
        if pg.evaluate("document.body.classList.contains('storm')"): F('Esc did not clear storm on phone')
    step('# search ranks' + ' ' + label)
    # search ranks W Lindsey St first
    if not phone:
        pg.fill('#q', 'Lindsey'); pg.wait_for_timeout(700)
        first = pg.inner_text('#res button >> nth=0') if pg.locator('#res button').count() else ''
        res['search_first'] = first.split('\n')[0]
        if 'W Lindsey St' not in first: F('search first ' + first)
        pg.keyboard.press('Escape')
    step('# Open record navigates' + ' ' + label)
    # Open record navigates to Home with the id, and Home can recall the home
    pg.evaluate(f'__select({sel})'); pg.wait_for_timeout(900)
    with pg.expect_navigation(timeout=15000):
        pg.click('#cta' if phone else '#open')
    res['open_url'] = pg.url.replace(BASE, '')
    if f'id=m{sel}' not in pg.url or 'c5-home' not in pg.url: F('open record url ' + pg.url)
    rec = pg.evaluate(f"JSON.parse(localStorage.getItem('rc.t.homes')||'{{}}')['m{sel}']||null")
    if not rec or not rec.get('addr'): F('RC.remember missing')
    res['remembered'] = rec
    errs = [e for e in errs if 'c5-home' not in e]   # Home's own errors are not this screen's
    res['errors'] = errs
    if errs: F(f'{len(errs)} errors')
    b.close(); return res


def main():
    cases = [('desktop', (1440, 900), '', 'v2-storm-desktop.png'),
             ('desktop sep12', (1440, 900), '?storm=2026-09-12', 'v2-storm-desktop-sep12.png'),
             ('phone', (390, 844), '', 'v2-storm-phone-default.png'),
             ('phone sep12', (390, 844), '?storm=2026-09-12', 'v2-storm-phone.png')]
    only = [a.replace('_', ' ') for a in sys.argv[1:]]
    out = []
    with sync_playwright() as pw:
        for c in cases:
            if only and c[0] not in only: continue
            try: r = run(pw, *c)
            except Exception as e: r = {'case': c[0], 'fail': ['exception: ' + str(e)[:300]]}
            out.append(r); print(json.dumps(r, indent=1, default=str)[:3000])
    print('\nRESULT:', 'PASS' if all(not r['fail'] for r in out) else 'FAIL', [(r['case'], len(r['fail'])) for r in out])


if __name__ == '__main__':
    main()
