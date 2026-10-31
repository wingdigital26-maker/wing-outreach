"""Daily 50 queue engine check (tour/lib/rc-queue.js): newest storm, spread, every reason true, picks, determinism,
exclusions, cadence (day 1 text, then email only), opt-out, a new storm switching the list, the hail-file fallback, timing.
Run: python tour/audit/_queue_check.py   (server on :4886 must already be running; this never starts one)
The engine is loaded into the shell page by a script tag (Today does not use it yet). Nothing is sent: tel:/sms:/mailto
navigations are stopped and formsubmit.co is blocked. Every rc.* key is cleared at the end."""
import collections, json, re, sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:4886/tour/product.html?dev=1#/daily"
ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"]
fails, passes = [], []


def check(ok, what):
    (passes if ok else fails).append(what)
    print(("PASS " if ok else "FAIL ") + what, flush=True)


LOAD = """async () => {
  if (!RC.copy) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'lib/rc-copy.js?t=' + Date.now(); s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  if (!window.RC || !RC.daily) await new Promise((res, rej) => { const s = document.createElement('script');
    s.src = 'lib/rc-queue.js?t=' + Date.now(); s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  return await RC.queueReady;
}"""
CLEAR = """() => { [localStorage, sessionStorage].forEach(st => Object.keys(st).filter(k => k.indexOf('rc.') === 0 && k !== 'rc.dev').forEach(k => st.removeItem(k))); return true; }"""
IDS = "(o) => RC.daily(o && o.date || null, Object.assign({ rebuild: true, keep: false }, o || {})).map(p => p.id)"


def day(page, iso_utc):
    page.clock.set_system_time(iso_utc)


