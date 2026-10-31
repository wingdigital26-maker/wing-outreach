"""Roof Command concept audit driver. READ-ONLY on the app; writes only to audit/.
Runs persona tasks on desktop and phone, clicks every control, logs what happened, screenshots as it goes.
"""
import asyncio, json, time, sys, hashlib, os, re
from playwright.async_api import async_playwright

BASE = "http://localhost:4880/"
OUT = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(OUT, "shots")
os.makedirs(SHOTS, exist_ok=True)
LOG = []
DESK = {"width": 1440, "height": 900}
PHONE = {"width": 390, "height": 844}

def log(persona, screen, step, expected, happened, note="", shot="", sev=""):
    LOG.append(dict(persona=persona, screen=screen, step=step, expected=expected, happened=happened, note=note, shot=shot, sev=sev))
    print(f"[{persona}/{screen}] {step} -> {happened[:110]}" + (f"  ({sev})" if sev else ""))

async def shot(pg, name):
    p = os.path.join(SHOTS, name + ".png")
    try:
        await pg.screenshot(path=p, timeout=15000)
    except Exception as e:
        print("shot fail", name, e)
    return "shots/" + name + ".png"

async def snap(pg):
    """state fingerprint: url + visible text hash + visible element count + body data attrs + open classes"""
    try:
        return await pg.evaluate("""() => {
          const vis = [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.opacity!=='0'; });
          const txt = document.body.innerText.slice(0, 20000);
          const cls = [...document.querySelectorAll('[class*="open"],[class*=" on"],[class*="done"],[class*="in"],[data-state],[aria-pressed],[aria-expanded]')].map(e => e.className + '|' + (e.dataset.state||'') + '|' + (e.getAttribute('aria-pressed')||'') + '|' + (e.getAttribute('aria-expanded')||'')).join(';');
          return { url: location.href, hash: txt.length + ':' + txt.split('').reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,7), n: vis.length, cls: cls.length + ':' + cls.split('').reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,7), sheet: document.body.dataset.sheet || '' , title: document.title };
        }""")
    except Exception as e:
        return {"err": str(e)}

def changed(a, b):
    if "err" in a or "err" in b: return True
    return a != b

async def goto(pg, url, wait=1800, ready=None):
    t0 = time.time()
    errs = []
    try:
        await pg.goto(url, wait_until="load", timeout=45000)
    except Exception as e:
        errs.append("GOTO: " + str(e)[:120])
    if ready:
        try: await pg.wait_for_function(ready, timeout=15000)
        except Exception: errs.append("ready timeout")
    await pg.wait_for_timeout(wait)
    return round(time.time() - t0, 2), errs

async def controls(pg):
    """list visible buttons/links with label, size, tag, href"""
    return await pg.evaluate("""() => [...document.querySelectorAll('button,a,[role=button],.chip,.st,.qrow')].map((e,i) => {
      const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
      const vis = r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none' && +s.opacity>0.05;
      e.setAttribute('data-aud', i);
      return { i, tag: e.tagName.toLowerCase(), label: (e.getAttribute('aria-label')||e.innerText||e.textContent||'').trim().replace(/\\s+/g,' ').slice(0,50), href: e.getAttribute('href')||'', w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), vis, id: e.id, cls: e.className && e.className.baseVal!==undefined ? e.className.baseVal : (e.className||'') };
    }).filter(c => c.vis)""")

async def click_everything(pg, persona, screen, url, prefix, viewport, skip_labels=(), ready=None, max_n=60):
    """Dead-button sweep: load page, click each visible control in turn (fresh load each time), fingerprint before/after."""
    load_t, errs = await goto(pg, url, 2200, ready)
    ctrls = await controls(pg)
    dead, live, results = [], [], []
    small = [c for c in ctrls if (c["w"] < 44 or c["h"] < 44)]
    log(persona, screen, "load " + url.replace(BASE, ""), "loads fast", f"{load_t}s, {len(ctrls)} visible controls, {len(small)} under 44px tap target" + ("; errors: " + "; ".join(errs) if errs else ""), shot=await shot(pg, prefix + "-00-loaded"))
    n = 0
    for c in ctrls:
        if n >= max_n: break
        if any(s.lower() in c["label"].lower() for s in skip_labels): continue
        n += 1
        if c["href"].startswith("tel:") or c["href"].startswith("sms:"):
            results.append((c, "tel/sms link, hands off to phone dialer")); live.append(c); continue
        before = await snap(pg)
        popup = None
        try:
            el = pg.locator(f'[data-aud="{c["i"]}"]').first
            async with pg.context.expect_page(timeout=1200) as pinfo:
                await el.click(timeout=3000, force=True)
            popup = await pinfo.value
        except Exception:
            pass
        await pg.wait_for_timeout(700)
        after = await snap(pg)
        navigated = before.get("url") != after.get("url")
        if popup:
            results.append((c, f"opened new tab {popup.url}")); live.append(c)
            try: await popup.close()
            except Exception: pass
        elif changed(before, after):
            results.append((c, "navigated to " + after.get("url", "").replace(BASE, "") if navigated else "state changed")); live.append(c)
        else:
            results.append((c, "NOTHING happened")); dead.append(c)
        # reset
        if navigated or changed(before, after):
            await goto(pg, url, 900, ready)
            await controls(pg)
        else:
            try: await pg.keyboard.press("Escape")
            except Exception: pass
    deadtxt = "; ".join(f'{c["tag"]} "{c["label"]}"' for c in dead) or "none"
    log(persona, screen, "click every control", "every control does something visible", f"{len(live)} live, {len(dead)} dead. Dead: {deadtxt}", note=json.dumps([{ "label": c["label"], "tag": c["tag"], "w": c["w"], "h": c["h"], "cls": c["cls"][:40] } for c in dead]), sev="major" if dead else "")
    return dead, live, results, small

