"""Lead card QA shots (10-22): each home at desktop (1440x900) and phone (390x844): the top of the record and the facts card.
  python -E tour/audit/leadcard/shoot.py 92039 89018 ...   (server: python -m http.server 4930 --bind 127.0.0.1 --directory <repo>)
-> tour/audit/leadcard/shots/<row>-<desk|phone>-top.png / -facts.png and shots/results.json (card text, header, errors)."""
import asyncio, json, os, sys
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "shots"); os.makedirs(OUT, exist_ok=True)
URL = "http://127.0.0.1:4930/tour/product.html?dev=1&nointro=1&noprefetch=1&cloud=0#/crm/home/m{}"
SIZES = [("desk", 1440, 900, False), ("phone", 390, 844, True)]


async def main(rows):
    rp = os.path.join(OUT, "results.json"); R = json.load(open(rp)) if os.path.exists(rp) else {}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        for row in rows:
            for name, w, h, mob in SIZES:
                ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mob else 1, is_mobile=mob, has_touch=mob)
                await ctx.route("**/formsubmit.co/**", lambda r: r.abort())
                pg = await ctx.new_page(); errs = []
                pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
                await pg.goto(URL.format(row), wait_until="load", timeout=60000)
                fr = None
                for _ in range(60):
                    fr = next((f for f in pg.frames if f != pg.main_frame), None)
                    try:
                        if fr and await fr.evaluate("(() => { const k = document.getElementById('facts'), t = document.getElementById('titleH'); return !!(k && /Year built/.test(k.innerText) && t && t.textContent); })()"): break
                    except Exception: pass
                    await pg.wait_for_timeout(500)
                await pg.wait_for_timeout(3000)
                # the assistant's passing "Messages go out until 8 pm" bubble covers the card in a still shot: hide its fixed box
                await pg.evaluate("""() => { for (const el of document.querySelectorAll('body *')) { if (el.children.length || !/Messages go out until/.test(el.textContent)) continue;
                  let e = el; while (e && getComputedStyle(e).position !== 'fixed') e = e.parentElement; if (e) e.style.display = 'none'; } }""")
                if fr: await fr.add_style_tag(content="#toast,.toast{display:none!important}")   # a passing 'messages go out until' toast hides the card
                await pg.screenshot(path=os.path.join(OUT, f"{row}-{name}-top.png"))
                info = {}
                try:
                    info = await fr.evaluate("""(() => ({ title: document.getElementById('titleH').textContent, sub: document.getElementById('titleP').textContent,
                      addr: (document.querySelector('h1')||{}).innerText || '',
                      kv: [...document.querySelectorAll('#facts > div')].map(d => [d.querySelector('span').innerText, d.querySelector('b').innerText.replace(/\\n/g, ' | ')]) }))()""")
                    for sel, tag in (("#factsPanel", "facts"), ("#measPanel", "roof")):
                        el = await fr.query_selector(sel)
                        if el: await el.scroll_into_view_if_needed(); await pg.wait_for_timeout(300); await el.screenshot(path=os.path.join(OUT, f"{row}-{name}-{tag}.png"))
                except Exception as e: errs.append("shot: " + str(e)[:200])
                R.setdefault(str(row), {})[name] = dict(info, errors=errs)
                print(row, name, info.get("title"), errs[:2], flush=True)
                await ctx.close()
        await b.close()
    json.dump(R, open(rp, "w"), indent=1)

asyncio.run(main(sys.argv[1:]))
