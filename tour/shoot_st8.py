"""Storm Map capture, rounds 8+: shoot_st8.py <round N> -> shots/st-round-N/
city.png (all homes), footprints.png (neighbourhood), storm.png, storm-selected.png, hover.png, county-midflight.png, all-counties.png,
search.png, phone.png, phone-storm.png, phone-sheet.png, overlap.json, perf.json (load ms, FPS during a scripted pan and zoom), vs-prev.png."""
import sys, os, asyncio, shutil, json, time
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw
ROOT=os.path.dirname(os.path.abspath(__file__)); N=int(sys.argv[1]); OUT=os.path.join(ROOT,'shots',f'st-round-{N}'); os.makedirs(OUT,exist_ok=True)
PREV=os.path.join(ROOT,'shots',f'st-round-{N-1}'); BASE='http://localhost:4880/'
ARGS=["--use-angle=d3d11","--enable-gpu","--ignore-gpu-blocklist","--enable-unsafe-swiftshader"]
SEL=['.cap','.ask','.sig','.stat','.peek','.dock','.sh','.ph','.read.show','.tlab','.tick','.stage','.concept-tag','.maplibregl-ctrl-attrib','.chip-s','.sheet','.cta.show','.tip.on','.handle','.nav','.res.on']
OVERLAP_JS="""(sels)=>{ const els=[]; sels.forEach(s=>document.querySelectorAll(s).forEach(e=>{ const cs=getComputedStyle(e); if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity===0) return; const r=e.getBoundingClientRect(); if(r.width<2||r.height<2) return; if(r.bottom<0||r.right<0||r.top>innerHeight||r.left>innerWidth) return; els.push({s,e,r}); }));
  const out=[]; for(let i=0;i<els.length;i++) for(let j=i+1;j<els.length;j++){ const a=els[i],b=els[j]; if(a.e.contains(b.e)||b.e.contains(a.e)) continue; if(a.e.parentElement===b.e.parentElement&&a.s===b.s&&a.s!=='.tlab') continue;
    const x=Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left), y=Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top); const sheet=document.getElementById('sheet'); const layered=(a.s==='.cta.show'&&(b.s==='.sheet'||sheet.contains(b.e)))||(b.s==='.cta.show'&&(a.s==='.sheet'||sheet.contains(a.e))); if(layered) continue;
    if((a.s==='.res.on'&&b.s==='.ask')||(b.s==='.res.on'&&a.s==='.ask')) continue; /* the results sheet hangs from the search field by design */
    if(x>0.5&&y>0.5) out.push({a:a.s,b:b.s,x:Math.round(x),y:Math.round(y)}); }
  return out; }"""
FPS_JS="""async (cam)=>{ const frames=[]; let last=performance.now(); let on=true; const tick=t=>{ frames.push(t-last); last=t; if(on) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  await new Promise(res=>{ map.once('moveend',res); map.easeTo(Object.assign({duration:2200,easing:t=>t},cam)); }); on=false; frames.shift();
  const ms=frames.reduce((a,b)=>a+b,0)/frames.length; const long=frames.filter(f=>f>33).length; return {frames:frames.length,avgFps:Math.round(1000/ms*10)/10,p95ms:Math.round(frames.slice().sort((a,b)=>a-b)[Math.floor(frames.length*0.95)]*10)/10,framesOver33ms:long}; }"""
