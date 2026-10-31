"""Information-organisation audit: full-page shots of every page/state at desktop + phone,
inventory of text blocks, scripted overlap check (getBoundingClientRect intersections), Pillow annotations.
Writes only to audit/. Does not touch app files."""
import asyncio, json, os, time
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw, ImageFont

BASE = "http://localhost:4880/"
OUT = os.path.dirname(os.path.abspath(__file__))
IA = os.path.join(OUT, "shots", "ia"); os.makedirs(IA, exist_ok=True)
DESK = {"width": 1440, "height": 900}; PHONE = {"width": 390, "height": 844}
RESULT = {}

# page, url, state setup (async fn), name
async def st_select(pg):
    try:
        if await pg.locator("text=Skip").count(): await pg.locator("text=Skip").first.click(timeout=1500)
    except Exception: pass
    await pg.wait_for_timeout(800)
    try: await pg.locator("#show").click(timeout=2500); await pg.wait_for_timeout(1800)
    except Exception: pass
    # try to open a house card by clicking around centre
    vp = pg.viewport_size
    for (dx, dy) in [(0,0),(-60,20),(40,-30),(-120,60),(90,50),(0,80),(-30,-60),(120,-40)]:
        await pg.mouse.click(vp["width"]//2+dx, vp["height"]//2+dy); await pg.wait_for_timeout(700)
        ok = await pg.evaluate("() => { const r=document.querySelector('#record,.record'); return !!r && r.getBoundingClientRect().width>0 && getComputedStyle(r).opacity!=='0' && r.innerText.length>10 }")
        if ok: break
    # phone: pull sheet up
    try:
        if vp["width"] < 600 and await pg.locator("#handle").count():
            await pg.locator("#handle").click(timeout=1500); await pg.wait_for_timeout(900)
    except Exception: pass

async def st_skip(pg):
    try:
        if await pg.locator("text=Skip").count(): await pg.locator("text=Skip").first.click(timeout=1500)
    except Exception: pass
    await pg.wait_for_timeout(800)

async def home_plane(pg):
    pass  # handled via ?plane=A

async def deck_roof(pg):
    try: await pg.locator('.card[data-d="0"] [data-a="roof"]').click(timeout=2500); await pg.wait_for_timeout(1200)
    except Exception: pass

async def deck_route(pg):
    try:
        if await pg.locator("#openRoute").is_visible(): await pg.locator("#openRoute").click(timeout=2500); await pg.wait_for_timeout(1800)
    except Exception: pass

async def ask_full(pg):
    try:
        if await pg.locator(".handle,#handle").count(): await pg.locator(".handle,#handle").first.click(timeout=1500); await pg.wait_for_timeout(900)
    except Exception: pass

async def noop(pg): pass

PAGES = [
    ("opening", "1a-storm-intro.html", noop, "opening", 4000),
    ("storm", "1b-storm-theater.html", st_skip, "default", 3500),
    ("storm", "1b-storm-theater.html?recent=1", st_select, "recent-selected", 3500),
    ("daily", "c4-command-deck/deck.html", noop, "default", 3500),
    ("daily", "c4-command-deck/deck.html", deck_roof, "roof-sheet", 3500),
    ("daily", "c4-command-deck/deck.html", deck_route, "route-sheet", 3500),
    ("daily-record", "c4-command-deck/record.html", noop, "default", 3500),
    ("home", "c5-home/index.html", noop, "default", 4000),
    ("home", "c5-home/index.html?plane=A&mode=hail", noop, "plane-selected-hail", 4000),
    ("ask", "c2-nimbus/index.html", noop, "default", 3500),
    ("ask", "c2-nimbus/index.html", ask_full, "sheet-full", 3500),
    ("shell", "product.html?tab=daily", noop, "shell-daily", 4000),
]

INVENTORY_JS = """() => {
  const out = [];
  const walk = (el, depth) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3) {
        const t = n.textContent.replace(/\\s+/g,' ').trim(); if (!t) continue;
        const p = n.parentElement; const r = p.getBoundingClientRect(); const s = getComputedStyle(p);
        if (r.width === 0 || r.height === 0 || s.visibility === 'hidden' || s.display === 'none') continue;
        let op = 1, q = p; while (q) { op *= parseFloat(getComputedStyle(q).opacity); q = q.parentElement; } if (op < 0.05) continue;
        out.push({ t: t.slice(0, 90), tag: p.tagName.toLowerCase(), cls: (typeof p.className === 'string' ? p.className : '').slice(0, 40), fs: Math.round(parseFloat(s.fontSize)), fw: s.fontWeight, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
      } else if (n.nodeType === 1 && !['SCRIPT','STYLE','NOSCRIPT'].includes(n.tagName)) walk(n, depth + 1);
    }
  };
  walk(document.body, 0);
  // canvases/maps/svgs as blocks
  document.querySelectorAll('canvas, .maplibregl-map, svg.roof, #gl').forEach(c => { const r = c.getBoundingClientRect(); if (r.width > 40 && r.height > 40) out.push({ t: '[' + (c.className && c.className.baseVal !== undefined ? c.className.baseVal : c.className || c.tagName.toLowerCase()) + ' visual]', tag: c.tagName.toLowerCase(), cls: '', fs: 0, fw: '', x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }); });
  return out;
}"""

OVERLAP_JS = """() => {
  // candidate boxes: elements that own text directly, plus images/canvas/svg
  const items = [];
  const vis = (e) => { const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false; let q = e; while (q) { const s = getComputedStyle(q); if (s.visibility === 'hidden' || s.display === 'none' || parseFloat(s.opacity) < 0.05) return false; q = q.parentElement; } return true; };
  document.querySelectorAll('body *').forEach(e => {
    if (['SCRIPT','STYLE'].includes(e.tagName)) return;
    const ownText = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    const media = ['CANVAS','IMG','SVG'].includes(e.tagName) && !e.closest('button') && !e.closest('a');
    if (!(ownText || media)) return; if (!vis(e)) return;
    const r = e.getBoundingClientRect();
    items.push({ el: e, label: (e.innerText || e.getAttribute('aria-label') || e.tagName).replace(/\\s+/g,' ').trim().slice(0, 40), tag: e.tagName.toLowerCase(), cls: (typeof e.className === 'string' ? e.className : (e.className && e.className.baseVal) || '').slice(0, 30), x: r.x, y: r.y, w: r.width, h: r.height, media });
  });
  const pairs = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ix > 4 && iy > 4) {
      const kind = (a.media || b.media) ? 'text-over-visual' : 'text-over-text';
      pairs.push({ kind, a: { label: a.label, tag: a.tag, cls: a.cls, box: [Math.round(a.x), Math.round(a.y), Math.round(a.w), Math.round(a.h)] }, b: { label: b.label, tag: b.tag, cls: b.cls, box: [Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)] }, overlap: [Math.round(ix), Math.round(iy)] });
    }
  }
  return pairs;
}"""

def annotate(src, dst, pairs, title):
    im = Image.open(src).convert("RGB"); d = ImageDraw.Draw(im)
    try: f = ImageFont.truetype("arial.ttf", 13)
    except Exception: f = ImageFont.load_default()
    n = 0
    for p in pairs:
        col = (220, 40, 40) if p["kind"] == "text-over-text" else (235, 140, 20)
        for k in ("a", "b"):
            x, y, w, h = p[k]["box"]
            d.rectangle([x, y, x + w, y + h], outline=col, width=2)
        x, y, w, h = p["a"]["box"]; n += 1
        d.text((x + 2, max(0, y - 15)), f"{n}", fill=col, font=f)
    d.rectangle([0, 0, im.width, 20], fill=(11, 16, 32))
    d.text((6, 3), f"{title}  red=text over text ({sum(1 for p in pairs if p['kind']=='text-over-text')})  orange=text over map/3D ({sum(1 for p in pairs if p['kind']!='text-over-text')})", fill=(255, 255, 255), font=f)
    im.save(dst)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"], headless=True)
        for vp, tag in [(DESK, "desk"), (PHONE, "phone")]:
            ctx = await b.new_context(viewport=vp, device_scale_factor=1, is_mobile=vp["width"] < 600, has_touch=vp["width"] < 600)
            await ctx.route("**/formsubmit.co/**", lambda r: r.abort())
            for page, url, setup, state, wait in PAGES:
                pg = await ctx.new_page()
                key = f"{tag}-{page}-{state}"
                try:
                    try: await pg.goto(BASE + url, wait_until="load", timeout=45000)
                    except Exception as e: print("goto", key, e)
                    await pg.wait_for_timeout(wait)
                    await asyncio.wait_for(setup(pg), timeout=30)
                    await pg.wait_for_timeout(600)
                    full = os.path.join(IA, key + ".png")
                    try: await pg.screenshot(path=full, full_page=True, timeout=20000)
                    except Exception: await pg.screenshot(path=full, timeout=20000)
                    view = os.path.join(IA, key + "-view.png"); await pg.screenshot(path=view, timeout=20000)
                    inv = await pg.evaluate(INVENTORY_JS)
                    pairs = await pg.evaluate(OVERLAP_JS)
                    sh = await pg.evaluate("() => ({sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight})")
                    annotate(view, os.path.join(IA, key + "-annot.png"), pairs, key)
                    RESULT[key] = {"url": url, "inventory": inv, "overlaps": pairs, "scroll": sh}
                    print(key, "items", len(inv), "overlaps", len(pairs), "tot", sum(1 for q in pairs if q["kind"] == "text-over-text"), "scroll", sh)
                except Exception as e:
                    print("ERR", key, str(e)[:160]); RESULT[key] = {"url": url, "error": str(e)[:200]}
                await pg.close()
            await ctx.close()
        await b.close()
    with open(os.path.join(OUT, "ia-data.json"), "w", encoding="utf-8") as f: json.dump(RESULT, f, indent=1)
    print("DONE")

asyncio.run(main())