with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=ARGS)
    ctx = b.new_context(viewport={"width": 1400, "height": 900})
    page = ctx.new_page()
    page.route("**/formsubmit.co/**", lambda r: r.abort())
    page.on("framenavigated", lambda f: None)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL, wait_until="domcontentloaded")
    page.wait_for_function("window.RC && RC.factsReady", timeout=20000)
    page.evaluate(CLEAR)
    page.reload(wait_until="domcontentloaded")
    page.wait_for_function("window.RC && RC.factsReady", timeout=20000)
    check(page.evaluate(LOAD) is True, "engine loads and scores the storm's homes")

    # ---------- timing (real clock) ----------
    t = page.evaluate("""() => { const a = performance.now(); const d = RC.daily(null, { rebuild: true, keep: false }); const b = performance.now();
      const c = performance.now(); RC.daily(null, { rebuild: true, keep: false }); const e = performance.now();
      return { first: b - a, second: e - c, n: d.length, stats: RC.queueStats() }; }""")
    st = t["stats"]
    print(f"timing: build+view {t['first']:.1f} ms, again {t['second']:.1f} ms; data load {st['loadMs']} ms; storm {st['storm']}; candidates {st['candidates']}", flush=True)
    check(t["first"] < 300 and t["second"] < 300, f"daily() under 300 ms ({t['first']:.1f} / {t['second']:.1f} ms)")

    # ---------- 50 picks, shape ----------
    d = page.evaluate("() => RC.daily(null, { rebuild: true, keep: false })")
    st = page.evaluate("() => RC.queueStats()")
    want = min(50, st["eligibleNew"] + st["dueToday"])
    check(len(d) == want, f"{len(d)} picks (want {want} = 50 or every eligible home)")
    check(len({p["id"] for p in d}) == len(d), "no home twice")
    check(all(p["reason"] == "new" and p["step"] == 1 for p in d), "fresh device: every pick is new, step 1")
    check(all(isinstance(p["score"], (int, float)) and len(p["why"]) >= 2 and all(isinstance(w, str) and w for w in p["why"]) for p in d), "every pick has a score and lists all its reasons (2 or more)")
    newest = page.evaluate("""async () => { const l = await fetch(RC.dataRoot + 'latest-storm.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
      const hit = RC.catalog.storms.filter(s => s.homes_1in > 0).map(s => s.date).sort();
      return l && RC.catalog.storms.some(s => s.date === l.iso) ? l.iso : hit[hit.length - 1]; }""")
    check(st["storm"] == newest and page.evaluate("() => RC.SHOWCASE") == newest, f"queue and RC.SHOWCASE use the newest storm ({st['storm']}, newest {newest})")
    check(st.get("source") == "precomputed" and st.get("fileStale") is False, f"reads the precomputed candidate file (source {st.get('source')}, stale {st.get('fileStale')})")
    check(all(p["storm"] in st["windowStorms"] for p in d), f"every pick's storm is in the 12-month window {st['windowStorms']}")
    check(sum(1 for p in d if p["storm"] == newest) >= 35, f"newest storm weighted most: {sum(1 for p in d if p['storm'] == newest)} of 50 from {newest} ({st.get('fromStorm')})")
    sc = collections.Counter(re.sub(r"^\d+\S*\s+", "", p["street"] or "") + "|" + p["city"] for p in d)
    nc = collections.Counter(p["neighbourhood"] for p in d)
    check(max(sc.values()) <= 3 and max(nc.values()) <= 4, f"spread: at most 3 per street ({max(sc.values())}), 4 per neighbourhood ({max(nc.values())}); {len(sc)} streets, {len(nc)} neighbourhoods")
    check(len(sc) >= 15 and len(nc) >= 12, f"spread across many streets and neighbourhoods ({len(sc)} / {len(nc)})")
    MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    year_now = page.evaluate("() => new Date().getFullYear()")
    def md(iso):
        y, m, dd = iso.split("-"); return f"{MON[int(m) - 1]} {int(dd)}" + ("" if int(y) == year_now else f", {y}")
    bad = []
    for p in d:
        w = p["why"]
        if not w[0].startswith(f"{p['hail']:.2f} in hail on {md(p['storm'])}"): bad.append((p["id"], w[0]))
        for x in w:
            m = re.match(r"Built (\d{4})", x)
            if m and int(m.group(1)) != p["yearBuilt"]: bad.append((p["id"], x))
            m = re.search(r"about (\d+) squares", x)
            if m and int(m.group(1)) != int((p["squares"] or -9) + 0.5): bad.append((p["id"], x))
            m = re.match(r"Hit by (\d+) storms", x)
            if m and int(m.group(1)) != len(p["stormDates"]): bad.append((p["id"], x))
            m = re.match(r"([\d.]+) miles from", x)
            if m and abs(float(m.group(1)) - p["miles"]) > 0.051: bad.append((p["id"], x))
            if "original" in x.lower() or "since it was built" in x: bad.append((p["id"], x))   # permit records start in 2023: never claimed
    check(not bad, "every reason matches the pick's own facts (hail + storm date, year built, squares, storm count, miles)" + ("" if not bad else ": " + str(bad[:3])))
    check(all(p["channel"] == "text" for p in d), "fresh device: every pick's first touch is a text")
    check(all(p["address"] for p in d), "every pick has a county address")
    check(all(d[i]["score"] >= d[i + 1]["score"] for i in range(len(d) - 1)), "new picks ordered by score")
    check(all(p["hail"] >= 1 for p in d), "every pick took 1 in+ hail on the storm")
    check(not any("—" in w for p in d for w in p["why"]), "no em dashes in reasons")
    print("top 10:", flush=True)
    for i, p in enumerate(d[:10]):
        print(f"  {i+1:2}. {p['address']}  [{p['subdivision']}]  score {p['score']}  | {' ; '.join(p['why'])}", flush=True)

    # ---------- deterministic: across reloads, and the kept list holds all day ----------
    ids1 = page.evaluate(IDS)
    kept1 = page.evaluate("() => RC.daily().map(p => p.id)")          # keeps today's list
    page.reload(wait_until="domcontentloaded"); page.wait_for_function("window.RC && RC.factsReady", timeout=20000); page.evaluate(LOAD)
    ids2 = page.evaluate(IDS)
    check(ids1 == ids2, "same 50 in the same order after a reload")
    check(page.evaluate("() => RC.daily().map(p => p.id)") == kept1 == ids1, "kept list for today returned after reload")
    # the kept list stays put after a home is reached; that home shows as done
    page.evaluate("id => RC.logText(id, 'Text drafted in Messages')", ids1[0])
    kd = page.evaluate("() => RC.daily()")
    check([p["id"] for p in kd] == ids1 and kd[0]["status"] == "done", "same 50 all day: a reached home stays, marked done")
    page.evaluate(CLEAR)

    # ---------- exclusions ----------
    base = page.evaluate(IDS)
    a, b2, c, e = base[0], base[1], base[2], base[3]
    # outreach is text and email only (10-09): a home reached under 24 h ago is one that got a text or an email
    page.evaluate("""([a, b, c, e]) => {
      RC.setStage(a, 'won', 'Won');
      RC.setStage(b, 'called', 'Moved to Not now', { archived: new Date().toISOString() });
      RC.optOut(c, 'STOP');
      RC.logText(e, 'Text drafted in Messages'); }""", [a, b2, c, e])
    after = page.evaluate(IDS)
    ex = page.evaluate("() => RC.queueStats().excluded")
    check(a not in after, "Won home excluded")
    check(b2 not in after, "Not now home excluded")
    check(c not in after, "opted-out home excluded")
    check(e not in after and ex["contacted24h"] >= 1, "home reached (text) under 24 h excluded")
    kept_order = [x for x in after if x in base]
    rest = [x for x in base if x not in (a, b2, c, e)]
    check(len(after) == len(base) and kept_order == rest[:len(kept_order)] and len(kept_order) >= len(rest) - 4, "the next best homes fill the freed slots, the rest keep their order")
    check(page.evaluate("id => RC.canSchedule(id).ok", c) is False, "opted-out home cannot have a text scheduled")
    page.evaluate(CLEAR)

    # ---------- cadence on a fake clock (Central time; 16:00Z = 11 am CDT / 10 am CST) ----------
    page.clock.install(time="2026-10-12T16:00:00Z")
    page.wait_for_timeout(300)
    fresh = page.evaluate(IDS)
    h, g = fresh[0], fresh[1]
    cad0 = page.evaluate("id => RC.cadence(id)", h)
    check(cad0["step"] == 1 and cad0["lastContact"] is None and cad0["dueToday"], "never reached: step 1, due now")
    page.evaluate("id => RC.logText(id, 'Text drafted in Messages')", h)                     # day 1 = Oct 12
    cad = page.evaluate("id => RC.cadence(id)", h)
    check(cad["step"] == 3 and cad["nextDue"] == "2026-10-14" and not cad["overdue"], f"day 1 touch -> next is day 3 on Oct 14 ({cad['step']}, {cad['nextDue']})")
    check(cad0["channel"] == "text" and cad["channel"] == "email", f"cadence channels: day 1 = text, day 3 = email ({cad0['channel']}, {cad['channel']})")
    ch = page.evaluate("""() => { const f = { id: 'x', street: '1 Main St', city: 'Plano', stormISO: '2026-06-02', hail: 1.2, roofYear: 1999 };
      const t1 = RC.copy.next(f, 1, 'cold', 'text'), a1 = RC.copy.next(f, 1, 'cold'), a0 = RC.copy.next(f, 0, 'cold'), e0 = RC.copy.next(f, 0, 'cold', 'email');
      return { t1b: t1.blocked || '', t1u: t1.useChannel, t1body: t1.body, a1: a1.channel, a0: a0.channel, e0: e0.channel, e0f: !!e0.fallback,
        cad: RC.copy.cadence.map(c => c.channel), steps: [1, 2, 3, 5].map(k => RC.copy.next(f, k, 'optin', 'text').useChannel) }; }""")
    check(ch["t1u"] == "email" and not ch["t1body"] and "email" in ch["t1b"], f"RC.copy.next: a day 3 text is refused with no words, use email ({ch['t1b']})")
    check(ch["a1"] == "email" and ch["a0"] == "text" and ch["cad"] == ["text", "email", "email", "email", "email", "email"], f"RC.copy.next default channel follows the step: {ch['cad']}")
    check(ch["steps"] == ["email"] * 4, "opted-in follow-ups are email too")
    check(ch["e0"] == "email" and ch["e0f"], "a day 1 email is only the fallback (marked fallback) when the text can't go")
    day(page, "2026-10-13T16:00:00Z")
    check(h not in page.evaluate(IDS) and not page.evaluate("id => RC.cadence(id).dueToday", h), "Oct 13: not due, not in the list")
    # a second home reached on Oct 13 (due Oct 15), so two homes are due later and ordering can be tested
    page.evaluate("id => RC.logText(id, 'Text drafted in Messages')", g)
    day(page, "2026-10-14T16:00:00Z")
    q = page.evaluate("() => RC.daily(null, { rebuild: true, keep: false })")
    check(q[0]["id"] == h and q[0]["reason"] == "cadence" and q[0]["step"] == 3, f"Oct 14: day 3 follow-up jumps to the top ({q[0]['id']} {q[0]['reason']} step {q[0]['step']})")
    check(q[0]["channel"] == "email" and all(p["channel"] == "text" for p in q[1:]), "the day 3 follow-up goes by email, new homes by text")
    check(len(q) == 50 and all(p["reason"] == "new" for p in q[1:]), "cadence slot first, new picks fill the rest to 50")
    check(any("Day 3 follow-up" in w for w in q[0]["why"]), "cadence pick says why: " + " ; ".join(q[0]["why"]))
    page.evaluate("id => RC.logText(id, 'Text drafted in Messages')", h)                     # day 3 touch
    cad = page.evaluate("id => RC.cadence(id)", h)
    check(cad["step"] == 7 and cad["nextDue"] == "2026-10-18", f"day 3 touch -> day 7 on Oct 18 ({cad['step']}, {cad['nextDue']})")
    day(page, "2026-10-16T16:00:00Z")                                                       # g due Oct 15, now 1 day over
    q = page.evaluate("() => RC.daily(null, { rebuild: true, keep: false })")
    check(q[0]["id"] == g and q[0]["step"] == 3 and page.evaluate("id => RC.cadence(id)", g)["daysOverdue"] == 1, "overdue home first, 1 day overdue")
    day(page, "2026-10-18T16:00:00Z")
    q = page.evaluate("() => RC.daily(null, { rebuild: true, keep: false })")
    due_ids = [p["id"] for p in q if p["reason"] == "cadence"]
    check(due_ids == [g, h], f"most overdue first: g (3 days over) then h (due today) {due_ids}")
    page.evaluate("id => RC.logEmail(id, 'Email drafted')", h)                               # day 7 touch
    cad = page.evaluate("id => RC.cadence(id)", h)
    check(cad["step"] == 30 and cad["nextDue"] == "2026-11-10", f"day 7 touch -> day 30 on Nov 10 ({cad['step']}, {cad['nextDue']})")
    day(page, "2026-11-10T16:00:00Z")
    check(page.evaluate("id => RC.cadence(id).dueToday", h), "Nov 10: day 30 due")
    page.evaluate("id => RC.logEmail(id, 'Email drafted')", h)                               # day 30 touch
    cad = page.evaluate("id => RC.cadence(id)", h)
    check(cad["step"] == 60 and cad["nextDue"] == "2026-12-10", f"day 30 touch -> day 60 on Dec 10 ({cad['step']}, {cad['nextDue']})")
    day(page, "2026-12-15T16:00:00Z")
    cad = page.evaluate("id => RC.cadence(id)", h)
    check(cad["overdue"] and cad["daysOverdue"] == 5 and cad["step"] == 60, "Dec 15: day 60 is 5 days overdue")
    page.evaluate("id => RC.logText(id, 'Text drafted in Messages')", h)                     # day 65 touch
    cad = page.evaluate("id => RC.cadence(id)", h)
    check(cad["step"] == 90 and cad["nextDue"] == "2027-01-09", f"late day 60 touch -> day 90 on Jan 9 ({cad['step']}, {cad['nextDue']})")

    # ---------- opt-out and Won stop the cadence ----------
    day(page, "2027-01-09T16:00:00Z")
    check(h in page.evaluate(IDS), "Jan 9: day 90 due and listed")
    page.evaluate("id => RC.optOut(id, 'STOP')", h)
    cad = page.evaluate("id => RC.cadence(id)", h)
    check(cad["stopped"] == "opted out" and cad["nextDue"] is None and h not in page.evaluate(IDS), "STOP: cadence stops, home leaves the list")
    check(page.evaluate("id => RC.optedOut(id)", h) is True, "RC.optedOut reports it")
    page.evaluate("id => RC.setStage(id, 'won', 'Won')", g)
    check(page.evaluate("id => RC.cadence(id).stopped", g) == "won" and g not in page.evaluate(IDS), "Won: cadence stops, home leaves the list")
    check(page.evaluate("() => RC.queueStats().dueToday") == 0, "nothing else due")

    # ---------- a new storm in the catalog switches the list (and the hail-file fallback) ----------
    def with_storm(hail_files):
        c2 = b.new_context(viewport={"width": 1400, "height": 900})
        pg = c2.new_page(); pg.route("**/formsubmit.co/**", lambda r: r.abort())
        cat = json.loads(pg.request.get("http://localhost:4886/tour/lib/st-data-dfw/catalog.json").body())
        new = json.loads(json.dumps([s for s in cat["storms"] if s["date"] == "2026-06-02"][0])); new["date"] = "2026-10-08"
        cat["storms"].insert(0, new)
        pg.route("**/st-data-dfw/catalog.json*", lambda r: r.fulfill(status=200, body=json.dumps(cat), content_type="application/json"))
        pg.route("**/st-data-dfw/latest-storm.json*", lambda r: r.fulfill(status=200, body=json.dumps({"iso": "2026-10-08", "new": True}), content_type="application/json"))
        def hail(r):
            if hail_files: r.fulfill(status=200, body=pg.request.get(r.request.url.replace("2026-10-08", "2026-06-02")).body(), content_type="application/octet-stream")
            else: r.fulfill(status=404, body="")
        pg.route("**/meta/hail/*/2026-10-08.bin", hail)
        pg.goto(URL, wait_until="domcontentloaded"); pg.wait_for_function("window.RC && RC.factsReady", timeout=20000)
        ok = pg.evaluate(LOAD)
        out = pg.evaluate("() => ({ d: RC.daily(null, { rebuild: true, keep: false }), st: RC.queueStats(), sc: RC.SHOWCASE })")
        pg.evaluate(CLEAR); c2.close()
        return ok, out
    ok, o = with_storm(True)
    check(ok and o["st"]["storm"] == "2026-10-08" and o["sc"] == "2026-10-08" and o["st"]["source"] == "scan" and o["st"]["fileStale"] is True,
          f"new storm in the catalog: the list switches to it on its own ({o['st']['storm']}, source {o['st']['source']}, file stale {o['st']['fileStale']})")
    check(len(o["d"]) == 50 and sum(1 for p in o["d"] if p["storm"] == "2026-10-08") >= 35, f"new storm's homes lead the list ({o['st'].get('fromStorm')})")
    ok, o = with_storm(False)
    fb = o["st"].get("fallback") or {}
    check(ok and o["st"]["storm"] == "2026-06-02" and fb.get("newest") == "2026-10-08" and bool(fb.get("missing")),
          f"newest storm without per-home hail files: falls back to {o['st']['storm']} and says so (missing {fb.get('missing')})")

    # ---------- clean up ----------
    page.evaluate(CLEAR)
    left = page.evaluate("() => Object.keys(localStorage).filter(k => k.indexOf('rc.t.') === 0 && k !== 'rc.t.roofer')")
    check(errors == [], "no page errors" + ("" if not errors else ": " + "; ".join(errors[:3])))
    print("leftover keys (written by the open Today frame, cleared again):", left, flush=True)
    page.evaluate(CLEAR)
    b.close()

print(f"\n{len(passes)} passed, {len(fails)} failed", flush=True)
sys.exit(1 if fails else 0)
