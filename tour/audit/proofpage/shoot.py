"""Screenshots for the Proof Page review (tour/audit/proofpage/index.html).

  python tour/audit/proofpage/shoot.py [base]   (base default http://localhost:4863, the worktree served as root)

One headless Chromium (swiftshader for the 3D record and the Today map), one context, shots in order, each written to
shots/ as it lands. The consent submitted on the Proof Page is a fake 555 number on localhost, kept in this throwaway
browser profile only. Nothing is sent anywhere: sms:/mailto: links are blocked before they open.
"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4863').rstrip('/')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')
GI = 19156            # 2017 Londonderry Dr: 1 in+ radar hail, 3 neighbours re-roofed in 90 days (turnover.json); no owner shown
os.makedirs(OUT, exist_ok=True)
log = []


async def shot(page, name, full=False, clip_sel=None):
    p = os.path.join(OUT, name)
    if clip_sel:   # clip by the element's box (an element screenshot waits for 'stable', which a live 3D page never is)
        el = page.locator(clip_sel).first
        await el.scroll_into_view_if_needed(timeout=10000)
        bb = await el.bounding_box()
        vp = page.viewport_size
        if bb and bb['height'] <= vp['height']:
            await page.screenshot(path=p, clip=bb, timeout=120000, animations='disabled')
        else:
            await el.screenshot(path=p, timeout=120000, animations='disabled')
    else:
        await page.screenshot(path=p, full_page=full, timeout=120000, animations='disabled')
    log.append(name); print('shot', name, flush=True)


async def go(page, url, until='domcontentloaded'):
    for k in range(3):   # a dropped connection (ERR_NETWORK_CHANGED) is not a page bug: try again
        try:
            return await page.goto(url, wait_until=until, timeout=90000)
        except Exception as e:
            print('retry', k + 1, url, str(e)[:80], flush=True); await page.wait_for_timeout(2000)
    raise RuntimeError('could not load ' + url)


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        page.on('console', lambda m: m.type == 'error' and print('console error:', m.text, flush=True))
        # ---------- the Proof Page, phone ----------
        await go(page, f'{BASE}/tour/proof/?h=placeholder')
        tok = await page.evaluate(f'RCP.token({GI})')
        url = f'{BASE}/tour/proof/?h={tok}&s=tshoot1'
        await go(page, url, 'networkidle')
        await page.wait_for_selector('#doc:not([hidden])', timeout=30000)
        await page.wait_for_timeout(2500)   # street map + permit counts land after the first paint
        await shot(page, 'proof-phone-top.png')
        await shot(page, 'proof-phone-full.png', full=True)
        await page.locator('#nearCard').scroll_into_view_if_needed(); await page.wait_for_timeout(300)
        await shot(page, 'proof-phone-near-street.png')
        await page.locator('#roof').scroll_into_view_if_needed(); await page.wait_for_timeout(300)
        await shot(page, 'proof-phone-roof.png')
        # book + consent
        await page.click('#bOpen'); await page.wait_for_timeout(200)
        await page.get_by_role('button', name='Saturday').click()
        await page.fill('#fPhone', '(972) 555-0142')
        await page.check('#fAgree')
        await page.locator('#form').scroll_into_view_if_needed()
        await shot(page, 'proof-phone-form.png', clip_sel='#book')
        await page.click('#bSend'); await page.wait_for_timeout(400)
        await shot(page, 'proof-phone-done.png', clip_sel='#book')
        st = await page.evaluate(f'RCP.status({GI})')
        json.dump(st, open(os.path.join(OUT, 'consent-record.json'), 'w'), indent=1)
        # ---------- the Proof Page, desktop ----------
        await page.set_viewport_size({'width': 1440, 'height': 900})
        await go(page, url + '&preview=1', 'networkidle')
        await page.wait_for_selector('#doc:not([hidden])', timeout=30000); await page.wait_for_timeout(2500)
        await shot(page, 'proof-desktop.png')
        await shot(page, 'proof-desktop-full.png', full=True)

        # ---------- the send flow: home record (desktop) ----------
        await page.add_init_script("document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href^=\"sms:\"],a[href^=\"mailto:\"]'); if (a) { e.preventDefault(); window.__handoff = a.getAttribute('href'); } }, false);")
        await go(page, f'{BASE}/tour/c5-home/index.html?home=m{GI}&dev=1')
        await page.wait_for_selector('#proofSt:not([hidden])', timeout=30000); await page.wait_for_timeout(3000)
        await shot(page, 'record-desktop-status.png')
        await page.eval_on_selector('.acts [data-act="proof"]', 'b => b.click()'); await page.wait_for_selector('.rcp-dlg[open]'); await page.wait_for_timeout(1500)
        await shot(page, 'record-desktop-dialog.png')
        for touch, label in [('storm', 'After the storm'), ('follow', 'Follow-up'), ('door', 'After the door')]:
            await page.locator('.rcp-dlg [data-g="touch"] button', has_text=label).click(); await page.wait_for_timeout(250)
            await shot(page, f'dialog-{touch}-text.png', clip_sel='.rcp-dlg')
        await page.locator('.rcp-dlg [data-g="ch"] button', has_text='Email').click(); await page.wait_for_timeout(250)
        await shot(page, 'dialog-door-email.png', clip_sel='.rcp-dlg')
        await page.locator('.rcp-dlg [data-g="ch"] button', has_text='Text').click()
        await page.locator('.rcp-dlg [data-g="touch"] button', has_text='After the storm').click(); await page.wait_for_timeout(250)
        await page.click('#rcpGo'); await page.wait_for_timeout(800)
        handoff = await page.evaluate('window.__handoff || null')
        print('hand-off href (blocked):', (handoff or '')[:90], flush=True)
        await shot(page, 'record-desktop-after-send.png')
        msg = await page.evaluate(f'({{ messaged: RC.messaged({GI}), hist: RC.history("m{GI}").slice(0, 6).map(h => h.what) }})')
        json.dump(msg, open(os.path.join(OUT, 'after-send.json'), 'w'), indent=1)
        # ---------- the send flow: home record (phone) ----------
        await page.set_viewport_size({'width': 390, 'height': 844})
        await go(page, page.url); await page.wait_for_selector('#proofSt:not([hidden])', timeout=30000); await page.wait_for_timeout(2500)
        await shot(page, 'record-phone.png')
        await page.eval_on_selector('.stick [data-act="proof"]', 'b => b.click()'); await page.wait_for_selector('.rcp-dlg[open]'); await page.wait_for_timeout(1500)
        await shot(page, 'record-phone-dialog.png')

        # ---------- Today cards (desktop) ----------
        await page.set_viewport_size({'width': 1440, 'height': 900})
        await go(page, f'{BASE}/tour/c4-command-deck/deck.html?dev=1')
        await page.wait_for_selector('[data-a="proof"]', timeout=45000); await page.wait_for_timeout(4000)
        await shot(page, 'today-desktop.png')
        await page.locator('[data-a="proof"]:visible').first.click(); await page.wait_for_selector('.rcp-dlg[open]'); await page.wait_for_timeout(1500)
        await shot(page, 'today-desktop-dialog.png')

        # ---------- the template gallery and legal checklist on the review page ----------
        await go(page, f'{BASE}/tour/audit/proofpage/index.html?noshots=1', 'networkidle'); await page.wait_for_timeout(800)
        await shot(page, 'review-templates.png', clip_sel='#templates')
        await shot(page, 'review-legal.png', clip_sel='#legal')
        await b.close()
    json.dump(log, open(os.path.join(OUT, 'shots.json'), 'w'), indent=1)
    print('done', len(log), 'shots', flush=True)

asyncio.run(main())