async def main():
    log=[]; overlaps={}; perf={}
    async with async_playwright() as p:
        b=await p.chromium.launch(args=ARGS,headless=True)
        async def page(w,h,mobile=False,key='d'):
            ctx=await b.new_context(viewport={"width":w,"height":h},device_scale_factor=2 if mobile else 1,is_mobile=mobile,has_touch=mobile)
            pg=await ctx.new_page(); await pg.route("**/formsubmit.co/**", lambda r: r.abort())
            pg.on("console", lambda m: log.append(m.type+": "+m.text[:200]) if m.type in ("error",) else None)
            pg.on("pageerror", lambda e: log.append("PAGEERR: "+str(e)[:200]))
            t=time.time(); await pg.goto(BASE+'1b-storm-theater.html?v='+str(int(t)),wait_until='domcontentloaded',timeout=90000)
            await pg.wait_for_function("window.__ready",timeout=90000)
            perf[key+'_readyMs']=round((time.time()-t)*1000); perf[key+'_homesLoadedMs']=await pg.evaluate("window.__loadMs"); perf[key+'_homes']=await pg.evaluate("STH.n")
            await pg.wait_for_timeout(1200)
            return pg
        async def settle(pg,ms=1400):
            await pg.wait_for_timeout(ms)
            try: await pg.wait_for_function("map.loaded()",timeout=15000)
            except Exception: log.append('map.loaded timeout')
            await pg.wait_for_timeout(300)
        async def ov(pg,key): overlaps[key]=await pg.evaluate(OVERLAP_JS,SEL)
        async def shot(pg,name,key=None):
            await pg.screenshot(path=os.path.join(OUT,name+'.png'))
            if key: await ov(pg,key)
        # ---- desktop 1440
        pg=await page(1440,900)
        await shot(pg,'city','1440-city')
        perf['panFps']=await pg.evaluate(FPS_JS,{"center":[-97.52,35.33],"zoom":12.4})
        perf['zoomFps']=await pg.evaluate(FPS_JS,{"center":[-97.44,35.22],"zoom":15.6,"pitch":52,"bearing":20})
        await settle(pg,2500); await pg.wait_for_timeout(1200)
        perf['footprintsInView']=await pg.evaluate("__fp()")
        await shot(pg,'footprints','1440-footprints')
        hp=await pg.evaluate("window.__hoverDemo()")
        if hp:
            await pg.mouse.move(hp['x'],hp['y']); await pg.wait_for_timeout(500); await shot(pg,'hover','1440-hover'); await pg.mouse.move(8,460); await pg.wait_for_timeout(300)
        await pg.evaluate("window.__show()"); await settle(pg,3000)
        perf['stormHits']=await pg.evaluate("__hits()"); perf['stormCatalog']=await pg.evaluate("cur.n")
        await shot(pg,'storm','1440-storm')
        pt=await pg.evaluate("window.__selectDemo()")
        if pt:
            await pg.mouse.click(pt['x'],pt['y']); await settle(pg,1600)
            await shot(pg,'storm-selected','1440-storm-selected')
        else: log.append('no select point')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
        await pg.evaluate("__fly('canadian')"); await pg.wait_for_timeout(650)
        await shot(pg,'county-midflight','1440-midflight')
        await settle(pg,1400); await pg.evaluate("__clear()"); await settle(pg,1500)
        await pg.evaluate("__fly('all')"); await settle(pg,2200); await pg.wait_for_timeout(600)
        await shot(pg,'all-counties','1440-all')
        # search: a storm by date (local), then an address via Nominatim if reachable
        await pg.click('#q'); await pg.keyboard.type('Sep 12'); await pg.wait_for_timeout(700)
        await shot(pg,'search','1440-search')
        await pg.keyboard.press('Escape')
        await pg.click('#q'); await pg.fill('#q',''); await pg.keyboard.type('W Main St Norman'); await pg.wait_for_timeout(2600)
        n=await pg.evaluate("document.querySelectorAll('#res button').length")
        perf['searchResults']=n
        if n:
            await shot(pg,'search-address','1440-search-address')
            await pg.keyboard.press('Enter'); await settle(pg,1800); await shot(pg,'search-flown','1440-search-flown')
        await pg.context.close()
        # ---- phone
        pg=await page(390,844,True,'m')
        ovw=await pg.evaluate("Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)>innerWidth")
        if ovw: log.append('HORIZONTAL OVERFLOW at 390')
        await shot(pg,'phone','390-normal')
        await pg.evaluate("window.__show()"); await settle(pg,3000)
        await shot(pg,'phone-storm','390-storm')
        pt=await pg.evaluate("window.__selectDemo()")
        if pt:
            await pg.mouse.click(pt['x'],pt['y']); await settle(pg,1400)
            await shot(pg,'phone-sheet','390-sheet')
        else: log.append('no phone select point')
        await pg.context.close(); await b.close()
    perf['consoleErrors']=log
    json.dump(overlaps,open(os.path.join(OUT,'overlap.json'),'w'),indent=1)
    json.dump(perf,open(os.path.join(OUT,'perf.json'),'w'),indent=1)
    for a,bn in (('storm','1b-storm.png'),('city','1b-normal.png'),('phone','1-phone.png'),('storm','1b-storm-theater.png')):
        if os.path.exists(os.path.join(OUT,a+'.png')): shutil.copy(os.path.join(OUT,a+'.png'),os.path.join(ROOT,'shots',bn))
    # vs previous round: storm view side by side
    prev=os.path.join(PREV,'storm.png') if os.path.exists(os.path.join(PREV,'storm.png')) else os.path.join(PREV,'1b-storm.png')
    if os.path.exists(prev) and os.path.exists(os.path.join(OUT,'storm.png')):
        a=Image.open(prev).convert('RGB'); c=Image.open(os.path.join(OUT,'storm.png')).convert('RGB'); h=600; a=a.resize((int(a.width*h/a.height),h)); c=c.resize((int(c.width*h/c.height),h))
        im=Image.new('RGB',(a.width+c.width+30,h+40),'white'); im.paste(a,(0,40)); im.paste(c,(a.width+30,40)); d=ImageDraw.Draw(im); d.text((10,12),f'round {N-1}',fill='black'); d.text((a.width+40,12),f'round {N}',fill='black'); im.save(os.path.join(OUT,'vs-prev.png'))
    bad={k:v for k,v in overlaps.items() if v}
    print(json.dumps(perf,indent=1)); print('OVERLAPS:',json.dumps(bad) if bad else 'none'); print('\n'.join(log) or 'no console errors')
asyncio.run(main())
