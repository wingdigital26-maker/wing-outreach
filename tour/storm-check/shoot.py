"""Screenshots of the storm-check page for review.

  python tour/storm-check/shoot.py [base] [outdir]   (base default http://localhost:4946, the repo served as root)

One headless Chromium, a throwaway profile. The test lead uses a fictional 555-01xx number on localhost and stays in that
profile. No cloud endpoint is set, so nothing leaves the machine.
"""
import asyncio, os, sys
from playwright.async_api import async_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4946').rstrip('/')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')
os.makedirs(OUT, exist_ok=True)
URL = BASE + '/tour/storm-check/?utm_source=google&utm_medium=organic&utm_campaign=gbp&ballpark=demo'


async def run(pw, name, vp, mobile):
    b = await pw.chromium.launch()
    ctx = await b.new_context(viewport=vp, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
    p = await ctx.new_page()
    await p.goto(URL, wait_until='networkidle')
    await p.screenshot(path=os.path.join(OUT, f'{name}-1-landing.png'))
    await p.fill('#q', '2100 Parkhaven')
    await p.wait_for_selector('#sugg li', timeout=20000)
    await p.screenshot(path=os.path.join(OUT, f'{name}-2-search.png'))
    await p.keyboard.press('Enter')
    await p.wait_for_selector('#doc:not([hidden])', timeout=30000)
    await p.wait_for_timeout(600)
    await p.screenshot(path=os.path.join(OUT, f'{name}-3-result.png'), full_page=True)
    await p.fill('#fName', 'Test Homeowner')
    await p.fill('#fPhone', '(972) 555-0123')
    await p.click('#when button')
    await p.check('#fAgree')
    await p.click('#bSend')
    await p.wait_for_selector('#done:not([hidden])', timeout=10000)
    await p.locator('#book').screenshot(path=os.path.join(OUT, f'{name}-4-sent.png'))
    await b.close()


async def main():
    async with async_playwright() as pw:
        await run(pw, 'desk', {'width': 1280, 'height': 860}, False)
        await run(pw, 'phone', {'width': 390, 'height': 844}, True)
    print('shots in', OUT)

asyncio.run(main())
