"""Visual check 10-23: every screen at desktop (1440x900) and phone (390x844), one light headless browser per screen
(the laptop is low on RAM), closed between screens. Each screen: wait, run its clicks, then screenshot the viewport and
up to 3 more scrolled views of the frame's main scroller. Records page errors, failed requests, sideways overflow and
elements past the right edge, and the visible text (for the proofread).
  python -E tour/audit/visual-check-1023/shoot.py <before|after> [desk|phone|both] [screen ...]
-> tour/audit/visual-check-1023/<set>/<screen>-<size>[-N].png + <set>/walk.json"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, sys.argv[1]); os.makedirs(OUT, exist_ok=True)
SIZES = {"desk": (1440, 900, False), "phone": (390, 844, True)}
size_arg = sys.argv[2] if len(sys.argv) > 2 else "both"
sizes = list(SIZES) if size_arg == "both" else [size_arg]
B = "http://127.0.0.1:4930/tour/"
Q = "?dev=1&nointro=1&noprefetch=1&cloud=0"
P = "product.html" + Q

# screen: (url, frame-url-part to scroll / click in, [steps])  step = ("click", selector) | ("wait", ms) | ("phonelist",)
SCREENS = {
    "today": (P + "#/daily", "deck", []),
    "radar": (P + "#/daily", "deck", [("phonelist",), ("click", "#tabRadar"), ("wait", 9000)]),
    "radar-street": (P + "#/daily", "deck", [("phonelist",), ("click", "#tabRadar"), ("wait", 9000), ("click", ".rd-sh"), ("wait", 2500)]),
    "storms": (P + "#/storm", "storm", [("wait", 6000)]),
    "inbox": (P + "#/crm/inbox", "c5-home", []),
    "pipeline": (P + "#/crm/pipeline", "c5-home", []),
    "calendar": (P + "#/crm/calendar", "c5-home", []),
    "record": (P + "#/crm/home/m92039", "c5-home", []),
    "measure": (P + "#/crm/home/m92039", "c5-home", [("click", "#bMeasure"), ("wait", 5000)]),
    "proposal": ("c5-home/proposal.html" + Q + "&id=m92039", "proposal", []),
    "hailreport": ("c5-home/hail-report.html" + Q + "&id=m92039", "hail-report", []),
    "proofpage": ("proof/?h=3ixhzvx&preview=1", "proof", []),
    "nimbus": (P + "#/ask", "nimbus", []),
}
want = sys.argv[3:] or list(SCREENS)

SCROLLER = """() => { let best = document.scrollingElement, bh = best.scrollHeight - best.clientHeight;
  for (const el of document.querySelectorAll('*')) { const cs = getComputedStyle(el);
    if (!/(auto|scroll)/.test(cs.overflowY)) continue; const r = el.getBoundingClientRect(); if (r.width < 200 || r.height < 200) continue;
    const d = el.scrollHeight - el.clientHeight; if (d > bh + 50) { best = el; bh = d; } }
  window.__vcS = best; return [bh, best.clientHeight]; }"""
OVER = """() => { const W = innerWidth, out = [];
  for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (r.width && r.height && r.right > W + 2 && cs.visibility !== 'hidden' && cs.display !== 'none') {
      let p = el.parentElement, clipped = false; while (p) { const o = getComputedStyle(p).overflowX; if (o !== 'visible') { clipped = true; break; } p = p.parentElement; }
      if (!clipped) out.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]) + ' ' + Math.round(r.right)); } }
  return { sw: document.documentElement.scrollWidth, w: W, past: out.slice(0, 8) }; }"""


def frame_for(pg, part):
    for f in pg.frames:
        if part in f.url and f != pg.main_frame: return f
    return pg.main_frame


async def snap(pg, path):
    """Playwright waits for a fresh frame; a busy swiftshader 3D page at phone size can starve it. Fall back to CDP."""
    try: await pg.screenshot(path=path, timeout=45000)
    except Exception:
        import base64
        cdp = await pg.context.new_cdp_session(pg); d = await cdp.send("Page.captureScreenshot", {"format": "png"})
        open(path, "wb").write(base64.b64decode(d["data"]))


async def one(p, name, sz):
    url, part, steps = SCREENS[name]; w, h, mob = SIZES[sz]
    b = await p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=1.5 if mob else 1, is_mobile=mob, has_touch=mob)
    await ctx.route("**/formsubmit.co/**", lambda r: r.abort())
    pg = await ctx.new_page(); errs, bad = [], []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.on("console", lambda m: errs.append("console: " + m.text[:200]) if m.type == "error" else None)
    pg.on("response", lambda r: bad.append(f"{r.status} {r.url[len(B) - 6:][:120]}") if r.status >= 400 else None)
    pg.on("requestfailed", lambda r: bad.append(f"failed {r.url[:120]} {r.failure}") if "formsubmit" not in r.url else None)
    rec = dict(errors=errs, bad=bad, shots=[], notes=[])
    try:
        await pg.goto(B + url, wait_until="load", timeout=90000)
        await pg.wait_for_timeout(int(os.environ.get("WALK_WAIT", "9000")))
        fr = frame_for(pg, part)
        for st in steps:
            try:
                if st[0] == "wait": await pg.wait_for_timeout(st[1])
                elif st[0] == "phonelist":
                    if mob and await fr.is_visible("#openList"): await fr.click("#openList"); await pg.wait_for_timeout(800)
                elif st[0] == "click":
                    try: await fr.locator(st[1]).first.click(timeout=8000)
                    except Exception: await fr.eval_on_selector(st[1], "e => e.click()")   # an overlay took the pointer: click in the DOM
                    await pg.wait_for_timeout(800)
            except Exception as e: rec["notes"].append(f"step {st} failed: {str(e)[:120]}")
        fn = f"{name}-{sz}.png"; await snap(pg, os.path.join(OUT, fn)); rec["shots"].append(fn)
        try:
            rec["overflow"] = await fr.evaluate(OVER)
            rec["overflow_top"] = await pg.evaluate(OVER) if fr != pg.main_frame else None
        except Exception as e: rec["notes"].append("overflow: " + str(e)[:100])
        try:
            bh, ch = await fr.evaluate(SCROLLER)
            for i in range(1, 4):
                if bh <= ch * (i - 1) + 40: break
                await fr.evaluate(f"() => {{ const s = window.__vcS; s.scrollTop = {int(ch * 0.9 * i)}; }}"); await pg.wait_for_timeout(1200)
                fn = f"{name}-{sz}-{i}.png"; await snap(pg, os.path.join(OUT, fn)); rec["shots"].append(fn)
        except Exception as e: rec["notes"].append("scroll: " + str(e)[:100])
        txt = ""
        for f in pg.frames:
            try: txt += "\n=== " + f.url[len(B) - 6:][:60] + "\n" + await f.evaluate("document.body ? document.body.innerText : ''")
            except Exception: pass
        rec["text"] = txt[:20000]
    finally:
        await ctx.close(); await b.close()
    rec["bad"] = sorted(set(bad))[:20]; rec["errors"] = errs[:15]
    return rec


async def main():
    rp = os.path.join(OUT, "walk.json"); R = json.load(open(rp, encoding="utf8")) if os.path.exists(rp) else {}
    async with async_playwright() as p:
        for name in want:
            for sz in sizes:
                try: R[f"{name}-{sz}"] = await one(p, name, sz)
                except Exception as e: R[f"{name}-{sz}"] = dict(fatal=str(e)[:300])
                r = R[f"{name}-{sz}"]
                print(name, sz, "shots", len(r.get("shots", [])), "err", len(r.get("errors", [])), "bad", len(r.get("bad", [])),
                      "over", (r.get("overflow") or {}).get("past"), r.get("notes") or "", r.get("fatal", ""), flush=True)
                json.dump(R, open(rp, "w", encoding="utf8"), indent=1)

asyncio.run(main())