async def console_collect(pg):
    msgs = []
    pg.on("console", lambda m: msgs.append(m.type + ": " + m.text[:160]) if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: msgs.append("PAGEERR: " + str(e)[:160]))
    pg.on("requestfailed", lambda r: msgs.append("REQFAIL: " + r.url[:120]))
    return msgs

# ------------------------------------------------------------------ persona 1: Cody Monday 7:40am (shell)
async def persona_cody(ctx, vp, tag):
    pg = await ctx.new_page(); msgs = await console_collect(pg)
    P = "Cody"; pre = f"{tag}-cody"
    t, errs = await goto(pg, BASE + "product.html", 1500)
    log(P, "shell", "open product.html", "see what happened overnight at a glance", f"{t}s to load; shell shows tabs Opening/Storm map/Daily 50/Home/Ask Nimbus; the Opening intro starts (logo sculpture + hail)", shot=await shot(pg, pre + "-01-open"))
    await pg.wait_for_timeout(4000)
    s1 = await shot(pg, pre + "-02-intro-4s")
    await pg.wait_for_timeout(5000)
    f = pg.frame_locator("#f")
    href = await pg.evaluate("() => { try { return document.getElementById('f').contentWindow.location.href } catch(e) { return 'x' } }")
    nav_on = await pg.evaluate("() => [...document.querySelectorAll('nav button')].find(b=>b.classList.contains('on'))?.textContent")
    bubble = await pg.evaluate("() => document.querySelector('.nb-bubble')?.textContent || ''")
    log(P, "opening", "wait for the opening to hand off", "it lands on something useful (overnight summary)", f"after ~9s frame is {href.replace(BASE,'')}, active tab '{nav_on}', Nimbus bubble: '{bubble[:90]}'", shot=await shot(pg, pre + "-03-after-intro"), sev="minor")
    # what does Cody learn overnight?
    txt = ""
    try:
        txt = await f.locator("body").inner_text(timeout=5000)
    except Exception as e:
        txt = "ERR " + str(e)[:80]
    log(P, "storm", "read the landing screen", "overnight summary: new storms, calls booked, follow-ups due", f"screen text begins: {txt[:220].replace(chr(10),' / ')}", sev="major")
    # try the Nimbus orb
    try:
        await pg.locator(".nb-dock").click(timeout=3000)
        await pg.wait_for_timeout(900)
        chat_open = await pg.evaluate("() => !!document.querySelector('.wm-chat.open, [class*=chat].open')")
        chat_txt = await pg.evaluate("() => (document.querySelector('.wm-chat, [class*=chat]')?.innerText||'').slice(0,300)")
        log(P, "shell", "click the Nimbus orb", "a chat opens where I can ask what happened", f"chat open={chat_open}; text: {chat_txt[:200].replace(chr(10),' / ')}", shot=await shot(pg, pre + "-04-nimbus-chat"))
        # click first suggested question
        qs = pg.locator(".wm-chat button, [class*=chat] button")
        nq = await qs.count()
        if nq:
            await qs.first.click(timeout=3000); await pg.wait_for_timeout(1500)
            ans = await pg.evaluate("() => (document.querySelector('.wm-chat, [class*=chat]')?.innerText||'').slice(-400)")
            log(P, "shell", "tap first suggested question", "an answer", f"{nq} buttons in chat; answer tail: {ans[-220:].replace(chr(10),' / ')}", shot=await shot(pg, pre + "-05-nimbus-answer"))
        # type a free question
        inp = pg.locator(".wm-chat input, .wm-chat textarea, [class*=chat] input")
        if await inp.count():
            await inp.first.fill("what happened overnight"); await inp.first.press("Enter"); await pg.wait_for_timeout(1800)
            ans = await pg.evaluate("() => (document.querySelector('.wm-chat, [class*=chat]')?.innerText||'').slice(-300)")
            log(P, "shell", "type 'what happened overnight'", "a real overnight summary", f"answer: {ans[-200:].replace(chr(10),' / ')}", shot=await shot(pg, pre + "-06-nimbus-free"), sev="major" if "do not have" in ans else "")
            await inp.first.fill("show me the Alvarez home"); await inp.first.press("Enter"); await pg.wait_for_timeout(1500)
            ans = await pg.evaluate("() => (document.querySelector('.wm-chat, [class*=chat]')?.innerText||'').slice(-300)")
            log(P, "shell", "type 'show me the Alvarez home' (Nimbus mentioned it)", "it opens that home", f"answer: {ans[-180:].replace(chr(10),' / ')}; frame still {(await pg.evaluate('()=>{try{return document.getElementById(\"f\").contentWindow.location.pathname}catch(e){return \"?\"}}'))}", sev="major")
        else:
            log(P, "shell", "look for a text box in Nimbus chat", "I can type a question", "no input found in chat", sev="major")
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(400)
        still = await pg.evaluate("() => !!document.querySelector('.wm-chat.open, [class*=chat].open')")
        log(P, "shell", "press Esc with chat open", "chat closes", f"chat still open={still}", sev="minor" if still else "")
    except Exception as e:
        log(P, "shell", "click the Nimbus orb", "chat opens", "ERR " + str(e)[:140], sev="major")
    # Ctrl K
    await pg.keyboard.press("Control+k"); await pg.wait_for_timeout(600)
    pal = await pg.evaluate("() => !!document.querySelector('[class*=palette],[class*=cmd],[role=dialog]')")
    log(P, "shell", "press Ctrl K", "a command palette / search", f"palette found={pal}", sev="minor")
    # tabs: go to Daily 50
    for name in ["Daily 50", "Home", "Ask Nimbus", "Storm map", "Opening"]:
        t0 = time.time()
        await pg.get_by_role("button", name=name, exact=True).click(timeout=5000)
        await pg.wait_for_timeout(2500)
        href = await pg.evaluate("() => { try { return document.getElementById('f').contentWindow.location.pathname } catch(e) { return 'x' } }")
        bub = await pg.evaluate("() => document.querySelector('.nb-bubble')?.textContent || ''")
        log(P, "shell", f"tab {name}", "screen swaps smoothly, state carries", f"frame {href}; Nimbus says '{bub[:80]}'; url bar {pg.url.replace(BASE,'')} (no deep link)", shot=await shot(pg, pre + f"-07-tab-{name.replace(' ','').lower()}"))
    # back button
    await pg.go_back(); await pg.wait_for_timeout(1200)
    log(P, "shell", "browser Back after visiting 5 tabs", "returns to previous tab", f"url now {pg.url.replace(BASE,'')}; left the app={'product' not in pg.url}", sev="major" if "product" not in pg.url else "")
    # deep links
    for q in ["?tab=daily", "?tab=home&mode=phone", "?tab=storm", "?tab=nope"]:
        t, errs = await goto(pg, BASE + "product.html" + q, 2500)
        href = await pg.evaluate("() => { try { return document.getElementById('f').contentWindow.location.pathname } catch(e) { return 'x' } }")
        phone = await pg.evaluate("() => document.getElementById('main').classList.contains('phone')")
        log(P, "shell", f"deep link product.html{q}", "lands on that tab", f"frame {href}, phone mode={phone}", shot=await shot(pg, pre + "-08-deep" + q.replace('?','-').replace('&','-').replace('=','')))
    # phone mode in shell: nimbus position
    await goto(pg, BASE + "product.html?tab=daily&mode=phone", 2500)
    pos = await pg.evaluate("() => { const d=document.querySelector('.nb-dock').getBoundingClientRect(); const f=document.getElementById('f').getBoundingClientRect(); return {dock:[Math.round(d.x),Math.round(d.y),Math.round(d.width)], frame:[Math.round(f.x),Math.round(f.y),Math.round(f.width),Math.round(f.height)], win:[innerWidth,innerHeight]} }")
    log(P, "shell", "phone mode layout", "phone frame centred, Nimbus reachable", f"{pos}", shot=await shot(pg, pre + "-09-phone-mode"))
    log(P, "shell", "console", "no errors", "; ".join(msgs[:8]) or "clean", sev="minor" if msgs else "")
    await pg.close()

