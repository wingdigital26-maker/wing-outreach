"""Quick smoke test for the Storm Map: load, storm, footprints; prints timings and console errors. shoot_st_smoke.py [outdir]"""
import asyncio, sys, time, os, functools
print = functools.partial(print, flush=True)
from playwright.async_api import async_playwright
ARGS=["--use-angle=d3d11","--enable-gpu","--ignore-gpu-blocklist","--enable-unsafe-swiftshader"]
OUT=sys.argv[1] if len(sys.argv)>1 else 'shots/st-round-8'; os.makedirs(OUT,exist_ok=True)
async def main():
    log=[]
    async with async_playwright() as p:
        b=await p.chromium.launch(args=ARGS,headless=True)
        ctx=await b.new_context(viewport={"width":1440,"height":900}); pg=await ctx.new_page()
        pg.on("console", lambda m: log.append(m.type+": "+m.text[:300]) if m.type in ("error",) else None)
        pg.on("pageerror", lambda e: log.append("PAGEERR: "+str(e)[:300]))
        t=time.time(); await pg.goto('http://localhost:4880/1b-storm-theater.html?v='+str(int(t)),wait_until='domcontentloaded',timeout=60000)
        try: await pg.wait_for_function("window.__ready",timeout=40000)
        except Exception: log.append("ready timeout")
        print("ready in", round(time.time()-t,2), "s; loadMs", await pg.evaluate("window.__loadMs"), "count", await pg.evaluate("window.STH&&STH.n"))
        await pg.wait_for_timeout(1200); await pg.screenshot(path=os.path.join(OUT,'smoke-normal.png'))
        await pg.evaluate("window.__show()"); await pg.wait_for_timeout(3200)
        print("hits", await pg.evaluate("__hits()"), "catalog", await pg.evaluate("cur&&cur.n"), "storm", await pg.evaluate("cur&&cur.iso"))
        await pg.screenshot(path=os.path.join(OUT,'smoke-storm.png'))
        pt=await pg.evaluate("window.__selectDemo()")
        if pt:
            await pg.mouse.click(pt['x'],pt['y']); await pg.wait_for_timeout(1600)
            print("fp after select", await pg.evaluate("__fp()"), "zoom", await pg.evaluate("map.getZoom().toFixed(2)"))
            await pg.screenshot(path=os.path.join(OUT,'smoke-selected.png'))
        else: print("no select point")
        await pg.evaluate("__clear()"); await pg.wait_for_timeout(1500)
        await pg.evaluate("__fly('all')"); await pg.wait_for_timeout(1800)
        await pg.screenshot(path=os.path.join(OUT,'smoke-all.png'))
        await b.close()
    print("\n".join(log[:20]) or "no console errors")
asyncio.run(main())
