"""Re-roofs toggle on the Storms map (10-23): turn it on, fly to Allen (Wimbledon Dr wave), click a dot; desktop + phone."""
import asyncio, os
from playwright.async_api import async_playwright
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "after")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        for name, w, h, mob in [s for s in (("desk", 1440, 900, False), ("phone", 390, 844, True)) if s[0] in os.environ.get("SIZES", "desk,phone")]:
            ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mob else 1, is_mobile=mob, has_touch=mob)
            pg = await ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
            await pg.goto("http://127.0.0.1:4930/tour/product.html?dev=1&nointro=1&noprefetch=1&cloud=0#/storm", wait_until="load", timeout=90000)
            await pg.wait_for_timeout(14000)
            fr = next(f for f in pg.frames if "storm-theater" in f.url)
            await fr.click("#rdBtn"); await pg.wait_for_timeout(3000)
            await pg.screenshot(path=os.path.join(OUT, f"storm-rd-wide-{name}.png"))
            await fr.evaluate("map.jumpTo({center:[-96.6455, 33.098], zoom:15.2, pitch:0})"); await pg.wait_for_timeout(5000)
            n = await fr.evaluate("map.queryRenderedFeatures({layers:['rd-dot']}).length")
            if n:
                pt = await fr.evaluate("(() => { const f = map.queryRenderedFeatures({layers:['rd-dot']})[0]; const p = map.project(f.geometry.coordinates); return [p.x, p.y]; })()")
                box = await (await fr.frame_element()).bounding_box()
                await pg.mouse.click(box["x"] + pt[0], box["y"] + pt[1]); await pg.wait_for_timeout(1200)
            await pg.screenshot(path=os.path.join(OUT, f"storm-rd-close-{name}.png"))
            print(name, "dots on screen:", n, "pressed:", await fr.get_attribute("#rdBtn", "aria-pressed"), "popup:", (await fr.evaluate("(document.querySelector('.rd-pop')||{}).innerText || '-'")).replace(chr(10), " "), "errors", errs)
            await ctx.close()
        await b.close()
asyncio.run(main())
