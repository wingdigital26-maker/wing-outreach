"""Nimbus corner check: exactly one Nimbus (the floating bottom-right orb), none in any header or frame.
usage: python _nimbus2_check.py fresh   -> fresh profile on :4886, Today/Storms/Homes/Ask at 1440x900 and 390x844, chat open+close
       python _nimbus2_check.py stale   -> persistent profile on :4899 loads the OLD build (registers its SW), then the new
                                           files are copied in and the tab is reloaded normally (no hard refresh)"""
import asyncio, sys, json, shutil, os, tempfile
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, 'shots')
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
MODE = sys.argv[1] if len(sys.argv) > 1 else 'fresh'
OLDSRV = sys.argv[2] if len(sys.argv) > 2 else ''
GPU = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
SCREENS = [('Today', 'today'), ('Storms', 'storms'), ('CRM', 'homes'), ('Ask', 'ask')]   # the Homes tab is CRM (10-09); shot names keep 'homes'

PROBE = r"""() => {
  const docs = [{ name: 'shell', doc: document, off: { left: 0, top: 0 } }];
  document.querySelectorAll('iframe').forEach(f => { try { if (f.contentDocument) docs.push({ name: f.dataset.screen || f.src, doc: f.contentDocument, off: f.getBoundingClientRect(), on: f.classList.contains('on') }); } catch (e) {} });
  const SEL = '.wm-root,.nb-dock,#nimbus,[class*="mascot"],[id*="mascot"],[aria-label^="Nimbus:"]';
  const found = [];
  docs.forEach(d => d.doc.querySelectorAll(SEL).forEach(el => {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const shown = r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
    found.push({ doc: d.name, cls: String(el.className).slice(0, 40), id: el.id, shown, inHeader: !!el.closest('header,.bar,.top,.hdr,[class*="header"]'),
      left: Math.round(r.left + d.off.left), top: Math.round(r.top + d.off.top), w: Math.round(r.width), h: Math.round(r.height) });
  }));
  const dock = document.querySelector('.nb-dock');
  const dr = dock && dock.getBoundingClientRect();
  const hit = dock && dock.querySelector('.nb-hit').getBoundingClientRect();
  const art = dock && dock.querySelector('.wm-root').getBoundingClientRect();
  return { found, docks: document.querySelectorAll('.nb-dock').length,
    dock: dr && { size: Math.round(dr.width), rightGap: Math.round(innerWidth - dr.right), bottomGap: Math.round(innerHeight - dr.bottom), top: Math.round(dr.top), in: dock.classList.contains('in'),
      hit: Math.round(hit.width), artCentreDx: Math.round(art.left + art.width / 2 - (dr.left + dr.width / 2)), artCentreDy: Math.round(art.top + art.height / 2 - (dr.top + dr.height / 2)) },
    vw: innerWidth, vh: innerHeight };
}"""


def verdict(p):
    shown = [f for f in p['found'] if f['shown']]
    roots = [f for f in shown if f['cls'].startswith('wm-root')]
    bad_header = [f for f in shown if f['inHeader']]
    in_frames = [f for f in shown if f['doc'] != 'shell']
    d = p['dock'] or {}
    ok = (p['docks'] == 1 and len(roots) == 1 and not bad_header and not in_frames and d.get('in')
          and d.get('rightGap', 99) <= 24 and d.get('top', 0) > p['vh'] * 0.6)
    return ok, {'roots_shown': len(roots), 'in_header': bad_header, 'in_frames': in_frames, 'dock': d}


async def shot(pg, path):
    try: await pg.screenshot(path=path, timeout=60000, animations='disabled')
    except Exception as e: print('shot failed', path, str(e)[:80], flush=True)


async def ev(pg, js):
    for i in range(6):
        try: return await pg.evaluate(js)
        except Exception as e:
            if 'crashed' in str(e): raise
            await pg.wait_for_timeout(1500)
    return await pg.evaluate(js)


async def tap(pg, sel):
    try: await pg.click(sel, timeout=15000)
    except Exception: await pg.evaluate('s => document.querySelector(s).click()', sel); print('  (js click)', sel, flush=True)


