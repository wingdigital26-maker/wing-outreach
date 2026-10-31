"""Storms screen (6 months, volume, smooth switches) shots + frame timing, before/after.
python tour/audit/_storms6_shoot.py <tag> [width]    (server on :4886, one headless browser at a time)
Shots: tour/audit/storms-1010/<tag>-<state>-<w>.png. Prints per switch: ms to apply, frames sampled, max frame ms,
p95 frame ms, frames over 50 ms (jank), console errors. Nominatim and formsubmit are route-blocked."""
import pathlib, sys, json, statistics
from playwright.sync_api import sync_playwright

TAG = sys.argv[1] if len(sys.argv) > 1 else "before"
URL = "http://localhost:4886/tour/product.html?dev=1&nosw=1&noprefetch=1#/storm"
OUT = pathlib.Path(__file__).parent / "storms-1010"; OUT.mkdir(exist_ok=True)
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]

SAMPLER = """() => { window.__ft = []; window.__ftOn = true; let last = performance.now();
  const tick = t => { if (!window.__ftOn) return; window.__ft.push(t - last); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); }"""

def frame_of(page, part, ready, tries=240):
    for _ in range(tries):
        fr = next((f for f in page.frames if part in f.url), None)
        if fr:
            try:
                if fr.evaluate(ready): return fr
            except Exception: pass
        page.wait_for_timeout(500)
    raise RuntimeError("frame not ready: " + part)

def measure_switch(fr, idx):
    fr.evaluate(SAMPLER)
    t0 = fr.evaluate("performance.now()")
    fr.evaluate("i => { window.__applied = 0; if (window.__pick) __pick(i); else selectStorm(i); }", idx)
    for _ in range(60):
        fr.page.wait_for_timeout(100)
        if fr.evaluate("window.__applied > 0"): break
    fr.page.wait_for_timeout(1400)
    applied = fr.evaluate("window.__applied")
    ft = fr.evaluate("window.__ftOn = false; window.__ft")
    ft = ft[1:] if len(ft) > 1 else ft
    srt = sorted(ft); p95 = srt[int(len(srt) * 0.95) - 1] if srt else 0
    return {"idx": idx, "apply_ms": round(applied - t0) if applied else None, "frames": len(ft), "max_ms": round(max(ft)) if ft else 0,
            "p95_ms": round(p95), "jank_over_50": sum(1 for x in ft if x > 50)}

def run(W):
    H = 900 if W > 640 else 844; MOB = W < 641
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=2 if MOB else 1, is_mobile=MOB, has_touch=MOB, timezone_id="America/Chicago")
        ctx.route("**/formsubmit.co/**", lambda r: r.abort())
        ctx.route("**/nominatim.openstreetmap.org/**", lambda r: r.fulfill(status=200, body="[]", content_type="application/json"))
        page = ctx.new_page(); errs = []
        page.on("console", lambda m: errs.append(m.text[:160] + " @ " + str((m.location or {}).get("url", ""))[-40:]) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)[:160]))
        page.goto(URL, wait_until="domcontentloaded", timeout=90000)
        sf = frame_of(page, "1b-storm", "document.body.classList.contains('loaded') && window.__ready === true", tries=240)
        page.wait_for_timeout(3000)
        try:
            if page.evaluate("(()=>{const x=document.querySelector('.nb-bubble .nb-x'); return !!x && x.getBoundingClientRect().width>0})()"):
                page.click(".nb-bubble .nb-x", timeout=3000, force=True)
        except Exception: pass
        def shot(name):
            page.wait_for_timeout(600)
            page.screenshot(path=str(OUT / f"{TAG}-{name}-{W}.png"), timeout=120000, animations="disabled")
            print("shot", name, W, flush=True)
        info = sf.evaluate("({n: ST.storms.length, first: ST.storms[0].iso, last: ST.storms[ST.storms.length-1].iso, homes: STH.n, shown: (window.__shown ? __shown() : null)})")
        print(f"[{W}] storms listed: {json.dumps(info)}", flush=True)
        shot("calm")
        n = info["n"]
        # newest storm, then the one before it, then back: three switches, each timed
        order = [n - 1, n - 2, n - 1]
        results = []
        for k, idx in enumerate(order):
            r = measure_switch(sf, idx); results.append(r)
            print(f"[{W}] switch {k+1} -> storm {idx}: {json.dumps(r)}", flush=True)
            if k == 0:
                page.wait_for_timeout(1200); shot("storm-newest")
                print(f"[{W}] stat: " + sf.evaluate("document.getElementById('stat').innerText.replace(/\\n+/g,' | ').slice(0,300)"), flush=True)
            if k == 1:
                page.wait_for_timeout(1200); shot("storm-previous")
        print(f"[{W}] console errors ({len(errs)}):"); [print("   ", e) for e in errs[:12]]
        b.close()
        return results

for W in ([int(sys.argv[2])] if len(sys.argv) > 2 else [1440, 390]):
    run(W)
