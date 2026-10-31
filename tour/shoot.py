import sys, asyncio, json
from playwright.async_api import async_playwright
# usage: shoot.py url out w h wait_ms [js_ready_expr]
async def main():
    url,out,w,h,wait=sys.argv[1],sys.argv[2],int(sys.argv[3]),int(sys.argv[4]),int(sys.argv[5])
    ready=sys.argv[6] if len(sys.argv)>6 else None
    async with async_playwright() as p:
        b=await p.chromium.launch(args=["--use-angle=d3d11","--enable-gpu","--ignore-gpu-blocklist","--enable-unsafe-swiftshader"],headless=True)
        pg=await b.new_page(viewport={"width":w,"height":h},device_scale_factor=1)
        await pg.route("**/formsubmit.co/**", lambda r: r.abort())
        msgs=[]
        pg.on("console", lambda m: msgs.append(m.type+": "+m.text) if m.type in ("error","warning") else None)
        pg.on("pageerror", lambda e: msgs.append("PAGEERR: "+str(e)))
        await pg.goto(url, wait_until="load", timeout=90000)
        if ready:
            try: await pg.wait_for_function(ready, timeout=60000)
            except Exception as e: msgs.append("READY TIMEOUT")
        await pg.wait_for_timeout(wait)
        await pg.screenshot(path=out)
        for m in msgs[:12]: print(m)
        await b.close()
asyncio.run(main())
