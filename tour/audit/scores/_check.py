"""Scores + search check (10-26): runs the RCS functions Nimbus will call in the real app, then screenshots the Find screen
(Search, Best blocks, Rep lists) and the evidence card on a home record at 1440 and 375.
  python -E tour/audit/scores/_check.py [out_dir]
Writes results.json + PNGs to out_dir (default tour/audit/scores/shots)."""
import json, os, sys
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "shots"); os.makedirs(OUT, exist_ok=True)
BASE = "http://127.0.0.1:4930/tour/product.html?dev=1&nointro=1&noprefetch=1&cloud=0"
ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"]
TEST = r"""async () => {
  const R = window.RCS; await R.ready(); const out = {};
  const jake = R.addRep('Jake'); R.addRep('Maria');
  const p = R.parse('Find 30 Plano homes with older documented roofs, recent hail exposure, and no prior contact. Show them on the map and prepare assignments for Jake.');
  const s = await R.search(Object.assign({}, p.filters, { limit: p.limit }));
  out.planoRequest = { understood: p.understood, filters: p.filters, total: s.total, conf: s.counts.conf };
  const p2 = R.parse('30 Frisco homes with recent hail and no prior contact for Jake');
  const s2 = await R.search(Object.assign({}, p2.filters, { limit: p2.limit }));
  out.friscoRequest = { understood: p2.understood, total: s2.total, first: s2.homes[0] && { score: s2.homes[0].score, roof: s2.homes[0].roof, conf: s2.homes[0].confWord } };
  const g0 = s2.homes[0].gi, g1 = s2.homes[1].gi;
  RC.optOut('m' + g0, 'STOP');
  out.optedOutEligibility = R.eligibility(g0);
  const s3 = await R.search({ cities: ['Frisco'], hailMin: 1, limit: 3 });
  out.ineligibleStillShown = s3.homes.map(h => [h.gi === g0, h.score, h.eligible, h.why]);
  const a = await R.assign(s2.homes.map(h => h.gi), jake.id);
  out.assign = { assigned: a.assigned, skipped: a.skipped.length, rep: a.rep.name };
  const seg = R.saveSegment({ name: '15+ year roofs after hail', filters: { roofAgeMin: 15, conf: ['high', 'medium', 'low'], hailMin: 1 }, queue: true, alert: true });
  const q = await R.segmentQueue(seg.id, 25); out.segmentQueue = { total: q.total, today: q.homes.length };
  const al = await R.segmentAlerts(); out.segmentAlert = al.map(x => [x.segment.name, x.newHomes]);
  out.myListJake = (await R.myList(jake.id)).length;
  out.blocks = (await R.neighborhoods({ limit: 5 })).map(b => [b.label, b.city, b.total, b.strong, b.homes]);
  const ex = await R.explain(g1); out.explain = { summary: ex.summary, parts: Object.fromEntries(Object.entries(ex.parts).map(([k, v]) => [k, [v.pts, v.max, v.plain]])), refreshed: ex.refreshed };
  try { await R.search({ income: 1 }); out.bannedFilter = 'accepted (BAD)'; } catch (e) { out.bannedFilter = 'refused: ' + e.message; }
  out.score = R.score(g1);
  return { out, g0, g1 };
}"""


def frame(page, screen):
    for f in page.frames:
        if ("c10-find" if screen == "find" else "c5-home/index") in f.url: return f
    return None


with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=ARGS)
    res = {}
    for w, h, tag in ((1440, 900, "1440"), (375, 812, "375")):
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=1, is_mobile=w < 500, has_touch=w < 500)
        page = ctx.new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto(BASE + "#/find"); page.wait_for_timeout(6000)
        if tag == "1440":
            r = page.evaluate(TEST); res = r["out"]; g0, g1 = r["g0"], r["g1"]
            page.evaluate("id => RC.optOut(id, 'STOP')", "m" + str(g0))   # keep one greyed home on Jake's list for the shot
        else:
            page.evaluate("""() => { const R = RCS; return R.ready().then(() => { const j = R.addRep('Jake');
              return R.search({ cities: ['Frisco'], hailMin: 1, crm: ['none'], eligible: 'only', limit: 30 }).then(s => R.assign(s.homes.map(h => h.gi), j.id)); }); }""")
        page.goto(BASE + "#/find"); page.wait_for_timeout(5000)
        f = frame(page, "find")
        f.evaluate("() => { localStorage.setItem('rc.find.filters', JSON.stringify({roofAgeMin:15, hailMin:1, _name:'15+ year roofs after hail'})); }")
        page.reload(); page.wait_for_timeout(7000); f = frame(page, "find")
        page.screenshot(path=os.path.join(OUT, "find-search-%s.png" % tag))
        if tag == "375":
            f.click("#fTog"); page.wait_for_timeout(500); page.screenshot(path=os.path.join(OUT, "find-filters-375.png")); f.click("#fTog")
        f.evaluate("() => FIND.show('nb')"); page.wait_for_timeout(5000)
        f.evaluate("() => { const c = document.querySelector('[data-b=\"0\"]'); if (c) c.classList.add('open'); }"); page.wait_for_timeout(500)
        page.screenshot(path=os.path.join(OUT, "find-blocks-%s.png" % tag))
        f.evaluate("() => FIND.show('reps')"); page.wait_for_timeout(3000)
        page.screenshot(path=os.path.join(OUT, "find-reps-%s.png" % tag))
        f.evaluate("() => FIND.show('saved')"); page.wait_for_timeout(3000)
        page.screenshot(path=os.path.join(OUT, "find-saved-%s.png" % tag))
        gi = page.evaluate("() => RCS.ready().then(() => RCS.search({ cities: ['Frisco'], hailMin: 1, limit: 1 })).then(r => r.homes[0].gi)") if tag == "375" else g1
        page.goto(BASE + "#/crm/home/m%d" % gi); page.wait_for_timeout(9000)
        hf = frame(page, "home")
        if hf:
            hf.evaluate("""() => { const t = document.querySelector('#ptab [data-p="home"]'); if (t) t.click();
              const p = document.getElementById('evidPanel'); if (p) { p.querySelectorAll('details').forEach((d, i) => { if (i < 2) d.open = true; }); p.scrollIntoView({ block: 'start' }); } }""")
            page.wait_for_timeout(1200)
            el = hf.query_selector("#evidPanel")
            if el and el.is_visible(): el.screenshot(path=os.path.join(OUT, "evidence-%s.png" % tag))
            page.screenshot(path=os.path.join(OUT, "record-%s.png" % tag))
            res["evidenceText" + tag] = hf.evaluate("() => (document.getElementById('evidPanel') || {}).innerText || null")
        res["errors" + tag] = errs[:10]
        ctx.close()
    b.close()
json.dump(res, open(os.path.join(OUT, "results.json"), "w", encoding="utf-8"), indent=1)
print(json.dumps(res, indent=1)[:6000])
