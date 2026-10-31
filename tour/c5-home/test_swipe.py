"""Phone swipe check for the pipeline columns: a real touch scroll gesture on the board, at 390 x 844, in the app shell.
Reports scroll metrics before and after. python test_swipe.py"""
import asyncio, time
from playwright.async_api import async_playwright

URL = "http://localhost:4886/tour/product.html?dev=1#/home"


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        await ctx.route("**/formsubmit.co/**", lambda r: r.abort())
        pg = await ctx.new_page()
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await pg.goto(URL, wait_until="load", timeout=60000)
        fr = None
        for _ in range(60):
            fr = next((f for f in pg.frames if "c5-home" in f.url), None)
            if fr and await fr.evaluate("!!document.querySelector('#pcols .pc')"):
                break
            await pg.wait_for_timeout(1000)
        await fr.evaluate("document.getElementById('pcols').scrollIntoView({block:'center'})")
        await pg.wait_for_timeout(1500)
        info = await fr.evaluate("(() => { const c = document.getElementById('pcols'); const r = c.getBoundingClientRect(); return {sw: c.scrollWidth, cw: c.clientWidth, top: r.top, h: r.height, sl: c.scrollLeft}; })()")
        off = await (await pg.query_selector('iframe[data-screen="home"]')).bounding_box()
        print("pcols", info, "iframe at", off, flush=True)
        cdp = await ctx.new_cdp_session(pg)
        x, y = off["x"] + 330, off["y"] + info["top"] + 40
        # control: vertical touch scroll of the page, and a horizontal touch swipe on the stage strip
        y0 = await fr.evaluate("scrollY")
        await cdp.send("Input.synthesizeScrollGesture", {"x": 200, "y": 600, "xDistance": 0, "yDistance": 300, "gestureSourceType": "touch", "speed": 400})
        await pg.wait_for_timeout(1200)
        print("control vertical touch: page scrollY", y0, "->", await fr.evaluate("scrollY"), flush=True)
        await fr.evaluate("document.getElementById('pcols').scrollIntoView({block:'center'})"); await pg.wait_for_timeout(800)
        info = await fr.evaluate("(() => { const c = document.getElementById('pcols'); const r = c.getBoundingClientRect(); return {top: r.top}; })()")
        y = off["y"] + info["top"] + 40
        await cdp.send("Input.synthesizeScrollGesture", {"x": x, "y": y, "xDistance": -260, "yDistance": 0, "gestureSourceType": "touch", "speed": 300, "preventFling": True})
        await pg.wait_for_timeout(1500)
        print("slow touch swipe on board: scrollLeft", await fr.evaluate("document.getElementById('pcols').scrollLeft"), flush=True)
        for src in ("touch", "mouse"):
            await cdp.send("Input.synthesizeScrollGesture", {"x": x, "y": y, "xDistance": -260, "yDistance": 0, "gestureSourceType": src, "speed": 800})
            await pg.wait_for_timeout(1200)
            print(src, "scrollLeft ->", await fr.evaluate("document.getElementById('pcols').scrollLeft"), "page scrollY", await fr.evaluate("scrollY"), flush=True)
        print("errors", errs[:5])
        await b.close()
asyncio.run(main())
