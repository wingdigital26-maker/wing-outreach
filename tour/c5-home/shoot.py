import sys, asyncio, os
from playwright.async_api import async_playwright
# shoot.py round_dir   -> captures the full set for c5-home
BASE = "http://localhost:4880/c5-home/index.html"
SHOTS = [
    ("home.png",            "",               1440, 900, False, None),
    ("home-plane.png",      "?plane=A",       1440, 900, False, None),
    ("home-dims.png",       "?mode=dims",     1440, 900, False, None),
    ("home-hail.png",       "?mode=hail",     1440, 900, False, None),
    ("home-edges.png",      "?mode=edges",    1440, 900, False, None),
    ("home-full.png",       "",               1440, 900, False, "full"),
    ("home-phone.png",      "",               390,  844, True,  None),
    ("home-phone-plane.png","?plane=A",       390,  844, True,  None),
]
async def main():
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    only = sys.argv[2:]
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=d3d11","--enable-gpu","--ignore-gpu-blocklist","--enable-unsafe-swiftshader"])
        for name, qs, w, h, mob, full in SHOTS:
            if only and name not in only: continue
            ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mob else 1, is_mobile=mob, has_touch=mob)
            pg = await ctx.new_page()
            msgs = []
            pg.on("console", lambda m: msgs.append(m.type+": "+m.text) if m.type == "error" else None)
            pg.on("pageerror", lambda e: msgs.append("PAGEERR: "+str(e)))
            await pg.goto(BASE + qs, wait_until="load", timeout=60000)
            try: await pg.wait_for_function("window.__ready===true", timeout=30000)
            except Exception: msgs.append("READY TIMEOUT")
            await pg.wait_for_timeout(600)
            try: await pg.wait_for_function("window.__settled===true", timeout=8000)
            except Exception: msgs.append("SETTLE TIMEOUT")
            await pg.wait_for_timeout(900)
            await pg.screenshot(path=os.path.join(out, name), full_page=bool(full))
            # overflow check per element at phone width
            if mob:
                ov = await pg.evaluate("[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth+1&&r.width>0&&getComputedStyle(e).position!=='fixed'}).slice(0,6).map(e=>e.tagName+'.'+e.className)")
                if ov: msgs.append("OVERFLOW: " + ", ".join(map(str, ov)))
            print(name, "OK" if not msgs else "; ".join(msgs[:6]))
            await ctx.close()
        await b.close()
asyncio.run(main())
