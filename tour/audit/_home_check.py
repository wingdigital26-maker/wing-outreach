"""Home (c5-home) v2 check: plane click, view modes, call outcome, booking, note, Next stop; console errors; visible overlaps.
python tour/audit/_home_check.py   (server on :4885 must already be running)"""
import datetime, os, sys
from playwright.sync_api import sync_playwright

ROOT = "http://localhost:4885/tour/"
HOME = ROOT + "c5-home/index.html"
SHOTS = os.path.join(os.path.dirname(__file__), "shots")
os.makedirs(SHOTS, exist_ok=True)
NOW = datetime.datetime(2026, 10, 5, 15, 0, 0, tzinfo=datetime.timezone.utc)  # 10:00 America/Chicago
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']

# Visible overlaps: leaves = elements with own text, or controls. Rects clipped by overflow ancestors + viewport.
# A leaf counts only if a hit-test at its centre lands on it; a pair counts only if the hit-test at the
# intersection centre lands on one of the two (so things covered by an opaque sheet or bar are skipped).
OVERLAP_JS = r"""() => {
  const st = document.createElement('style'); st.textContent = '*{pointer-events:auto!important}'; document.head.appendChild(st);
  const vw = innerWidth, vh = innerHeight;
  const clip = (e) => { let r = e.getBoundingClientRect(); let x0 = Math.max(0, r.left), y0 = Math.max(0, r.top), x1 = Math.min(vw, r.right), y1 = Math.min(vh, r.bottom);
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const q = p.getBoundingClientRect(); x0 = Math.max(x0, q.left); y0 = Math.max(y0, q.top); x1 = Math.min(x1, q.right); y1 = Math.min(y1, q.bottom); } }
    return x1 - x0 > 1 && y1 - y0 > 1 ? { x0, y0, x1, y1 } : null; };
  const shown = (e) => { for (let p = e; p; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < .05) return false; } return true; };
  const leaves = [...document.querySelectorAll('body *')].filter(e => {
    if (e.tagName === 'CANVAS' || e.closest('#toast') || e.closest('svg')) return false;
    const ctl = /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(e.tagName);
    const txt = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    return (ctl || txt) && shown(e);
  }).map(e => ({ e, r: clip(e) })).filter(o => {
    if (!o.r) return false; const t = document.elementFromPoint((o.r.x0 + o.r.x1) / 2, (o.r.y0 + o.r.y1) / 2);
    return t && (o.e === t || o.e.contains(t) || t.contains(o.e) && t.tagName !== 'CANVAS' && false);
  });
  const out = [];
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const a = leaves[i], b = leaves[j]; if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
    const x0 = Math.max(a.r.x0, b.r.x0), x1 = Math.min(a.r.x1, b.r.x1), y0 = Math.max(a.r.y0, b.r.y0), y1 = Math.min(a.r.y1, b.r.y1);
    if (x1 <= x0 || y1 <= y0 || (x1 - x0) * (y1 - y0) <= 4) continue;
    const t = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2);
    if (!t || !(a.e.contains(t) || b.e.contains(t))) continue;
    const nm = o => `${o.e.tagName.toLowerCase()}.${String(o.e.className).split(' ')[0]}("${o.e.textContent.trim().slice(0, 22)}")`;
    out.push(`${nm(a)} x ${nm(b)} ${(x1 - x0).toFixed(0)}x${(y1 - y0).toFixed(0)}`);
  }
  st.remove(); return out;
}"""


def seed_records(pg):
    """Use the deck's own roof spec generator (dk.js) to remember Daily 50 stops 3 and 4, like the deck would."""
    pg.goto(ROOT + "REFS.md", wait_until="load"); pg.set_content("<!doctype html><html><body></body></html>")
    pg.evaluate("""() => { Object.keys(localStorage).filter(k => k.startsWith('rc.t.')).forEach(k => localStorage.removeItem(k)); }""")
    pg.add_script_tag(url=ROOT + "lib/rc-state.js")
    pg.add_script_tag(url=ROOT + "c4-command-deck/data/routes.js")
    pg.add_script_tag(url=ROOT + "c4-command-deck/dk.js")
    return pg.evaluate("""() => {
      const H = DK.homes('reddirt');
      const ppl = ['Maria Alvarez', 'Dan Nguyen'];
      [3, 4].forEach((n, k) => { const h = H[n - 1]; RC.remember({ id: 'dreddirt-' + n, addr: h.addr, hail: h.hail, sq: h.sq, pitch: h.pitch, year: h.year,
        person: ppl[k], phone: '(405) 555-01' + (40 + n), storm: '2026-09-12', spec: h.spec, county: 'Cleveland', city: 'Norman', best: h.best }); });
      return [RC.recall('dreddirt-3').addr, RC.recall('dreddirt-3').spec.planes.length, RC.recall('dreddirt-4').addr];
    }""")


