"""A rep's day, screen by screen (Jackson build-out 10-22): load each screen, wait, record page errors, failed requests and the
visible text, screenshot it. One light headless browser, closed at the end (the laptop is low on RAM).
  python -E tour/audit/repday/walk.py <out-folder-name> [desk|phone] [screen ...]
-> tour/audit/repday/<out>/<screen>-<size>.png + walk.json"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, sys.argv[1]); os.makedirs(OUT, exist_ok=True)
SIZE = sys.argv[2] if len(sys.argv) > 2 else "desk"
B = "http://127.0.0.1:4930/tour/"
Q = "?dev=1&nointro=1&noprefetch=1&cloud=0"
SCREENS = {
    "today": "product.html" + Q + "#/daily", "storms": "product.html" + Q + "#/storm", "inbox": "product.html" + Q + "#/crm/inbox",
    "pipeline": "product.html" + Q + "#/crm/pipeline", "calendar": "product.html" + Q + "#/crm/calendar",
    "home": "product.html" + Q + "#/crm/home/m92039", "proposal": "c5-home/proposal.html" + Q + "&id=m92039",
    "hailreport": "c5-home/hail-report.html" + Q + "&id=m92039", "ask": "product.html" + Q + "#/ask", "weekly": "product.html" + Q + "#/weekly",
}
want = sys.argv[3:] or list(SCREENS)


async def main():
    rp = os.path.join(OUT, "walk.json"); R = json.load(open(rp)) if os.path.exists(rp) else {}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        w, h, mob = (1440, 900, False) if SIZE == "desk" else (390, 844, True)
        for name in want:
            ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mob else 1, is_mobile=mob, has_touch=mob)
            await ctx.route("**/formsubmit.co/**", lambda r: r.abort())
            pg = await ctx.new_page(); errs, bad = [], []
            pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
            pg.on("console", lambda m: errs.append("console: " + m.text[:200]) if m.type == "error" else None)
            pg.on("response", lambda r: bad.append(f"{r.status} {r.url[len(B) - 6:][:120]}") if r.status >= 400 else None)
            await pg.goto(B + SCREENS[name], wait_until="load", timeout=60000)
            await pg.wait_for_timeout(int(os.environ.get("WALK_WAIT", "9000")))
            txt = ""
            for f in pg.frames:
                try: txt += "\n" + await f.evaluate("document.body ? document.body.innerText : ''")
                except Exception: pass
            await pg.screenshot(path=os.path.join(OUT, f"{name}-{SIZE}.png"))
            R[f"{name}-{SIZE}"] = dict(errors=errs[:12], bad=sorted(set(bad))[:20], text=txt[:6000])
            print(name, SIZE, "errors", len(errs), "bad", len(set(bad)), flush=True)
            await ctx.close()
        await b.close()
    json.dump(R, open(rp, "w"), indent=1)

asyncio.run(main())
