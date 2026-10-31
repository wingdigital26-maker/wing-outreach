"""Weekly reel key frames at 1440 and 390 (one headless browser at a time, server on :4886).
python tour/audit/_weekly_shoot.py [seed.json]   seed.json = a device's rc.t.daily kept lists (the Daily 50 picks) so a fresh
profile shows the picks slide; without it the reel skips that slide, as it would on a device where Today never ran.
Shots: tour/audit/weekly-reel-1010/<slide>-<w>.png (still frames: ?slide=<id>&still=1 finishes every count and holds)."""
import pathlib, sys, json
from playwright.sync_api import sync_playwright

OUT = pathlib.Path(__file__).parent / "weekly-reel-1010"; OUT.mkdir(exist_ok=True)
BASE = "http://localhost:4886/tour/c7-weekly/index.html?dev=1&nosw=1&still=1&slide="
SLIDES = ["homes", "hit", "picks", "places"]
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
SEED = json.loads(pathlib.Path(sys.argv[1]).read_text()) if len(sys.argv) > 1 else None

def run(W):
    H = 900 if W > 640 else 844; MOB = W < 641
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=2 if MOB else 1, is_mobile=MOB, has_touch=MOB, timezone_id="America/Chicago")
        ctx.route("**/formsubmit.co/**", lambda r: r.abort())
        if SEED:
            ctx.add_init_script("try{localStorage.setItem('rc.t.daily',%s)}catch(e){}" % json.dumps(json.dumps(SEED)))
        page = ctx.new_page(); errs = []
        page.on("console", lambda m: errs.append(m.text[:160]) if m.type == "error" and "4911" not in m.text else None)
        page.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)[:160]))
        for s in SLIDES:
            page.goto(BASE + s, wait_until="domcontentloaded", timeout=90000)
            for _ in range(120):
                if page.evaluate("document.documentElement.dataset.ready === '1'"): break
                page.wait_for_timeout(500)
            page.wait_for_timeout(1500)
            cur = page.evaluate("(document.querySelector('.slide.on')||{dataset:{}}).dataset.id")
            page.screenshot(path=str(OUT / f"{s}-{W}.png"), timeout=120000)
            print(W, s, "shown:", cur)
        print(W, "facts:", json.dumps(page.evaluate("window.__reel && window.__reel.facts && {homes:__reel.facts.homes,storms:__reel.facts.storms,storms6:__reel.facts.storms6,hit:__reel.facts.hit,picks:__reel.facts.picks,pickCities:__reel.facts.pickCities,pickNbs:__reel.facts.pickNbs,traced:__reel.facts.traced,mock:__reel.facts.mockTraced,texts:__reel.facts.texts,emails:__reel.facts.emails,slides:__reel.slides}")))
        print(W, "errors:", errs[:6])
        b.close()

for W in (1440, 390):
    run(W)
