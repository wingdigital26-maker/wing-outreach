import asyncio, json, os, time
from playwright.async_api import async_playwright
BASE="http://localhost:4880/"; OUT=os.path.dirname(os.path.abspath(__file__)); SH=os.path.join(OUT,"shots")
R=[]
def log(k,v): R.append((k,v)); print(k,"->",str(v)[:300])
async def shot(pg,n):
    try: await pg.screenshot(path=os.path.join(SH,n+".png"),timeout=15000)
    except Exception as e: print("shot",n,e)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=["--use-angle=d3d11","--enable-gpu","--ignore-gpu-blocklist","--enable-unsafe-swiftshader"],headless=True)
        for vp,tag in [({"width":1440,"height":900},"desk"),({"width":390,"height":844},"phone")]:
            ctx=await b.new_context(viewport=vp,device_scale_factor=1,is_mobile=vp["width"]<600,has_touch=vp["width"]<600)
            pg=await ctx.new_page(); errs=[]
            pg.on("pageerror",lambda e: errs.append(str(e)[:120]))
            # shell chat
            await pg.goto(BASE+"product.html?tab=daily",wait_until="load",timeout=45000); await pg.wait_for_timeout(3000)
            await pg.locator(".nb-dock").click(timeout=4000); await pg.wait_for_timeout(900)
            info=await pg.evaluate("() => { const c=[...document.querySelectorAll('body > *')].filter(e=>/chat/i.test(e.className)).map(e=>({cls:e.className, open:getComputedStyle(e).opacity, txt:e.innerText.slice(0,200), inputs:e.querySelectorAll('input,textarea').length, btns:[...e.querySelectorAll('button')].map(b=>b.innerText.trim()).slice(0,8)})); return c }")
            log(f"{tag} shell chat after orb click",info); await shot(pg,f"{tag}-f-chat-open")
            inp=pg.locator("input[placeholder*='Nimbus'], .wm-chat input, input").first
            for q in ["what happened overnight","show me the Alvarez home","who is next","book an inspection at 413 S Pickard","how many homes did Sep 12 hit"]:
                try:
                    await inp.fill(q); await inp.press("Enter"); await pg.wait_for_timeout(1600)
                    ans=await pg.evaluate("() => { const c=[...document.querySelectorAll('body > *')].find(e=>/chat/i.test(e.className)); const m=c?[...c.querySelectorAll('*')].filter(e=>e.children.length===0&&e.innerText&&e.innerText.trim().length>20).map(e=>e.innerText.trim()):[]; return m.slice(-1)[0]||'' }")
                    log(f"{tag} chat Q '{q}'",ans)
                except Exception as e: log(f"{tag} chat Q '{q}'","ERR "+str(e)[:100])
            await shot(pg,f"{tag}-f-chat-answers")
            fr=await pg.evaluate("()=>{try{return document.getElementById('f').contentWindow.location.pathname}catch(e){return '?'}}")
            log(f"{tag} frame after asking to show Alvarez / book",fr)
            await pg.keyboard.press("Escape"); await pg.wait_for_timeout(500)
            op=await pg.evaluate("() => { const c=[...document.querySelectorAll('body > *')].find(e=>/chat/i.test(e.className)); return c? c.className+' op='+getComputedStyle(c).opacity : 'none' }")
            log(f"{tag} Esc closes chat?",op)
            # Ctrl K in shell and inside storm theater
            await pg.keyboard.press("Control+k"); await pg.wait_for_timeout(600)
            log(f"{tag} shell Ctrl K: new visible dialog/palette?", await pg.evaluate("() => [...document.querySelectorAll('[role=dialog],[class*=palette],[class*=cmd],[class*=search]')].filter(e=>e.getBoundingClientRect().width>0).map(e=>e.className).slice(0,5)"))
            await pg.goto(BASE+"1b-storm-theater.html",wait_until="load",timeout=45000); await pg.wait_for_timeout(3500)
            try:
                if await pg.locator("text=Skip").count(): await pg.locator("text=Skip").first.click(timeout=1500); await pg.wait_for_timeout(800)
            except Exception: pass
            before=await pg.evaluate("()=>document.activeElement&&document.activeElement.tagName+'.'+document.activeElement.className")
            await pg.keyboard.press("Control+k"); await pg.wait_for_timeout(500)
            after=await pg.evaluate("()=>document.activeElement&&document.activeElement.tagName+'.'+document.activeElement.className+' | '+(document.activeElement.innerText||'').slice(0,40)")
            log(f"{tag} storm Ctrl K focus before/after",(before,after))
            # ask bar on storm map: click and type
            try:
                ask=pg.locator(".ask, #ask, [class*=ask]").first
                await ask.click(timeout=2500); await pg.keyboard.type("homes over 1.5 in"); await pg.keyboard.press("Enter"); await pg.wait_for_timeout(1200)
                log(f"{tag} storm ask bar typed+enter: active el / text", await pg.evaluate("()=>document.activeElement.tagName+' '+(document.activeElement.value||document.activeElement.innerText||'').slice(0,60)+' | body has typed text='+document.body.innerText.includes('homes over 1.5')"))
                await shot(pg,f"{tag}-f-storm-askbar")
            except Exception as e: log(f"{tag} storm ask bar","ERR "+str(e)[:100])
            # storm Esc with storm selected
            try:
                await pg.locator("#show").click(timeout=2500); await pg.wait_for_timeout(1500)
                await pg.keyboard.press("Escape"); await pg.wait_for_timeout(600)
                log(f"{tag} storm: Esc after selecting storm clears it?", await pg.evaluate("()=>document.body.className"))
            except Exception as e: log(f"{tag} storm esc","ERR "+str(e)[:100])
            log(f"{tag} storm page errors",errs[:5]); errs.clear()
            # deep links + mode + back
            for q in ["?tab=daily","?tab=home&mode=phone","?tab=storm","?tab=ask","?tab=nope"]:
                await pg.goto(BASE+"product.html"+q,wait_until="load",timeout=45000); await pg.wait_for_timeout(2500)
                fr=await pg.evaluate("()=>{try{return document.getElementById('f').contentWindow.location.pathname}catch(e){return '?'}}")
                ph=await pg.evaluate("()=>document.getElementById('main').classList.contains('phone')")
                log(f"{tag} deep link {q}",(fr,"phone" if ph else "desktop"))
                await shot(pg,f"{tag}-f-deep{q.replace('?','-').replace('&','-').replace('=','')}")
            # phone mode layout + nimbus placement
            await pg.goto(BASE+"product.html?tab=daily&mode=phone",wait_until="load",timeout=45000); await pg.wait_for_timeout(3000)
            pos=await pg.evaluate("() => { const d=document.querySelector('.nb-dock').getBoundingClientRect(); const f=document.getElementById('f').getBoundingClientRect(); return {dock:[Math.round(d.x),Math.round(d.y),Math.round(d.width)], frame:[Math.round(f.x),Math.round(f.y),Math.round(f.width),Math.round(f.height)], win:[innerWidth,innerHeight]} }")
            log(f"{tag} phone-mode geometry",pos); await shot(pg,f"{tag}-f-phone-mode")
            # tabs then back
            await pg.get_by_role("button",name="Home",exact=True).click(timeout=4000); await pg.wait_for_timeout(1500)
            await pg.get_by_role("button",name="Ask Nimbus",exact=True).click(timeout=4000); await pg.wait_for_timeout(1500)
            try:
                await pg.go_back(wait_until="commit",timeout=8000); await pg.wait_for_timeout(1200)
                log(f"{tag} browser Back after 2 tab clicks",pg.url.replace(BASE,""))
            except Exception as e: log(f"{tag} browser Back after 2 tab clicks","hung/ERR "+str(e)[:80]+" url="+pg.url.replace(BASE,""))
            # home Book: what changed
            await pg.goto(BASE+"c5-home/index.html",wait_until="load",timeout=45000); await pg.wait_for_timeout(3500)
            bt=await pg.evaluate("()=>document.body.innerText.length")
            await pg.get_by_role("button",name="Book").first.click(timeout=3000,force=True); await pg.wait_for_timeout(900)
            log(f"{tag} home Book: text len before/after, new visible dialog",(bt,await pg.evaluate("()=>document.body.innerText.length"),await pg.evaluate("()=>[...document.querySelectorAll('[role=dialog],.sheet,.modal')].filter(e=>e.getBoundingClientRect().width>0&&getComputedStyle(e).opacity!=='0').map(e=>e.className+':'+e.innerText.slice(0,60))")))
            await shot(pg,f"{tag}-f-home-book")
            # deck: keyboard, 'Find an address', avatar, pipeline bottom, Directions
            await pg.goto(BASE+"c4-command-deck/deck.html",wait_until="load",timeout=45000); await pg.wait_for_timeout(3500)
            c0=await pg.evaluate("()=>document.querySelector('.card[data-d=\"0\"] h2')?.innerText")
            for k in ["ArrowRight","ArrowDown","n","Enter","Space"]:
                await pg.keyboard.press(k); await pg.wait_for_timeout(400)
            log(f"{tag} deck keyboard (arrows/n/enter/space) changed card?",(c0,await pg.evaluate("()=>document.querySelector('.card[data-d=\"0\"] h2')?.innerText")))
            for sel,name in [(".find","Find an address"),("#me, .me","avatar C"),(".pipe .stg, #pipe button","pipeline stage"),("#mnext button, .mnext button","Directions")]:
                try:
                    el=pg.locator(sel).first
                    if not await el.is_visible(): log(f"{tag} deck {name}","not visible"); continue
                    t0=await pg.evaluate("()=>document.body.innerText.length"); u0=pg.url
                    async with pg.context.expect_page(timeout=1000) as pi:
                        await el.click(timeout=2500,force=True)
                    np_=await pi.value; log(f"{tag} deck {name}","opened new tab "+np_.url[:80]); await np_.close()
                except Exception as e:
                    t1=await pg.evaluate("()=>document.body.innerText.length")
                    log(f"{tag} deck {name}", "state changed" if (t1!=t0 or pg.url!=u0) else "NOTHING happened")
            # deck phone: Directions in route sheet
            if tag=="phone":
                try:
                    await pg.locator("#openRoute").click(timeout=2500); await pg.wait_for_timeout(1800)
                    log(f"{tag} route sheet controls",await pg.evaluate("()=>[...document.querySelectorAll('#sheetRoute button, #sheetRoute a')].map(b=>b.innerText.trim()||b.getAttribute('aria-label'))"))
                except Exception as e: log(f"{tag} route sheet","ERR "+str(e)[:80])
            # record.html quick look
            await pg.goto(BASE+"c4-command-deck/record.html",wait_until="load",timeout=45000); await pg.wait_for_timeout(2500)
            log(f"{tag} record.html live controls", await pg.evaluate("()=>[...document.querySelectorAll('button')].filter(b=>b.onclick||b.getAttribute('onclick')).length+' with inline handlers of '+document.querySelectorAll('button').length+' buttons'"))
            log(f"{tag} deck/record errors",errs[:5])
            await ctx.close()
        await b.close()
    json.dump(R,open(os.path.join(OUT,"log-followup.json"),"w"),indent=1)
asyncio.run(main())
