"""Skip + greeting check on the opening alone (?short=1&wait=1, never released): the corner Skip is visible by 3 s,
the greeting shows the roofer's first name, the hold cue reads 'Still loading' after 12 s, a click on Skip ends it."""
import asyncio, os, json
from playwright.async_api import async_playwright
OUT=os.path.dirname(os.path.abspath(__file__))
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(headless=True,args=["--use-angle=d3d11","--enable-gpu","--ignore-gpu-blocklist"])
        pg=await (await b.new_context(viewport={"width":1440,"height":900})).new_page()
        await pg.goto("http://127.0.0.1:4886/tour/1a-storm-intro.html?short=1&wait=1",wait_until="load")
        r={}
        await pg.wait_for_timeout(3500)
        r['skip_3s']=await pg.evaluate("()=>{const s=document.getElementById('skip');const c=getComputedStyle(s);return {hidden:s.hidden,op:c.opacity,disp:c.display,x:s.getBoundingClientRect().right,y:s.getBoundingClientRect().bottom,font:c.fontFamily.slice(0,20)}}")
        await pg.wait_for_timeout(6500)
        r['beat_10s']=await pg.evaluate("()=>({beat:window.__beat,hi:document.querySelector('#beat-hi').className,text:document.querySelector('#beat-hi .beat-big').textContent.trim(),loading:document.documentElement.className,cue:document.getElementById('load-t').textContent})")
        await pg.screenshot(path=os.path.join(OUT,"hold-10s.png"))
        await pg.wait_for_timeout(9000)
        r['cue_19s']=await pg.evaluate("()=>document.getElementById('load-t').textContent")
        await pg.screenshot(path=os.path.join(OUT,"hold-still-19s.png"))
        await pg.click("#skip")
        await pg.wait_for_timeout(300)
        r['after_skip']=await pg.evaluate("()=>document.body.className")
        print(json.dumps(r,indent=1)); open(os.path.join(OUT,"skip-check.json"),"w").write(json.dumps(r,indent=1))
        await b.close()
asyncio.run(main())
