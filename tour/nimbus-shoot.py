import asyncio, sys
from playwright.async_api import async_playwright
B="http://localhost:4880/product.html"; O="shots/nimbus-shell/"
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(args=["--use-angle=d3d11","--enable-gpu","--ignore-gpu-blocklist","--enable-unsafe-swiftshader"],headless=True)
    pg=await b.new_page(viewport={"width":1440,"height":900})
    await pg.route("**/formsubmit.co/**", lambda r: r.abort())
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(B, timeout=60000)
    await pg.wait_for_timeout(4000)
    await pg.screenshot(path=O+"0-opening.png")
    # auto-advance
    await pg.wait_for_function("document.querySelector('nav .on') && document.querySelector('nav .on').textContent==='Storm map'",timeout=40000); await pg.wait_for_timeout(900)
    print("after intro tab:", await pg.evaluate("document.querySelector('nav .on').textContent"))
    await pg.screenshot(path=O+"1-arrive-greeting.png")
    await pg.wait_for_timeout(5500)
    await pg.screenshot(path=O+"2-storm.png")
    for i,name in [(2,"3-daily"),(3,"4-home"),(4,"5-ask")]:
      await pg.click(f"nav button:nth-child({i+1})"); await pg.wait_for_timeout(3500)
      await pg.screenshot(path=O+name+".png")
    await pg.evaluate("Nimbus.check(Nimbus.updates[3],6500)"); await pg.wait_for_timeout(1800)
    await pg.screenshot(path=O+"6-update-alert.png")
    await pg.click(".nb-dock .wm-root"); await pg.wait_for_timeout(2500)
    await pg.click(".wmp-q button >> nth=0"); await pg.wait_for_timeout(2500)
    await pg.screenshot(path=O+"7-chat-open.png")
    await pg.keyboard.press("Escape"); await pg.wait_for_timeout(500)
    print("chat open after esc:", await pg.evaluate("Nimbus.chat.el.classList.contains('open')"))
    await pg.click("nav button:nth-child(3)"); await pg.click("#dPhone"); await pg.wait_for_timeout(4000)
    await pg.screenshot(path=O+"8-phone-daily.png")
    await pg.evaluate("Nimbus.say(Nimbus.updates[2],6500)"); await pg.wait_for_timeout(600)
    await pg.screenshot(path=O+"8b-phone-bubble.png")
    await pg.click(".nb-dock .wm-root"); await pg.wait_for_timeout(2500)
    await pg.screenshot(path=O+"9-phone-chat.png")
    await pg.fill(".wmp-ask input","who is next"); await pg.click(".wmp-ask button"); await pg.wait_for_timeout(2500)
    await pg.screenshot(path=O+"9b-phone-ask-typed.png")
    print("errors:", errs)
    await b.close()
asyncio.run(main())
