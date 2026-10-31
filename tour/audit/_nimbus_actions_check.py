"""Nimbus live actions (10-09): the four chips answer from this device's data and open the right place.
Fresh profile on :4886, 1440x900 then 390x844. Seeds texts, a reply and an overdue follow-up through RC, then from the chat:
  - Draft today's texts: routes Today to the next open stop and opens its text draft (dialog) inside texting hours
  - Who replied?: counts the homes whose latest record is the homeowner's reply, opens the inbox on Replied
  - What's due today?: counts due / overdue by RC.cadence (the Today frame's follow-up clock), opens the inbox on Overdue
  - Biggest storm this month: names the catalog's biggest storm of the month (or the latest month with hail), opens Storms on it
Also: the orb is 64 / 52 px (hit >= 44), and Nimbus.updates() runs once the route exists (the routeToday crash of 10-09).
Nothing is sent: formsubmit.co is blocked and no sms:/mailto: navigation is followed. rc.* storage is cleared at the end.
Run: python tour/audit/_nimbus_actions_check.py  -> ALL_OK or FAIL. Shots: shots/nimbus-act-*.png"""
import asyncio, json, os
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__)); SHOTS = os.path.join(HERE, 'shots')
GPU = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
BASE = 'http://localhost:4886/tour/product.html?dev=1'
CLEAR = "() => { [localStorage, sessionStorage].forEach(st => Object.keys(st).filter(k => k.indexOf('rc.') === 0 && k !== 'rc.dev').forEach(k => st.removeItem(k))); return true; }"


async def shot(pg, name):
    try: await pg.screenshot(path=os.path.join(SHOTS, name), timeout=60000, animations='disabled')
    except Exception as e: print('shot failed', name, str(e)[:80], flush=True)


async def daily_ready(pg):
    for _ in range(120):
        ok = await pg.evaluate("(() => { const f = document.querySelector('#f iframe[data-screen=daily]'); try { return !!(f && f.contentWindow && f.contentWindow.RC && f.contentWindow.RC.daily && f.contentWindow.RC.daily().length && f.contentDocument.querySelector('.card[data-i]')); } catch (e) { return false; } })()")
        if ok: return True
        await pg.wait_for_timeout(500)
    return False


async def open_chat(pg):
    if not await pg.evaluate("document.querySelector('.wmp').classList.contains('open')"):
        await pg.click('.nb-dock .nb-hit')
    await pg.wait_for_timeout(900)


async def chip(pg, label):
    await open_chat(pg)
    await pg.evaluate("(l) => { const b = [...document.querySelectorAll('.wmp-q button')].find(x => x.textContent.trim() === l); if (!b) throw new Error('no chip ' + l); b.click(); }", label)
    await pg.wait_for_timeout(2600)   # the typed answer, the 900 ms hand-off, the frame's follow-through
    return await pg.evaluate("document.querySelector('.wmp-body').textContent.trim()")


