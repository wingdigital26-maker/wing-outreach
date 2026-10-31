"""Nimbus floating orb check: Today, Storms, Homes, Ask at 1440x900 and 390x844 with the update bubble up,
plus the chat open once per size. Asserts 0 console errors and no overlap between the orb / bubble and the
screen's own buttons (bounding boxes from Nimbus.obstacles(), measured inside the active frame).
Screenshots: tour/audit/shots/nimbus-<screen>-<w>.png. Run: python tour/audit/nimbus_float_check.py"""
import json, os, sys
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:4886/tour/product.html?dev=1&nointro=1&noprefetch=1&nosw=1'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')
os.makedirs(OUT, exist_ok=True)
SCREENS = ['daily', 'storm', 'home', 'ask']
NAMES = {'daily': 'today', 'storm': 'storms', 'home': 'homes', 'ask': 'ask'}

MEASURE = """() => {
  const ov = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const box = el => { const r = el.getBoundingClientRect(); return {left:r.left, right:r.right, top:r.top, bottom:r.bottom, w:r.width, h:r.height}; };
  const orb = box(document.querySelector('.nb-dock'));
  const bub = document.querySelector('.nb-bubble');
  const bon = bub.classList.contains('on');
  const bb = box(bub);
  const obs = Nimbus.obstacles().map(o => ({left:o.left, right:o.right, top:o.top, bottom:o.bottom, what:(o.el.className||o.el.tagName)+' '+(o.el.textContent||'').trim().slice(0,24)}));
  return { orb, bubbleOn: bon, bubble: bb, bubbleText: bub.innerText, orbHits: obs.filter(o => ov(orb, o)), bubbleHits: bon ? obs.filter(o => ov(bb, o)) : [],
    nObs: obs.length, vw: innerWidth, vh: innerHeight, aria: document.querySelector('.nb-hit').getAttribute('aria-label') };
}"""

def shot(pg, path):
    # the storm map keeps WebGL busy on a software GPU; fall back to a plain capture if the frozen one stalls
    try:
        pg.screenshot(path=path, timeout=60000, animations='disabled')
    except Exception:
        pg.screenshot(path=path, timeout=60000)

def run():
    report, errors = [], []
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        for w, h in [(1440, 900), (390, 844)]:
            ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, is_mobile=w < 600, has_touch=w < 600)
            pg = ctx.new_page()
            pg.on('console', lambda m, w=w: m.type == 'error' and errors.append(f'{w}: {m.text}'))
            pg.on('pageerror', lambda e, w=w: errors.append(f'{w}: pageerror {e}'))
            pg.on('response', lambda r, w=w: r.status >= 400 and errors.append(f'{w}: HTTP {r.status} {r.url}'))
            # load Today first so the deck stores today's route on this device (the real queue)
            pg.goto(BASE + '#/daily', wait_until='load', timeout=60000)
            pg.wait_for_timeout(6000)
            for s in SCREENS:
                pg.evaluate(f"location.hash = '#/{s}'")
                pg.wait_for_timeout(20000 if s == 'storm' else 5500 if s != 'daily' else 2500)
                # make sure an update is up for the shot (phone shows one, then only on events)
                pg.evaluate("() => { const l = Nimbus.updates(); const k = {daily:'next',storm:'storm',home:'queue',ask:'window'}[location.hash.split('/')[1]]; const it = l.find(u => u.key === k) || l[0]; if (it && !document.querySelector('.nb-bubble.on')) Nimbus.say(it, 20000); Nimbus.place(); }")
                pg.wait_for_timeout(700)
                m = pg.evaluate(MEASURE)
                m['screen'] = s; m['w'] = w
                report.append(m)
                shot(pg, os.path.join(OUT, f'nimbus-{NAMES[s]}-{w}.png'))
            # chat open once
            pg.evaluate("location.hash = '#/daily'"); pg.wait_for_timeout(2500)
            stab = [pg.evaluate("JSON.stringify(Nimbus.orb)") for _ in range(3) if not pg.wait_for_timeout(400)]
            try:
                pg.click('.nb-hit', timeout=10000)
            except Exception as e:
                errors.append(f'{w}: orb click failed: {str(e).splitlines()[-3:]} positions={stab}')
            pg.wait_for_timeout(1500)
            chat = pg.evaluate("() => { const r = document.querySelector('.wmp').getBoundingClientRect(); return {open: document.querySelector('.wmp').classList.contains('open'), left:r.left, right:r.right, top:r.top, bottom:r.bottom, expanded: document.querySelector('.nb-hit').getAttribute('aria-expanded')}; }")
            report.append({'chat': chat, 'w': w})
            shot(pg, os.path.join(OUT, f'nimbus-chat-{w}.png'))
            pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
            ctx.close()
        b.close()
    print(json.dumps({'errors': errors, 'report': report}, indent=1))
    bad = [r for r in report if r.get('orbHits') or r.get('bubbleHits')]
    print('OVERLAPS:', len(bad), 'CONSOLE ERRORS:', len(errors))
    return 1 if bad or errors else 0

if __name__ == '__main__':
    sys.exit(run())
