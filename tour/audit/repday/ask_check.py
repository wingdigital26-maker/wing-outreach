"""Ask Nimbus a few rep questions and print the answers (10-22).  python -E tour/audit/repday/ask_check.py"""
import asyncio, os, urllib.parse
from playwright.async_api import async_playwright
QS = ["which homes got the biggest hail", "homes in Allen with no re-roof permit", "how many homes did the Jun 2 storm hit", "what is on my pipeline", "biggest storm last year"]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        pg = await (await b.new_context(viewport={"width": 1440, "height": 900})).new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        for i, q in enumerate(QS):
            await pg.goto("http://127.0.0.1:4930/tour/product.html?dev=1&nointro=1&noprefetch=1&cloud=0#/ask?q=" + urllib.parse.quote(q), wait_until="load")
            await pg.wait_for_timeout(9000)
            ans = ""
            for f in pg.frames:
                if "nimbus" in f.url or "c2-" in f.url:
                    try: ans = await f.evaluate("document.body.innerText")
                    except Exception: pass
            print("Q:", q); print("A:", ans[-700:].replace("\n", " | ").encode("ascii", "replace").decode()); print()
            if i == 0: await pg.screenshot(path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "after", "ask-desk.png"))
        print("errors", errs); await b.close()
asyncio.run(main())
