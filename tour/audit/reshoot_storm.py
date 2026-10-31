import sys; sys.stdout.reconfigure(encoding="utf-8")
import asyncio, os
from playwright.async_api import async_playwright
BASE="http://localhost:4880/"; SH=os.path.join(os.path.dirname(os.path.abspath(__file__)),"shots","ia")
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=["--use-angle=d3d11","--enable-gpu","--ignore-gpu-blocklist","--enable-unsafe-swiftshader"],headless=True)
        for vp,tag in [({"width":1440,"height":900},"desk"),({"width":390,"height":844},"phone")]:
            ctx=await b.new_context(viewport=vp,device_scale_factor=1,is_mobile=vp["width"]<600,has_touch=vp["width"]<600)
            pg=await ctx.new_page(); errs=[]
            pg.on("pageerror",lambda e: errs.append(str(e)[:120])); pg.on("requestfailed",lambda r: errs.append("REQFAIL "+r.url[-40:]))
            for q,name in [("","default"),("?recent=1","recent")]:
                try: await pg.goto(BASE+"1b-storm-theater.html"+q,wait_until="load",timeout=45000)
                except Exception as e: print("goto",e)
                await pg.wait_for_timeout(5000)
                try:
                    if await pg.locator("text=Skip").count(): await pg.locator("text=Skip").first.click(timeout=1500); await pg.wait_for_timeout(1000)
                except Exception: pass
                await pg.screenshot(path=os.path.join(SH,f"{tag}-storm-NOW-{name}.png"),timeout=20000)
                txt=await pg.evaluate("()=>document.body.innerText.replace(/\s+/g,' ').slice(0,500)")
                ctrls=await pg.evaluate("()=>[...document.querySelectorAll('button,a')].filter(e=>e.getBoundingClientRect().width>0).map(e=>(e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,30)).filter(Boolean)")
                print(f"\n## {tag} {name}\nTEXT: {txt}\nCONTROLS: {ctrls}\nERRS: {errs[:4]}"); errs.clear()
                # select the latest storm + a home
                try:
                    for sel in ["#show","button:has-text('Show the Sep 12')","button:has-text('Sep 12')"]:
                        if await pg.locator(sel).count(): await pg.locator(sel).first.click(timeout=2500); await pg.wait_for_timeout(2000); break
                    for (dx,dy) in [(0,0),(-60,20),(40,-30),(-120,60),(90,50),(0,80),(-30,-60),(120,-40),(-90,-20)]:
                        await pg.mouse.click(vp["width"]//2+dx,vp["height"]//2+dy); await pg.wait_for_timeout(700)
                        ok=await pg.evaluate("()=>{const r=document.querySelector('#record,.record,.rec,[class*=record]'); return !!r&&r.getBoundingClientRect().width>0&&getComputedStyle(r).opacity!=='0'&&r.innerText.length>10}")
                        if ok: break
                    if vp["width"]<600 and await pg.locator("#handle").count():
                        try: await pg.locator("#handle").click(timeout=1500); await pg.wait_for_timeout(900)
                        except Exception: pass
                    await pg.screenshot(path=os.path.join(SH,f"{tag}-storm-NOW-{name}-selected.png"),timeout=20000)
                    rec=await pg.evaluate("()=>{const r=document.querySelector('#record,.record,.rec,[class*=record]'); return r? r.innerText.replace(/\s+/g,' ').slice(0,300):'no record el'}")
                    print("RECORD:",rec)
                    # Open record now?
                    for sel in ["button:has-text('Open record')","#cta",".btn"]:
                        if await pg.locator(sel).count() and await pg.locator(sel).first.is_visible():
                            u0=pg.url; t0=await pg.evaluate("()=>document.body.innerText.length")
                            await pg.locator(sel).first.click(timeout=2500,force=True); await pg.wait_for_timeout(1500)
                            print("OPEN RECORD ->", "navigated "+pg.url if pg.url!=u0 else ("state changed" if (await pg.evaluate("()=>document.body.innerText.length"))!=t0 else "NOTHING")); break
                    print("ERRS after select:",errs[:4])
                except Exception as e: print("select err",str(e)[:120])
            await ctx.close()
        await b.close()
asyncio.run(main())
