import asyncio, sys
from playwright.async_api import async_playwright
# check_overlap.py [?query]  -> pairwise getBoundingClientRect overlap check of visible text-bearing elements
BASE = "http://localhost:4880/c5-home/index.html"
SIZES = [(1440, 900), (1366, 768), (1280, 800), (390, 844)]
JS = """() => {
  const els = [...document.querySelectorAll('body *')].filter(e => {
    if (e.closest('#labels') || e.closest('.sheet') || e.closest('.stick') || e.closest('.bar')) return false;
    const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    const hasText = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    const r = e.getBoundingClientRect(); return hasText && r.width > 0 && r.height > 0;
  });
  const out = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], b = els[j]; if (a.contains(b) || b.contains(a)) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ox > 1 && oy > 1) out.push(`${a.tagName}.${a.className}("${a.textContent.trim().slice(0,18)}") x ${b.tagName}.${b.className}("${b.textContent.trim().slice(0,18)}") ${ox.toFixed(0)}x${oy.toFixed(0)}`);
  }
  // 3D pins among themselves
  const pins = [...document.querySelectorAll('#labels > *')].filter(e => e.style.visibility === 'visible');
  for (let i = 0; i < pins.length; i++) for (let j = i + 1; j < pins.length; j++) {
    const ra = pins[i].getBoundingClientRect(), rb = pins[j].getBoundingClientRect();
    const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ox > 1 && oy > 1) out.push(`PIN ${pins[i].textContent.trim()} x ${pins[j].textContent.trim()} ${ox.toFixed(0)}x${oy.toFixed(0)}`);
  }
  return out;
}"""
async def main():
    qs = sys.argv[1] if len(sys.argv) > 1 else ""
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=d3d11","--enable-gpu","--ignore-gpu-blocklist","--enable-unsafe-swiftshader"])
        for w, h in SIZES:
            mob = w < 640
            ctx = await b.new_context(viewport={"width": w, "height": h}, is_mobile=mob, has_touch=mob)
            pg = await ctx.new_page()
            await pg.goto(BASE + qs, wait_until="load", timeout=60000)
            try: await pg.wait_for_function("window.__ready===true", timeout=30000)
            except Exception: pass
            await pg.wait_for_timeout(500)
            try: await pg.wait_for_function("window.__settled===true", timeout=8000)
            except Exception: pass
            await pg.wait_for_timeout(600)
            res = await pg.evaluate(JS)
            print(f"{w}x{h}{qs}: {'clean' if not res else str(len(res)) + ' overlaps'}")
            for r in res[:12]: print("   ", r)
            await ctx.close()
        await b.close()
asyncio.run(main())
