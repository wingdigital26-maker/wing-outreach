"""Intro as loading screen: one headless Chromium (software GL), the first open of product.html.
Records the measured ready time (shell window.__loading), the handoff moment, a shot sequence, and long tasks
(PerformanceObserver 'longtask', installed in every frame) split before / after the handoff.
Run: python tour/audit/intro-load-1011/measure.py [url]
"""
import asyncio, json, sys, time, os
from playwright.async_api import async_playwright

URL = next((a for a in sys.argv[1:] if a.startswith("http")), "http://127.0.0.1:4886/tour/product.html?dev=1")
GPU = "--gpu" in sys.argv   # --gpu: real GPU (d3d11) for the shot sequence; default swiftshader for long-task timing, no shots
TAG = "gpu" if GPU else "sw"
OUT = os.path.dirname(os.path.abspath(__file__))
INIT = """
(function(){ window.__lt=[]; window.__t0=performance.timeOrigin;
  try{ new PerformanceObserver(l=>{ for(const e of l.getEntries()) window.__lt.push({s:Math.round(e.startTime), d:Math.round(e.duration)}); }).observe({type:'longtask', buffered:true}); }catch(e){}
})();
"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, args=(["--use-angle=d3d11","--enable-gpu","--ignore-gpu-blocklist"] if GPU else ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]))
        ctx = await b.new_context(viewport={"width": 1440, "height": 900})
        await ctx.add_init_script(INIT)
        pg = await ctx.new_page()
        pg.on("pageerror", lambda e: print("PAGEERR", e))
        pg.on("console", lambda m: print("CON", m.type, m.text) if m.type in ("error",) else None)
        t_nav = time.time()
        await pg.goto(URL, wait_until="commit")
        # shot sequence: every 1 s until Today has been on for 6 s
        handoff = None; shots = []
        for i in range(60):
            await pg.wait_for_timeout(1000)
            st = await pg.evaluate("""() => ({hash:location.hash, loading:window.__loading, frames:[...document.querySelectorAll('.frame')].map(f=>({s:f.dataset.screen, cls:f.className, hold:f.dataset.hold||''}))})""")
            el = round(time.time() - t_nav, 1)
            if st["hash"] == "#/daily" and handoff is None:
                handoff = el
            if GPU and (i < 25 or (handoff is not None and el - handoff < 7)):
                path = os.path.join(OUT, f"seq-{i+1:02d}s.png"); await pg.screenshot(path=path, timeout=90000); shots.append(path)
            print(el, st["hash"], st["loading"], st["frames"])
            if handoff is not None and el - handoff > 8: break
        # long tasks per frame, split at the handoff (shell clock)
        hand_ms = await pg.evaluate("() => (window.__loading && window.__loading.hand) || 0")
        res = {}
        for fr in pg.frames:
            try:
                lt = await fr.evaluate("() => ({lt:window.__lt||[], now:performance.now(), origin:performance.timeOrigin})")
            except Exception as e:
                continue
            res[fr.name or fr.url.split('/')[-1][:40]] = lt
        shell_origin = res[list(res)[0]]["origin"] if res else 0
        summary = {"url": URL, "ready_ms": await pg.evaluate("() => window.__loading && window.__loading.ready"), "why": await pg.evaluate("() => window.__loading && window.__loading.why"),
                   "handoff_s_after_nav": handoff, "today_ready_in_frame_ms": None, "long_tasks": {}}
        for fr in pg.frames:
            if "deck.html" in fr.url:
                try: summary["today_ready_in_frame_ms"] = await fr.evaluate("() => Math.round(window.__todayReady||0)")
                except Exception: pass
        hand_abs = await pg.evaluate("() => window.__handAbs||0")
        for k, v in res.items():
            before = [e for e in v["lt"] if v["origin"] + e["s"] < hand_abs]; after = [e for e in v["lt"] if v["origin"] + e["s"] >= hand_abs]
            summary["long_tasks"][k] = {"before": {"n": len(before), "ms": sum(e["d"] for e in before), "max": max([e["d"] for e in before] or [0])},
                                        "after": {"n": len(after), "ms": sum(e["d"] for e in after), "max": max([e["d"] for e in after] or [0])}}
        with open(os.path.join(OUT, f"measure-{TAG}.json"), "w") as f: json.dump(summary, f, indent=1)
        print(json.dumps(summary, indent=1))
        await b.close()

asyncio.run(main())
