"""Before/after shots and Storms frame time for the UI cleanup round (Jack's voice notes, 10-26).

python tour/audit/cleanup/shoot_cleanup.py before|after [only=house,storms,results,inbox,find] [perf]
'before' serves the files this round changed from git HEAD (request interception), so both runs use the same server.
One browser, one page at a time (the laptop is low on RAM). Writes tour/audit/cleanup/<phase>/*.png and perf.json.
"""
import json, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
BASE = 'http://127.0.0.1:4930/tour/'
APP = BASE + 'product.html?dev=1&nointro=1&noprefetch=1&cloud=0'
HOME = 'm5704'
PAGES = {
    'house': '#/crm/home/' + HOME,
    'storms': '#/storm',
    'results': '#/results',
    'inbox': '#/crm',
    'find': '#/find',
    'today': '#/daily',
    'stormsat': '#/storm',
}
SIZES = {'1440': (1440, 900), '375': (375, 812)}


def changed_files():
    out = subprocess.run(['git', 'diff', '--name-only', 'HEAD', '--', 'tour'], cwd=ROOT, capture_output=True, text=True).stdout.split()
    untracked = subprocess.run(['git', 'ls-files', '--others', '--exclude-standard', '--', 'tour'], cwd=ROOT, capture_output=True, text=True).stdout.split()
    return [f for f in out if f.endswith(('.js', '.css', '.html'))], [f for f in untracked if f.endswith(('.js', '.css'))]


def install_before(page):
    mod, new = changed_files()
    for f in mod:
        body = subprocess.run(['git', 'show', 'HEAD:' + f], cwd=ROOT, capture_output=True).stdout
        url = 'http://127.0.0.1:4930/' + f
        ct = 'text/html' if f.endswith('.html') else 'text/css' if f.endswith('.css') else 'application/javascript'
        page.route(url + '*', lambda r, *a, body=body, ct=ct: r.fulfill(status=200, body=body, content_type=ct + '; charset=utf-8'))
    for f in new:   # files this round added: absent before
        url = 'http://127.0.0.1:4930/' + f
        page.route(url + '*', lambda r, *a: r.fulfill(status=404, body=''))
    return mod + new


PERF_JS = """async () => {
  const fr = document.querySelector('iframe[data-screen=storm]'); const w = fr.contentWindow;
  const map = w.eval('map');
  const frames = []; let last = performance.now(), run = true;
  const tick = t => { frames.push(t - last); last = t; if (run) w.requestAnimationFrame(tick); };
  w.requestAnimationFrame(tick);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // a fixed camera script: zoom out over Collin, pan, zoom in, pan (the same in both runs)
  const c0 = map.getCenter();
  map.jumpTo({ zoom: 10.6, center: c0 }); await wait(900); frames.length = 0; last = performance.now();
  map.easeTo({ zoom: 10.2, duration: 1500 }); await wait(1700);
  map.panBy([300, 120], { duration: 1500 }); await wait(1700);
  map.easeTo({ zoom: 12.3, duration: 1500 }); await wait(1700);
  map.panBy([-260, -160], { duration: 1500 }); await wait(1700);
  map.easeTo({ zoom: 14, duration: 1500 }); await wait(1700);
  run = false;
  const f = frames.slice(1).sort((a, b) => a - b), n = f.length, sum = f.reduce((s, x) => s + x, 0);
  return { frames: n, mean_ms: +(sum / n).toFixed(1), p50_ms: +f[Math.floor(n * .5)].toFixed(1), p95_ms: +f[Math.floor(n * .95)].toFixed(1), worst_ms: +f[n - 1].toFixed(1),
    fps: +(1000 * n / sum).toFixed(1), over50ms: f.filter(x => x > 50).length,
    gl: (() => { try { const c = document.createElement('canvas').getContext('webgl'); const d = c.getExtension('WEBGL_debug_renderer_info'); return c.getParameter(d.UNMASKED_RENDERER_WEBGL); } catch (e) { return '?'; } })() };
}"""