def shot(pg, path, **kw):
    try: pg.screenshot(path=path, timeout=240000, **kw); print("  shot", os.path.basename(path))
    except Exception as e: print("  shot skipped (renderer too slow):", os.path.basename(path))


def wait3d(pg):
    pg.wait_for_function("window.__ready===true", timeout=60000)
    try: pg.wait_for_function("window.__settled===true", timeout=12000)
    except Exception: pass
    pg.wait_for_timeout(700)


def overlaps(pg, label, fails):
    res = pg.evaluate(OVERLAP_JS)
    print(f"  overlaps {label}: {len(res)}")
    for r in res[:10]: print("     ", r)
    if res: fails.append(f"{label}: {len(res)} overlaps")


CLIP_JS = r"""() => { const W = innerWidth, out = [];
  if (document.scrollingElement.scrollWidth > W + 1) out.push('page scrolls sideways ' + document.scrollingElement.scrollWidth);
  document.querySelectorAll('body *').forEach(e => { if (e.closest('#labels') || e.closest('.sheet') || e.closest('dialog') || e.closest('.chips') || e.closest('.steps') || e.closest('.tabs')) return;
    const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const r = e.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) out.push(e.tagName + '.' + e.className + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
    if (/^(H1|H2|H3|H4|B|BUTTON|SPAN|P)$/.test(e.tagName) && e.scrollWidth > e.clientWidth + 2 && cs.overflow === 'hidden') out.push('text cut ' + e.tagName + ' ' + e.textContent.trim().slice(0, 30)); });
  return out.slice(0, 12); }"""


def clipped(pg, tag, fails):
    res = pg.evaluate(CLIP_JS)
    if res:
        print("  CLIPPED:", res); fails.append(f"{tag}: {len(res)} clipped")


def newpage(b, w, h):
    ctx = b.new_context(viewport={"width": w, "height": h}, timezone_id="America/Chicago", device_scale_factor=1)
    pg = ctx.new_page(); pg.set_default_timeout(150000); pg.clock.set_system_time(NOW)
    return ctx, pg


def sizes_only(p, fails):
    b = p.chromium.launch(headless=True, args=ARGS)
    for (w, h) in [(1861, 867), (1366, 768)]:
        for q in ["", "?home=dreddirt-3"]:
            ctx, pg = newpage(b, w, h)
            errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
            seed_records(pg); pg.goto(HOME + q, wait_until="domcontentloaded"); wait3d(pg)
            tag = f"{w}x{h}{q or ' default'}"; print("==", tag)
            overlaps(pg, tag, fails); clipped(pg, tag, fails)
            if errs: fails.append(f"{tag}: errors {errs[:2]}")
            shot(pg, os.path.join(SHOTS, f"v2-home-{w}{'-d3' if q else ''}.png")); ctx.close()
        ctx, pg = newpage(b, w, h)  # embedded in the tour shell: one header only
        sd = seed_records(pg); pg.goto(ROOT + "product.html?tab=home", wait_until="load"); pg.wait_for_timeout(3000)
        fr = next((f for f in pg.frames if "c5-home" in f.url), None)
        if fr:
            fr.wait_for_function("window.__ready===true", timeout=90000); pg.wait_for_timeout(1500)
            bar = fr.evaluate("getComputedStyle(document.querySelector('.bar')).display")
            print(f"== shell {w}x{h}: page bar display={bar}")
            if bar != "none": fails.append(f"shell {w}x{h}: page header still shown")
            r = fr.evaluate(CLIP_JS)
            if r: print("  CLIPPED in shell:", r); fails.append(f"shell {w}x{h}: clipped")
            shot(pg, os.path.join(SHOTS, f"v2-home-shell-{w}.png"))
            fr.evaluate("window.__marker = 42; window.postMessage({type:'route', params:{id:'dreddirt-3'}}, location.origin)")
            try:
                fr.wait_for_function("(a) => document.querySelector('#addr').textContent.indexOf(a) >= 0", arg=sd[0], timeout=30000)
                print(f"  shell route message -> {fr.text_content('#addr')} | {fr.text_content('#titleH')} | same document (no reload): {fr.evaluate('window.__marker === 42')}")
            except Exception as e:
                fails.append(f"shell {w}x{h}: route message did not switch the home")
        else: fails.append("shell: home frame not found")
        ctx.close()
    b.close()