async def main():
    os.makedirs(SHOTS, exist_ok=True); every = True

    def check(name, ok, info=''):
        nonlocal every; every &= bool(ok)
        print(('PASS ' if ok else 'FAIL ') + name, (json.dumps(info)[:300] if info != '' else ''), flush=True)

    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, args=GPU)
        for vw, vh in [(1440, 900), (390, 844)]:
            ctx = await b.new_context(viewport={'width': vw, 'height': vh}, device_scale_factor=1, is_mobile=vw < 600, has_touch=vw < 600)
            await ctx.route('**/formsubmit.co/**', lambda r: r.abort())
            pg = await ctx.new_page()
            await pg.clock.install(time='2026-10-08T16:00:00Z')   # Thu 11 am Central: texting hours open
            errs = []
            pg.on('pageerror', lambda e: errs.append('pageerror ' + str(e)[:160]))
            pg.on('console', lambda m: errs.append('console ' + m.text[:160]) if m.type == 'error' else None)
            await pg.goto(BASE + '#/daily', timeout=60000)
            await pg.wait_for_selector('.nb-dock.in', timeout=60000)
            await pg.evaluate(CLEAR); await pg.reload(); await pg.wait_for_selector('.nb-dock.in', timeout=60000)
            check(f'{vw} Today list ready', await daily_ready(pg))
            # the orb
            d = await pg.evaluate("(() => { const r = document.querySelector('.nb-dock').getBoundingClientRect(), h = document.querySelector('.nb-dock .nb-hit').getBoundingClientRect(); return { size: Math.round(r.width), hit: Math.round(h.width) }; })()")
            check(f'{vw} orb is {64 if vw > 600 else 52}px with a 44px+ hit target', d['size'] == (64 if vw > 600 else 52) and d['hit'] >= 44, d)
            # seed: through the Today frame's RC (same localStorage): stop 1 texted today, stop 2 texted + a reply, stop 3 texted 10 days ago (day 7 overdue)
            seed = await pg.evaluate("""() => { const w = document.querySelector('#f iframe[data-screen=daily]').contentWindow, RC = w.RC, d = RC.daily();
              const a = d[0].id, b = d[1].id, c = d[2].id;
              RC.logText(a, 'Text drafted in Messages', { body: 'hello', to: '5550100' });
              RC.logText(b, 'Text drafted in Messages', { body: 'hello', to: '5550101' }); RC.logReply(b, 'Yes, come by Friday', 'text');
              const all = JSON.parse(localStorage.getItem('rc.t.pipe') || '{}'); all[c] = { stage: 'called', history: [{ at: new Date(Date.now() - 10 * 864e5).toISOString(), what: 'Text drafted in Messages', kind: 'text' }] };
              localStorage.setItem('rc.t.pipe', JSON.stringify(all));
              return { a, b, c, n: d.length }; }""")
            await pg.wait_for_timeout(800)
            # the brain, straight: counts from the seed
            r = await pg.evaluate("(() => ({ replied: Nimbus.actions.replied().map(x => x.id), due: Nimbus.actions.due(), big: Nimbus.actions.biggestThisMonth(), next: Nimbus.actions.nextDraft(), upd: Nimbus.updates().length }))()")
            check(f'{vw} Who replied = the one home whose latest record is a reply', r['replied'] == [seed['b']], r['replied'])
            check(f'{vw} due counts come from RC.cadence (1 overdue: day 7 follow-up 10 days after the text)', r['due'] and r['due']['late'] >= 1, r['due'])
            check(f'{vw} biggest storm of the month found in the catalog', r['big'] and r['big']['s'] and r['big']['s']['date'], r['big'] and r['big']['s'] and r['big']['s']['date'])
            check(f'{vw} Nimbus.updates() runs with a route on this device (no routeToday crash)', isinstance(r['upd'], int), r['upd'])
            # chips from the chat
            await open_chat(pg)
            chips = await pg.evaluate("[...document.querySelectorAll('.wmp-q button')].map(b => b.textContent.trim())")
            check(f'{vw} the four action chips lead the chat', chips[:4] == ["Draft today's texts", 'Who replied?', "What's due today?", 'Biggest storm this month'], chips)
            await shot(pg, f'nimbus-act-chat-{vw}.png')
            t = await chip(pg, 'Who replied?')
            st = await pg.evaluate("(() => { const d = document.querySelector('#f iframe[data-screen=daily]').contentDocument; const f = d.querySelector('#paneInbox [data-f][aria-pressed=\"true\"]'); return { screen: location.hash, tab: (d.getElementById('tabInbox') || {}).getAttribute && d.getElementById('tabInbox').getAttribute('aria-selected'), filter: f && f.dataset.f, rows: d.querySelectorAll('#paneInbox .irow').length }; })()")
            check(f'{vw} Who replied: answer names 1 home and the inbox opens on Replied', '1 home replied' in t and st['screen'].startswith('#/daily') and st['tab'] == 'true' and st['filter'] == 'reply' and st['rows'] == 1, {'t': t[:120], **st})
            await shot(pg, f'nimbus-act-replied-{vw}.png')
            t = await chip(pg, "What's due today?")
            st = await pg.evaluate("(() => { const d = document.querySelector('#f iframe[data-screen=daily]').contentDocument; const f = d.querySelector('#paneInbox [data-f][aria-pressed=\"true\"]'); return { filter: f && f.dataset.f, rows: d.querySelectorAll('#paneInbox .irow').length }; })()")
            check(f"{vw} What's due today: counts, then the inbox on Overdue", 'overdue' in t and st['filter'] == 'late' and st['rows'] >= 1, {'t': t[:120], **st})
            await shot(pg, f'nimbus-act-due-{vw}.png')
            t = await chip(pg, "Draft today's texts")
            st = await pg.evaluate("(() => { const d = document.querySelector('#f iframe[data-screen=daily]').contentDocument; const dlg = d.querySelector('dialog[open]'); return { screen: location.hash, dlg: !!dlg, title: dlg ? (dlg.querySelector('h3') || {}).textContent : '', body: dlg ? !!dlg.querySelector('#dBody, #dBody0') : false }; })()")
            check(f"{vw} Draft today's texts: Today on the next open stop with its text draft open", 'Next up' in t and st['dlg'] and st['title'].startswith('Text ') and st['body'], {'t': t[:120], **st})
            check(f'{vw} the draft stays a draft (no sms: navigation happened)', (await pg.evaluate("location.href")).startswith('http://localhost:4886/tour/product.html'))
            await shot(pg, f'nimbus-act-draft-{vw}.png')
            await pg.evaluate("(() => { const d = document.querySelector('#f iframe[data-screen=daily]').contentDocument; const dlg = d.querySelector('dialog[open]'); if (dlg) dlg.close(); })()")
            await pg.wait_for_timeout(500)
            t = await chip(pg, 'Biggest storm this month')
            await pg.wait_for_timeout(1500)
            iso = r['big']['s']['date']
            check(f'{vw} Biggest storm this month: names the storm and opens Storms on it', 'homes at 1 in or more' in t and location_ok(await pg.evaluate("location.hash"), iso), {'t': t[:120], 'hash': await pg.evaluate("location.hash")})
            await shot(pg, f'nimbus-act-storm-{vw}.png')
            check(f'{vw} no console errors', not errs, errs)
            await pg.evaluate(CLEAR)
            await ctx.close()
        await b.close()
    print('ALL_OK' if every else 'FAIL', flush=True)


def location_ok(h, iso):
    return h.startswith('#/storm') and iso in h


if __name__ == '__main__': asyncio.run(main())
