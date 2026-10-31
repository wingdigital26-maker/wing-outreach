"""Nimbus polish check (bubbles, orb clearance, storm year). Fresh profile on :4886, 1440x900 and 390x844.
usage: python _nimbus3_check.py
Asserts:
  - a bubble never shows while a dialog or sheet is open (Homes Book dialog, Today phone Up next sheet)
  - a shown bubble never overlaps a button, link, input or card of the screen under it (Homes board, Today, Ask)
  - the orb never overlaps a button of the screen under it (Ask phone sheet states incl. "Add N homes to Daily 50",
    Today phone Up next sheet rows) while staying in its 140px lift band
  - storm short date carries the year when not this year; Nimbus still matches typed "Aug 12" and "Aug 12, 2025"
Prints ALL_OK or FAIL. Shots: audit/shots/nimbus3-*.png"""
import asyncio, json, os
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, 'shots')
GPU = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
BASE = 'http://localhost:4886/tour/product.html?dev=1'

# overlap of the bubble / orb with the active screen's controls and cards, measured independently of nimbus-shell.js
PROBE = r"""(cards) => {
  const fr = document.querySelector('#f .frame.on'); const fb = fr.getBoundingClientRect(); const doc = fr.contentDocument, win = fr.contentWindow;
  const area = fb.width * fb.height;
  const HIT = 'a[href],button,input,select,textarea,[role="button"],[data-a],[data-act]';
  const CARD = 'article,.pc,.qrow,[data-id]';
  const vis = el => { const cs = win.getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05 && cs.pointerEvents !== 'none'; };
  // the visible part: cut by each scrolling/clipping ancestor up to the first fixed one
  const seen = el => { const r = el.getBoundingClientRect(); let l = r.left, t = r.top, rr = r.right, b = r.bottom;
    if (win.getComputedStyle(el).position !== 'fixed') for (let p = el.parentElement; p && p !== doc.body; p = p.parentElement) {
      const cs = win.getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const c = p.getBoundingClientRect(); l = Math.max(l, c.left); t = Math.max(t, c.top); rr = Math.min(rr, c.right); b = Math.min(b, c.bottom); }
      if (cs.position === 'fixed') break; }
    return { l, t, r: rr, b, full: r.width * r.height }; };
  const rects = sel => [...doc.querySelectorAll(sel)].map(el => { const r = seen(el);
      return { el, l: r.l + fb.left, t: r.t + fb.top, r: r.r + fb.left, b: r.b + fb.top, w: r.r - r.l, h: r.b - r.t, full: r.full }; })
    .filter(o => o.w >= 4 && o.h >= 4 && o.full <= area * 0.4 && o.b > fb.top && o.t < fb.bottom && o.r > fb.left && o.l < fb.right && vis(o.el));
  const over = (a, list) => list.filter(o => o.l < a.r && o.r > a.l && o.t < a.b && o.b > a.t)
    .map(o => ((o.el.className && String(o.el.className)) || o.el.tagName).slice(0, 24) + ':' + (o.el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30));
  const b = document.querySelector('.nb-bubble'), bon = b.classList.contains('on') && getComputedStyle(b).visibility !== 'hidden';
  const br = b.getBoundingClientRect(), bubble = { l: br.left, t: br.top, r: br.right, b: br.bottom };
  const d = document.querySelector('.nb-dock .nb-hit').getBoundingClientRect();
  // the orb's own circle: test its inscribed square so a round corner does not count
  const k = d.width * 0.15, orb = { l: d.left + k, t: d.top + k, r: d.right - k, b: d.bottom - k };
  const hit = rects(HIT), card = rects(CARD);
  const dock = document.querySelector('.nb-dock'), tucked = dock.classList.contains('tuck') && +getComputedStyle(dock).opacity < 0.05;
  // is there any clear spot for him in his 140px band? (corner = viewport bottom - gap - safe area; he never sits lower)
  const gap = innerWidth <= 599 ? 20 : 24, corner = Math.max(d.bottom, innerHeight - gap);
  let clearSpot = false;
  for (let y = corner; y >= corner - 140 && !clearSpot; y -= 2) { const bx = { l: orb.l, r: orb.r, t: y - d.height + k, b: y - k }; if (!over(bx, hit).length) clearSpot = true; }
  const small = list => list.filter(o => o.w * o.h < d.width * d.height * 2.5);
  const orbSmall = small(hit.filter(o => o.l < orb.r && o.r > orb.l && o.t < orb.b && o.b > orb.t)).map(o => (o.el.textContent || '').trim().slice(0, 30));
  const modal = !!doc.querySelector('dialog[open]') || [...doc.querySelectorAll('.sheet.open,.rsheet.open')].some(vis);
  return { bubbleOn: bon, bubbleText: bon ? b.textContent.trim().slice(0, 60) : '', bubbleOver: bon ? over(bubble, hit.concat(cards ? card : [])) : [],
    orbOver: tucked ? [] : over(orb, hit), orbSmallOver: tucked ? [] : orbSmall, tucked, clearSpot, modal, orbTop: Math.round(d.top), orbBottomGap: Math.round(innerHeight - d.bottom) };
}"""

