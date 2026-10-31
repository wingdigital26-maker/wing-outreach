"""Pipeline v3 user-path check (Jack's testing rule): the real app shell, headless Chromium, both widths.
python test_pipe3.py [1440|390|both] [look]   -> tour/audit/shots/pipe3-<step>-<w>.png, log to stdout.
formsubmit.co is blocked, tel:/sms: links never navigate. Test data is cleared at the end."""
import asyncio, os, sys, json, time
from playwright.async_api import async_playwright

URL = "http://localhost:4886/tour/product.html?dev=1#/home"
OUT = os.path.join(os.path.dirname(__file__), "..", "audit", "shots")
NO_TEL = """document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href^="tel:"],a[href^="sms:"]');
  if (a) { e.preventDefault(); window.__telBlocked = (window.__telBlocked || 0) + 1; } }, true);"""


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


async def run(p, w, h, look_only):
    mob = w < 700
    b = await p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=1, is_mobile=mob, has_touch=mob)
    await ctx.route("**/*formsubmit.co*/**", lambda r: r.abort())
    await ctx.route("**/formsubmit.co/**", lambda r: r.abort())
    await ctx.add_init_script(NO_TEL)
    pg = await ctx.new_page()
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)))
    await pg.goto(URL, wait_until="load", timeout=60000)
    fr = None
    for _ in range(60):
        fr = next((f for f in pg.frames if "c5-home" in f.url), None)
        if fr:
            try:
                if await fr.evaluate("!!document.querySelector('#pcols .pc')"):
                    break
            except Exception:
                pass
        await pg.wait_for_timeout(1000)
    await pg.wait_for_timeout(2500)
    F = pg.frame_locator('iframe[data-screen="home"]')
    FR[:] = [fr]
    MOB[0] = mob

    async def shot(step):
        await pg.wait_for_timeout(500)
        path = os.path.join(OUT, f"pipe3-{step}-{w}.png")
        for i in range(3):
            try:
                await pg.screenshot(path=path, timeout=60000, animations="disabled")
                log("shot", os.path.basename(path)); return
            except Exception as e:
                log("shot retry", step, i, str(e)[:60])

    async def box(sel):
        return await F.locator(sel).first.bounding_box()

    # a home that sat 5 days in Called, so the stale edge shows (test data, cleared at the end)
    await fr.evaluate("""() => { const k = 'rc.t.pipe', all = JSON.parse(localStorage.getItem(k) || '{}'), t = new Date(Date.now() - 5 * 864e5).toISOString();
      all['djackson-3'] = { stage: 'called', history: [{ at: t, what: 'Called, no answer', kind: 'stage' }] };
      localStorage.setItem(k, JSON.stringify(all));
      const at = JSON.parse(localStorage.getItem('rc.t.att') || '{}'); at['djackson-3'] = [{ at: t, outcome: 'no_answer' }]; localStorage.setItem('rc.t.att', JSON.stringify(at));
      window.renderPipe(true); }""")
    await shot("01-open")
    if look_only:
        log("errors:", errs[:8]); await b.close(); return errs

    if not LATE[0]:
        cols = 'iframe[data-screen="home"]'
        # filter by city
        await tap(F, fr, "#pfBtn")
        cities = await fr.evaluate("[...document.querySelectorAll('#pfCity option')].map(o=>o.value).filter(Boolean)")
        log("cities", cities)
        city = cities[1] if len(cities) > 1 else cities[0]
        await F.locator("#pfCity").select_option(city)
        n = await fr.evaluate("document.querySelectorAll('#pcols .pc').length")
        log("filter city", city, "cards", n, await fr.evaluate("document.querySelector('.pshow').textContent"))
        await shot("02-filter-city")
        await tap(F, fr, "#pfClear"); await tap(F, fr, "#pfBtn")
        # search an address
        await F.locator("#pq").fill("Roundtree")
        await pg.wait_for_timeout(400)
        log("search", await fr.evaluate("[...document.querySelectorAll('#pcols .pc b')].map(b=>b.textContent)"))
        await shot("03-search")
        await F.locator("#pq").fill(""); await pg.wait_for_timeout(400)
        # sort by most hail, then longest in stage
        await F.locator("#psort").select_option("hail"); await pg.wait_for_timeout(300)
        log("sort hail", await fr.evaluate("[...document.querySelectorAll('.pcol[data-drop=new] .phail')].slice(0,4).map(b=>b.textContent)"))
        await F.locator("#psort").select_option("age"); await pg.wait_for_timeout(300)
        await shot("04-sort")
        await F.locator("#psort").select_option("new")

        # drag the first New hit card to Inspection booked -> pick a time
        target_id = await fr.evaluate("document.querySelector('.pcol[data-drop=new] .pc').dataset.id")
        if mob:
            await long_press_drag(pg, F, fr, target_id, "inspection")
        else:
            await mouse_drag(pg, F, target_id, '.pcol[data-drop="inspection"]')
        await pg.wait_for_timeout(600)
        log("dialog open", await fr.evaluate("document.getElementById('dlg').open"), await fr.evaluate("document.getElementById('dlgTitle').textContent"))
        await shot("05-drop-booked-picker")
        await tap(F, fr, "#bkGo"); await pg.wait_for_timeout(500)
        log("booked", target_id, await fr.evaluate(f"RC.stage('{target_id}')"), await fr.evaluate(f"RC.booking('{target_id}')"))
        await shot("06-booked")
        # cancel path: a second card dropped on Inspection booked, then Cancel -> stays
        t2 = await fr.evaluate("document.querySelector('.pcol[data-drop=new] .pc').dataset.id")
        await menu_move(F, t2, "inspection")
        await tap(F, fr, "#bkNo"); await pg.wait_for_timeout(400)
        log("cancel booking ->", t2, await fr.evaluate(f"RC.stage('{t2}')"))

        # move one to Won -> confirm
        await menu_move(F, target_id, "won")
        log("won dialog", await fr.evaluate("document.getElementById('dlgTitle').textContent"))
        await shot("07-won-confirm")
        await tap(F, fr, "#wonGo"); await pg.wait_for_timeout(500)
        log("won", await fr.evaluate(f"RC.stage('{target_id}')"), await fr.evaluate("document.querySelector('.pcol[data-drop=won] .psub').textContent"))
        await scroll_to_col(fr, "won")
        await shot("08-won")

        # send one to Not now -> open lane -> restore
        await menu_move(F, t2, "lost")
        log("parked", await fr.evaluate("document.querySelector('.plane .pnum').textContent"))
        await scroll_to_col(fr, "lost")
        await shot("09-not-now")
        await tap(F, fr, ".plt"); await pg.wait_for_timeout(500)
        await scroll_to_col(fr, "lost")
        await shot("10-lane-open")
        await tap(F, fr, f'.pc[data-id="{t2}"] .prs'); await pg.wait_for_timeout(500)
        log("restored", t2, await fr.evaluate(f"RC.stage('{t2}')"), await fr.evaluate(f"!!(RC.pipeline()['{t2}']||{{}}).archived"))
        await tap(F, fr, ".plt")
        await scroll_to_col(fr, "new")
        await shot("11-restored")

    if SWIPE[0]:
        await fr.evaluate("document.getElementById('pcols').scrollIntoView({block:'start'})")
        await swipe(pg, F, fr); await shot("15-swipe"); log("errors:", errs[:10]); await b.close(); return errs
    # full board, drag there, Esc
    await tap(F, fr, "#pfullBtn"); await pg.wait_for_timeout(700)
    await shot("12-full-board")
    t3 = await fr.evaluate("document.querySelector('.pcol[data-drop=new] .pc').dataset.id")
    if mob:
        await long_press_drag(pg, F, fr, t3, "called")
    else:
        await mouse_drag(pg, F, t3, '.pcol[data-drop="called"]')
    await pg.wait_for_timeout(500)
    log("full-board drag", t3, await fr.evaluate(f"RC.stage('{t3}')"))
    await shot("13-full-drag")
    await F.locator("#pfullBtn").focus()
    await pg.keyboard.press("Escape"); await pg.wait_for_timeout(600)
    log("after esc full", await fr.evaluate("document.body.classList.contains('pfull')"))
    await shot("14-esc")

    if mob:
        # phone: swipe the columns, long-press drag a card
        await scroll_to_col(fr, "new")
        await swipe(pg, F, fr)
        await shot("15-swipe")
        t4 = await fr.evaluate("document.querySelector('.pcol[data-drop=new] .pc').dataset.id")
        await scroll_to_col(fr, "new")
        await long_press_drag(pg, F, fr, t4, "called", shot_mid=lambda: shot("16-longpress"))
        log("long-press drag", t4, await fr.evaluate(f"RC.stage('{t4}')"))
        await shot("17-longpress-dropped")

    # corner check: nothing of the board in the bottom-right 120x120
    corner = await fr.evaluate("""() => { const W = innerWidth, H = innerHeight; return [...document.querySelectorAll('.pipe, .pcol, .ptools')].filter(e => {
      const r = e.getBoundingClientRect(); return r.width && r.right > W - 120 && r.bottom > H - 120 && r.top < H; }).map(e => e.className).slice(0, 4); }""")
    log("corner overlap", corner)
    tel = await pg.evaluate("window.__telBlocked||0")
    # clear test data
    await fr.evaluate("""() => { ['rc.t.pipe','rc.t.att','rc.t.hopened','rc.pipe.seen','rc.pipe.view','rc.t.homes'].forEach(k => localStorage.removeItem(k)); }""")
    left = await fr.evaluate("Object.keys(localStorage).filter(k=>/^rc\\.(t\\.(pipe|att)|pipe\\.)/.test(k))")
    log("test data left:", left, "tel blocked:", tel)
    log("errors:", errs[:10])
    await b.close()
    return errs


