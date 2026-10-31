"""Storm Map capture: shoot_st.py <round N> -> shots/st-round-N/
1b-normal.png, 1b-storm.png, 1b-selected.png, 1b-hover.png, 1b-1280-normal.png, 1b-1280-storm.png, 1-phone.png, 1-phone-sheet.png,
overlap.json (getBoundingClientRect intersections between visible panels / labels at 1440, 1280, 390) and vs-prev.png."""
import sys, os, asyncio, shutil, json
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw, ImageFont
ROOT=os.path.dirname(os.path.abspath(__file__)); N=int(sys.argv[1]); OUT=os.path.join(ROOT,'shots',f'st-round-{N}'); os.makedirs(OUT,exist_ok=True)
PREV=os.path.join(ROOT,'shots',f'st-round-{N-1}'); BASE='http://localhost:4880/'
ARGS=["--use-angle=d3d11","--enable-gpu","--ignore-gpu-blocklist","--enable-unsafe-swiftshader"]
SEL=['.cap','.ask','.sig','.stat','.peek','.dock','.sh','.ph','.read.show','.tlab','.tick','.stage','.concept-tag','.maplibregl-ctrl-attrib','.chip-s','.sheet','.cta.show','.tip.on','.handle']
OVERLAP_JS="""(sels)=>{ const els=[]; sels.forEach(s=>document.querySelectorAll(s).forEach(e=>{ const cs=getComputedStyle(e); if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity===0) return; const r=e.getBoundingClientRect(); if(r.width<2||r.height<2) return; if(r.bottom<0||r.right<0||r.top>innerHeight||r.left>innerWidth) return; els.push({s,e,r}); }));
  const out=[]; for(let i=0;i<els.length;i++) for(let j=i+1;j<els.length;j++){ const a=els[i],b=els[j]; if(a.e.contains(b.e)||b.e.contains(a.e)) continue; if(a.e.parentElement===b.e.parentElement&&a.s===b.s&&a.s!=='.tlab') continue;
    const x=Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left), y=Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top); const sheet=document.getElementById('sheet'); const layered=(a.s==='.cta.show'&&(b.s==='.sheet'||sheet.contains(b.e)))||(b.s==='.cta.show'&&(a.s==='.sheet'||sheet.contains(a.e))); if(layered) continue; /* the phone CTA floats over the sheet by design, with a fade and 96px of sheet padding under it */
    if(x>0.5&&y>0.5) out.push({a:a.s,b:b.s,x:Math.round(x),y:Math.round(y)}); }
  return out; }"""
