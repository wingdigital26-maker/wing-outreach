import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=["--use-angle=d3d11","--enable-gpu","--ignore-gpu-blocklist","--enable-unsafe-swiftshader"])
        pg=await b.new_page(viewport={"width":1440,"height":900})
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
        await pg.goto("http://localhost:4880/c5-home/index.html", wait_until="load")
        await pg.wait_for_function("window.__ready===true"); await pg.wait_for_timeout(800)
        title=lambda: pg.evaluate("document.getElementById('measTitle').textContent")
        # click on the red front slope pixel (find a reddish pixel in the canvas)
        pt=await pg.evaluate("""() => { const c=document.getElementById('gl'); const r=c.getBoundingClientRect();
          const gl=c.getContext('webgl2')||c.getContext('webgl'); return [r.left+r.width*0.44, r.top+r.height*0.37]; }""")
        await pg.mouse.click(pt[0], pt[1]); await pg.wait_for_timeout(1500)
        t1=await title(); chip=await pg.evaluate("document.querySelector('.chip.on').dataset.m")
        pins=await pg.evaluate("[...document.querySelectorAll('.epin')].filter(e=>e.style.visibility==='visible').length")
        print("click plane ->", t1, "| mode:", chip, "| edge pins visible:", pins)
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(1300)
        print("esc ->", await title(), "| mode:", await pg.evaluate("document.querySelector('.chip.on').dataset.m"))
        await pg.click("#table tbody tr:nth-child(5)"); await pg.wait_for_timeout(1300)
        print("row 5 ->", await title(), await pg.evaluate("document.getElementById('measPill').textContent"))
        # click empty stage corner
        await pg.mouse.click(60, 700); await pg.wait_for_timeout(1300)
        print("click away ->", await title())
        await pg.click("#bExplode"); await pg.wait_for_timeout(900); print("explode label:", await pg.evaluate("document.getElementById('bExplode').textContent"))
        print("errors:", errs)
        await b.close()
asyncio.run(main())
