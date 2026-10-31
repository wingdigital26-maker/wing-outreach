import asyncio, os, json
from playwright.async_api import async_playwright
OUT=os.path.dirname(os.path.abspath(__file__))
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(headless=True,args=["--use-angle=d3d11","--enable-gpu","--ignore-gpu-blocklist"])
        pg=await (await b.new_context(viewport={"width":1440,"height":900})).new_page()
        await pg.goto("http://127.0.0.1:4886/tour/1a-storm-intro.html?short=1&wait=1",wait_until="load")
        await pg.wait_for_timeout(4000)
        print(await pg.evaluate("()=>{const s=document.getElementById('skip');const r=s.getBoundingClientRect();const c=getComputedStyle(s);const e=document.elementFromPoint(r.left+10,r.top+10);return {rect:[r.left,r.top,r.width,r.height],color:c.color,vis:c.visibility,z:c.zIndex,top:e&&(e.id||e.tagName+'.'+e.className),stageZ:getComputedStyle(document.getElementById('stage')||document.body).zIndex,stagePos:getComputedStyle(document.getElementById('stage')||document.body).position}}"))
        await pg.screenshot(path=os.path.join(OUT,"skip-corner.png"),clip={"x":1240,"y":800,"width":200,"height":100})
        await b.close()
asyncio.run(main())
