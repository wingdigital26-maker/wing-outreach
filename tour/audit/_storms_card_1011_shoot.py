"""Storms house card vs the pipeline dock and the Nimbus orb (10-11). 3312 Caleo Ct (m164153, index 164153) open on
the Storms screen inside the product shell, at every width Jack uses, short and tall. Prints, per shot, whether the
pipeline dock or the orb overlaps the card and whether the card's last control is reachable.
python tour/audit/_storms_card_1011_shoot.py <before|after>   (server on :4886). Shots: tour/audit/storms-card-1011/."""
import pathlib, sys, json
from playwright.sync_api import sync_playwright
TAG = sys.argv[1] if len(sys.argv) > 1 else "before"
ONLY = [int(x) for x in sys.argv[2:]] if len(sys.argv) > 2 else None
OUT = pathlib.Path(__file__).parent / "storms-card-1011"; OUT.mkdir(exist_ok=True)
ARGS = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]
GI = 164153
SIZES = [(390, 844), (768, 1024), (768, 600), (890, 600), (890, 900), (1024, 640), (1024, 768), (1280, 600), (1280, 800), (1440, 900), (1920, 1080)]
if ONLY: SIZES = [s for s in SIZES if s[0] in ONLY]
PROBE = """() => {
  const R = e => { if (!e) return null; const r = e.getBoundingClientRect(); return {l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), vis: !!(r.width && r.height) && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none'}; };
  const peek = document.getElementById('peek'), add = document.getElementById('add');
  return { peek: R(peek), dock: R(document.querySelector('.dock')), pipe: R(document.querySelector('.pipe')), add: R(add),
    sel: document.body.classList.contains('sel'), scroll: peek ? peek.scrollHeight - peek.clientHeight : 0,
    roof: (document.getElementById('p-roof') || {}).innerText || '', sub: (document.getElementById('p-sub') || {}).innerText || '',
    sq: (document.getElementById('p-sq') || {}).innerText || '', vh: innerHeight, vw: innerWidth };
}"""
def inter(a, b):
    if not a or not b or not a["vis"] or not b["vis"]: return False
    return a["l"] < b["r"] and b["l"] < a["r"] and a["t"] < b["b"] and b["t"] < a["b"]
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for W, H in SIZES:
        ctx = b.new_context(viewport={"width": W, "height": H}, timezone_id="America/Chicago", is_mobile=W < 600, has_touch=W < 600)
        ctx.route("**/formsubmit.co/**", lambda r: r.abort())
        ctx.route("**/st-data-dfw/private/**", lambda r: r.fulfill(status=404, body=""))
        page = ctx.new_page(); errs = []
        page.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)[:160]))
        page.goto("http://localhost:4886/tour/product.html?dev=1&nosw=1&noprefetch=1#/storm", wait_until="domcontentloaded", timeout=90000)
        fr = None
        for _ in range(160):
            fr = next((f for f in page.frames if "1b-storm" in f.url), None)
            if fr:
                try:
                    if fr.evaluate("document.body.classList.contains('loaded') && typeof selectHome === 'function'"): break
                except Exception: pass
            page.wait_for_timeout(500)
        page.wait_for_timeout(1500)
        fr.evaluate(f"selectHome({GI}, true)")
        for _ in range(40):   # wait for the roof measurement to land on the card
            page.wait_for_timeout(500)
            try:
                if fr.evaluate("!!(window.FACTS && FACTS[%d] && FACTS[%d].loading === false)" % (GI, GI)): break
            except Exception: pass
        page.wait_for_timeout(1500)
        if W < 600:
            try: fr.locator("#handle").click(timeout=1500); page.wait_for_timeout(900)
            except Exception: pass
        info = fr.evaluate(PROBE)
        orb = page.evaluate("() => { const e = document.querySelector('.nb-dock'); if (!e) return null; const r = e.getBoundingClientRect(); return {l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), vis: !!(r.width && r.height)}; }")
        frbox = page.evaluate("() => { const e = document.querySelector('iframe[data-screen=storm]'); const r = e.getBoundingClientRect(); return {l: Math.round(r.left), t: Math.round(r.top)}; }")
        # card coordinates into the shell's frame
        def shift(x):
            return None if not x else dict(x, l=x["l"] + frbox["l"], r=x["r"] + frbox["l"], t=x["t"] + frbox["t"], b=x["b"] + frbox["t"])
        pk, ad = shift(info["peek"]), shift(info["add"])
        res = {"size": f"{W}x{H}", "sel": info["sel"], "pipe_on_card": inter(info["pipe"], info["peek"]), "dock_on_card": inter(info["dock"], info["peek"]),
               "orb_on_card": inter(orb, pk), "orb_on_last_button": inter(orb, ad), "card_bottom_in_view": bool(pk and pk["b"] <= H + 1),
               "last_button_in_view": bool(ad and ad["b"] <= H + 1 and ad["vis"]), "card_scroll_px": info["scroll"], "peek": pk, "orb": orb, "dock": info["dock"], "pipe": info["pipe"],
               "sq": info["sq"], "sub": info["sub"][:120], "roof": info["roof"][:90], "errs": errs[:3]}
        print(json.dumps(res))
        page.screenshot(path=str(OUT / f"{TAG}-{W}x{H}.png"))
        ctx.close()
    b.close()
