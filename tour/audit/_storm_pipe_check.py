"""Storms pipeline strip: New hit is ONE storm's homes (latest when none picked), never the sum of every storm.
Run: python tour/audit/_storm_pipe_check.py <1440|390>  (server on :4886). Shots: shots/stormpipe-<step>-<w>.png"""
import pathlib, sys
from playwright.sync_api import sync_playwright
W = int(sys.argv[1]) if len(sys.argv) > 1 else 1440; MOB = W < 641
SHOTS = pathlib.Path(__file__).parent / "shots"; SHOTS.mkdir(exist_ok=True)
fails = []
def check(c, m):
    print(("ok   " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)
def frame(page):
    for _ in range(240):
        fr = next((f for f in page.frames if "storm-theater" in f.url), None)
        if fr:
            try:
                if fr.evaluate("!!(window.LAST||(typeof LAST!=='undefined'&&LAST)) && document.getElementById('pipe').children.length>0"): return fr
            except Exception: pass
        page.wait_for_timeout(500)
    raise RuntimeError("storm frame not ready")
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
    ctx = b.new_context(viewport={"width": W, "height": 900 if not MOB else 844}, device_scale_factor=2 if MOB else 1, is_mobile=MOB, has_touch=MOB)
    page = ctx.new_page(); page.route("**/formsubmit.co/**", lambda r: r.abort())
    errs = []; page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.goto("http://localhost:4886/tour/product.html?dev=1#/storm"); fr = frame(page); page.wait_for_timeout(2500)
    st = fr.evaluate("({ph:document.getElementById('ph').textContent, nh:+document.querySelector('#pipe .stage b').textContent.replace(/,/g,''), last:LAST.n, lastd:LAST.d, sum:ST.storms.reduce((a,s)=>a+s.n,0), homes:RC.facts.homes||STH.n})")
    print(st)
    check(st["nh"] == st["last"], "no storm picked: New hit = latest storm's homes")
    check(st["nh"] != st["sum"] or len(set([st["sum"]])) == 0, "New hit is not the all-storm sum")
    check(st["nh"] <= st["homes"], "New hit never exceeds homes in the area")
    check(st["lastd"] in st["ph"], "header names the storm the count is from")
    page.screenshot(path=str(SHOTS / f"stormpipe-01-none-{W}.png"), timeout=150000, animations="disabled")
    i = fr.evaluate("Math.max(0, ST.storms.findIndex(s=>s.n>=400))")
    fr.evaluate(f"selectStorm({i})"); page.wait_for_timeout(3500)
    st2 = fr.evaluate("({ph:document.getElementById('ph').textContent, nh:+document.querySelector('#pipe .stage b').textContent.replace(/,/g,''), n:cur.n, d:cur.d})")
    print(st2)
    check(st2["nh"] == st2["n"] and st2["d"] in st2["ph"], "picked storm: New hit = that storm's homes")
    page.screenshot(path=str(SHOTS / f"stormpipe-02-picked-{W}.png"), timeout=150000, animations="disabled")
    check(not errs, f"0 console errors ({errs[:3]})")
    b.close()
print("FAILS:", fails); sys.exit(1 if fails else 0)