async def tap(F, fr, sel):
    """centre the control, click it; if a passing shell notice covers it, wait and try again"""
    for i in range(4):
        try:
            await fr.evaluate(f"""(() => {{ const e = document.querySelector('{sel}'); if (e) e.scrollIntoView({{block:'center'}}); }})()""")
            if i < 2 and not MOB[0]:
                await F.locator(sel).first.click(timeout=6000)
            else:   # the slow software renderer never lets the element read as stable: click it in the page
                ok = await fr.evaluate(f"(() => {{ const e = document.querySelector('{sel}'); if (!e) return false; e.click(); return true; }})()")
                log("dom click", sel, ok)
                if not ok: raise RuntimeError("missing " + sel)
            return
        except Exception as e:
            log("retry tap", sel, i, str(e)[-260:].replace(chr(10), ' | ')); await asyncio.sleep(2)
    raise RuntimeError("could not tap " + sel)


async def scroll_to_col(fr, key):
    await fr.evaluate(f"""() => {{ const c = document.querySelector('.pcol[data-drop="{key}"]'), cols = document.getElementById('pcols');
      cols.scrollLeft = c.offsetLeft - cols.offsetLeft - 12; const r = cols.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) cols.scrollIntoView({{block:'nearest'}}); }}""")
    await asyncio.sleep(0.4)


