import sys; sys.stdout.reconfigure(encoding="utf-8")
import asyncio, os
from playwright.async_api import async_playwright
BASE="http://localhost:4880/"; SH=os.path.join(os.path.dirname(os.path.abspath(__file__)),"shots")
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=["--use-angle=d3d11","--enable-gpu","--ignore-gpu-blocklist","--enable-unsafe-swiftshader"],headless=True)
        for vp,tag in [({"width":1440,"height":900},"desk"),({"width":390,"height":844},"phone")]:
            ctx=await b.new_context(viewport=vp,device_scale_factor=1,is_mobile=vp["width"]<600,has_touch=vp["width"]<600)
            pg=await ctx.new_page()
            await pg.goto(BASE+"product.html?tab=daily",wait_until="load",timeout=45000); await pg.wait_for_timeout(3000)
            await pg.locator(".nb-dock").click(timeout=4000); await pg.wait_for_timeout(900)
            st=await pg.evaluate("()=>{const p=document.querySelector('.wmp'); return {open:p.classList.contains('open'), askHidden:p.querySelector('.wmp-ask').hidden, qs:[...p.querySelectorAll('.wmp-q button')].map(b=>b.innerText), body:p.querySelector('.wmp-body').innerText.slice(0,160)}}")
            print(tag,"chat opened:",st)
            # click a suggested q
            await pg.locator(".wmp-q button").first.click(timeout=3000); await pg.wait_for_timeout(1500)
            print(tag,"after suggested q:",await pg.evaluate("()=>{const p=document.querySelector('.wmp'); return {askHidden:p.querySelector('.wmp-ask').hidden, body:p.querySelector('.wmp-body').innerText.slice(-200)}}"))
            await pg.screenshot(path=os.path.join(SH,f"{tag}-g-chat-suggested.png"))
            inp=pg.locator(".wmp-ask input")
            for q in ["what happened overnight","show me the Alvarez home","who is next","book an inspection at 413 S Pickard","how many homes did Sep 12 hit","which storm hit the most homes"]:
                if await inp.is_visible():
                    await inp.fill(q); await inp.press("Enter"); await pg.wait_for_timeout(1700)
                    print(tag,f"Q '{q}' ->",await pg.evaluate("()=>document.querySelector('.wmp-body').innerText.slice(-230).split(String.fromCharCode(10)).join(' / ')"))
                else: print(tag,"ask input hidden; cannot type"); break
            await pg.screenshot(path=os.path.join(SH,f"{tag}-g-chat-typed.png"))
            print(tag,"frame after chat:",await pg.evaluate("()=>{try{return document.getElementById('f').contentWindow.location.pathname}catch(e){return '?'}}"))
            await pg.keyboard.press("Escape"); await pg.wait_for_timeout(500)
            print(tag,"Esc closes chat:",await pg.evaluate("()=>!document.querySelector('.wmp').classList.contains('open')"))
            # Nimbus bubble overlap check on Home + Storm tab
            for t in ["Home","Storm map"]:
                await pg.get_by_role("button",name=t,exact=True).click(timeout=4000); await pg.wait_for_timeout(2600)
                print(tag,t,"bubble:",await pg.evaluate("()=>{const b=document.querySelector('.nb-bubble'); const r=b.getBoundingClientRect(); return {on:b.classList.contains('on'), box:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)], text:b.innerText.slice(0,80)}}"))
            # storm map NOW: selected state shots
            await pg.goto(BASE+"1b-storm-theater.html?recent=1",wait_until="load",timeout=45000); await pg.wait_for_timeout(5000)
            try:
                if await pg.locator("text=Skip").count(): await pg.locator("text=Skip").first.click(timeout=1500); await pg.wait_for_timeout(1000)
            except Exception: pass
            hits=pg.locator("button.hit, button[aria-label*='storm,']")
            n=await hits.count(); print(tag,"timeline hit buttons:",n)
            if n:
                try: await hits.nth(n-1).click(timeout=3000,force=True); await pg.wait_for_timeout(2500)
                except Exception as e: print("hit click",str(e)[:80])
            # click homes
            opened=False
            for (dx,dy) in [(0,0),(-60,20),(40,-30),(-120,60),(90,50),(0,80),(-30,-60),(120,-40),(-90,-20),(200,0),(-200,0)]:
                await pg.mouse.click(vp["width"]//2+dx,vp["height"]//2+dy); await pg.wait_for_timeout(800)
                ok=await pg.evaluate("()=>{const r=document.querySelector('#record,.record,[class*=record]'); return !!r&&r.getBoundingClientRect().width>0&&getComputedStyle(r).opacity!=='0'&&r.innerText.length>10}")
                if ok: opened=True; break
            print(tag,"home record opened by clicking map:",opened)
            if vp["width"]<600:
                try: await pg.locator("#handle, button[aria-label='Open details']").first.click(timeout=1500); await pg.wait_for_timeout(1000)
                except Exception: pass
            await pg.screenshot(path=os.path.join(SH,"ia",f"{tag}-storm-NOW-recent-selected.png"),timeout=20000)
            print(tag,"storm text:",await pg.evaluate("()=>document.body.innerText.split(String.fromCharCode(10)).join(' / ').slice(0,420)"))
            for sel in ["button:has-text('Open record')","#cta",".btn"]:
                if await pg.locator(sel).count() and await pg.locator(sel).first.is_visible():
                    u0=pg.url; t0=await pg.evaluate("()=>document.body.innerText.length")
                    await pg.locator(sel).first.click(timeout=2500,force=True); await pg.wait_for_timeout(1500)
                    print(tag,"OPEN RECORD ->","navigated "+pg.url if pg.url!=u0 else ("state changed" if (await pg.evaluate("()=>document.body.innerText.length"))!=t0 else "NOTHING")); break
            else: print(tag,"no visible Open record button")
            await pg.keyboard.press("Escape"); await pg.wait_for_timeout(600)
            print(tag,"Esc on storm: body class / storm still selected:",await pg.evaluate("()=>document.body.className+' | '+document.body.innerText.includes('Clear')"))
            # search bar
            try:
                sb=pg.locator("input").first
                if await sb.is_visible():
                    await sb.click(); await pg.keyboard.type("Lindsey"); await pg.wait_for_timeout(800)
                    print(tag,"search typed 'Lindsey' -> suggestions/results visible:",await pg.evaluate("()=>[...document.querySelectorAll('[class*=result],[class*=sugg],[role=listbox],[role=option]')].filter(e=>e.getBoundingClientRect().width>0).map(e=>e.innerText.slice(0,60))"))
                    await pg.keyboard.press("Enter"); await pg.wait_for_timeout(1500)
                    await pg.screenshot(path=os.path.join(SH,f"{tag}-g-storm-search.png"),timeout=20000)
                    print(tag,"after Enter text:",await pg.evaluate("()=>document.body.innerText.split(String.fromCharCode(10)).join(' / ').slice(0,200)"))
            except Exception as e: print(tag,"search err",str(e)[:100])
            await ctx.close()
        await b.close()
asyncio.run(main())
