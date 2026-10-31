from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"]); ctx = b.new_context(viewport={"width": 1200, "height": 900})
    ctx.route("**/st-data-dfw/private/**", lambda x: x.fulfill(status=404, body=""))
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:400]))
    pg.on("console", lambda m: errs.append("console:" + m.text[:300]) if m.type == "error" else None)
    pg.goto("http://127.0.0.1:4886/tour/product.html?dev=1&nosw=1&noprefetch=1&nointro=1#/crm/home/m164153", wait_until="domcontentloaded")
    for fr in []: pass
    pg.wait_for_timeout(15000)
    for f in pg.frames:
        try: f.evaluate("1")
        except Exception: pass
    print("\n".join(errs[:12]))
    b.close()
