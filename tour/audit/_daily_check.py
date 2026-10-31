"""Daily 50 v2 check: real flows + zero console errors + zero overlapping visible leaf text/controls.
Run: python tour/audit/_daily_check.py   (server on :4885 must already be running)
Clock is pinned to Mon 2026-10-05 10:00 Central so calling is open. tel:/sms: navigations are stopped."""
import json, sys, pathlib
from playwright.sync_api import sync_playwright

URL = "http://localhost:4885/tour/c4-command-deck/deck.html"
ORIG = "http://localhost:4880/c4-command-deck/deck.html"
SHOTS = pathlib.Path(__file__).parent / "shots"; SHOTS.mkdir(exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']

OVERLAP_JS = r"""() => {
  const leafSel = 'a,button,input,textarea,select,[role=link]';
  const all = [...document.querySelectorAll('body *')];
  const inSvg = e => !!e.closest('svg,canvas');
  const vis = e => { for (let n=e;n&&n.nodeType===1;n=n.parentElement){ const s=getComputedStyle(n); if (s.display==='none'||s.visibility==='hidden'||+s.opacity<0.05) return false; } return true; };
  const isLeaf = e => { if (inSvg(e) || ['SCRIPT','STYLE','svg','CANVAS','DIALOG'].includes(e.tagName)) return false;
    if (e.matches(leafSel)) return true;
    if (e.closest(leafSel)) return false;
    const txt = [...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
    return txt; };
  const clip = e => { let r = e.getBoundingClientRect(); let x0=r.left,y0=r.top,x1=r.right,y1=r.bottom;
    for (let n=e.parentElement;n&&n!==document.body;n=n.parentElement){ const s=getComputedStyle(n); if (/(hidden|auto|scroll|clip)/.test(s.overflow+s.overflowX+s.overflowY)){ const q=n.getBoundingClientRect(); x0=Math.max(x0,q.left);y0=Math.max(y0,q.top);x1=Math.min(x1,q.right);y1=Math.min(y1,q.bottom);} }
    x0=Math.max(0,x0);y0=Math.max(0,y0);x1=Math.min(innerWidth,x1);y1=Math.min(innerHeight,y1); return x1-x0>1&&y1-y0>1?{x0,y0,x1,y1}:null; };
  const onTop = (e, r) => { const pts=[[(r.x0+r.x1)/2,(r.y0+r.y1)/2],[r.x0+2,r.y0+2],[r.x1-2,r.y1-2]]; return pts.some(([x,y])=>{ const t=document.elementFromPoint(x,y); return t && (t===e||e.contains(t)||t.contains(e)); }); };
  const items = [];
  // a text-less link that fills a picture (the roof art "Open home") is a backdrop, not a leaf; inline text is measured per line
  const backdrop = e => e.matches('a,button') && !e.textContent.trim() && e.getBoundingClientRect().width*e.getBoundingClientRect().height > 8000;
  for (const e of all){ if (!isLeaf(e) || !vis(e) || backdrop(e)) continue; const r = clip(e); if (!r || !onTop(e,r)) continue;
    const inl = getComputedStyle(e).display === 'inline';
    if (inl) [...e.getClientRects()].forEach(q=>{ const rr={x0:Math.max(q.left,r.x0),y0:Math.max(q.top,r.y0),x1:Math.min(q.right,r.x1),y1:Math.min(q.bottom,r.y1)}; if (rr.x1-rr.x0>1&&rr.y1-rr.y0>1) items.push({e,r:rr}); });
    else items.push({e,r}); }
  const out = [];
  for (let i=0;i<items.length;i++) for (let j=i+1;j<items.length;j++){
    const a=items[i], b=items[j]; if (a.e===b.e||a.e.contains(b.e)||b.e.contains(a.e)) continue;
    const w=Math.min(a.r.x1,b.r.x1)-Math.max(a.r.x0,b.r.x0), h=Math.min(a.r.y1,b.r.y1)-Math.max(a.r.y0,b.r.y0);
    if (w>0&&h>0&&w*h>4){
      // a map pin that slides under an overlay card is covered, not colliding: skip when the pin is not on top where they meet
      const mk = a.e.closest('.maplibregl-marker') ? a : b.e.closest('.maplibregl-marker') ? b : null;
      if (mk){ const cx=(Math.max(a.r.x0,b.r.x0)+Math.min(a.r.x1,b.r.x1))/2, cy=(Math.max(a.r.y0,b.r.y0)+Math.min(a.r.y1,b.r.y1))/2, t=document.elementFromPoint(cx,cy); if (t && !mk.e.contains(t) && !t.contains(mk.e)) continue; }
      out.push([a.e.tagName+'.'+a.e.className+' "'+(a.e.textContent||'').trim().slice(0,30)+'"', b.e.tagName+'.'+b.e.className+' "'+(b.e.textContent||'').trim().slice(0,30)+'"', Math.round(w*h)]); }
  }
  return {n: items.length, overlaps: out};
}"""
SMALL_JS = r"""() => [...document.querySelectorAll('a,button,input,[role=link]')].filter(e=>{ const r=e.getBoundingClientRect(); if(r.width<1||r.height<1) return false; for(let n=e;n&&n.nodeType===1;n=n.parentElement){const s=getComputedStyle(n); if(s.display==='none'||s.visibility==='hidden'||+s.opacity<0.05) return false;} if(e.closest('.maplibregl-ctrl')) return false; const t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2); if(!t||!(t===e||e.contains(t))) return false; return r.height<44||r.width<44; }).map(e=>e.tagName+'.'+e.className+' "'+e.textContent.trim().slice(0,24)+'" '+Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height))"""

def goto(page, url, reload=False):
    for k in range(4):
        try:
            if reload: page.reload(wait_until='domcontentloaded', timeout=90000)
            else: page.goto(url, wait_until='domcontentloaded', timeout=90000)
            return
        except Exception as e:
            print('retry', k, str(e).splitlines()[0]); page.wait_for_timeout(3000)
    raise RuntimeError('could not load ' + url)

results = {}; fails = []
def check(cond, msg):
    if not cond: fails.append(msg)
    print(("ok   " if cond else "FAIL ") + msg)


FIT_JS = r"""() => { const c = document.querySelector('.card[data-d="0"]'), cr = c.getBoundingClientRect(), act = c.querySelector('.act').getBoundingClientRect();
  const out = [];
  if (act.bottom > cr.bottom + 0.5 || act.bottom > innerHeight + 0.5) out.push('call bar clipped: act.bottom '+Math.round(act.bottom)+' card '+Math.round(cr.bottom)+' vh '+innerHeight);
  const cb = c.querySelector('.cb'); [...cb.children].forEach(k=>{ const r=k.getBoundingClientRect(); if (r.bottom > cr.bottom+0.5) out.push('card child clipped '+k.className); });
  const q = document.getElementById('qlist'); if (q && getComputedStyle(q).display!=='none'){ const qr=q.getBoundingClientRect(), pr=q.parentElement.getBoundingClientRect(); if (qr.bottom>pr.bottom+0.5) out.push('queue list past its panel'); if (pr.bottom>innerHeight+0.5) out.push('queue panel past viewport'); }
  const pl = document.getElementById('pline'); if (pl && pl.getBoundingClientRect().height>0 && pl.getBoundingClientRect().height>40) out.push('pipeline line wraps to '+Math.round(pl.getBoundingClientRect().height)+'px');
  if (document.documentElement.scrollHeight > innerHeight+1) out.push('page scrolls '+document.documentElement.scrollHeight);
  return out; }"""

def fitrun(p, name, w, h, shell=False):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': w, 'height': h}, timezone_id='America/Chicago')
    page = ctx.new_page(); errs = []
    page.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    page.clock.install(time="2026-10-05T10:00:00-05:00")
    target = "http://localhost:4885/tour/product.html#/daily" if shell else URL
    goto(page, target); page.wait_for_timeout(500)
    page.evaluate("() => { Object.keys(localStorage).filter(k=>k.startsWith('rc.t.')).forEach(k=>localStorage.removeItem(k)); }")
    goto(page, None, True)
    fr = page
    if shell:
        fr = None
        for _ in range(60):
            fr = next((f for f in page.frames if 'deck.html' in f.url), None)
            if fr: break
            page.wait_for_timeout(500)
        fr.wait_for_load_state('domcontentloaded')
    try: fr.wait_for_function("window.__mapReady===true", timeout=45000)
    except Exception: errs.append('map not ready')
    fr.wait_for_selector('.card[data-d="0"] .act', timeout=60000)
    fr.wait_for_timeout(500)
    if shell: check(fr.evaluate("getComputedStyle(document.querySelector('.app > .bar')).display") == 'none', f'{name}: deck bar hidden inside the shell')
    for state in ('load', 'log'):
        if state == 'log':
            fr.evaluate("""document.addEventListener('click', e => { const a = e.target.closest('a[href^="tel:"]'); if (a) e.preventDefault(); })""")
            n_call = fr.locator('.card[data-d="0"] a.call').count()
            check(n_call == 1, f'{name}: Call link present ({fr.evaluate("""(document.querySelector('.card[data-d="0"] .calls')||{}).textContent""")}, frame {fr.url})')
            if not n_call: break
            fr.locator('.card[data-d="0"] a.call').click(timeout=10000, force=True); fr.wait_for_timeout(200)
        f = fr.evaluate(FIT_JS); check(not f, f'{name} {state}: fits the viewport {f}')
        o = fr.evaluate(OVERLAP_JS); check(not o['overlaps'], f"{name} {state}: overlaps {o['overlaps'][:4]}")
    try: page.screenshot(path=str(SHOTS / f'v2-daily-{name}.png'), timeout=60000)
    except Exception as e: print('screenshot skipped', name, str(e).splitlines()[0])
    check(not errs, f'{name}: zero page errors {errs[:3]}')
    b.close()

def run(p, name, w, h, mobile):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': w, 'height': h}, timezone_id='America/Chicago', is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
    page = ctx.new_page()
    errs = []
    page.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    page.clock.install(time="2026-10-05T10:00:00-05:00")
    goto(page, URL)
    page.evaluate("() => { Object.keys(localStorage).filter(k=>k.startsWith('rc.t.')).forEach(k=>localStorage.removeItem(k)); }")
    goto(page, None, True)
    page.add_init_script("")
    page.evaluate("""() => document.addEventListener('click', e => { const a = e.target.closest('a[href^="tel:"],a[href^="sms:"],a[href^="https://www.google.com/maps"]'); if (a){ e.preventDefault(); window.__lastHref = a.href; } })""")
    try: page.wait_for_function("window.__mapReady===true", timeout=45000)
    except Exception: errs.append('map not ready in 20 s')
    page.wait_for_timeout(600)
    card = '.card[data-d="0"]'
    # greeting + header
    check(page.locator('#greet').inner_text() == 'Good morning', f'{name}: greeting from the clock')
    check(page.locator('#pRingTxt').inner_text() == '0 of 50', f'{name}: header starts at 0 of 50')
    shot = SHOTS / f'v2-daily-{name}.png'
    page.screenshot(path=str(shot))
    o = page.evaluate(OVERLAP_JS); check(not o['overlaps'], f"{name}: overlaps at load {len(o['overlaps'])} of {o['n']} leaves {o['overlaps'][:4]}")
    if mobile:
        small = page.evaluate(SMALL_JS); check(not small, f'{name}: tap targets >= 44px {small[:6]}')
    # Call -> No answer
    call = page.locator(f'{card} a.call')
    href = call.get_attribute('href'); check(bool(href) and href.startswith('tel:'), f'{name}: Call href is tel: ({href})')
    call.click(); page.wait_for_timeout(150)
    check(page.evaluate('window.__lastHref||""').startswith('tel:'), f'{name}: tel: navigation stopped')
    check(page.locator(f'{card} [data-out]').count() == 5, f'{name}: five outcome buttons after Call')
    page.locator(f'{card} [data-out="no_answer"]').click(); page.wait_for_timeout(150)
    check(page.locator('#pRingTxt').inner_text() == '1 of 50', f"{name}: header shows 1 of 50 called ({page.locator('#pRingTxt').inner_text()})")
    check(page.locator(f'{card} .addr .pill').inner_text() == 'Called', f"{name}: stage is Called ({page.locator(f'{card} .addr .pill').inner_text()})")
    check('1 of 3 calls in 24 hours' in page.locator(f'{card} .calls').inner_text(), f'{name}: 1 of 3 calls in 24 hours')
    first_id = page.locator(card).get_attribute('data-id')
    check(page.evaluate(f"RC.stage('{first_id}')") == 'called', f'{name}: RC.stage({first_id}) = called')
    o = page.evaluate(OVERLAP_JS); check(not o['overlaps'], f"{name}: overlaps after logging {o['overlaps'][:4]}")
    page.locator(f'{card} [data-a="next"]').click(); page.wait_for_timeout(500)
    # Book via the dialog
    second_id = page.locator(card).get_attribute('data-id'); check(second_id != first_id, f'{name}: Next stop moves on ({second_id})')
    page.locator(f'{card} a.call').click(); page.wait_for_timeout(100)
    page.locator(f'{card} [data-out="booked"]').click(); page.wait_for_timeout(200)
    check(page.locator('#dlg[open]').count() == 1, f'{name}: Booked opens the date/time picker')
    page.locator('#dDays button').nth(2).click(); page.locator('#dSlots button').nth(4).click()
    label = page.locator('#dOk').inner_text()
    o = page.evaluate(OVERLAP_JS); check(not o['overlaps'], f"{name}: overlaps with the book dialog {o['overlaps'][:4]}")
    if name == 'desktop': page.screenshot(path=str(SHOTS / 'v2-daily-desktop-book.png'))
    page.locator('#dOk').click(); page.wait_for_timeout(200)
    check(page.locator(f'{card} .addr .pill').inner_text() == 'Inspection booked', f'{name}: stage Inspection booked ({label})')
    check(page.evaluate(f"!!RC.booking('{second_id}')"), f'{name}: RC.book stored a booking')
    check(page.locator('#sBooked').inner_text() == '1', f'{name}: header 1 inspection booked')
    page.locator(f'{card} [data-a="next"]').click(); page.wait_for_timeout(500)
    # Skip + Undo
    third_id = page.locator(card).get_attribute('data-id')
    page.locator(f'{card} [data-a="skip"]').click(); page.wait_for_timeout(100)
    check(page.locator(f'{card} [data-skip]').count() == 3, f'{name}: Skip asks why (3 reasons)')
    page.locator(f'{card} [data-skip="Not a fit"]').click(); page.wait_for_timeout(500)
    check(page.locator(card).get_attribute('data-id') != third_id, f'{name}: Skip moves to the next stop')
    check(page.locator('#toast.open #toastUndo').count() == 1, f'{name}: Undo offered')
    page.locator('#toastUndo').click(); page.wait_for_timeout(500)
    check(page.locator(card).get_attribute('data-id') == third_id, f'{name}: Undo returns to the skipped stop')
    check(page.evaluate("Object.keys(JSON.parse(localStorage.getItem('rc.t.d50skip')||'{}')).length") == 0, f'{name}: Undo clears the skip')
    # Text: opt-in state first
    page.locator(f'{card} [data-a="text"]').click(); page.wait_for_timeout(150)
    txt = page.locator('#dlg').inner_text()
    check('CIB 80000000 (sample)' in txt or 'CIB 80000000, sample' in txt, f'{name}: draft carries the CIB number')
    optin = page.locator('#dlg .optin').inner_text(); has_sms = page.locator('#dlg a[href^="sms:"]').count()
    check(('Not opted in' in optin) == (has_sms == 0), f'{name}: sms link only when opted in ({optin.splitlines()[0]}, sms={has_sms})')
    page.keyboard.press('Escape'); page.wait_for_timeout(150)
    # remembered for Home
    check(page.evaluate(f"!!RC.recall('{first_id}') && RC.recall('{first_id}').addr.length>0"), f'{name}: RC.remember stored the stop for Home')
    hails = page.evaluate("Object.values(JSON.parse(localStorage.getItem('rc.t.homes')||'{}')).map(h=>h.hail)")
    check(max(hails) <= 1.23, f'{name}: per-home hail <= 1.23 (max {max(hails)})')
    if not mobile:
        page.fill('#findIn', '9th'); page.wait_for_timeout(100)
        n = page.locator('#qlist .qrow').count(); check(0 < n < 12, f'{name}: Find an address filters the queue ({n} rows)')
        page.fill('#findIn', ''); page.wait_for_timeout(100)
        mapsHref = page.locator('#mnext a.go').get_attribute('href'); check('google.com/maps' in (mapsHref or ''), f'{name}: Directions opens Google Maps')
        stacked = page.evaluate("""[...document.querySelectorAll('.card[data-d="1"],.card[data-d="2"]')].map(c=>getComputedStyle(c).opacity)""")
        check(all(float(x) == 0 for x in stacked), f'{name}: no stacked cards behind the stop')
    page.screenshot(path=str(shot))
    o = page.evaluate(OVERLAP_JS); check(not o['overlaps'], f"{name}: overlaps at end {o['overlaps'][:4]}")
    if mobile:
        page.locator(f'{card} [data-a="roof"]').click(); page.wait_for_timeout(1000)
        page.screenshot(path=str(SHOTS / f'v2-daily-{name}-roof.png'))
        o = page.evaluate(OVERLAP_JS); check(not o['overlaps'], f"{name}: overlaps with roof sheet {o['overlaps'][:4]}")
        small = page.evaluate(SMALL_JS); check(not small, f'{name}: roof sheet tap targets >= 44px {small[:6]}')
        bg = page.evaluate("getComputedStyle(document.getElementById('sheetRoof')).backgroundColor"); check(bg in ('rgb(255, 255, 255)',), f'{name}: roof sheet background white ({bg})')
        page.locator('#scrim').click(position={'x': 20, 'y': 20}); page.wait_for_timeout(500)
        page.locator('#openRoute').click(); page.wait_for_timeout(1200)
        page.screenshot(path=str(SHOTS / f'v2-daily-{name}-route.png'))
        o = page.evaluate(OVERLAP_JS); check(not o['overlaps'], f"{name}: overlaps with route sheet {o['overlaps'][:4]}")
    check(not errs, f'{name}: zero console/page errors {errs[:4]}')
    b.close()

def orig(p):
    b = p.chromium.launch(args=ARGS)
    for nm, w, h in (('desktop', 1440, 900), ('phone', 390, 844)):
        pg = b.new_page(viewport={'width': w, 'height': h})
        try:
            pg.goto(ORIG, wait_until='domcontentloaded'); pg.wait_for_timeout(2500)
            pg.screenshot(path=str(SHOTS / f'v2-daily-orig-{nm}.png'))
        except Exception as e: print('orig', nm, e)
        pg.close()
    b.close()

ONLY = [a[7:] for a in sys.argv if a.startswith('--only=')]
with sync_playwright() as p:
  if ONLY:
    for nm in ONLY:
      w, h = {'1861': (1861, 867), '1440': (1440, 900), '1366': (1366, 768)}[nm.split('-')[1]]
      fitrun(p, nm, w, h, nm.startswith('shell'))
  else:
      run(p, 'desktop', 1440, 900, False)
      run(p, 'phone', 390, 844, True)
      fitrun(p, 'fit-1440', 1440, 900)
      fitrun(p, 'fit-1861', 1861, 867)
      fitrun(p, 'fit-1366', 1366, 768)
      fitrun(p, 'shell-1861', 1861, 867, True)
      fitrun(p, 'shell-1440', 1440, 900, True)
      fitrun(p, 'shell-1366', 1366, 768, True)
      if '--orig' in sys.argv: orig(p)
print('\nFAILS:', len(fails))
for f in fails: print(' -', f)
sys.exit(1 if fails else 0)