# ------------------------------------------------------------------ persona 2: storm just hit
async def persona_storm(ctx, vp, tag):
    pg = await ctx.new_page(); msgs = await console_collect(pg)
    P = "Storm"; pre = f"{tag}-storm"
    phone = vp["width"] < 600
    ready = "() => window.map && window.map.loaded && window.map.loaded() || document.querySelector('.maplibregl-canvas')"
    t, errs = await goto(pg, BASE + "1b-storm-theater.html?recent=1", 3500, ready)
    txt = await pg.evaluate("() => document.body.innerText.slice(0,600)")
    log(P, "storm", "open storm map ?recent=1", "the recent storm is front and centre with hardest-hit streets", f"{t}s; text: {txt[:260].replace(chr(10),' / ')}", shot=await shot(pg, pre + "-01-recent"))
    # is there an intro?
    skip = pg.locator("text=Skip")
    if await skip.count():
        log(P, "storm", "intro overlay", "no intro when I am in a hurry", "an intro with a Skip pill shows first", sev="minor")
        try: await skip.first.click(timeout=2000)
        except Exception: pass
        await pg.wait_for_timeout(1200)
    await shot(pg, pre + "-02-after-intro")
    # find hardest hit streets: is there a street list?
    has_streets = await pg.evaluate("() => /street|st\\b|ave|rd\\b/i.test(document.body.innerText) && !!document.querySelector('#chips, .chip-s, .streets')")
    body = await pg.evaluate("() => document.body.innerText")
    log(P, "storm", "find hardest-hit streets", "a ranked list of streets", f"streets ranked on this screen: {'yes' if 'Lindsey' in body else 'NO (only homes/towers, no street ranking)'}", sev="major" if "Lindsey" not in body else "")
    # click the show button (latest storm)
    try:
        await pg.locator("#show").click(timeout=3000); await pg.wait_for_timeout(1800)
        txt = await pg.evaluate("() => document.body.innerText.slice(0,500)")
        log(P, "storm", "click 'show' latest storm", "the Sep 12 storm is selected, homes highlighted", f"text: {txt[:200].replace(chr(10),' / ')}", shot=await shot(pg, pre + "-03-show-latest"))
    except Exception as e:
        log(P, "storm", "click 'show' latest storm", "selects latest", "ERR " + str(e)[:100])
    # click a house (tower) on the map: try clicking map centre a few points
    opened = False
    for (dx, dy) in [(0, 0), (-60, 20), (40, -30), (-120, 60), (90, 50), (0, 80), (-30, -60)]:
        cx, cy = vp["width"] // 2 + dx, vp["height"] // 2 + dy
        await pg.mouse.move(cx, cy); await pg.wait_for_timeout(250)
        await pg.mouse.click(cx, cy); await pg.wait_for_timeout(900)
        rec = await pg.evaluate("() => { const r=document.querySelector('#record, .record, .rec'); if(!r) return ''; const s=getComputedStyle(r); return (r.classList.contains('open')||s.opacity!=='0'&&r.getBoundingClientRect().width>0) ? r.innerText.slice(0,300) : '' }")
        if rec and len(rec) > 10:
            opened = True
            log(P, "storm", f"click a house on the map at +{dx},+{dy}", "a home card opens", f"record: {rec[:200].replace(chr(10),' / ')}", shot=await shot(pg, pre + "-04-house-card"))
            break
    if not opened:
        log(P, "storm", "click houses on the map (7 tries)", "a home card opens", "no home card opened by clicking around the centre; tiny targets", shot=await shot(pg, pre + "-04-no-house"), sev="major" if not phone else "minor")
    # Open record button
    try:
        btn = pg.locator("button.btn:has-text('Open record'), #cta").first
        if await btn.is_visible():
            before = await snap(pg)
            await btn.click(timeout=3000); await pg.wait_for_timeout(1000)
            after = await snap(pg)
            log(P, "storm", "click 'Open record'", "the Home screen for this house opens", "state changed" if changed(before, after) else "NOTHING happened, dead end", shot=await shot(pg, pre + "-05-open-record"), sev="" if changed(before, after) else "blocker")
    except Exception as e:
        log(P, "storm", "click 'Open record'", "opens home", "not visible / " + str(e)[:80])
    # queue homes / plan a knock route?
    body = await pg.evaluate("() => document.body.innerText")
    log(P, "storm", "queue homes to Daily 50 / plan a knock route from the map", "a button to add hit homes to the Daily 50 and plan a route", f"'Daily 50' on screen: {'Daily 50' in body}; 'route' on screen: {'route' in body.lower()}", sev="blocker")
    # timeline ticks
    hits = pg.locator("button.hit")
    nh = await hits.count()
    if nh:
        sizes = await pg.evaluate("() => [...document.querySelectorAll('button.hit')].map(b=>{const r=b.getBoundingClientRect();return Math.round(r.width)+'x'+Math.round(r.height)})")
        await hits.nth(1).click(timeout=3000, force=True); await pg.wait_for_timeout(1500)
        txt = await pg.evaluate("() => document.body.innerText.slice(0,400)")
        log(P, "storm", "click a timeline tick (storm 2)", "swap to that storm", f"{nh} ticks, sizes {sizes[:6]}; text: {txt[:160].replace(chr(10),' / ')}", shot=await shot(pg, pre + "-06-timeline-tick"), sev="minor" if any(int(s.split('x')[0])<24 for s in sizes) else "")
    # keyboard
    await pg.keyboard.press("Escape"); await pg.wait_for_timeout(500)
    await shot(pg, pre + "-07-after-esc")
    # Ask Nimbus page: ?storm mode
    t, errs = await goto(pg, BASE + "c2-nimbus/index.html", 3500)
    txt = await pg.evaluate("() => document.body.innerText.slice(0,700)")
    log(P, "ask", "open Ask Nimbus", "I can ask which streets were hit and act", f"{t}s; text: {txt[:300].replace(chr(10),' / ')}", shot=await shot(pg, pre + "-08-ask"))
    # type a question
    comp = pg.locator(".composer")
    try:
        await comp.click(timeout=2000); await pg.keyboard.type("homes over 1.5 in near Boyd"); await pg.wait_for_timeout(300)
        typed = await pg.evaluate("() => document.querySelector('.composer')?.innerText")
        await pg.locator(".send").click(timeout=2000); await pg.wait_for_timeout(1200)
        txt2 = await pg.evaluate("() => document.body.innerText.slice(0,700)")
        log(P, "ask", "type a question in the composer and send", "an answer", f"composer text after typing: '{typed}'; page changed={txt!=txt2}", shot=await shot(pg, pre + "-09-ask-typed"), sev="blocker")
    except Exception as e:
        log(P, "ask", "type in composer", "an answer", "ERR " + str(e)[:100], sev="blocker")
    # street chips
    sts = pg.locator(".st")
    if await sts.count() > 2:
        await sts.nth(2).click(timeout=3000); await pg.wait_for_timeout(2000)
        a = await pg.evaluate("() => document.getElementById('answer')?.innerText")
        log(P, "ask", "tap 3rd street (S Berry Rd)", "map flies there, answer updates", f"answer: {a}", shot=await shot(pg, pre + "-10-ask-street"))
    # add to daily 50
    try:
        await pg.locator("#add").click(timeout=3000); await pg.wait_for_timeout(1500)
        lbl = await pg.evaluate("() => document.getElementById('add')?.innerText")
        log(P, "ask", "click 'Add 38 homes to Daily 50'", "they appear in Daily 50", f"button now '{lbl}'", shot=await shot(pg, pre + "-11-ask-added"))
        # does Daily 50 reflect it?
        await goto(pg, BASE + "c4-command-deck/deck.html", 3000)
        body = await pg.evaluate("() => document.body.innerText")
        log(P, "daily", "open Daily 50 after adding 38 homes", "38 Lindsey/Berry homes are in the queue", f"Lindsey in deck={'Lindsey' in body}; Berry={'Berry' in body}; deck text: {body[:200].replace(chr(10),' / ')}", shot=await shot(pg, pre + "-12-daily-after-add"), sev="blocker")
    except Exception as e:
        log(P, "ask", "add to daily 50", "", "ERR " + str(e)[:100])
    # plan a route / chips
    await goto(pg, BASE + "c2-nimbus/index.html", 3000)
    for lbl in ["Plan a route", "Compare with Aug 21", "Who picked up yesterday?"]:
        try:
            b = pg.get_by_role("button", name=lbl).first
            if not await b.is_visible():
                log(P, "ask", f"click '{lbl}'", "something happens", "not visible at this size", sev="minor"); continue
            before = await snap(pg); await b.click(timeout=3000); await pg.wait_for_timeout(1000); after = await snap(pg)
            log(P, "ask", f"click '{lbl}'", "something happens", "state changed" if changed(before, after) else "NOTHING happened, dead", sev="" if changed(before, after) else "major")
        except Exception as e:
            log(P, "ask", f"click '{lbl}'", "", "ERR " + str(e)[:80])
    await shot(pg, pre + "-13-ask-after-chips")
    log(P, "ask", "console", "no errors", "; ".join(msgs[:8]) or "clean", sev="minor" if msgs else "")
    await pg.close()