async def menu_move(F, card_id, to):
    # the board re-renders on every change, so re-find the card each try
    for i in range(4):
        try:
            if i < 2 and not MOB[0]:
                await F.locator(f'.pc[data-id="{card_id}"] .pmv').click(timeout=8000)
                await F.locator(f'.pmenu [data-to="{to}"]').click(timeout=5000)
            else:
                ok = await FR[0].evaluate(f"""(() => {{ const m = document.querySelector('.pmenu'); if (m) m.remove();
                  const b = document.querySelector('.pc[data-id="{card_id}"] .pmv'); if (!b) return 'no card'; b.click();
                  const t = document.querySelector('.pmenu [data-to="{to}"]'); if (!t) return 'no item'; t.click(); return 'ok'; }})()""")
                log("dom menu", card_id, to, ok)
            break
        except Exception as e:
            log("retry menu", i, str(e)[-200:].replace(chr(10), ' | ')); await asyncio.sleep(0.6)
    await asyncio.sleep(0.5)


async def mouse_drag(pg, F, card_id, target_sel):
    c = F.locator(f'.pc[data-id="{card_id}"] .pco b')
    await c.scroll_into_view_if_needed()
    bb = await c.bounding_box()
    await F.locator(target_sel).first.scroll_into_view_if_needed()
    tb = await F.locator(target_sel).first.bounding_box()
    bb = await c.bounding_box()
    x0, y0 = bb["x"] + 20, bb["y"] + bb["height"] / 2
    x1, y1 = tb["x"] + tb["width"] / 2, tb["y"] + 70
    await pg.mouse.move(x0, y0); await pg.mouse.down()
    for i in range(1, 13):
        await pg.mouse.move(x0 + (x1 - x0) * i / 12, y0 + (y1 - y0) * i / 12)
        await asyncio.sleep(0.03)
    await asyncio.sleep(0.2)
    await pg.mouse.up()


