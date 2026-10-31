"""Daily 50 layout audit: python d50_audit.py [page] -> overlaps + clipped text per viewport (JSON lines)."""
import sys, asyncio, json
from playwright.async_api import async_playwright
BASE = "http://localhost:4880/c4-command-deck/"
PAGE = sys.argv[1] if len(sys.argv) > 1 else "deck.html"
VP = [("1440x900", 1440, 900, 1, False), ("1366x768", 1366, 768, 1, False), ("1280x800", 1280, 800, 1, False),
      ("390x844", 390, 844, 2, True), ("430x932", 430, 932, 2, True)]
JS = r"""
() => {
  const out = {overlaps: [], clipped: [], offscreen: []};
  const vw = innerWidth, vh = innerHeight;
  const name = el => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\s+/).join('.'); const t = (el.innerText || el.textContent || '').trim().replace(/\s+/g,' ').slice(0, 40); return s + (t ? ' "' + t + '"' : ''); };
  const hiddenCard = el => { const c = el.closest('.card'); return c && (c.dataset.d !== '0'); };
  const inClosedSheet = el => { const s = el.closest('.sheet'); return s && !s.classList.contains('open'); };
  const visible = el => { if (hiddenCard(el) || inClosedSheet(el)) return false; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  const scrollable = a => { const cs = getComputedStyle(a); return /(auto|scroll)/.test(cs.overflowY + cs.overflowX); };
  const visRect = el => { const r = el.getBoundingClientRect(); let L = r.left, T = r.top, Rr = r.right, B = r.bottom; let a = el.parentElement;
    while (a && a !== document.body) { if (getComputedStyle(a).overflow !== 'visible') { const q = a.getBoundingClientRect(); L = Math.max(L, q.left); T = Math.max(T, q.top); Rr = Math.min(Rr, q.right); B = Math.min(B, q.bottom); } a = a.parentElement; }
    return {left: L, top: T, right: Rr, bottom: B}; };
  // text-bearing leaf boxes
  const all = [...document.querySelectorAll('body *')].filter(el => !el.closest('svg') && !el.closest('.maplibregl-ctrl') && visible(el));
  const textEls = all.filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
  // clip check 1: own overflow
  for (const el of textEls) {
    const cs = getComputedStyle(el);
    const clipsX = cs.overflowX !== 'visible' || cs.textOverflow === 'ellipsis';
    const clipsY = cs.overflowY !== 'visible' || cs.webkitLineClamp !== 'none' && cs.webkitLineClamp;
    if (clipsX && el.scrollWidth > el.clientWidth + 1) out.clipped.push(name(el) + ' [x ' + el.scrollWidth + '>' + el.clientWidth + ']');
    else if (clipsY && el.scrollHeight > el.clientHeight + 1) out.clipped.push(name(el) + ' [y ' + el.scrollHeight + '>' + el.clientHeight + ']');
  }
  // clip check 2: text box cut by an overflow-hidden ancestor or the viewport
  const boxes = [...textEls, ...all.filter(el => el.matches('button,.stop,.ring,.pill,.mnext,.act,.facts,.ph'))];
  const uniq = [...new Set(boxes)];
  for (const el of uniq) {
    const r = el.getBoundingClientRect(); if (el.closest('#map') && !el.matches('.stop')) continue;
    let a = el.parentElement, cut = null;
    while (a && a !== document.body) {
      const cs = getComputedStyle(a);
      if (scrollable(a)) break;  // reachable by scrolling this container
      if (cs.overflow !== 'visible' && !scrollable(a) && !a.matches('.maplibregl-canvas-container,.maplibregl-marker')) {
        const ar = a.getBoundingClientRect();
        if (r.left < ar.left - 1 || r.right > ar.right + 1 || r.top < ar.top - 1 || r.bottom > ar.bottom + 1) { cut = a; break; }
      }
      a = a.parentElement;
    }
    if (cut) out.clipped.push(name(el) + ' cut by ' + name(cut).slice(0, 40));
    else if (!el.closest('.sheet') && !(() => { let q = el.parentElement; while (q && q !== document.body) { if (scrollable(q)) return true; q = q.parentElement; } return false; })() && (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1)) out.offscreen.push(name(el) + ' [' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.right) + 'x' + Math.round(r.bottom) + ']');
  }
  // overlaps: text boxes, pins, map overlays, concept label
  const ov = [...new Set([...textEls, ...all.filter(el => el.matches('.stop,.mnext,.mtag .pill,.ring,.concept,.act button,.pill,.maplibregl-ctrl-attrib,.pipe,.stg .bar2,.peek,.card[data-d="0"]'))])];
  // inline text is measured per line box so wrapped spans in one paragraph do not count as overlapping
  const R = ov.map(el => { const v = visRect(el); const lines = getComputedStyle(el).display === 'inline' ? [...el.getClientRects()] : [el.getBoundingClientRect()];
    return lines.map(r => ({left: Math.max(r.left, v.left), top: Math.max(r.top, v.top), right: Math.min(r.right, v.right), bottom: Math.min(r.bottom, v.bottom)})); });
  for (let i = 0; i < ov.length; i++) for (let j = i + 1; j < ov.length; j++) {
    const a = ov[i], b = ov[j];
    if (a.contains(b) || b.contains(a)) continue;
    let hit = null;
    for (const ra of R[i]) for (const rb of R[j]) {
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w > 1 && h > 1) hit = [w, h];
    }
    if (hit) out.overlaps.push(name(a).slice(0, 60) + '  X  ' + name(b).slice(0, 60) + ' [' + Math.round(hit[0]) + 'x' + Math.round(hit[1]) + ']');
  }
  // hidden info: content that exists in the markup but is display:none at this size
  out.hidden = [];
  const must = innerWidth > 640 ? ['.win', '.tstat', '#ringL', '.mnext .go span:last-child', '.card[data-d="0"] .calls .pill', '.dt', '.qfoot', '.pipe .lead small', '.ph .bl']
                                : ['.card[data-d="0"] .calls .pill', '.dt', '.win', '.tstat'];
  for (const sel of must) document.querySelectorAll(sel).forEach(el => { if (el.closest('.sheet')) return; if (!el.getClientRects().length) out.hidden.push(sel + ' ' + name(el).slice(0, 50)); });
  return out;
}
"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"])
        tot = {"overlaps": 0, "clipped": 0, "offscreen": 0, "hidden": 0}
        for label, w, h, dpr, mob in VP:
            ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=dpr, is_mobile=mob, has_touch=mob)
            pg = await ctx.new_page()
            await pg.route("**/formsubmit.co/**", lambda r: r.abort())
            await pg.goto(BASE + PAGE, wait_until="load", timeout=60000)
            try: await pg.wait_for_function("window.__mapReady===true || window.__ready===true", timeout=30000)
            except Exception: pass
            await pg.wait_for_timeout(1800)
            res = await pg.evaluate(JS)
            print(f"== {PAGE} {label}: overlaps {len(res['overlaps'])}, clipped {len(res['clipped'])}, offscreen {len(res['offscreen'])}, hidden {len(res['hidden'])}")
            for k in ("overlaps", "clipped", "offscreen", "hidden"):
                tot[k] += len(res[k])
                for x in res[k]: print(f"  {k[:4]}: {x}")
            await ctx.close()
        await b.close()
        print("TOTAL", json.dumps(tot))
asyncio.run(main())
