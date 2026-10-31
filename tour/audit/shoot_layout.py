"""Layout audit shots for the Roof Command app shell.
usage: python tour/audit/shoot_layout.py [tag] [roofer,...] [sizes]
Writes tour/audit/shots/layout-<tag>-<roofer>-<screen>-<w>.png and prints console errors + overflow findings.
Fresh browser context per shot (no service worker), ?nosw=1 so none registers."""
import sys, json, asyncio
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tour' / 'audit' / 'shots'
BASE = 'http://127.0.0.1:4886/tour/product.html'
tag = sys.argv[1] if len(sys.argv) > 1 else 'after'
roofers = (sys.argv[2] if len(sys.argv) > 2 else 'jackson,reddirt').split(',')
SIZES = [(1440, 900), (1861, 867), (1366, 768), (390, 844), (360, 780)]
if len(sys.argv) > 3:
    SIZES = [tuple(int(x) for x in s.split('x')) for s in sys.argv[3].split(',')]
SCREENS = ['daily', 'storm', 'home', 'ask']
if len(sys.argv) > 4:
    SCREENS = sys.argv[4].split(',')

OVERFLOW_JS = """
() => {
  const out = [];
  const vw = innerWidth, vh = innerHeight;
  const scan = (doc, pre) => {
    doc.querySelectorAll('body *').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (r.right > vw + 1 || r.left < -1) {
        const t = (el.textContent || '').trim().slice(0, 40);
        if (t && el.children.length < 3) out.push(pre + ' X-overflow ' + el.tagName + '.' + el.className + ' "' + t + '" ' + Math.round(r.left) + '-' + Math.round(r.right));
      }
      const fs = parseFloat(cs.fontSize);
      if (fs && fs < 11 && (el.textContent || '').trim() && el.children.length === 0 && r.width > 0) out.push(pre + ' small-text ' + fs + 'px ' + el.tagName + '.' + el.className + ' "' + (el.textContent||'').trim().slice(0,30) + '"');
    });
  };
  scan(document, 'shell');
  return out;
}
"""

async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
        report = {}
        for roofer in roofers:
            for (w, h) in SIZES:
                for screen in SCREENS:
                    ctx = await browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1,
                                                    is_mobile=w < 700, has_touch=w < 700)
                    page = await ctx.new_page()
                    errors = []
                    page.on('console', lambda m, e=errors: e.append(m.text) if m.type == 'error' else None)
                    page.on('pageerror', lambda ex, e=errors: e.append('pageerror: ' + str(ex)))
                    url = f'{BASE}?dev=1&roofer={roofer}&nointro=1&nosw=1&noprefetch=1#/{screen}'
                    try:
                        await page.goto(url, wait_until='load', timeout=60000)
                        await page.wait_for_timeout(5000)
                    except Exception as ex:
                        errors.append('nav: ' + str(ex))
                    name = f'layout-{tag}-{roofer}-{screen}-{w}.png'
                    try:
                        await page.screenshot(path=str(OUT / name), full_page=False, timeout=90000)
                    except Exception as ex:
                        errors.append('shot: ' + str(ex)[:120])
                    # overflow scan in shell + the active frame
                    finds = []
                    try:
                        finds += await page.evaluate(OVERFLOW_JS)
                        for fr in page.frames:
                            if fr == page.main_frame: continue
                            if not fr.url or 'product.html' in fr.url: continue
                            try:
                                finds += [f.replace('shell', 'frame') for f in await fr.evaluate(OVERFLOW_JS)]
                            except Exception:
                                pass
                    except Exception as ex:
                        finds.append('scan failed: ' + str(ex))
                    errs = [e for e in errors if 'favicon' not in e and 'tiles.openfreemap' not in e and 'net::ERR' not in e]
                    report[name] = {'errors': errs, 'finds': finds[:25]}
                    print(name, '| errors:', len(errs), '| finds:', len(finds))
                    for e in errs[:5]: print('   ERR', e[:200])
                    for f in finds[:12]: print('   ', f[:160])
                    await ctx.close()
        await browser.close()
    (OUT / f'layout-{tag}-report.json').write_text(json.dumps(report, indent=1))

asyncio.run(main())
