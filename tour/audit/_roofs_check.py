"""Real roofs check: every Daily 50 stop's roof comes from its real building outline, not a generator.

Prints the 12 OKC stops (addr, outline found, sqft, squares, planes, pitch, measured) and asserts they are
not near-identical; screenshots the deck, the roof sheet and Home (most complex roof) at 1440 and 390;
zero console errors / page errors. One headless chromium, closed at the end.
    python tour/audit/_roofs_check.py
"""
import os, sys, json
import numpy as np
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4885/tour"
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")
os.makedirs(SHOTS, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
errors, fails = [], []


def check(ok, msg):
    print(("PASS " if ok else "FAIL ") + msg)
    if not ok: fails.append(msg)


def watch(page, tag):
    page.on("console", lambda m: errors.append(f"{tag} console.{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"{tag} pageerror: {e}"))
    page.route("**/formsubmit.co/**", lambda r: r.abort())


def home_ready(page):
    page.wait_for_function("window.__ready === true", timeout=90000, polling=500)
    page.wait_for_function("window.__settled === true", timeout=30000, polling=500)
    page.wait_for_timeout(600)


with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    try:
        ctx = b.new_context(viewport={"width": 1440, "height": 900})
        pg = ctx.new_page(); pg.set_default_timeout(45000); watch(pg, "deck")
        pg.goto(BASE + "/c4-command-deck/deck.html?r=reddirt", wait_until="load")
        pg.wait_for_function("typeof HOMES !== 'undefined' && HOMES.length && window.RealRoof && window.ROOFS")
        rows = pg.evaluate("""HOMES.filter(h=>!h.added).map(h=>({n:h.n, addr:h.addr, found:!h.spec.none, sqft:h.spec.sqft||null,
            squares:h.M.squares, planes:h.spec.none?0:h.spec.planes.length, pitch:h.spec.none?'':h.spec.rise+'/12',
            measured:!!h.spec.pitchMeasured, cplx:h.spec.none?0:h.spec.edges.filter(e=>e.type!=='eave').length}))""")
        print(f"\n{'#':>2}  {'address':26} {'outline':8} {'sqft':>6} {'squares':>8} {'planes':>6} {'pitch':>6}  measured")
        for r in rows:
            print(f"{r['n']:>2}  {r['addr'][:26]:26} {'yes' if r['found'] else 'none':8} {r['sqft'] or '':>6} {r['squares'] if r['squares'] is not None else '':>8} {r['planes'] or '':>6} {r['pitch']:>6}  {'LiDAR' if r['measured'] else ('assumed' if r['found'] else '')}")
        real = [r for r in rows if r["found"]]
        check(len(rows) == 12, f"12 route stops ({len(rows)})")
        check(len(real) == 12, f"real outlines found for {len(real)} of {len(rows)} stops")
        sq = [r["squares"] for r in real]
        check(len(set(sq)) == len(sq), f"every real roof has its own squares {sq}")
        check(max(sq) - min(sq) >= 10, f"squares spread {min(sq)} to {max(sq)}")
        check(len({r['planes'] for r in real}) >= 3, f"plane counts vary {[r['planes'] for r in real]}")
        check(all(r["squares"] is None for r in rows if not r["found"]), "no squares shown for stops with no outline")
        bl = pg.evaluate("[...document.querySelectorAll('.card .bl')].map(e=>e.textContent)")
        check(all(("No outline" in t) == (not r["found"]) for t, r in zip(bl, rows)), "card labels say real sq or No outline on file")
        # exact match with the app's solver: deck squares = RoofPlan totals.squares
        same = pg.evaluate("""HOMES.filter(h=>!h.spec.none).every(h=>{ const n=h.n, e=ROOFS.reddirt['stop'+n];
            return Math.abs(RoofPlan.build(e.ring_ft, e.pitch.rise, {style:'hip'}).totals.squares - h.M.squares) < 0.05; })""")
        check(same, "deck squares equal RoofPlan totals for the real outline")
        top = max(real, key=lambda r: (r["planes"], r["cplx"]))
        print("most complex roof: stop", top["n"], top["addr"], top["planes"], "planes")

        pg.goto(BASE + f"/c4-command-deck/deck.html?r=reddirt&n={top['n']}", wait_until="load"); pg.wait_for_timeout(2500)
        pg.screenshot(path=os.path.join(SHOTS, "roofs-daily-1440.png"))
        # the deck's roof sheet is a phone sheet (hidden at desktop widths), so it is shot at 390 below
        pg.goto(BASE + f"/c4-command-deck/deck.html?r=reddirt&n={top['n']}&sheet=roof", wait_until="load"); pg.wait_for_timeout(2500)
        txt = pg.evaluate("(document.getElementById('rsTab')||{}).textContent||''")
        check("Measured from the building outline" in txt, "roof sheet says measured from the building outline")

        # storm map homes ('m<index>'): one with a footprint on file, one without
        TOUR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
        cat = json.load(open(os.path.join(TOUR, "lib", "st-data", "catalog.json"))); N = cat["total"]
        hb = open(os.path.join(TOUR, "lib", "st-data", "homes.bin"), "rb").read()
        xy = np.frombuffer(hb, dtype=np.float32, count=N * 2); ty = np.frombuffer(hb, dtype=np.uint8, count=N, offset=N * 8)
        off = next(r for r in cat["regions"] if r["id"] == "okcounty")["offset"]
        route = json.load(open(os.path.join(TOUR, "c4-command-deck", "data", "route-okc.json")))
        g_fp = off + route["stops"][2]["fp"]
        near = np.where((np.abs(xy[0::2] + 97.53) < .01) & (np.abs(xy[1::2] - 35.49) < .01) & ((ty & 128) == 0))[0]
        g_no = int(near[0]) if len(near) else None
        adds = [{"id": f"m{g_fp}", "addr": "Storm map home A", "lon": float(xy[g_fp * 2]), "lat": float(xy[g_fp * 2 + 1]), "hail": 1.1, "from": "storm map"}]
        if g_no is not None: adds.append({"id": f"m{g_no}", "addr": "Storm map home B", "lon": float(xy[g_no * 2]), "lat": float(xy[g_no * 2 + 1]), "hail": 1.1, "from": "storm map"})
        pg.evaluate("a => a.forEach(h => RC.add(h))", adds)
        pg.goto(BASE + "/c4-command-deck/deck.html?r=reddirt", wait_until="load")
        pg.wait_for_function("typeof HOMES !== 'undefined' && HOMES.filter(h=>h.added).length && HOMES.filter(h=>h.added).every(h=>!h.spec.loading)", timeout=30000)
        mrows = pg.evaluate("HOMES.filter(h=>h.added).map(h=>({id:h.id, real:!!h.spec.real, none:!!h.spec.none, sq:h.M.squares, planes:h.spec.planes.length, bl:(document.querySelector(`.card[data-id='${h.id}'] .bl`)||{}).textContent||''}))")
        for m in mrows: print("storm map home", m)
        a = next(m for m in mrows if m["id"] == f"m{g_fp}")
        check(a["real"] and a["sq"] and f"{a['sq']} sq" in a["bl"], f"storm map home with a footprint gets its real roof ({a['sq']} sq, {a['planes']} planes)")
        if g_no is not None:
            bm = next(m for m in mrows if m["id"] == f"m{g_no}")
            check(bm["none"] and "No outline" in bm["bl"], "storm map home without a footprint says No outline on file")

        hp = ctx.new_page(); hp.set_default_timeout(45000); watch(hp, "home")
        hp.goto(BASE + f"/c5-home/index.html?home=dreddirt-{top['n']}", wait_until="load"); home_ready(hp)
        t = hp.evaluate("document.getElementById('titleH').textContent + ' | ' + document.getElementById('titleP').textContent")
        print("home:", t)
        check(str(top["squares"]) in t, f"Home shows the stop's real squares ({top['squares']})")
        hp.screenshot(path=os.path.join(SHOTS, "roofs-home-1440.png"), timeout=90000)
        hp.goto(BASE + "/c5-home/index.html", wait_until="load"); home_ready(hp)
        t0 = hp.evaluate("document.getElementById('titleH').textContent + ' | ' + document.getElementById('titleP').textContent")
        print("home default:", t0)
        check("25.1" not in t0 and "building outline" in t0, "default Home is a real house, not the 25.1 sample")
        hp.goto(BASE + f"/c5-home/index.html?home=m{g_fp}", wait_until="load"); home_ready(hp)
        check(str(a["sq"]) + " squares" in hp.evaluate("document.getElementById('titleH').textContent"), f"Home m{g_fp}: storm map home's real roof")
        if g_no is not None:
            hp.goto(BASE + f"/c5-home/index.html?home=m{g_no}", wait_until="load"); home_ready(hp)
            check("No outline" in hp.evaluate("document.getElementById('titleH').textContent"), f"Home m{g_no}: No outline on file")

        hp.close(); pg.close()   # one live WebGL page at a time (swiftshader is slow)
        ph = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        pp = ph.new_page(); pp.set_default_timeout(90000); watch(pp, "phone390")
        pp.goto(BASE + f"/c4-command-deck/deck.html?r=reddirt&n={top['n']}&sheet=roof", wait_until="load"); pp.wait_for_timeout(2500)
        pp.screenshot(path=os.path.join(SHOTS, "roofs-daily-roof-sheet-390.png"))
        pp.goto(BASE + f"/c5-home/index.html?home=dreddirt-{top['n']}", wait_until="load"); home_ready(pp)
        pp.screenshot(path=os.path.join(SHOTS, "roofs-home-390.png"), timeout=90000)
    finally:
        b.close()

check(not errors, f"zero console/page errors ({len(errors)})")
for e in errors[:20]: print("  ", e)
print("\nshots:", ", ".join(os.path.join(SHOTS, f) for f in ["roofs-daily-1440.png", "roofs-daily-roof-sheet-390.png", "roofs-home-1440.png", "roofs-home-390.png"]))
print("RESULT", "FAIL" if fails else "PASS")
sys.exit(1 if fails else 0)
