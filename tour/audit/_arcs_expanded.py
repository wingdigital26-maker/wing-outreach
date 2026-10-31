"""Expanded aerial Today map at 1440: empty, then 3 contacts through the real card buttons, then cleared.
Checks: 0 console errors, no request off localhost/basemaps, Nimbus (shell, bottom-right) does not cover the legend
or the stop card. Run: python tour/audit/_arcs_expanded.py   (server on :4886)."""
import pathlib
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:4886/tour/product.html?dev=1#/daily"
SHOTS = pathlib.Path(__file__).parent / "shots"; SHOTS.mkdir(exist_ok=True)
OK = ("localhost", "127.0.0.1", "tiles.openfreemap.org", "basemap.nationalmap.gov")
fails = []
def check(c, m):
    print(("ok   " if c else "FAIL ") + m, flush=True)
    if not c: fails.append(m)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page(); page.set_default_timeout(90000)
    # real clock: the run is inside Texas calling hours (9 am to 8 pm Central)
    page.route("**/formsubmit.co/**", lambda r: r.abort())
    errs, foreign = [], []
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)))
    page.on("request", lambda r: foreign.append(r.url) if "://" in r.url and r.url.split("/")[2].split(":")[0] not in OK else None)
    page.goto(URL, wait_until="commit", timeout=180000); print("loaded", flush=True)
    fr = None
    for _ in range(400):
        fr = next((f for f in page.frames if "deck.html" in f.url), None)
        try:
            if fr and fr.evaluate("window.__mapReady === true"): break
        except Exception: pass
        page.wait_for_timeout(500)
    print("frame ready", flush=True)
    fr.evaluate("""() => document.addEventListener('click', e => { const a = e.target.closest('a[href^="tel:"],a[href^="sms:"],a[href^="mailto:"],a[href^="https://www.google.com/maps"]'); if (a) e.preventDefault(); }, true)""")
    def overlap():
        # Nimbus's dock (shell page) against the legend and the stop card (deck frame), in page pixels
        nb = page.evaluate("(()=>{const e=document.querySelector('.nb-dock.in'); if(!e) return null; const r=e.getBoundingClientRect(); return [r.left,r.top,r.right,r.bottom]})()")
        bb = fr.frame_element().bounding_box(); ifr = [bb['x'], bb['y']]
        boxes = fr.evaluate("['.mleg','#mnext'].map(s=>{const r=document.querySelector(s).getBoundingClientRect(); return [s,r.left,r.top,r.right,r.bottom]})")
        hits = []
        if nb:
            for s, l, t, r_, bt in boxes:
                l += ifr[0]; r_ += ifr[0]; t += ifr[1]; bt += ifr[1]
                if min(r_, nb[2]) - max(l, nb[0]) > 0 and min(bt, nb[3]) - max(t, nb[1]) > 0: hits.append(s)
        return nb, hits
    def expand(on):
        if fr.evaluate("document.documentElement.classList.contains('mapbig')") != on: fr.click("#mExp")
        page.wait_for_timeout(2500)
    expand(True); page.wait_for_timeout(10000)
    nb, hits = overlap(); print("nimbus", nb, hits, flush=True)
    check(not hits, f"empty: Nimbus clear of legend and stop card {hits}")
    check(fr.evaluate("document.querySelectorAll('.reach .q').length") == 12, "empty: 12 queued lines")
    page.screenshot(path=str(SHOTS / "arcs-expanded-empty-1440.png"), timeout=60000, animations="disabled")
    expand(False)
    card = '.card[data-d="0"]'
    fr.click(f"{card} a.call"); fr.click(f'{card} [data-out="no_answer"]'); fr.click(f'{card} [data-a="next"]'); page.wait_for_timeout(900)
    fr.click(f'{card} [data-a="text"]'); page.wait_for_timeout(400); fr.click("#dSms"); page.wait_for_timeout(700)
    fr.evaluate("dlg.open && dlg.close()"); fr.evaluate("go(2, true)"); page.wait_for_timeout(900)
    fr.click(f"{card} a.call"); fr.click(f'{card} [data-out="spoke"]'); page.wait_for_timeout(600)
    expand(True); page.wait_for_timeout(6000)
    arcs = fr.evaluate("[...document.querySelectorAll('.reach .arc')].map(a=>a.dataset.ch).sort()")
    check(arcs == ["call", "call", "text"], f"contacted: lines {arcs}")
    print("note", fr.evaluate("document.querySelector('.mleg .lnote').textContent"), flush=True)
    nb, hits = overlap(); check(not hits, f"contacted: Nimbus clear of legend and stop card {hits}")
    page.screenshot(path=str(SHOTS / "arcs-expanded-contacted-1440.png"), timeout=60000, animations="disabled")
    check(not errs, f"0 console errors {errs[:4]}")
    check(not foreign, f"no foreign requests {foreign[:4]}")
    fr.evaluate("() => { ['att','pipe','d50skip'].forEach(k => localStorage.removeItem('rc.t.'+k)); localStorage.removeItem('rc.reachDay'); }")
    check(fr.evaluate("RC.contacted({all:true}).length") == 0, "test contacts cleared")
    print("FAILS:", len(fails), fails, flush=True)
    import os; os._exit(0)
