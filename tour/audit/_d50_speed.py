"""Daily 50 speed on Today: navigation -> first card -> full list -> map ready, A/B against the committed engine.
Run: python tour/audit/_d50_speed.py [runs]   (server on :4886 must already be running; this never starts one)
Each run opens the shell at #/daily twice in fresh contexts (no service worker, empty cache), interleaved:
  before  tour/lib/rc-queue.js, rc-state.js, rc-copy.js as committed at BASE_REF, and Today's page as BEFORE_DECK
          (a snapshot of deck.html without this change) when that file exists, served by request interception
  after   the files on disk
then once more warm (same context, second visit). Times are ms from the shell's navigation start:
  queue = RC.queueReady resolved in the Today frame, first = first Up next row on screen, full = every pick listed,
  map = window.__mapReady. Also prints the engine's own load time. Medians at the end.
Nothing is sent; formsubmit.co is blocked; rc.* keys are cleared."""
import os, subprocess, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
URL = "http://localhost:4886/tour/product.html?dev=1&nointro=1#/daily"
ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"]
RUNS = int(sys.argv[1]) if len(sys.argv) > 1 else 3
BASE_REF = os.environ.get("BASE_REF", "HEAD")
BEFORE_DECK = os.environ.get("BEFORE_DECK", "")
CLEAR = """() => { [localStorage, sessionStorage].forEach(st => Object.keys(st).filter(k => k.indexOf('rc.') === 0 && k !== 'rc.dev').forEach(k => st.removeItem(k))); return true; }"""
PROBE = """() => { const w = window; if (w.__d50) return; w.__d50 = {};
  const mark = (k) => { if (w.__d50[k] == null) w.__d50[k] = Math.round(performance.now()); };
  const tick = () => { try {
      if (w.RC && w.RC.queueReady && !w.__d50q) { w.__d50q = 1; w.RC.queueReady.then(() => mark('queue')); }
      const rows = document.querySelectorAll('#qlist .qrow').length;
      if (rows) mark('first');
      if (w.RC && w.RC.daily && rows && rows >= w.RC.daily().length) mark('full');
      if (w.__mapReady) mark('map');
    } catch (e) {}
    if (w.__d50.full == null || w.__d50.map == null) requestAnimationFrame(tick); };
  tick(); }"""
OLD = {f: subprocess.run(["git", "-C", ROOT, "show", f"{BASE_REF}:tour/lib/{f}"], capture_output=True).stdout for f in ("rc-queue.js", "rc-state.js", "rc-copy.js")}
if BEFORE_DECK and os.path.exists(BEFORE_DECK): OLD["deck.html"] = open(BEFORE_DECK, "rb").read()


def frame_of(page):
    for _ in range(800):
        for f in page.frames:
            if "c4-command-deck/deck.html" in f.url: return f
        page.wait_for_timeout(25)
    return None


def visit(ctx, before):
    page = ctx.new_page()
    page.route("**/formsubmit.co/**", lambda r: r.abort())
    if before:
        for name, body in OLD.items():
            ct = "text/html" if name.endswith(".html") else "application/javascript"
            def serve(r, req=None, b=body, c=ct):
                if r.request.resource_type in ("script", "document"): r.fulfill(status=200, body=b, content_type=c)
                else: r.continue_()
            page.route(f"**/{name}*", serve)
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(URL, wait_until="commit")
    f = frame_of(page)
    f.wait_for_load_state("domcontentloaded")
    f.evaluate("(" + PROBE + ")()")
    f.wait_for_function("window.__d50 && window.__d50.full != null && window.__d50.map != null", timeout=120000, polling=100)
    d = f.evaluate("() => ({ m: window.__d50, o: performance.timeOrigin, st: RC.queueStats(), n: RC.daily().length })")
    off = d["o"] - page.evaluate("() => performance.timeOrigin")
    page.evaluate(CLEAR)
    page.close()
    return {k: round(v + off) for k, v in d["m"].items()}, d["st"], d["n"], errs


with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=ARGS)
    rows = {}
    for i in range(RUNS):
        for label in ("before", "after"):
            ctx = b.new_context(viewport={"width": 1440, "height": 900}, service_workers="block")
            for kind in ("cold", "warm"):
                m, st, n, errs = visit(ctx, label == "before")
                rows.setdefault((label, kind), []).append(m)
                print(f"{label:6} {kind} {i+1}: queue {m.get('queue')} first {m.get('first')} full {m.get('full')} map {m.get('map')} | picks {n} storm {st.get('storm')} source {st.get('source', 'scan')} engine load {st.get('loadMs')} ms | errors {len(errs)}", flush=True)
            ctx.close()
    med = lambda l: sorted(l)[len(l) // 2]
    print("\n| Run | Engine ready | First card | Full list | Map ready |\n|---|---|---|---|---|")
    for (label, kind), ms in rows.items():
        print(f"| {label} {kind} | {med([m['queue'] for m in ms]):,} | {med([m['first'] for m in ms]):,} | {med([m['full'] for m in ms]):,} | {med([m['map'] for m in ms]):,} |")
    b.close()