async def tour(pg, tag, out):
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:160]))
    allok = True
    for label, key in SCREENS:
        btn = pg.locator('nav button', has_text=label).first
        try: await btn.click(timeout=15000)
        except Exception: await btn.evaluate('b => b.click()')
        await pg.wait_for_timeout(4200)
        p = await ev(pg, PROBE)
        ok, v = verdict(p)
        allok &= ok
        w = p['vw']
        await shot(pg, os.path.join(SHOTS, f'nimbus2-{key}-{w}{tag}.png'))
        # chat: open on the orb, screenshot, close with the panel's x
        await tap(pg, '.nb-dock .nb-hit')
        await pg.wait_for_timeout(900)
        opened = await pg.evaluate("document.querySelector('.wmp').classList.contains('open')")
        await shot(pg, os.path.join(SHOTS, f'nimbus2-{key}-chat-{w}{tag}.png'))
        await tap(pg, '.wmp-x')
        await pg.wait_for_timeout(700)
        closed = await pg.evaluate("!document.querySelector('.wmp').classList.contains('open')")
        allok &= opened and closed
        out.append({'screen': key, 'w': w, 'ok': ok, 'chat_open': opened, 'chat_closed': closed, **v})
        print(json.dumps(out[-1]), flush=True)
    return allok, errs


async def main():
    os.makedirs(SHOTS, exist_ok=True)
    async with async_playwright() as p:
        if MODE == 'fresh':
            b = await p.chromium.launch(headless=True, args=GPU)
            out, every = [], True
            for vw, vh in [(1440, 900), (390, 844)]:
                ctx = await b.new_context(viewport={'width': vw, 'height': vh}, device_scale_factor=1)
                await ctx.route('**/formsubmit.co/**', lambda r: r.abort())
                pg = await ctx.new_page()
                await pg.goto('http://localhost:4886/tour/product.html?dev=1#/daily', timeout=60000)
                await pg.wait_for_selector('.nb-dock.in', timeout=60000)
                ok, errs = await tour(pg, '', out)
                every &= ok
                print('errors', vw, errs, flush=True)
                await ctx.close()
            await b.close()
            print('ALL_OK' if every else 'FAIL', flush=True)
        else:
            prof = tempfile.mkdtemp(prefix='nb2prof')
            ctx = await p.chromium.launch_persistent_context(prof, headless=True, viewport={'width': 1440, 'height': 900}, args=GPU)
            await ctx.route('**/formsubmit.co/**', lambda r: r.abort())
            pg = ctx.pages[0] if ctx.pages else await ctx.new_page()
            url = 'http://localhost:4899/tour/product.html?dev=1#/ask'
            await pg.goto(url, timeout=60000)
            await pg.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller", timeout=60000)
            await pg.wait_for_timeout(6000)   # precache settles
            keys = await ev(pg, "caches.keys()")
            old_ask = await pg.evaluate("(()=>{const f=document.querySelector('iframe[data-screen=ask]');return f?f.contentDocument.querySelectorAll('#nimbus .wm-root').length:-1})()")
            print('OLD build: caches', keys, 'Ask in-sheet orbs', old_ask, flush=True)
            await pg.reload(); await pg.wait_for_timeout(4000)
            old_ask2 = await pg.evaluate("(()=>{const f=document.querySelector('iframe[data-screen=ask]');return f?f.contentDocument.querySelectorAll('#nimbus .wm-root').length:-1})()")
            print('OLD build reloaded from its SW: Ask in-sheet orbs', old_ask2, flush=True)
            await shot(pg, os.path.join(SHOTS, 'nimbus2-stale-before-1440.png'))
            # ship the new build into the same origin
            for rel in ['tour/sw.js', 'tour/product.html', 'tour/lib/nimbus-shell.js', 'tour/lib/nimbus-shell.css', 'tour/c2-nimbus/index.html']:
                shutil.copyfile(os.path.join(REPO, rel), os.path.join(OLDSRV, rel))
            print('new files copied; normal reload (no hard refresh)', flush=True)
            await pg.reload()
            for i in range(30):   # the new worker installs, activates, deletes the old caches and reloads the tab
                await pg.wait_for_timeout(1000)
                try:
                    k = await pg.evaluate("caches.keys()")
                    if not any('v5' in x for x in k): print('old caches gone after', i + 1, 's', flush=True); break
                except Exception: pass
            await pg.wait_for_timeout(5000)
            keys = await ev(pg, "caches.keys()")
            pr = await ev(pg, PROBE)
            ok, v = verdict(pr)
            print('AFTER one normal reload: caches', keys, json.dumps({'ok': ok, **v}), flush=True)
            await shot(pg, os.path.join(SHOTS, 'nimbus2-stale-after-1440.png'))
            out = []
            ok2, errs = await tour(pg, '-stale', out)
            print('errors', errs, flush=True)
            await ctx.close()
            print('ALL_OK' if (ok and ok2) else 'FAIL', flush=True)

if __name__ == "__main__": asyncio.run(main())