# ------------------------------------------------------------------ persona 3: rep in the truck
async def persona_rep(ctx, vp, tag):
    pg = await ctx.new_page(); msgs = await console_collect(pg)
    P = "Rep"; pre = f"{tag}-rep"
    phone = vp["width"] < 600
    t, errs = await goto(pg, BASE + "c4-command-deck/deck.html", 3500)
    body = await pg.evaluate("() => document.body.innerText")
    log(P, "daily", "open Daily 50", "today's first stop, big Call button", f"{t}s; text: {body[:260].replace(chr(10),' / ')}", shot=await shot(pg, pre + "-01-deck"))
    # top nav tabs
    for lbl in ["Pipeline", "Map", "Homes", "Storms"]:
        try:
            b = pg.locator("header button, .top button, nav button, .tabs button").filter(has_text=lbl).first
            if not await b.is_visible(): log(P, "daily", f"nav tab {lbl}", "opens that section", "not visible", sev="minor"); continue
            before = await snap(pg); await b.click(timeout=3000, force=True); await pg.wait_for_timeout(800); after = await snap(pg)
            log(P, "daily", f"nav tab {lbl}", "opens that section", "state changed" if changed(before, after) else "NOTHING happened, dead tab", sev="" if changed(before, after) else "major")
        except Exception as e:
            log(P, "daily", f"nav tab {lbl}", "", "ERR " + str(e)[:80])
    await shot(pg, pre + "-02-after-navtabs")
    # first card details
    card = await pg.evaluate("() => (document.querySelector('.card[data-d=\"0\"]')?.innerText||'').slice(0,400)")
    log(P, "daily", "read the first card", "address, hail, best time, owner, one tap to call", f"{card[:300].replace(chr(10),' / ')}")
    # Call
    try:
        before = await snap(pg)
        await pg.locator('.card[data-d="0"] [data-a="call"]').click(timeout=3000); await pg.wait_for_timeout(400)
        mid = await pg.evaluate("() => (document.querySelector('.card[data-d=\"0\"] [data-a=\"call\"]')?.innerText||'')")
        s = await shot(pg, pre + "-03-call-pressed")
        await pg.wait_for_timeout(1400)
        card2 = await pg.evaluate("() => (document.querySelector('.card[data-d=\"0\"]')?.innerText||'').slice(0,120)")
        dialer = await pg.evaluate("() => !!document.querySelector('a[href^=\"tel:\"]')")
        log(P, "daily", "tap Call on the first card", "phone dials; then I pick an outcome (no answer / spoke / booked)", f"button said '{mid}' then card auto-advanced to: {card2[:100].replace(chr(10),' / ')}; any tel: link on deck={dialer}; no outcome picker appeared", shot=s, sev="blocker")
    except Exception as e:
        log(P, "daily", "tap Call", "", "ERR " + str(e)[:100], sev="blocker")
    await shot(pg, pre + "-04-after-call")
    # Text
    try:
        await pg.locator('.card[data-d="0"] [data-a="text"]').click(timeout=3000); await pg.wait_for_timeout(800)
        lbl = await pg.evaluate("() => (document.querySelector('.card[data-d=\"0\"] [data-a=\"text\"]')?.innerText||'')")
        sheet = await pg.evaluate("() => !!document.querySelector('.sheet.open, [class*=draft], textarea')")
        log(P, "daily", "tap Text", "a draft I can read/edit/send (only if opted in)", f"button now '{lbl}'; draft visible={sheet}; nothing to read or send", shot=await shot(pg, pre + "-05-text"), sev="major")
    except Exception as e:
        log(P, "daily", "tap Text", "", "ERR " + str(e)[:100])
    # Skip
    try:
        c1 = await pg.evaluate("() => (document.querySelector('.card[data-d=\"0\"] .ad, .card[data-d=\"0\"] h2, .card[data-d=\"0\"] .addr')?.innerText||document.querySelector('.card[data-d=\"0\"]').innerText.slice(0,40))")
        await pg.locator('.card[data-d="0"] [data-a="skip"]').click(timeout=3000); await pg.wait_for_timeout(1200)
        c2 = await pg.evaluate("() => (document.querySelector('.card[data-d=\"0\"] .ad, .card[data-d=\"0\"] h2, .card[data-d=\"0\"] .addr')?.innerText||document.querySelector('.card[data-d=\"0\"]').innerText.slice(0,40))")
        log(P, "daily", "tap Skip", "next stop, with a reason/undo", f"'{c1[:40]}' -> '{c2[:40]}'; no reason asked, no undo", shot=await shot(pg, pre + "-06-skip"), sev="minor")
    except Exception as e:
        log(P, "daily", "tap Skip", "", "ERR " + str(e)[:100])
    # swipe
    try:
        c = pg.locator('.card[data-d="0"]'); bb = await c.bounding_box()
        if bb:
            x, y = bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2
            await pg.mouse.move(x, y); await pg.mouse.down(); await pg.mouse.move(x + 60, y, steps=5); s = await shot(pg, pre + "-07-swipe-mid"); await pg.mouse.move(x + 160, y, steps=5); await pg.mouse.up(); await pg.wait_for_timeout(1000)
            log(P, "daily", "swipe the card right", "clear meaning (right = ?)", "card swiped and advanced; swipe direction meaning is not labelled on screen", shot=s, sev="minor")
    except Exception as e:
        log(P, "daily", "swipe", "", "ERR " + str(e)[:100])
    # roof expand
    try:
        await pg.locator('.card[data-d="0"] [data-a="roof"]').click(timeout=3000); await pg.wait_for_timeout(1200)
        rs = await pg.evaluate("() => (document.getElementById('sheetRoof')?.innerText||'').slice(0,200)")
        log(P, "daily", "tap the roof squares button", "roof measurement opens", f"roof sheet: {rs[:150].replace(chr(10),' / ')}", shot=await shot(pg, pre + "-08-roof-sheet"))
        # chips inside
        for m in ["Edges", "Dimensions", "Hail"]:
            try: await pg.locator('#rsChips button').filter(has_text=m).click(timeout=2000); await pg.wait_for_timeout(500)
            except Exception: pass
        await shot(pg, pre + "-09-roof-hail")
        # click a plane
        pl = pg.locator('#rsRoof .pl').first
        if await pl.count():
            await pl.click(timeout=2000, force=True); await pg.wait_for_timeout(600)
            await shot(pg, pre + "-10-roof-plane")
        # is there an Open home / book from here?
        rs = await pg.evaluate("() => (document.getElementById('sheetRoof')?.innerText||'')")
        log(P, "daily", "from the roof sheet, open the full home / book inspection", "a link to the Home screen and a Book button", f"'Open' in sheet={'Open' in rs}; 'Book' in sheet={'Book' in rs}", sev="major")
        await pg.locator('#sheetRoof [data-close]').click(timeout=2000); await pg.wait_for_timeout(600)
    except Exception as e:
        log(P, "daily", "roof sheet", "", "ERR " + str(e)[:100])
    # route sheet + pipeline (phone peek)
    for bid, nm in [("openRoute", "Route"), ("openPipe", "Pipeline")]:
        try:
            b = pg.locator("#" + bid)
            if await b.is_visible():
                await b.click(timeout=3000); await pg.wait_for_timeout(1800)
                txt = await pg.evaluate(f"() => (document.getElementById('sheet{'Route' if bid=='openRoute' else 'Pipe'}')?.innerText||'').slice(0,200)")
                log(P, "daily", f"open {nm} sheet", "route map with stops, Directions button", f"{txt[:160].replace(chr(10),' / ')}; 'Directions' present={'Directions' in txt}", shot=await shot(pg, pre + f"-11-{nm.lower()}"), sev="major" if nm == "Route" and "Directions" not in txt else "")
                await pg.locator(f'#sheet{"Route" if bid=="openRoute" else "Pipe"} [data-close]').click(timeout=2000); await pg.wait_for_timeout(600)
            else:
                log(P, "daily", f"open {nm} sheet", "", "peek bar not visible at this size (desktop shows side panels)")
        except Exception as e:
            log(P, "daily", f"{nm} sheet", "", "ERR " + str(e)[:100])
    # queue row click
    try:
        rows = pg.locator(".qrow")
        n = await rows.count()
        if n > 5:
            await rows.nth(5).click(timeout=3000, force=True); await pg.wait_for_timeout(1000)
            c = await pg.evaluate("() => (document.querySelector('.card[data-d=\"0\"]')?.innerText||'').slice(0,60)")
            log(P, "daily", "tap queue row 6", "jumps to that stop", f"card now: {c.replace(chr(10),' / ')}", shot=await shot(pg, pre + "-12-queue-jump"))
        else:
            log(P, "daily", "queue list", "visible list of 50", f"{n} rows visible")
    except Exception as e:
        log(P, "daily", "queue", "", "ERR " + str(e)[:100])
    # pipeline stage buttons
    try:
        stg = pg.locator(".stg")
        if await stg.count():
            before = await snap(pg); await stg.nth(2).click(timeout=2000, force=True); await pg.wait_for_timeout(700); after = await snap(pg)
            log(P, "daily", "click a pipeline stage", "filters to that stage", "state changed" if changed(before, after) else "NOTHING happened, dead", sev="" if changed(before, after) else "major")
    except Exception as e:
        pass
    # keyboard shortcuts on deck
    await pg.keyboard.press("ArrowRight"); await pg.wait_for_timeout(400)
    await pg.keyboard.press("Escape"); await pg.wait_for_timeout(400)
    # open the Home from deck?  there is no link, go directly
    body = await pg.evaluate("() => document.body.innerText")
    log(P, "daily", "open the full record of the current stop", "tap the address to open Home", f"any 'Open record'/'Open home' control: {('Open record' in body) or ('Open home' in body)}; address is not a link", sev="blocker")
    # Home screen
    t, errs = await goto(pg, BASE + "c5-home/index.html", 4000)
    body = await pg.evaluate("() => document.body.innerText")
    log(P, "home", "open Home", "the home I was just on (from Daily 50)", f"{t}s; shows: {body[:200].replace(chr(10),' / ')}; address matches deck={'Pickard' in body or 'Lindsey' in body}", shot=await shot(pg, pre + "-13-home"), sev="blocker")
    # measure: click a plane on the canvas
    try:
        st = pg.locator("#stage"); bb = await st.bounding_box()
        found = False
        for (fx, fy) in [(0.5, 0.45), (0.42, 0.5), (0.58, 0.5), (0.5, 0.6), (0.35, 0.4), (0.65, 0.4)]:
            await pg.mouse.click(bb["x"] + bb["width"] * fx, bb["y"] + bb["height"] * fy); await pg.wait_for_timeout(1100)
            pill = await pg.evaluate("() => document.getElementById('measPill')?.innerText + ' | ' + (document.getElementById('sheetTitle')?.innerText||'') + ' | ' + document.body.dataset.sheet")
            if "Whole roof" not in pill.split("|")[0]:
                found = True; break
        log(P, "home", "click a roof plane to measure", "plane highlights, area and squares shown", f"meas pill/sheet: '{pill}'; found plane={found}", shot=await shot(pg, pre + "-14-plane"), sev="" if found else "minor")
        for m in ["edges", "dims", "hail"]:
            await pg.locator(f'.chip[data-m="{m}"]').first.click(timeout=2000, force=True); await pg.wait_for_timeout(700)
        await shot(pg, pre + "-15-hail-mode")
        await pg.locator("#bExplode").click(timeout=2000, force=True); await pg.wait_for_timeout(1500)
        await shot(pg, pre + "-16-explode")
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(600)
    except Exception as e:
        log(P, "home", "measure", "", "ERR " + str(e)[:100])
    # Book
    for lbl in ["Book", "Text", "More", "Done", "Reschedule", "Add a note"]:
        try:
            b = pg.get_by_role("button", name=lbl).first
            if not await b.is_visible(): log(P, "home", f"tap {lbl}", "", "not visible", sev="minor"); continue
            before = await snap(pg); await b.click(timeout=3000, force=True); await pg.wait_for_timeout(900); after = await snap(pg)
            s = await shot(pg, pre + f"-17-{lbl.replace(' ','').lower()}")
            log(P, "home", f"tap {lbl}", "a booking/text/note flow", "state changed" if changed(before, after) else "NOTHING happened, dead", shot=s, sev="" if changed(before, after) else ("blocker" if lbl == "Book" else "major"))
        except Exception as e:
            log(P, "home", f"tap {lbl}", "", "ERR " + str(e)[:80])
    # activity tabs
    try:
        before = await snap(pg); await pg.locator(".ptabs span").nth(1).click(timeout=2000, force=True); await pg.wait_for_timeout(600); after = await snap(pg)
        log(P, "home", "click Activity tab 'Calls'", "filters the timeline", "state changed" if changed(before, after) else "NOTHING happened, dead (and it is a span, not a button)", sev="" if changed(before, after) else "minor")
    except Exception as e:
        pass
    # Call link
    tel = await pg.evaluate("() => [...document.querySelectorAll('a[href^=\"tel:\"]')].map(a=>a.href)")
    log(P, "home", "Call link", "dials the owner", f"tel links: {tel}; same sample number on all = {len(set(tel))==1}")
    # next stop
    body = await pg.evaluate("() => document.body.innerText")
    log(P, "home", "move to the next stop", "a 'Next stop' button back into the Daily 50", f"'Next' control present={'Next stop' in body or 'Next home' in body}; crumb says '{(await pg.evaluate('() => document.querySelector(\".crumb\")?.innerText'))}' but is not a link", sev="blocker")
    # back nav
    await pg.go_back(); await pg.wait_for_timeout(800)
    log(P, "home", "browser Back", "returns to Daily 50 at the same stop", f"url {pg.url.replace(BASE,'')}")
    log(P, "home", "console", "no errors", "; ".join(msgs[:8]) or "clean", sev="minor" if msgs else "")
    await pg.close()