def run(p, w, h, q, shots, fails):
    mob = w < 640
    b = p.chromium.launch(headless=True, args=ARGS)
    ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=mob, has_touch=mob, device_scale_factor=1, timezone_id="America/Chicago")
    ctx.route("**/formsubmit.co/**", lambda r: r.abort())
    pg = ctx.new_page(); pg.set_default_timeout(150000)
    pg.clock.set_system_time(NOW)
    errs = []
    pg.on("console", lambda m: errs.append("console: " + m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    seeded = seed_records(pg)
    tag = f"{w}x{h}{q or ' default'}"
    print(f"== {tag}  seeded {seeded}")
    pg.goto(HOME + q, wait_until="domcontentloaded"); wait3d(pg)
    title = pg.text_content("#addr"); crumb = pg.text_content("#crumb") or ""
    print("  title:", title, "| crumb:", crumb.strip(), "| 3D:", pg.text_content("#titleH"), "|", pg.text_content("#titleP"))
    if q and seeded[0] not in title: fails.append(f"{tag}: title is not the recalled address")
    if "1.75" in pg.content(): fails.append(f"{tag}: 1.75 in still on the page")
    overlaps(pg, tag + " rest", fails)
    clipped(pg, tag, fails)
    if shots.get("rest"): shot(pg, os.path.join(SHOTS, shots["rest"]))

    # click a roof plane on the canvas
    pt = pg.evaluate("window.__planeScreen(0)")
    pg.mouse.click(pt["x"], pt["y"]); pg.wait_for_timeout(1600)
    focused = pg.evaluate("document.getElementById('stage').classList.contains('focused')")
    epins = pg.evaluate("[...document.querySelectorAll('.epin')].filter(e=>e.style.visibility==='visible').length")
    print(f"  plane click at {pt}: focused={focused}, edge pins shown={epins}, panel={pg.text_content('#measTitle')}")
    if not focused: fails.append(f"{tag}: plane click did not focus")
    if mob and not pg.evaluate("document.getElementById('sheet').classList.contains('open')"): fails.append(f"{tag}: sheet not open")
    overlaps(pg, tag + " plane", fails)
    if shots.get("plane"): shot(pg, os.path.join(SHOTS, shots["plane"]))
    # view modes (chips live in the sheet on phone while it is open)
    for m in ["dims", "hail", "edges"]:
        pg.click(f".chip[data-m={m}]"); pg.wait_for_timeout(350)
        if pg.get_attribute(f".chip[data-m={m}]", "aria-pressed") != "true": fails.append(f"{tag}: chip {m} not pressed")
    leg = pg.text_content("#legend")
    if mob: pg.click("#sheetClose")
    else: pg.click("#bWhole")
    pg.wait_for_timeout(1300)
    pg.click(".chip[data-m=hail]"); pg.wait_for_timeout(400)
    print("  hail legend:", (pg.text_content("#legend") or "").strip()[:120])
    pg.click(".chip[data-m=planes]"); pg.wait_for_timeout(300)

    # call -> outcome
    call = ".stick [data-act=call]" if mob else ".acts [data-act=call]"
    href = pg.get_attribute(call, "href")
    pg.evaluate(f"document.querySelector('{call}').removeAttribute('href')")  # do not leave the page for the dialer
    pg.click(call)
    try: pg.wait_for_function("document.getElementById('dlg').open", timeout=15000)
    except Exception: pass
    dlg_open = pg.evaluate("document.getElementById('dlg').open")
    print(f"  call href={href} -> outcome dialog open={dlg_open}")
    if not href or not dlg_open: fails.append(f"{tag}: call link/outcome dialog missing")
    if dlg_open:
        pg.click("#dlg [data-o=no_answer]"); pg.wait_for_function("!document.getElementById('dlg').open")
    # text draft
    pg.click(".stick [data-act=text]" if mob else ".acts [data-act=text]"); pg.wait_for_timeout(250)
    draft = pg.input_value("#smsBody")
    if "CIB 80000000 (sample)" not in draft: fails.append(f"{tag}: CIB missing from draft")
    print("  text locked:", pg.locator("#dlg .pbtn[disabled]").count() == 1)
    pg.click("#dlgClose"); pg.wait_for_function("!document.getElementById('dlg').open")
    # book
    pg.click(".stick [data-act=book]" if mob else ".acts [data-act=book]"); pg.wait_for_timeout(250)
    pg.fill("#bkD", "2026-10-08"); pg.select_option("#bkT", "17:30"); pg.click("#bkGo"); pg.wait_for_function("!document.getElementById('dlg').open"); pg.wait_for_timeout(300)
    hid = "c5-sample" if not q else q.split("=")[1]
    stage = pg.evaluate(f"RC.stage('{hid}')"); bk = pg.evaluate(f"RC.booking('{hid}')")
    print("  after book: stage", stage, "booking", bk)
    if stage != "inspection" or not bk: fails.append(f"{tag}: booking not stored")
    # stepper + undo
    pg.click("#steps [data-s=proposal]"); pg.wait_for_timeout(300)
    prop = pg.is_visible("#proposal")
    print("  proposal block visible:", prop, "| has $:", "$" in (pg.text_content("#proposal") or ""))
    if not prop: fails.append(f"{tag}: proposal block hidden at proposal stage")
    pg.evaluate("document.querySelector('#toast button').click()"); pg.wait_for_timeout(300)
    if pg.evaluate(f"RC.stage('{hid}')") != "inspection": fails.append(f"{tag}: undo failed")
    # note
    pg.click(".tabs [data-t=notes]"); pg.click("#addNote"); pg.fill("#noteText", "Gate code 4411, dog is friendly"); pg.click("#noteform .pbtn"); pg.wait_for_timeout(300)
    if "Gate code 4411" not in pg.text_content("#notelist"): fails.append(f"{tag}: note not saved")
    pg.click(".tabs [data-t=act]"); pg.click("#afil [data-f=calls]"); pg.wait_for_timeout(200)
    print("  activity calls filter:", pg.get_attribute("#afil [data-f=calls]", "aria-pressed"), "|", (pg.text_content("#tl") or "")[:90])
    pg.wait_for_timeout(6200)  # toast gone
    pg.evaluate("scrollTo(0,0)")
    if shots.get("after"): shot(pg, os.path.join(SHOTS, shots["after"]), full_page=False)
    overlaps(pg, tag + " after", fails)
    # next stop
    if q:
        pg.evaluate("window.__marker = 42"); pg.click("#stopnav [data-go=next]"); pg.wait_for_function("(a) => document.querySelector('#addr').textContent.indexOf(a) < 0", arg=seeded[0]); pg.wait_for_timeout(2500)
        print("  next stop (in place) ->", pg.url.split("/")[-1], "same document:", pg.evaluate("window.__marker === 42"), "|", pg.text_content("#addr"), "|", pg.text_content("#titleH"))
        if seeded[2] not in (pg.text_content("#addr") or ""): fails.append(f"{tag}: Next stop did not change the home")
    if errs:
        print("  ERRORS:"); [print("     ", e) for e in errs[:10]]
        fails.append(f"{tag}: {len(errs)} console/page errors")
    b.close()


fails = []
with sync_playwright() as p:
    for args in [(1440, 900, "", {"rest": "v2-home-desktop.png"}), (1440, 900, "?home=dreddirt-3", {"rest": "v2-home-desktop-d3.png", "plane": "v2-home-plane.png"}),
                 (390, 844, "", {"rest": "v2-home-phone-default.png"}), (390, 844, "?home=dreddirt-3", {"rest": "v2-home-phone.png", "plane": "v2-home-phone-sheet.png"})]:
        if len(sys.argv) > 1 and sys.argv[1] not in f"{args[0]}{args[2]}": continue
        try: run(p, *args, fails)
        except Exception as e: fails.append(f"{args[0]}{args[2]}: crashed {str(e).splitlines()[0]}"); print("  CRASH", chr(10).join(str(e).splitlines()[:14]))
    if len(sys.argv) < 2 or sys.argv[1] == "sizes":
        try: sizes_only(p, fails)
        except Exception as e: fails.append(f"sizes: crashed {str(e).splitlines()[0]}"); print("  CRASH", chr(10).join(str(e).splitlines()[:14]))
print("\nRESULT:", "PASS" if not fails else "FAIL")
for f in fails: print(" -", f)