CDP = {}
FR = [None]
MOB = [False]
LATE = [False]
SWIPE = [False]
async def touch(pg, typ, x, y):
    # one CDP session per page, so a touch sequence (start, moves, end) stays one gesture
    if id(pg) not in CDP:
        CDP[id(pg)] = await pg.context.new_cdp_session(pg)
    await CDP[id(pg)].send("Input.dispatchTouchEvent", {"type": typ, "touchPoints": [] if typ == "touchEnd" else [{"x": x, "y": y}]})


async def long_press_drag(pg, F, fr, card_id, to, shot_mid=None):
    # bring both the card and the target column into view: drop on the stage count strip (a drop target too)
    c = F.locator(f'.pc[data-id="{card_id}"] .pco b')
    await c.scroll_into_view_if_needed()
    bb = await c.bounding_box()
    tb = await F.locator(f'.pcn[data-drop="{to}"]').bounding_box()
    if tb["y"] < 60 or bb["y"] > 800:
        await fr.evaluate("document.getElementById('pcount').scrollIntoView({block:'start'})")
        await asyncio.sleep(0.4)
        bb = await c.bounding_box(); tb = await F.locator(f'.pcn[data-drop="{to}"]').bounding_box()
    x0, y0 = bb["x"] + 20, bb["y"] + bb["height"] / 2
    x1, y1 = tb["x"] + tb["width"] / 2, tb["y"] + tb["height"] / 2
    await touch(pg, "touchStart", x0, y0)
    await asyncio.sleep(0.6)
    for i in range(1, 11):
        await touch(pg, "touchMove", x0 + (x1 - x0) * i / 10, y0 + (y1 - y0) * i / 10)
        await asyncio.sleep(0.04)
    if shot_mid:
        await shot_mid()
    await touch(pg, "touchEnd", x1, y1)
    await asyncio.sleep(0.6)


async def swipe(pg, F, fr):
    bb = await F.locator("#pcols").bounding_box()
    y = bb["y"] + 60
    before = await fr.evaluate("document.getElementById('pcols').scrollLeft")
    x0 = bb["x"] + bb["width"] - 40
    # a finger swipe right to left across the columns (Chromium's touch scroll gesture)
    if id(pg) not in CDP:
        CDP[id(pg)] = await pg.context.new_cdp_session(pg)
    await CDP[id(pg)].send("Input.synthesizeScrollGesture", {"x": x0, "y": y, "xDistance": -260, "yDistance": 0, "gestureSourceType": "touch", "speed": 900})
    await asyncio.sleep(1.2)
    if not await fr.evaluate("document.getElementById('pcols').scrollLeft"):
        # this headless build turns no synthetic touch gesture into a scroll (a vertical page swipe fails the same way,
        # see test_swipe.py), so the same horizontal gesture goes in as a wheel/trackpad swipe
        log("touch scroll gesture not applied by headless Chromium; wheel swipe fallback")
        await CDP[id(pg)].send("Input.synthesizeScrollGesture", {"x": x0, "y": y, "xDistance": -260, "yDistance": 0, "gestureSourceType": "mouse", "speed": 900})
        await asyncio.sleep(1.2)
    log("swipe scrollLeft", before, "->", await fr.evaluate("document.getElementById('pcols').scrollLeft"))


async def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "both"
    look = "look" in sys.argv
    LATE[0] = "late" in sys.argv or "swipe" in sys.argv
    SWIPE[0] = "swipe" in sys.argv
    sizes = [(1440, 900), (390, 844)] if which == "both" else [(int(which), 900 if which == "1440" else 844)]
    async with async_playwright() as p:
        for w, h in sizes:
            log("=== width", w)
            try:
                await run(p, w, h, look)
            except Exception as e:
                log("FAILED", w, repr(e)[:400])
asyncio.run(main())
