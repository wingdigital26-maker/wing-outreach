"""Record an intro as a frame sequence every ~250ms. Usage:
python intro-record.py <url> <prefix> [phone] [seconds]
Writes shots/intro/<prefix>-NN.png and prints frame times."""
import asyncio, sys, os
from playwright.async_api import async_playwright
url, prefix = sys.argv[1], sys.argv[2]
phone = len(sys.argv) > 3 and sys.argv[3] == 'phone'
secs = float(sys.argv[4]) if len(sys.argv) > 4 else 5.0
vp = {"width": 390, "height": 844} if phone else {"width": 1440, "height": 900}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"], headless=True)
        pg = await b.new_page(viewport=vp, device_scale_factor=1)
        pg.on("pageerror", lambda e: print("ERR", e))
        pg.on("console", lambda m: print("CON", m.type, m.text) if m.type in ("error", "warning") else None)
        t0 = None
        await pg.goto(url, wait_until="domcontentloaded")
        # wait for the piece engine to be live, then start the clock
        try:
            await pg.wait_for_function("window.WingPiece && window.WingPiece.ready", timeout=20000)
        except Exception as e:
            print("no WingPiece.ready", e)
        t0 = await pg.evaluate("performance.now()")
        i = 0
        while True:
            target = i * 250
            await pg.wait_for_function(f"performance.now()-{t0}>={target}", timeout=10000)
            await pg.screenshot(path=f"shots/intro/{prefix}-{i:02d}.png")
            i += 1
            if target >= secs * 1000: break
        print("frames", i, "url", pg.url)
        await b.close()
asyncio.run(main())
