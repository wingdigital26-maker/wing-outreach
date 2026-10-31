"""Direction board for the Today messages map (10-09). Option zero = the real app (map expanded, same sample state as the tiles:
texts sent to the first homes, one scheduled), A/B/C = tour/audit/dirs/map-dirs.html?dir=A|B|C. 1440x900 each, then one board.
Run: python tour/audit/dirs/shoot_dirs.py   (server on :4886 running). Shots: tour/audit/shots/dir-map-0..3.png + dir-map-board.png"""
import pathlib, time
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont

HERE = pathlib.Path(__file__).parent
SHOTS = HERE.parent / "shots"
ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"]
BASE = "http://localhost:4886/tour/"
STOP_LINKS = """() => document.addEventListener('click', e => { const a = e.target.closest('a[href^="tel:"],a[href^="sms:"],a[href^="mailto:"]'); if (a){ e.preventDefault(); window.__lastHref = a.href; } }, false)"""

def deck(page):
    for k in range(600):
        fr = next((f for f in page.frames if "deck.html" in f.url), None)
        if fr:
            try:
                if fr.evaluate("window.__mapReady === true && typeof QREADY !== 'undefined' && QREADY && !!(window.__mapStats && window.__mapStats.hit != null)"): return fr
            except Exception: pass
        page.wait_for_timeout(500)
    raise RuntimeError("deck not ready")

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page(); page.route("**/formsubmit.co/**", lambda r: r.abort())
    # option zero: the real app
    page.goto(BASE + "product.html?dev=1#/daily", wait_until="domcontentloaded", timeout=90000)
    fr = deck(page); fr.evaluate(STOP_LINKS); page.wait_for_timeout(1000)
    # same sample state as the tiles, logged the honest way (text drafts opened, a scheduled reminder), on this check profile only
    for k in range(12):
        fr.evaluate(f"go({k},false)"); page.wait_for_timeout(150)
        fr.evaluate("(()=>{ const h = HOMES[cur]; RC.logText(h.id, { body: 'Direction board sample text', gi: h.gi, lon: h.loc[0], lat: h.loc[1] }); })()") if fr.evaluate("typeof RC.logText === 'function'") else None
    fr.evaluate("RC.remember({id:HOMES[12].id, optin:true}); relist(false); go(12,false)"); page.wait_for_timeout(600)
    fr.evaluate("(()=>{ const b = document.querySelector('.card[data-d=\"0\"] [data-a=\"text\"]'); b && b.click(); })()"); page.wait_for_timeout(600)
    fr.evaluate("(()=>{ const s = document.querySelector('#dSched'); s && s.click(); })()"); page.wait_for_timeout(400)
    fr.evaluate("(()=>{ const o = document.querySelector('#sOk'); o && o.click(); })()"); page.wait_for_timeout(800)
    if fr.evaluate("dlg.open"): fr.evaluate("dlg.close()")
    fr.evaluate("setBig(true)"); page.wait_for_timeout(2500)
    try:
        if page.evaluate("(()=>{const x=document.querySelector('.nb-bubble .nb-x'); if(!x) return false; return x.getBoundingClientRect().width>0})()"):
            page.click(".nb-bubble .nb-x", timeout=4000, force=True); page.wait_for_timeout(300)
    except Exception: pass
    print("app state", fr.evaluate("document.querySelector('.mtag').innerText.split('\\n').slice(0,3)"), flush=True)
    page.screenshot(path=str(SHOTS / "dir-map-0.png"), animations="disabled")
    fr.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('rc.')).forEach(k=>localStorage.removeItem(k))")
    fr.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('rc.')).forEach(k=>localStorage.removeItem(k))")
    print("cleared", fr.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('rc.')).length"), flush=True)
    # A B C
    for i, d in enumerate("ABC", start=1):
        pg = ctx.new_page()
        pg.goto(BASE + f"audit/dirs/map-dirs.html?dir={d}", wait_until="domcontentloaded", timeout=90000)
        for _ in range(120):
            if pg.evaluate("window.__ready === true"): break
            pg.wait_for_timeout(500)
        pg.wait_for_timeout(2500)
        pg.screenshot(path=str(SHOTS / f"dir-map-{i}.png"), animations="disabled"); print("shot", d, flush=True)
        pg.close()
    b.close()

# board: four tiles, two per row, labelled
tiles = [Image.open(SHOTS / f"dir-map-{i}.png").convert("RGB") for i in range(4)]
labels = ["0  Current build (functional, in the app now)", "A  Night glass: dark map, glowing message arcs", "B  Light refined: current palette, gradient arcs, vertical legend", "C  Signal room: ink map, range rings, ribbons, big counters"]
tw, th = 1440 // 2, 900 // 2
board = Image.new("RGB", (tw * 2 + 60, (th + 54) * 2 + 60), "#F3F4F7")
try: font = ImageFont.truetype("arial.ttf", 22)
except Exception: font = ImageFont.load_default()
dr = ImageDraw.Draw(board)
for i, (im, lab) in enumerate(zip(tiles, labels)):
    x = 20 + (i % 2) * (tw + 20); y = 20 + (i // 2) * (th + 54)
    dr.text((x + 4, y), lab, fill="#0B1020", font=font)
    board.paste(im.resize((tw, th), Image.LANCZOS), (x, y + 34))
board.save(SHOTS / "dir-map-board.png")
print("board", SHOTS / "dir-map-board.png")