NEXT = "{k:'Next stop', t:'3704 Morning Dove Dr, 1.09 in hail.', m:'excited', go:{screen:'daily',params:{n:1}}}"
CALLS = "{k:'Texts', t:'Texting is open until 8 pm.', m:'calm', go:{screen:'daily',params:{}}}"   # the texting-hours bubble (outreach is text and email only)


async def shot(pg, name):
    try: await pg.screenshot(path=os.path.join(SHOTS, name), timeout=60000, animations='disabled')
    except Exception as e: print('shot failed', name, str(e)[:80], flush=True)


async def nav(pg, label):
    btn = pg.locator('nav button', has_text=label).first
    try: await btn.click(timeout=15000)
    except Exception: await btn.evaluate('b => b.click()')
    await pg.wait_for_timeout(4500)


async def frame_eval(pg, js):
    return await pg.evaluate("(js) => { const w = document.querySelector('#f .frame.on').contentWindow; return w.eval(js); }", js)


async def say_and_probe(pg, item, cards=True):
    await pg.evaluate(f"Nimbus.say({item}, 9000)")
    await pg.wait_for_timeout(900)
    return await pg.evaluate(PROBE, cards)


async def main():
    os.makedirs(SHOTS, exist_ok=True)
    every, results = True, []

    def check(name, ok, info):
        nonlocal every
        every &= bool(ok)
        results.append(name)
        print(('PASS ' if ok else 'FAIL ') + name, json.dumps(info)[:400], flush=True)

    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, args=GPU)
        for vw, vh in [(1440, 900), (390, 844)]:
            ctx = await b.new_context(viewport={'width': vw, 'height': vh}, device_scale_factor=1)
            await ctx.route('**/formsubmit.co/**', lambda r: r.abort())
            pg = await ctx.new_page()
            errs = []
            pg.on('pageerror', lambda e: errs.append('pageerror ' + str(e)[:160]))
            pg.on('console', lambda m: errs.append('console ' + m.text[:160]) if m.type == 'error' else None)
            await pg.goto(BASE + '#/daily', timeout=60000)
            await pg.wait_for_selector('.nb-dock.in', timeout=60000)
            await pg.wait_for_timeout(3000)

            # ---- storm date with the year ----
            st = await pg.evaluate("""() => { const s = RC.facts.storm, y = s.iso.slice(0, 4), cur = String(new Date().getFullYear());
              const ask = Nimbus.chatFor('ask').items.map(i => i.q), daily = Nimbus.context('daily').t, brief = Nimbus.brief().t;
              const md = s.d.replace(/,\\s*\\d{4}$/, ''), storm = q => /storm hit/.test(Nimbus.answer(q).html);
              const chipQ = ask.find(q => q.indexOf(md) >= 0) || ask[0];   // the storm chip (the four action chips come first since 10-09)
              return { d: s.d, iso: s.iso, needsYear: y !== cur, ask, daily, brief, upd: (Nimbus.updates().find(u => u.key === 'storm') || {}).t,
                typedShort: storm('Show the ' + md + ' storm'), typedFull: storm('Show the ' + md + ', ' + y + ' storm'),
                typedApos: storm('show the ' + md + " '" + y.slice(2) + ' storm'), typedOther: storm('Show the ' + md + ', ' + (+y - 1) + ' storm'),
                chip: storm(chipQ) }; }""")
            yr = st['iso'][:4]
            want = (', ' + yr) in st['d'] if st['needsYear'] else (',' not in st['d'])
            check(f'{vw} storm date year-aware ({st["d"]})', want and all((st['d'] in x) for x in [next((q for q in st['ask'] if st['d'] in q), ''), st['daily'], st['brief']]), st)
            check(f'{vw} typed date matches', st['typedShort'] and st['typedFull'] and st['typedApos'] and not st['typedOther'] and st['chip'], st)

            if vw == 1440:
                for label, key in [('CRM', 'homes'), ('Today', 'today'), ('Storms', 'storms'), ('Ask', 'ask')]:   # Homes tab is CRM (10-09)
                    await nav(pg, label)
                    for nm, it in [('next', NEXT), ('calls', CALLS)]:
                        r = await say_and_probe(pg, it)
                        await shot(pg, f'nimbus3-{key}-bubble-{nm}-1440.png')
                        check(f'1440 {key} {nm} bubble clear', not r['bubbleOver'] and not r['orbOver'], r)
                # chat chips carry the year
                await nav(pg, 'Ask')
                await pg.click('.nb-dock .nb-hit'); await pg.wait_for_timeout(900)
                chips = await pg.evaluate("[...document.querySelectorAll('.wmp-q button')].map(b => b.textContent)")
                await shot(pg, 'nimbus3-ask-chat-1440.png')
                check('1440 chat chip carries the storm date', any(st['d'] in c for c in chips), chips)
                await pg.click('.wmp-x'); await pg.wait_for_timeout(600)
            else:
                # Homes: Book dialog open -> no bubble
                await nav(pg, 'CRM')
                await frame_eval(pg, "(() => { const b = document.querySelector('[data-v=home]'); if (b && b.getAttribute('aria-pressed') !== 'true') b.click(); })()")   # CRM opens on Inbox (10-09); Book lives on the Home view
                await pg.wait_for_timeout(900)
                await frame_eval(pg, "[...document.querySelectorAll('[data-act=book]')].find(b => b.offsetParent).click()")
                await pg.wait_for_timeout(900)
                r = await say_and_probe(pg, NEXT)
                await shot(pg, 'nimbus3-homes-book-390.png')
                check('390 homes Book dialog: no bubble', r['modal'] and not r['bubbleOn'], r)
                # a bubble already up when the dialog opens steps away within one place() tick
                await frame_eval(pg, "document.getElementById('dlg').close()")
                await pg.wait_for_timeout(600)
                await pg.evaluate(f"Nimbus.say({CALLS}, 9000)")
                await pg.wait_for_timeout(500)
                await frame_eval(pg, "[...document.querySelectorAll('[data-act=book]')].find(b => b.offsetParent).click()")
                await pg.wait_for_timeout(1200)
                r = await pg.evaluate(PROBE, True)
                check('390 homes bubble leaves when Book opens', r['modal'] and not r['bubbleOn'], r)
                await frame_eval(pg, "document.getElementById('dlg').close()")
                await pg.wait_for_timeout(600)
                # Homes: pipeline board in view -> bubble never on the first card
                await frame_eval(pg, "(document.querySelector('.pc') || document.getElementById('pipePane')).scrollIntoView({block:'center'})")
                await pg.wait_for_timeout(900)
                for nm, it in [('next', NEXT), ('calls', CALLS)]:
                    r = await say_and_probe(pg, it)
                    await shot(pg, f'nimbus3-homes-board-{nm}-390.png')
                    check(f'390 homes board {nm} bubble clear', not r['bubbleOver'] and not r['orbOver'], r)
                # Today: bubble clear; Up next sheet open -> no bubble, orb off the rows
                await nav(pg, 'Today')
                r = await say_and_probe(pg, NEXT)
                await shot(pg, 'nimbus3-today-bubble-390.png')
                check('390 today bubble clear', not r['bubbleOver'], r)
                await frame_eval(pg, "document.getElementById('openList').click()")
                await pg.wait_for_timeout(1200)
                for pos in [0, 200, 400, 99999]:
                    await frame_eval(pg, f"(() => {{ document.querySelectorAll('#sheetList, #sheetList *').forEach(e => {{ if (e.scrollHeight > e.clientHeight + 4) e.scrollTop = {pos}; }}); }})()")
                    await pg.wait_for_timeout(1100)
                    r = await say_and_probe(pg, CALLS, cards=False)
                    await shot(pg, f'nimbus3-today-upnext-{pos}-390.png')
                    check(f'390 today Up next sheet scroll {pos}: no bubble, orb clear (or stepped out)', r['modal'] and not r['bubbleOn'] and not r['orbOver'], r)
                await frame_eval(pg, "document.querySelector('#sheetList [data-close]').click()")
                await pg.wait_for_timeout(800)
                # Ask: every sheet state, orb clear of the Add button and the cards' buttons
                await nav(pg, 'Ask')
                for stt in ['peek', 'half', 'full']:
                    await frame_eval(pg, f"window.__sheet('{stt}')")
                    await pg.wait_for_timeout(1500)
                    r = await pg.evaluate(PROBE, False)
                    add = await frame_eval(pg, "(() => { const b = [...document.querySelectorAll('button')].find(x => /Daily 50/.test(x.textContent) && x.offsetParent); if (!b) return null; const r = b.getBoundingClientRect(); return {t: r.top, b: r.bottom, r: r.right, txt: b.textContent.trim()}; })()")
                    await shot(pg, f'nimbus3-ask-{stt}-390.png')
                    # clear of every control when his band has a clear spot; with none, never on a button (a peeking card at most)
                    check(f'390 ask sheet {stt}: orb clear', (not r['orbOver'] or (not r['clearSpot'] and not r['orbSmallOver'])) and r['orbBottomGap'] <= 20 + 140 + 4, {**r, 'add': add})
                    rb = await say_and_probe(pg, NEXT)
                    await shot(pg, f'nimbus3-ask-{stt}-bubble-390.png')
                    check(f'390 ask sheet {stt}: bubble clear', not rb['bubbleOver'], rb)
                await pg.click('.nb-dock .nb-hit'); await pg.wait_for_timeout(900)
                await shot(pg, 'nimbus3-ask-chat-390.png')
                await pg.click('.wmp-x'); await pg.wait_for_timeout(600)

            check(f'{vw} no console errors', not errs, errs)
            await ctx.close()
        await b.close()
    print('ALL_OK' if every else 'FAIL', flush=True)

if __name__ == '__main__': asyncio.run(main())