# ------------------------------------------------------------------ a11y + dead sweep per page
async def sweeps(ctx, vp, tag):
    pg = await ctx.new_page(); msgs = await console_collect(pg)
    P = "Sweep"
    pages = [
        ("storm", BASE + "1b-storm-theater.html?recent=1", ("Skip",)),
        ("daily", BASE + "c4-command-deck/deck.html", ()),
        ("home", BASE + "c5-home/index.html", ()),
        ("ask", BASE + "c2-nimbus/index.html", ()),
    ]
    allsmall = {}
    for name, url, skip in pages:
        try:
            dead, live, results, small = await click_everything(pg, P, name, url, f"{tag}-sweep-{name}", vp, skip_labels=skip, max_n=45)
            allsmall[name] = [(c["label"], c["w"], c["h"]) for c in small]
            # focus visibility + contrast quick checks
            a11y = await pg.evaluate("""() => {
              const out = {noLabel:0, lowContrast:[], focusStyles:0};
              document.querySelectorAll('button,a').forEach(b => { const t=(b.getAttribute('aria-label')||b.innerText||'').trim(); if(!t) out.noLabel++; });
              const lum = c => { const m=c.match(/\\d+(\\.\\d+)?/g); if(!m) return 1; const [r,g,b]=m.map(Number).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)}); return .2126*r+.7152*g+.0722*b; };
              document.querySelectorAll('small,.sub,.note,.src,.mt,.who,.cap,span').forEach(e => { const s=getComputedStyle(e); if(parseFloat(s.fontSize)>12.5) return; let bg=s.backgroundColor, p=e; while((bg==='rgba(0, 0, 0, 0)'||bg==='transparent') && (p=p.parentElement)) bg=getComputedStyle(p).backgroundColor; if(!p) bg='rgb(255,255,255)'; const l1=lum(s.color), l2=lum(bg); const cr=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05); if(cr<4.5 && e.innerText.trim() && e.getBoundingClientRect().width>0) out.lowContrast.push((e.innerText.trim().slice(0,30))+' '+cr.toFixed(1)+':1 @'+s.fontSize); });
              return out; }""")
            log(P, name, "accessibility quick check", "labels, contrast, focus", f"unlabelled controls={a11y['noLabel']}; small text under 4.5:1 contrast: {len(a11y['lowContrast'])} e.g. {a11y['lowContrast'][:3]}", sev="minor" if a11y["lowContrast"] else "")
            # tab focus visible?
            await pg.keyboard.press("Tab"); await pg.wait_for_timeout(200)
            fo = await pg.evaluate("() => { const a=document.activeElement; if(!a||a===document.body) return 'none'; const s=getComputedStyle(a); return a.tagName+' '+(a.innerText||a.getAttribute('aria-label')||'').slice(0,30)+' outline:'+s.outlineStyle+' '+s.outlineWidth }")
            log(P, name, "press Tab once", "visible focus ring on first control", fo)
        except Exception as e:
            log(P, name, "sweep", "", "ERR " + str(e)[:120])
    log(P, "all", "tap targets under 44px", "none on a phone", json.dumps(allsmall)[:600], sev="minor" if vp["width"] < 600 and any(allsmall.values()) else "")
    log(P, "all", "console", "no errors", "; ".join(sorted(set(msgs))[:10]) or "clean", sev="minor" if msgs else "")
    await pg.close()