SWITCH_JS = """async () => {
  // picking storms: the frame-time hit of a storm switch (hail per home, hit columns, density), 4 storms in a row
  const fr = document.querySelector('iframe[data-screen=storm]'); const w = fr.contentWindow;
  const ST = w.eval('ST'), sel = w.eval('selectStorm'); const wait = ms => new Promise(r => setTimeout(r, ms));
  const picks = ST.storms.slice(-4).map(s => s.i); const out = [];
  for (const i of picks) { const frames = []; let last = performance.now(), run = true;
    const tick = t => { frames.push(t - last); last = t; if (run) w.requestAnimationFrame(tick); }; w.requestAnimationFrame(tick);
    sel(i); await wait(2200); run = false; frames.sort((a, b) => b - a);
    out.push({ storm: ST.storms[i].iso, worst_ms: +frames[0].toFixed(1), over50ms: frames.filter(x => x > 50).length, frames: frames.length }); }
  return out;
}"""

HOVER_JS = """async () => {
  // hover cost: the mouse sweeping across the homes (deck.gl picks on every move)
  const fr = document.querySelector('iframe[data-screen=storm]'); const w = fr.contentWindow, map = w.eval('map');
  map.jumpTo({ zoom: 11.4 }); await new Promise(r => setTimeout(r, 1200));
  const cv = map.getCanvas(), r = cv.getBoundingClientRect(); const t = [];
  for (let k = 0; k < 40; k++) { const t0 = performance.now();
    cv.dispatchEvent(new w.PointerEvent('pointermove', { clientX: r.left + 200 + k * 15, clientY: r.top + 300 + (k % 7) * 10, bubbles: true }));
    cv.dispatchEvent(new w.MouseEvent('mousemove', { clientX: r.left + 200 + k * 15, clientY: r.top + 300 + (k % 7) * 10, bubbles: true }));
    await new Promise(res => w.requestAnimationFrame(() => w.requestAnimationFrame(res))); t.push(performance.now() - t0); }
  t.sort((a, b) => a - b); return { hover_p50_ms: +t[20].toFixed(1), hover_p95_ms: +t[38].toFixed(1) };
}"""


def main():
    phase = sys.argv[1]
    only = next((a.split('=', 1)[1].split(',') for a in sys.argv[2:] if a.startswith('only=')), list(PAGES))
    perf = 'perf' in sys.argv[2:]
    d = OUT / phase; d.mkdir(parents=True, exist_ok=True)
    res = {}
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--max-old-space-size=900'])
        for name in only:
            for sz, (w, h) in SIZES.items():
                ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=(2 if 'dpr2' in sys.argv else 1), is_mobile=w < 700, has_touch=w < 700)
                pg = ctx.new_page()
                if phase.startswith('before'): install_before(pg)
                if name == 'stormsat': pg.add_init_script("try{localStorage.setItem('rc-mapview','sat')}catch(e){}")
                pg.goto(APP + PAGES[name], wait_until='domcontentloaded', timeout=90000)
                pg.wait_for_timeout(16000 if name == 'storms' else 9000)
                if name == 'stormsat':   # zoom into a street so the roof lines (if any) draw on the photo
                    pg.evaluate("() => { const w = document.querySelector('iframe[data-screen=storm]').contentWindow; const m = w.eval('map'), H = w.STH; m.jumpTo({ center: [H.lon(5704), H.lat(5704)], zoom: 18.6, pitch: 0, bearing: 0 }); }")
                    pg.wait_for_timeout(7000)
                pg.screenshot(path=str(d / f'{name}-{sz}.png'))
                if name == 'house':   # the record, scrolled one screen down
                    pg.evaluate("() => { const f = document.querySelector('iframe[data-screen=home]'); f.contentWindow.scrollTo(0, f.contentWindow.innerHeight * .85); }")
                    pg.wait_for_timeout(800); pg.screenshot(path=str(d / f'{name}-{sz}-b.png'))
                if name == 'storms' and perf and sz == '1440':
                    res['storms_pan_zoom'] = pg.evaluate(PERF_JS)
                    res['storms_hover'] = pg.evaluate(HOVER_JS)
                    res['storms_switch'] = pg.evaluate(SWITCH_JS)
                    print(json.dumps(res, indent=1))
                ctx.close()
                print(phase, name, sz, flush=True)
        b.close()
    if res:
        (d / 'perf.json').write_text(json.dumps(res, indent=1))


if __name__ == '__main__':
    main()
