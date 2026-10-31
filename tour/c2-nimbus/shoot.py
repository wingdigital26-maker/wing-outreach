import sys, os, asyncio
from playwright.async_api import async_playwright
URL="http://localhost:4880/c2-nimbus/index.html"
OUT=sys.argv[1] if len(sys.argv)>1 else "shots"
os.makedirs(OUT,exist_ok=True)
async def shot(p,name,w,h,mobile=False,click=None,sheet=None):
    b=await p.chromium.launch(args=["--use-angle=d3d11","--enable-gpu","--ignore-gpu-blocklist","--enable-unsafe-swiftshader"])
    pg=await b.new_page(viewport={"width":w,"height":h},device_scale_factor=2 if mobile else 1,is_mobile=mobile,has_touch=mobile)
    await pg.route("**/formsubmit.co/**", lambda r: r.abort())
    msgs=[]
    pg.on("console", lambda m: msgs.append(m.type+": "+m.text) if m.type in ("error","warning") else None)
    pg.on("pageerror", lambda e: msgs.append("PAGEERR: "+str(e)))
    await pg.goto(URL, wait_until="load", timeout=90000)
    try: await pg.wait_for_function("window.__ready===true", timeout=60000)
    except Exception: msgs.append("READY TIMEOUT")
    if click is not None:
        await pg.click(f'.st[data-id="{click}"]'); await pg.wait_for_timeout(2500)
    if sheet: await pg.evaluate(f"window.__sheet('{sheet}')"); await pg.wait_for_timeout(900)
    await pg.wait_for_timeout(2500)
    ov=await pg.evaluate("[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(e).position!=='fixed'&&!e.closest('#map')&&!e.closest('.streets')).map(e=>e.className||e.tagName).slice(0,6)")
    print(name, "src=",await pg.evaluate("window.__streetSrc"), "scrollW=",await pg.evaluate("document.documentElement.scrollWidth"), "overflow:",ov)
    for d in {OUT,"shots"}: await pg.screenshot(path=os.path.join(d,name))
    for m in msgs[:10]: print("  ",m)
    await b.close()
async def main():
    async with async_playwright() as p:
        await shot(p,"2-nimbus-copilot.png",1440,900)
        await shot(p,"2-click.png",1440,900,click=2)
        await shot(p,"2-phone.png",390,844,mobile=True)
        await shot(p,"2-phone-sheet.png",390,844,mobile=True,sheet="full")
        await shot(p,"2-phone-430.png",430,932,mobile=True)
asyncio.run(main())
