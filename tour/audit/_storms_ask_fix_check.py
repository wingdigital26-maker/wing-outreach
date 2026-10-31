"""Storms + Ask fixes: the Storms pipeline strip and the Ask street cards end clear of Nimbus (the shell's floating orb),
the strip is labelled as ONE storm's homes, storm dates carry the year when the storm is not this year, the Storms
service-area card says which storm today's Daily 50 is built from, and the Ask basemap really draws its streets.
Run: python tour/audit/_storms_ask_fix_check.py  (server already on :4886). Shots: shots/fix-storms-<w>.png, fix-ask-<w>.png"""
import pathlib, sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4886/tour/product.html?dev=1"
SHOTS = pathlib.Path(__file__).parent / "shots"; SHOTS.mkdir(exist_ok=True)
GPU = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"]
THIS_YEAR = "2026"
fails = []


def check(c, m):
    print(("ok   " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)


def orb(page):
    return page.evaluate("(()=>{const r=document.querySelector('.nb-dock').getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom}})()")


def overlap(a, b, pad=0):
    return a["l"] < b["r"] + pad and a["r"] > b["l"] - pad and a["t"] < b["b"] + pad and a["b"] > b["t"] - pad


def frame(page, part, ready):
    for _ in range(240):
        fr = next((f for f in page.frames if part in f.url), None)
        if fr:
            try:
                if fr.evaluate(ready): return fr
            except Exception: pass
        page.wait_for_timeout(500)
    raise RuntimeError(part + " frame not ready")


def rects(page, fr, sel):
    """element rects of `sel` inside frame `fr`, in shell (page) coordinates"""
    off = fr.frame_element().bounding_box()
    rs = fr.evaluate(f"[...document.querySelectorAll({sel!r})].map(e=>{{const r=e.getBoundingClientRect();return {{l:r.left,t:r.top,r:r.right,b:r.bottom,txt:e.textContent.trim()}}}})")
    for r in rs:
        r["l"] += off["x"]; r["r"] += off["x"]; r["t"] += off["y"]; r["b"] += off["y"]
    return rs


def run(p, W, H):
    MOB = W < 641
    b = p.chromium.launch(args=GPU)
    ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=1, is_mobile=MOB, has_touch=MOB)
    page = ctx.new_page(); page.route("**/formsubmit.co/**", lambda r: r.abort())
    errs = []; page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append(str(e)))

    # ---------------- Storms ----------------
    page.goto(BASE + "#/storm")
    fr = frame(page, "storm-theater", "!!(typeof LAST!=='undefined'&&LAST) && document.getElementById('pipe').children.length>0")
    page.wait_for_timeout(4000)
    st = fr.evaluate("""({ph:document.getElementById('ph').textContent, first:document.querySelector('#pipe .stage span').textContent,
      stages:[...document.querySelectorAll('#pipe .stage b')].map(b=>b.textContent), lastIso:LAST.iso, lastD:LAST.d,
      sub:document.getElementById('c-sub').textContent, show:document.getElementById('show').textContent,
      d50:document.getElementById('c-d50').textContent, d50hidden:document.getElementById('c-d50').hidden,
      showcase:RC.SHOWCASE, showD:(ST.all||ST.storms).find(s=>s.iso===RC.SHOWCASE)})""")
    print(f"  storms {W}: header={st['ph']!r} first={st['first']!r} stages={st['stages']} last={st['lastIso']}")
    print(f"  card: {st['sub']!r} | button {st['show']!r} | {st['d50']!r}")
    check(st["first"] == "Homes hit", f"[{W}] first stage reads 'Homes hit'")
    check("storm" in st["ph"] and st["lastD"] in st["ph"], f"[{W}] strip header names the one storm it counts")
    check("…" not in "".join(st["stages"]), f"[{W}] stage counts loaded (no pending marks)")
    ly = st["lastIso"][:4]
    if ly != THIS_YEAR:
        check(ly in st["ph"] and ly in st["sub"] and ly in st["show"], f"[{W}] last storm ({st['lastIso']}) shows its year in header, card and button")
    else:
        check(ly not in st["ph"] and ly not in st["show"], f"[{W}] last storm is this year ({st['lastIso']}): no year clutter")
    sy = st["showcase"][:4]
    check(not st["d50hidden"] and "Daily 50" in st["d50"] and (sy in st["d50"] if sy != THIS_YEAR else True),
          f"[{W}] service-area card names the Daily 50 storm ({st['showcase']})")
    if MOB:
        fr.evaluate("setSheet('full')"); page.wait_for_timeout(900)
        fr.evaluate("document.querySelector('.pipe').scrollIntoView({block:'end'})"); page.wait_for_timeout(1800)
    o = orb(page)
    stages = rects(page, fr, "#pipe .stage")
    box = rects(page, fr, "#pipe")[0]
    check(len(stages) == 5, f"[{W}] five stages")
    check(all(not overlap(s, o, 4) for s in stages), f"[{W}] no stage under Nimbus (orb {round(o['l'])},{round(o['t'])}; last stage right {round(stages[-1]['r'])})")
    check(all(s["r"] <= box["r"] + 0.5 and s["l"] >= box["l"] - 0.5 for s in stages), f"[{W}] all five stages fit the strip (Won not cut off)")
    labels = fr.evaluate("[...document.querySelectorAll('#pipe .stage span')].map(s=>s.scrollWidth<=s.clientWidth+1)")
    check(all(labels), f"[{W}] every stage label fully readable")
    page.screenshot(path=str(SHOTS / f"fix-storms-{W}.png"), timeout=150000, animations="disabled")
    if not MOB:
        page.screenshot(path=str(SHOTS / f"fix-storms-strip-{W}.png"), clip={"x": W - 560, "y": H - 200, "width": 560, "height": 200}, timeout=150000, animations="disabled")

    # ---------------- Ask ----------------
    page.goto(BASE + "#/ask")
    fa = frame(page, "c2-nimbus", "!!window.__ready && document.querySelectorAll('#streets .st').length===5")
    page.wait_for_timeout(2500)
    a = fa.evaluate("""(()=>{ const L=map.getStyle().layers.filter(l=>l.type==='line'&&/road|highway|street|minor|major|motorway|trunk|primary|secondary|tertiary/.test(l.id)).map(l=>l.id);
      return {roads:map.queryRenderedFeatures({layers:L}).length, tiles:map.areTilesLoaded(), sdate:[...document.querySelectorAll('.sdate')].map(e=>e.textContent),
        showcase:RC.SHOWCASE, canvas:[map.getCanvas().clientWidth,map.getCanvas().clientHeight], op:getComputedStyle(map.getCanvas()).opacity}; })()""")
    print(f"  ask {W}: roads={a['roads']} tiles={a['tiles']} canvas={a['canvas']} sdate={a['sdate']}")
    check(a["roads"] > 20 and a["tiles"] and a["op"] == "1", f"[{W}] Ask basemap draws its streets ({a['roads']} road features rendered)")
    sy = a["showcase"][:4]
    check(all((sy in d) == (sy != THIS_YEAR) for d in a["sdate"]), f"[{W}] Ask question/source dates carry the year only when not this year ({a['sdate'][0]})")
    # an answer that names the storm: the year rides along, and typing the bare date still finds the storm
    fa.evaluate("(()=>{const i=document.getElementById('ask'); i.value='How many homes did the last storm hit?'; document.getElementById('composer').requestSubmit();})()")
    page.wait_for_timeout(1200)
    ans = fa.evaluate("document.getElementById('answer').textContent")
    print(f"  answer: {ans!r}")
    check(sy == THIS_YEAR or (sy in ans), f"[{W}] Ask answer names the storm with its year")
    bare = fa.evaluate("RC.facts.storm.d")
    hit = fa.evaluate(f"Nimbus.answer('what did {bare} do').html")
    check("storm hit" in hit, f"[{W}] typing the bare date ('{bare}') still finds the storm")
    if MOB:
        fa.evaluate("window.__sheet('half')"); page.wait_for_timeout(1500)
        fa.evaluate("document.getElementById('streets').scrollIntoView({block:'center'})"); page.wait_for_timeout(1800)
    o = orb(page)
    row = rects(page, fa, "#streets")[0]
    cards = rects(page, fa, "#streets .st")
    vis = [c for c in cards if c["r"] > row["l"] and c["l"] < row["r"]]
    check(row["r"] <= o["l"] - 4 or not overlap(row, o), f"[{W}] street card row ends clear of Nimbus (row right {round(row['r'])}, orb left {round(o['l'])})")
    check(all(not overlap({**c, "r": min(c["r"], row["r"])}, o, 2) for c in vis), f"[{W}] no visible street card under Nimbus")
    if not MOB:
        nc = rects(page, fa, "#streets .st .row div+div")
        check(not overlap(nc[-1], o, 2), f"[{W}] 5th card's 'Not reached' number is clear of Nimbus")
        fit = fa.evaluate("[...document.querySelectorAll('#streets .st .row')].every(r=>r.scrollWidth<=r.clientWidth+1&&r.getBoundingClientRect().height<40)")
        check(fit, f"[{W}] 'Max hail' and 'Not reached' stay on one line in every card")
    page.screenshot(path=str(SHOTS / f"fix-ask-{W}.png"), timeout=150000, animations="disabled")
    if MOB:
        # last card scrolled fully into the row window: still clear of the orb
        fa.evaluate("document.querySelector('#streets .st:last-child').scrollIntoView({inline:'end',block:'nearest'})"); page.wait_for_timeout(1500)
        o = orb(page); last = rects(page, fa, "#streets .st")[-1]
        check(not overlap(last, o, 2), f"[{W}] 5th card scrolled in is clear of Nimbus")
        page.screenshot(path=str(SHOTS / f"fix-ask-{W}-last.png"), timeout=150000, animations="disabled")

    check(not errs, f"[{W}] 0 console errors ({errs[:3]})")
    b.close()


with sync_playwright() as p:
    for W, H in [(1440, 900), (390, 844)]:
        run(p, W, H)
print("FAILS:", fails); sys.exit(1 if fails else 0)