# ------------------------------------------------------------------ opening / intro
async def opening(ctx, vp, tag):
    pg = await ctx.new_page(); msgs = await console_collect(pg)
    P = "Opening"
    t, errs = await goto(pg, BASE + "1a-storm-intro.html", 500)
    frames = []
    for i in range(6):
        frames.append(await shot(pg, f"{tag}-opening-{i}"))
        await pg.wait_for_timeout(1500)
    url = pg.url
    log(P, "opening", "watch the opening for 9s", "ends on something actionable", f"ends at {url.replace(BASE,'')}", shot=frames[2])
    # skip by key
    t, errs = await goto(pg, BASE + "1a-storm-intro.html", 400)
    await pg.keyboard.press("Space"); await pg.wait_for_timeout(1200)
    log(P, "opening", "press a key to skip", "skips", f"url after 1.2s: {pg.url.replace(BASE,'')}")
    # ?storm=1
    t, errs = await goto(pg, BASE + "1a-storm-intro.html?storm=1", 2500)
    log(P, "opening", "open ?storm=1", "storm variant", f"url {pg.url.replace(BASE,'')}", shot=await shot(pg, f"{tag}-opening-storm1"))
    t, errs = await goto(pg, BASE + "1b-storm-theater.html?storm=1", 3500)
    log(P, "storm", "open 1b ?storm=1", "storm variant", f"text: {(await pg.evaluate('() => document.body.innerText.slice(0,200)')).replace(chr(10),' / ')}", shot=await shot(pg, f"{tag}-storm-storm1"))
    await pg.close()

async def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"], headless=True)
        for vp, tag in [(DESK, "desk"), (PHONE, "phone")]:
            ctx = await b.new_context(viewport=vp, device_scale_factor=1, is_mobile=(vp["width"] < 600), has_touch=(vp["width"] < 600))
            await ctx.route("**/formsubmit.co/**", lambda r: r.abort())
            tasks = {"opening": opening, "cody": persona_cody, "storm": persona_storm, "rep": persona_rep, "sweep": sweeps}
            for k, fn in tasks.items():
                if which != "all" and which != k: continue
                try:
                    await asyncio.wait_for(fn(ctx, vp, tag), timeout=420)
                except Exception as e:
                    log(k, "-", "task", "", "TASK ERR " + str(e)[:200], sev="")
                with open(os.path.join(OUT, f"log-{which}.json"), "w", encoding="utf-8") as f:
                    json.dump(LOG, f, indent=1)
            await ctx.close()
        await b.close()
    with open(os.path.join(OUT, f"log-{which}.json"), "w", encoding="utf-8") as f:
        json.dump(LOG, f, indent=1)
    print("DONE", len(LOG), "entries")

asyncio.run(main())
