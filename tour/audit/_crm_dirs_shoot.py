"""CRM direction board (10-09): option zero = the real CRM inbox (seeded with a text from Today and a logged reply),
A/B/C = static prototypes in tour/audit/dirs/crm-{a,b,c}.html. Nothing from A/B/C is applied to the app.
Run: python tour/audit/_crm_dirs_shoot.py   (server on :4886). Writes shots/dir-crm-0.png..3.png + dir-crm-board.png,
and dirs/roof-crop.png (the real 3D roof, cropped from option zero, so every tile shows the same real house)."""
import pathlib, sys
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).parent
SHOTS = ROOT / "shots"; DIRS = ROOT / "dirs"
ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"]
URL = "http://localhost:4886/tour/product.html?dev=1&nosw=1#/daily"
GUARD = """document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href^="tel:"],a[href^="sms:"],a[href^="mailto:"]'); if (a) { e.preventDefault(); } }, true);"""
CLEAR = "Object.keys(localStorage).filter(k => k.startsWith('rc.')).forEach(k => localStorage.removeItem(k))"

def frame_of(page, part, ready):
    for _ in range(600):
        fr = next((f for f in page.frames if part in f.url), None)
        if fr:
            try:
                if fr.evaluate(ready): return fr
            except Exception: pass
        page.wait_for_timeout(500)
    raise RuntimeError("frame " + part)

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, timezone_id="America/Chicago")
    ctx.add_init_script(GUARD); ctx.route("**/formsubmit.co/**", lambda r: r.abort())
    page = ctx.new_page()
    page.goto(URL, wait_until="domcontentloaded", timeout=90000)
    fr = frame_of(page, "deck.html", "window.__mapReady === true && typeof QREADY !== 'undefined' && QREADY")
    fr.evaluate(CLEAR); page.reload(wait_until="domcontentloaded")
    fr = frame_of(page, "deck.html", "window.__mapReady === true && typeof QREADY !== 'undefined' && QREADY")
    page.clock.install(time="2026-10-08T11:00:00-05:00"); page.wait_for_timeout(2500)
    def tap(f, sel):
        r = f.evaluate("s => { const e = document.querySelector(s); e.scrollIntoView({block:'nearest'}); const b = e.getBoundingClientRect(); return {x: b.x+b.width/2, y: b.y+b.height/2}; }", sel)
        o = f.frame_element().bounding_box(); page.mouse.click(o["x"] + r["x"], o["y"] + r["y"])
    try: page.click(".nb-bubble .nb-x", timeout=3000, force=True)
    except Exception: pass
    # seed: texts on stops 1 and 2, one logged reply, from Today
    for n in (1, 2):
        fr.evaluate(f"go({n-1},true)"); page.wait_for_timeout(1000)
        tap(fr, '.card[data-d="0"] [data-a="text"]'); page.wait_for_timeout(500); tap(fr, "#dSms"); page.wait_for_timeout(600)
        if fr.evaluate("dlg.open"): fr.evaluate("dlg.close()")
    ids = fr.evaluate("HOMES.slice(0,2).map(h=>h.id)")
    fr.evaluate(f"RC.logReply('{ids[0]}', 'Who is this?', 'text')")
    page.click('nav button[data-screen="home"]', force=True); page.wait_for_timeout(1500)
    cf = frame_of(page, "c5-home", "!!window.renderCRM && !!window.__ready")
    tap(cf, f'.crow[data-id="{ids[0]}"]'); page.wait_for_timeout(2500)
    try: page.click(".nb-bubble .nb-x", timeout=2000, force=True)
    except Exception: pass
    page.wait_for_timeout(800)
    page.screenshot(path=str(SHOTS / "dir-crm-0.png"), animations="disabled"); print("shot 0")
    # the real roof, cropped out of option zero for the prototypes
    r = cf.evaluate("(()=>{ ['.title','.dock','.legend','.labels'].forEach(s=>{ const e=document.querySelector('#stage '+s); if(e) e.style.display='none'; }); const b = document.getElementById('stage').getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height}; })()")
    o = cf.frame_element().bounding_box(); page.wait_for_timeout(300)
    page.screenshot(path=str(DIRS / "roof-crop.png"), clip={"x": o["x"] + r["x"], "y": o["y"] + r["y"], "width": r["w"], "height": r["h"]}, animations="disabled")
    cf.evaluate("['.title','.dock','.legend','.labels'].forEach(s=>{ const e=document.querySelector('#stage '+s); if(e) e.style.display=''; })")
    cf.evaluate(CLEAR)
    for i, k in enumerate("abc", 1):
        pg = ctx.new_page(); pg.goto(f"http://localhost:4886/tour/audit/dirs/crm-{k}.html", wait_until="load"); pg.wait_for_timeout(800)
        pg.screenshot(path=str(SHOTS / f"dir-crm-{i}.png")); pg.close(); print("shot", i)
    b.close()

# the board: option zero top left, then A, B, C
tiles = [("0  Current build (functional, option zero)", "dir-crm-0.png"), ("A  Glass deck", "dir-crm-1.png"), ("B  Mission control", "dir-crm-2.png"), ("C  Field ledger", "dir-crm-3.png")]
TW, TH, PAD, LAB = 720, 450, 24, 44
board = Image.new("RGB", (TW * 2 + PAD * 3, (TH + LAB) * 2 + PAD * 3), "#1A1F2E")
d = ImageDraw.Draw(board)
try: font = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 22)
except Exception: font = ImageFont.load_default()
for i, (label, f) in enumerate(tiles):
    x = PAD + (i % 2) * (TW + PAD); y = PAD + (i // 2) * (TH + LAB + PAD)
    d.text((x, y + 8), label, fill="#FFFFFF", font=font)
    board.paste(Image.open(SHOTS / f).convert("RGB").resize((TW, TH), Image.LANCZOS), (x, y + LAB))
board.save(SHOTS / "dir-crm-board.png"); print("board", SHOTS / "dir-crm-board.png")
