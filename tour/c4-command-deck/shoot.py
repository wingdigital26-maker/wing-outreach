import sys, asyncio
from playwright.async_api import async_playwright
# shoot.py url out w h [wait_ms] [mobile]
async def main():
    url,out,w,h=sys.argv[1],sys.argv[2],int(sys.argv[3]),int(sys.argv[4])
    wait=int(sys.argv[5]) if len(sys.argv)>5 else 2500
    mob=len(sys.argv)>6
    async with async_playwright() as p:
        b=await p.chromium.launch(args=["--use-angle=d3d11","--enable-gpu","--ignore-gpu-blocklist","--enable-unsafe-swiftshader"])
        ctx=await b.new_context(viewport={"width":w,"height":h},device_scale_factor=2 if mob else 1,is_mobile=mob,has_touch=mob)
        pg=await ctx.new_page()
        await pg.route("**/formsubmit.co/**", lambda r: r.abort())
        msgs=[]
        pg.on("console", lambda m: msgs.append(m.type+": "+m.text) if m.type=="error" else None)
        pg.on("pageerror", lambda e: msgs.append("PAGEERR: "+str(e)))
        await pg.goto(url, wait_until="load", timeout=90000)
        try: await pg.wait_for_function("window.__mapReady===true || window.__ready===true", timeout=45000)
        except Exception: msgs.append("READY TIMEOUT")
        await pg.wait_for_timeout(wait)
        await pg.screenshot(path=out)
        for m in msgs[:10]: print(m)
        await b.close()
asyncio.run(main())
