"""Storm Theater phone capture: shoot_st_mobile.py <round N> -> shots/st-mobile-round-N/ (390x844 and 430x932 at 2x) + vs-prev.png"""
import sys, os, asyncio, shutil
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw, ImageFont
ROOT=os.path.dirname(os.path.abspath(__file__)); N=int(sys.argv[1]); OUT=os.path.join(ROOT,'shots',f'st-mobile-round-{N}'); os.makedirs(OUT,exist_ok=True)
PREV=os.path.join(ROOT,'shots',f'st-mobile-round-{N-1}'); BASE='http://localhost:4880/'
ARGS=["--use-angle=d3d11","--enable-gpu","--ignore-gpu-blocklist","--enable-unsafe-swiftshader"]
SIZES=[(390,844,''),(430,932,'-430')]
async def main():
    log=[]
    async with async_playwright() as p:
        b=await p.chromium.launch(args=ARGS,headless=True)
        for w,h,suf in SIZES:
            ctx=await b.new_context(viewport={"width":w,"height":h},device_scale_factor=2,is_mobile=True,has_touch=True)
            pg=await ctx.new_page(); pg.on("pageerror", lambda e: log.append("PAGEERR: "+str(e))); pg.on("console", lambda m: log.append("console error: "+m.text) if m.type=="error" else None)
            await pg.goto(BASE+'1b-storm-theater.html',wait_until='load',timeout=90000); await pg.wait_for_function("window.__ready",timeout=90000); await pg.wait_for_timeout(900)
            ov=await pg.evaluate("Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)>innerWidth")
            if ov: log.append(f'HORIZONTAL OVERFLOW at {w}')
            await pg.screenshot(path=os.path.join(OUT,f'1-phone{suf}.png'))
            await pg.evaluate("window.__setSheet('half')"); await pg.wait_for_timeout(600)
            await pg.screenshot(path=os.path.join(OUT,f'1-phone-sheet{suf}.png'))
            await pg.goto(BASE+'1a-storm-intro.html?hold=1',wait_until='load',timeout=90000)
            await pg.wait_for_function("window.__revealT && window.__map",timeout=90000); await pg.wait_for_function("performance.now()-window.__revealT>1700",timeout=30000)
            await pg.screenshot(path=os.path.join(OUT,f'1-phone-intro{suf}.png'))
            await ctx.close()
        await b.close()
    shutil.copy(os.path.join(OUT,'1-phone.png'),os.path.join(ROOT,'shots','1-phone.png'))
    if os.path.isdir(PREV):
        names=['1-phone.png','1-phone-sheet.png','1-phone-intro.png']
        imgs=[]
        for n in names:
            a=os.path.join(PREV,n); c=os.path.join(OUT,n)
            A=Image.open(a).convert('RGB').resize((390,844)) if os.path.exists(a) else Image.new('RGB',(390,844),'#333')
            C=Image.open(c).convert('RGB').resize((390,844)); imgs.append((A,C,n))
        W=len(imgs)*(390*2+30)+20; H=844+60
        img=Image.new('RGB',(W,H),'#111'); d=ImageDraw.Draw(img)
        try: font=ImageFont.truetype('arial.ttf',18)
        except: font=ImageFont.load_default()
        x=20
        for A,C,n in imgs:
            d.text((x,20),f'r{N-1} {n}',fill='#bbb',font=font); img.paste(A,(x,50)); x+=400
            d.text((x,20),f'r{N} {n}',fill='#fff',font=font); img.paste(C,(x,50)); x+=410
        img.save(os.path.join(OUT,'vs-prev.png'))
    for m in log[:15]: print(m)
    print('done',OUT)
asyncio.run(main())
