import asyncio, os, json, sys
sys.path.insert(0, os.path.dirname(__file__))
from playwright.async_api import async_playwright
from importlib import import_module
m = import_module('_nimbus2_check')
VIEWS = [(1440, 900), (390, 844)] if len(sys.argv) < 2 else [(390, 844)]
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(headless=True, args=m.GPU)
    for vw, vh in VIEWS:
      ctx = await b.new_context(viewport={'width': vw, 'height': vh}); await ctx.route('**/formsubmit.co/**', lambda r: r.abort())
      pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:150]))
      await pg.goto('http://localhost:4886/tour/product.html?dev=1#/ask', timeout=60000)
      await pg.wait_for_selector('.nb-dock.in', timeout=60000); await pg.wait_for_timeout(12000)
      pr = await pg.evaluate(m.PROBE); ok, v = m.verdict(pr)
      line = await pg.evaluate("document.querySelector('iframe[data-screen=ask]').contentDocument.querySelector('#slot').textContent")
      print('shell ask', vw, ok, json.dumps(v['dock']), 'slot:', line[:90], errs, flush=True)
      await m.shot(pg, os.path.join(m.SHOTS, f'nimbus2-ask-{vw}.png'))
      # standalone Ask page (no shell)
      pg2 = await ctx.new_page(); errs2 = []; pg2.on('pageerror', lambda e: errs2.append(str(e)[:150]))
      await pg2.goto('http://localhost:4886/tour/c2-nimbus/index.html?dev=1', timeout=60000); await pg2.wait_for_timeout(9000)
      pr = await pg2.evaluate(m.PROBE); ok, v = m.verdict(pr)
      print('standalone ask', vw, ok, json.dumps(v), errs2, flush=True)
      await m.shot(pg2, os.path.join(m.SHOTS, f'nimbus2-ask-standalone-{vw}.png'))
      await ctx.close()
    await b.close()
asyncio.run(main())