async def main():
    log=[]; overlaps={}
    async with async_playwright() as p:
        b=await p.chromium.launch(args=ARGS,headless=True)
        async def page(w,h,mobile=False):
            ctx=await b.new_context(viewport={"width":w,"height":h},device_scale_factor=2 if mobile else 1,is_mobile=mobile,has_touch=mobile)
            pg=await ctx.new_page(); await pg.route("**/formsubmit.co/**", lambda r: r.abort())
            pg.on("console", lambda m: log.append(m.type+": "+m.text) if m.type in ("error",) else None)
            pg.on("pageerror", lambda e: log.append("PAGEERR: "+str(e)))
            await pg.goto(BASE+'1b-storm-theater.html',wait_until='load',timeout=90000)
            await pg.wait_for_function("window.__ready",timeout=90000); await pg.wait_for_timeout(1500)
            return pg
        async def settle(pg,ms=1400):
            await pg.wait_for_timeout(ms)
            try: await pg.wait_for_function("map.loaded()",timeout=15000)
            except Exception: log.append('map.loaded timeout')
            await pg.wait_for_timeout(300)
        async def ov(pg,key):
            overlaps[key]=await pg.evaluate(OVERLAP_JS,SEL)
        async def desktop(w,h,tag):
            pg=await page(w,h)
            await pg.screenshot(path=os.path.join(OUT,f'1b{tag}-normal.png')); await ov(pg,f'{w}-normal')
            await pg.evaluate("window.__show()"); await settle(pg,2600)
            await pg.screenshot(path=os.path.join(OUT,f'1b{tag}-storm.png')); await ov(pg,f'{w}-storm')
            pt=await pg.evaluate("window.__selectDemo()")
            if pt:
                await pg.mouse.click(pt['x'],pt['y']); await pg.wait_for_timeout(700)
                await pg.screenshot(path=os.path.join(OUT,f'1b{tag}-selected.png')); await ov(pg,f'{w}-selected')
                hp=await pg.evaluate("window.__hoverDemo()")
                if hp and tag=='':
                    await pg.mouse.move(hp['x'],hp['y']); await pg.wait_for_timeout(500)
                    await pg.screenshot(path=os.path.join(OUT,'1b-hover.png')); await ov(pg,f'{w}-hover')
            else: log.append(f'no select point at {w}')
            if tag=='':
                await pg.mouse.move(8,460); await pg.evaluate("map.jumpTo({zoom:12.4,pitch:46})"); await settle(pg,2500); await pg.wait_for_timeout(800)
                await pg.screenshot(path=os.path.join(OUT,'1b-city.png')); await ov(pg,f'{w}-city')
                await pg.evaluate("map.jumpTo({zoom:13.4,pitch:58})"); await settle(pg,2000)
            # calm view with a home selected (record panel in normal mode)
            await pg.evaluate("window.__clear()"); await settle(pg,2600)
            pt=await pg.evaluate("window.__selectDemo()")
            if pt:
                await pg.mouse.click(pt['x'],pt['y']); await pg.wait_for_timeout(700)
                await pg.screenshot(path=os.path.join(OUT,f'1b{tag}-normal-selected.png')); await ov(pg,f'{w}-normal-selected')
            await pg.context.close()
        await desktop(1440,900,'')
        await desktop(1280,800,'-1280')
        # phone: calm peek, then storm + selected home with the sheet at half
        pg=await page(390,844,True)
        ovw=await pg.evaluate("Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)>innerWidth")
        if ovw: log.append('HORIZONTAL OVERFLOW at 390')
        await pg.screenshot(path=os.path.join(OUT,'1-phone.png')); await ov(pg,'390-normal')
        await pg.evaluate("window.__show()"); await settle(pg,2600)
        await pg.screenshot(path=os.path.join(OUT,'1-phone-storm.png')); await ov(pg,'390-storm')
        pt=await pg.evaluate("window.__selectDemo()")
        if pt:
            await pg.mouse.click(pt['x'],pt['y']); await pg.wait_for_timeout(900)
            await pg.screenshot(path=os.path.join(OUT,'1-phone-sheet.png')); await ov(pg,'390-sheet')
        else: log.append('no phone select point')
        await pg.context.close()
        await b.close()
    json.dump(overlaps,open(os.path.join(OUT,'overlap.json'),'w'),indent=1)
    for f in ('1b-normal.png','1b-storm.png','1-phone.png'):
        if os.path.exists(os.path.join(OUT,f)): shutil.copy(os.path.join(OUT,f),os.path.join(ROOT,'shots',f))
    if os.path.exists(os.path.join(OUT,'1b-storm.png')): shutil.copy(os.path.join(OUT,'1b-storm.png'),os.path.join(ROOT,'shots','1b-storm-theater.png'))
    # side by side vs previous round (previous rounds only had a storm view)
    if os.path.isdir(PREV):
        pa=os.path.join(PREV,'1b-storm.png'); pa=pa if os.path.exists(pa) else os.path.join(PREV,'1b-storm-theater.png')
        pn=os.path.join(PREV,'1b-normal.png'); pn=pn if os.path.exists(pn) else pa
        rows=[(pn,'1b-normal.png'),(pa,'1b-storm.png')]
        pp=os.path.join(PREV,'1-phone.png'); pc=Image.open(os.path.join(OUT,'1-phone.png')).convert('RGB').resize((390,844))
        pa_img=Image.open(pp).convert('RGB').resize((390,844)) if os.path.exists(pp) else Image.new('RGB',(390,844),'#333')
        W=1440*2+60; H=40+len(rows)*950+844+50
        img=Image.new('RGB',(W,H),'#111'); d=ImageDraw.Draw(img)
        try: font=ImageFont.truetype('arial.ttf',26)
        except Exception: font=ImageFont.load_default()
        y=40
        for prev,f in rows:
            a=Image.open(prev).convert('RGB').resize((1440,900)); c=Image.open(os.path.join(OUT,f)).convert('RGB').resize((1440,900))
            d.text((20,y-34),f'round {N-1}  {os.path.basename(prev)}',fill='#bbb',font=font); d.text((1440+40,y-34),f'round {N}  {f}',fill='#fff',font=font)
            img.paste(a,(20,y)); img.paste(c,(1440+40,y)); y+=950
        d.text((20,y-34),f'round {N-1}  phone',fill='#bbb',font=font); d.text((1440+40,y-34),f'round {N}  phone',fill='#fff',font=font)
        img.paste(pa_img,(20,y)); img.paste(pc,(1440+40,y))
        img.save(os.path.join(OUT,'vs-prev.png'))
    for m in log[:15]: print(m)
    tot=sum(len(v) for v in overlaps.values()); print('overlaps:',tot, {k:len(v) for k,v in overlaps.items() if v})
    for k,v in overlaps.items():
        for o in v[:6]: print(' ',k,o)
    print('done',OUT)
asyncio.run(main())
