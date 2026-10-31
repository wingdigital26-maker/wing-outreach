/* Results screen ("is the service paying for itself"). window.RCRoi.render(el). Computes only when the screen opens.
   Inputs: leads from window.RCInbox.rows() (status booked/shown/signed, status_at, job_value), optional Daily 50 outcomes
   (window.RCDaily.outcomes() if it exists), imported signed jobs (CSV), company_settings.pilot_floor / retainer_monthly.
   If the live database has no pilot_floor / retainer_monthly columns yet (migration 008), values live in localStorage.
   Demo mode (?demo=1 with no session) shows a small fictional sample, labelled as such. Nothing here sends anything. */
(function () {
  "use strict";
  var A = function () { return window.RC_AUTH; };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var money = function (n) { return "$" + Math.round(n).toLocaleString("en-US"); };
  var LS = { get: function (k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var LOCAL_NOTE = "Saved on this device until the database update is applied";

  function signedIn() { return !!(A() && A().session && A().session()); }
  function companyId() { var c = A() && A().company && A().company(); return (c && c.company_id) || "x"; }
  function mkey(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2); }
  function keyOf(iso) { var d = new Date(iso); return isNaN(d) ? null : mkey(d); }
  function months() { var n = new Date(), out = []; for (var i = 0; i < 4; i++) { var d = new Date(n.getFullYear(), n.getMonth() - i, 1); out.push({ key: mkey(d), label: MON[d.getMonth()], long: LONG[d.getMonth()] + " " + d.getFullYear() }); } return out; }

  /* ---------- demo sample: fictional, small ---------- */
  function sample() {
    var n = new Date(), y = n.getFullYear(), m = n.getMonth();
    var at = function (back, day) { return new Date(y, m - back, day, 10).toISOString(); };
    var L = function (id, st, back, day, jv) { return { id: id, status: st, status_at: at(back, day), created_at: at(back, Math.max(1, day - 2)), job_value: jv == null ? null : jv, address: "Sample " + id }; };
    return { leads: [L("s1", "signed", 0, 3, 18400), L("s2", "signed", 0, 4, 12200), L("s3", "shown", 0, 3), L("s4", "shown", 0, 2), L("s5", "booked", 0, 2), L("s6", "booked", 0, 1),
      L("s7", "signed", 1, 18, 21500), L("s8", "shown", 1, 12), L("s9", "shown", 1, 10), L("s10", "booked", 1, 5), L("s11", "booked", 1, 4),
      L("s12", "shown", 2, 20), L("s13", "booked", 2, 9)], imports: [], floor: 4, fee: 1000 };
  }

  /* ---------- settings (database first, device as fallback) ---------- */
  function lsKey() { return "rc.roi." + companyId(); }
  function loadSettings() {
    var local = LS.get(lsKey()) || {};
    if (!signedIn()) return Promise.resolve({ floor: local.floor, fee: local.fee, pilot_start: local.pilot_start, imports: local.imports || [], local: true });
    return A().token().then(function (t) { return A().api("/rest/v1/company_settings?select=pilot_floor,retainer_monthly&limit=1", "GET", null, t); })
      .then(function (r) {
        var x = r && r[0] || {};
        var floor = x.pilot_floor != null ? x.pilot_floor : local.floor, fee = x.retainer_monthly != null ? x.retainer_monthly : local.fee;
        return { floor: floor, fee: fee, pilot_start: local.pilot_start, imports: local.imports || [], local: x.pilot_floor == null && x.retainer_monthly == null && (local.floor != null || local.fee != null) };
      }, function () { return { floor: local.floor, fee: local.fee, pilot_start: local.pilot_start, imports: local.imports || [], local: local.floor != null || local.fee != null }; });
  }
  /* returns "db" or "local" */
  function saveSetting(field, val) {
    var col = field === "floor" ? "pilot_floor" : "retainer_monthly", loc = LS.get(lsKey()) || {};
    var keep = function () { loc[field] = val; LS.set(lsKey(), loc); return "local"; };
    if (!signedIn()) return Promise.resolve(keep());
    var c = A().company && A().company(); if (!c) return Promise.resolve(keep());
    var patch = {}; patch[col] = val; patch.updated_at = new Date().toISOString();
    return A().token().then(function (t) { return A().api("/rest/v1/company_settings?company_id=eq." + c.company_id, "PATCH", patch, t); })
      .then(function (r) { if (r && r[0]) { delete loc[field]; LS.set(lsKey(), loc); return "db"; } return keep(); }, keep);
  }

  /* pilot start is device-only (company_settings has no column for it) */
  function savePilotStart(v) { var loc = LS.get(lsKey()) || {}; loc.pilot_start = v; LS.set(lsKey(), loc); }
  function pilotSegs(leads, startIso, floor) {
    var st = new Date(startIso + "T00:00:00"), now = new Date(), DAY = 86400000, segs = [];
    for (var i = 0; i < 3; i++) segs.push({ from: new Date(st.getTime() + i * 30 * DAY), to: new Date(st.getTime() + (i + 1) * 30 * DAY), n: 0 });
    leads.forEach(function (l) {
      if (l.status !== "shown" && l.status !== "signed") return;
      var d = new Date(l.shown_at || l.status_at || l.created_at); if (isNaN(d)) return;
      segs.forEach(function (g) { if (d >= g.from && d < g.to) g.n++; });
    });
    segs.forEach(function (g) { g.state = now < g.from ? "not started" : (floor != null && g.n >= floor) ? "met" : now < g.to ? "in progress" : floor != null ? "missed" : "ended"; });
    return segs;
  }
  var SHORT = function (d) { return MON[d.getMonth()] + " " + d.getDate(); };

  /* ---------- CSV import ---------- */
  function parseCsv(text) {
    var out = [], row = [], f = "", q = false, i = 0, c;
    text = String(text).replace(/^﻿/, "");
    for (; i < text.length; i++) {
      c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); f = ""; if (row.length > 1 || row[0] !== "") out.push(row); row = []; }
      else f += c;
    }
    row.push(f); if (row.length > 1 || row[0] !== "") out.push(row);
    return out;
  }
  function mkDate(y, mo, d) { var x = new Date(y, mo - 1, d, 12); return x.getFullYear() === y && x.getMonth() === mo - 1 && x.getDate() === d ? x : null; } /* rejects 2026-02-31 */
  function parseDate(s) {
    s = String(s || "").trim(); var m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return mkDate(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s))) { var yr = +m[3]; if (yr < 100) yr += 2000; return mkDate(yr, +m[1], +m[2]); }
    return null;
  }
  /* street key: house number + street name up to the suffix; city, state, zip and unit are dropped */
  var SUF = { street: "st", st: "st", drive: "dr", dr: "dr", road: "rd", rd: "rd", avenue: "ave", ave: "ave", av: "ave", lane: "ln", ln: "ln", court: "ct", ct: "ct", boulevard: "blvd", blvd: "blvd", way: "way", place: "pl", pl: "pl", circle: "cir", cir: "cir", terrace: "ter", ter: "ter", trail: "trl", trl: "trl", parkway: "pkwy", pkwy: "pkwy", highway: "hwy", hwy: "hwy" };
  function normAddr(a) {
    var t = String(a || "").toLowerCase().split(",")[0].replace(/\b(apt|unit|ste|suite|lot)\b.*$/, "").replace(/#.*$/, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().split(" ");
    var out = [];
    for (var i = 0; i < t.length; i++) { var w = t[i]; if (SUF[w] && out.length > 1) { out.push(SUF[w]); return out.join(" "); } out.push(w); }
    return out.join(" ");
  }
  function importRows(grid) {
    var head = grid[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var ia = head.findIndex(function (h) { return /addr/.test(h); }), id = head.findIndex(function (h) { return /date/.test(h); }), iv = head.findIndex(function (h) { return /value|amount|price|total/.test(h); });
    var body = grid.slice(1);
    if (ia < 0 || id < 0 || iv < 0) { if (grid[0].length >= 3 && parseDate(grid[0][1])) { ia = 0; id = 1; iv = 2; body = grid; } else return { err: "Need three columns: address, date, value." }; }
    var good = [], bad = 0, why = { value: 0, date: 0, address: 0 };
    body.slice(0, 2000).forEach(function (r) {
      var rawv = String(r[iv] == null ? "" : r[iv]).trim(), a = String(r[ia] || "").trim().slice(0, 200), d = parseDate(r[id]);
      var vok = /^\$?\s*\d[\d,]*(\.\d+)?$/.test(rawv), v = vok ? Math.round(Number(rawv.replace(/[$,\s]/g, ""))) : NaN;
      if (!a) { bad++; why.address++; return; }
      if (!d) { bad++; why.date++; return; }
      if (!vok || !isFinite(v) || v <= 0 || v > 1000000) { bad++; why.value++; return; }
      good.push({ a: a, d: d.toISOString().slice(0, 10), v: v });
    });
    var rs = []; if (why.value) rs.push(why.value + " with a missing or unreadable value"); if (why.date) rs.push(why.date + " with a missing or impossible date"); if (why.address) rs.push(why.address + " with no address");
    good.why = rs.join(", ");
    return { good: good, bad: bad };
  }

  /* ---------- the numbers ---------- */
  function compute(leads, imports, ms) {
    var out = {}; ms.forEach(function (m) { out[m.key] = { booked: 0, shown: 0, signed: 0, value: 0, valued: 0, events: 0 }; });
    var matched = 0, used = {}, seenJob = {}, inWin = 0, outWin = 0;
    var addrIdx = {}; leads.forEach(function (l) { var k = normAddr(l.address); if (k) (addrIdx[k] = addrIdx[k] || []).push(l); });
    leads.forEach(function (l) {
      var fall = l.status_at || l.created_at;
      var reached = { booked: l.status === "booked" || l.status === "shown" || l.status === "signed", shown: l.status === "shown" || l.status === "signed", signed: l.status === "signed" };
      [["booked", "booked_at"], ["shown", "shown_at"], ["signed", "signed_at"]].forEach(function (st) {
        if (!reached[st[0]]) return;
        var k = keyOf(l[st[1]] || fall), b = k && out[k]; if (!b) return; /* stage date, else last status change, else received date */
        b[st[0]]++; b.events++;
        if (st[0] === "signed" && l.job_value != null) { b.value += Number(l.job_value) || 0; b.valued++; }
      });
    });
    imports.forEach(function (j) {
      var k = keyOf(j.d), b = k && out[k]; if (!b) { outWin++; return; }
      var ak = normAddr(j.a), dk = ak + "|" + k; if (seenJob[dk]) return; seenJob[dk] = 1; /* same address twice in one month = one job */
      inWin++;
      var hit = (addrIdx[ak] || []).filter(function (l) { return l.status === "signed" && !used[l.id]; })[0];
      if (hit) { /* already counted as a signed lead: do not double count; use the file value if the lead has none */
        used[hit.id] = 1; matched++;
        if (hit.job_value == null) { b.value += j.v; b.valued++; }
        return;
      }
      b.signed++; b.events++; b.value += j.v; b.valued++;
    });
    return { by: out, matched: matched, inWin: inWin, outWin: outWin };
  }
  function dailyBooked() {
    try { var d = window.RCDaily; if (!d || typeof d.outcomes !== "function") return null; var o = d.outcomes() || [], k = mkey(new Date()); var n = 0; o.forEach(function (x) { if (x && x.outcome === "booked" && keyOf(x.at || x.date) === k) n++; }); return n; } catch (e) { return null; }
  }

  var CSS = ".roi-seg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.roi-seg>div{border:1px solid var(--line);border-radius:12px;padding:10px 12px}.roi-seg b{display:block;font-size:12.5px;font-weight:600}.roi-seg .n{font-size:22px;font-weight:650;font-variant-numeric:tabular-nums}.roi-seg .st{font-size:12.5px;font-weight:600}.roi-rep{white-space:pre-wrap;font:inherit;font-size:13px;line-height:1.5;color:var(--ink);background:var(--surface-2);border-radius:10px;padding:12px;margin:0;width:100%;box-sizing:border-box;border:0}@media (max-width:640px){.roi-seg{grid-template-columns:1fr;gap:8px}.roi-seg>div{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px;padding:8px 12px}.roi-seg .n{font-size:18px}}" +
    ".roi-wrap{max-width:980px;display:flex;flex-direction:column;gap:14px;padding-bottom:30px}.roi-note{font-size:12.5px;color:var(--muted)}" +
    ".roi-hero{padding:22px 24px;display:flex;flex-direction:column;gap:6px}.roi-hero .lab{font-size:12.5px;color:var(--muted)}.roi-big{font-size:46px;font-weight:650;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1.05}.roi-vs{font-size:15px;color:var(--ink-2)}.roi-vs b{font-weight:650;color:var(--ink)}.roi-fee{display:flex;gap:2px 16px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:0}.roi-fee .roi-edit{margin-left:auto;padding:0;min-height:32px}.roi-hero{gap:4px}" +
    ".roi-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.roi-kpis .kpi-value{font-variant-numeric:tabular-nums}.roi-none{font-size:15px;color:var(--muted);font-weight:500;line-height:1.3}" +
    ".roi-in{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.roi-in input[type=number]{font:inherit;font-size:13px;padding:7px 9px;width:130px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--ink)}" +
    ".roi-tbl{width:100%;border-collapse:collapse;font-size:13px}.roi-tbl th{text-align:right;font-weight:500;color:var(--muted);font-size:12px;padding:6px 8px}.roi-tbl th:first-child,.roi-tbl td:first-child{text-align:left}.roi-tbl td{text-align:right;padding:9px 8px;border-top:1px solid var(--line-2);font-variant-numeric:tabular-nums}" +
    ".roi-bar{height:8px;border-radius:99px;background:var(--surface-2);overflow:hidden;min-width:70px}.roi-bar i{display:block;height:100%;background:var(--accent);border-radius:99px}" +
    ".roi-imp{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.roi-imp input[type=file]{font-size:12.5px;max-width:100%}.roi-msg{font-size:12.5px;color:var(--ink-2)}" +
    ".roi-link{all:unset;cursor:pointer;font-size:12.5px;color:var(--accent);text-decoration:underline;text-underline-offset:2px}.roi-link:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.roi-ctx{display:block;font-size:12.5px;color:var(--muted);margin-top:4px}.roi-edit{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;min-height:44px;min-width:44px;padding:0 12px 0 0;cursor:pointer;font-size:12.5px;color:var(--accent);text-decoration:underline;text-underline-offset:2px}.roi-edit:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.roi-of{font-size:15px;font-weight:500;color:var(--muted)}.roi-set{display:flex;gap:18px;flex-wrap:wrap}" +
    "@media (max-width:640px){.roi-kpis{gap:8px}.roi-kpis .card.kpi{padding:12px 10px;min-width:0}.roi-kpis .label{font-size:11.5px}.roi-kpis .kpi-value{font-size:24px}.roi-kpis .roi-none{font-size:12px}.roi-kpis .delta{font-size:11px}.roi-of{font-size:12px;display:block}.roi-big{font-size:38px}.roi-hero{padding:18px}.roi-tbl .hide-s{display:none}}";
  function injectCss() { if (document.getElementById("roiCss")) return; var s = document.createElement("style"); s.id = "roiCss"; s.textContent = CSS; document.head.appendChild(s); }

  function render(el) {
    injectCss();
    el.innerHTML = '<div class="roi-wrap"><div class="card ib-empty" style="padding:26px 20px;color:var(--muted)">Loading results...</div></div>';
    var showRep = false, wrap = el.firstChild, demo = !signedIn() && !!(A() && A().demo), S = null, leads = [], loadErr = false, showSet = false;
    var ms = months();
    function reportText(cur, fee, floor, segs, label) {
      var L = ["Monthly report, " + label, "Inspections booked: " + cur.booked, "Inspections done: " + cur.shown, "Jobs signed: " + cur.signed];
      L.push("Signed value: " + (cur.valued ? money(cur.value) : "none logged") + (fee > 0 ? " against a " + money(fee) + " monthly fee" : " (no fee set)"));
      var cs = null; if (segs) segs.forEach(function (g) { if (new Date() >= g.from && new Date() < g.to) cs = g; });
      L.push("Floor: " + (floor == null ? "no target set" : floor + " inspections a month" + (cs ? ", pilot month " + (segs.indexOf(cs) + 1) + " is " + cs.state + " (" + cs.n + " of " + floor + ")" : (segs ? ", pilot window is not active this month" : ", pilot start date not set"))));
      try { var q = window.RCSeo; if (q && typeof q.summary === "function") { var t = q.summary(); if (t) L.push("SEO: " + (typeof t === "string" ? t : (t.headline || ""))); } } catch (e) { }
      return L.join("\n").replace(/[\u2013\u2014]/g, "-");
    }
    function draw(note) {
      var imports = S.imports || [], cm = compute(leads, imports, ms), cur = cm.by[ms[0].key], fee = S.fee, floor = S.floor;
      var hasAny = ms.some(function (m) { return cm.by[m.key].events > 0; });
      var h = "";
      if (demo) h += '<div class="card" style="padding:12px 16px"><b>Sample data.</b> <span class="roi-note">These are made-up numbers so you can see the layout. Sign in to see your own results.</span></div>';
      if (loadErr) h += '<div class="card" style="padding:12px 16px"><span class="roi-note">Could not load your leads, so the numbers below may be incomplete. Reopen this screen to try again.</span></div>';
      /* hero: signed work vs fee */
      h += '<div class="card roi-hero"><span class="lab">Signed work vs fee, ' + esc(ms[0].long) + "</span>";
      var vs = "";
      if (cur.signed > 0) {
        h += '<div class="roi-big">' + (cur.valued ? money(cur.value) : cur.signed + (cur.signed === 1 ? " job" : " jobs")) + ' <span style="font-size:18px;font-weight:500;color:var(--muted)">signed</span></div>';
        if (cur.valued < cur.signed) h += '<div class="roi-note">' + (cur.signed - cur.valued) + " signed " + (cur.signed - cur.valued === 1 ? "job has" : "jobs have") + " no job value yet, so the total is higher than shown. Add it on the Leads screen.</div>";
        if (fee > 0 && cur.valued) vs = '<div class="roi-vs">against a <b>' + money(fee) + "</b> monthly fee (" + (cur.value >= fee ? "covers it " + (Math.round(cur.value / (fee || 1) * 10) / 10) + " times over" : "not yet covered") + ")</div>";
      } else {
        h += '<div class="roi-big" style="color:var(--muted);font-size:26px;font-weight:600">No signed jobs logged yet this month</div>';
        if (fee > 0) vs = '<div class="roi-vs">Monthly fee <b>' + money(fee) + "</b></div>";
      }
      h += '<div class="roi-fee">' + vs + '<button type="button" class="roi-edit" data-open="set">' + (fee > 0 ? "Edit fee and target" : "Set your monthly fee") + "</button></div></div>";
      /* pilot tracker */
      h += '<div class="card"><div class="card-h"><h3>Pilot</h3></div><div class="card-b">';
      var segs = null, ps = S.pilot_start;
      if (ps && floor != null) segs = pilotSegs(leads, ps, floor);
      if (!segs) h += '<div class="roi-note">' + (!ps ? "Set a pilot start date" : "") + (!ps && floor == null ? " and a monthly inspection target" : (floor == null ? "Set a monthly inspection target" : "")) + ' in Edit fee and target to track the 90-day pilot.</div>';
      else {
        h += '<div class="roi-note" style="margin-bottom:8px">Started ' + esc(SHORT(segs[0].from)) + ", ends " + esc(SHORT(new Date(segs[2].to.getTime() - 86400000))) + ". Floor: " + floor + " inspections a month.</div><div class=\"roi-seg\">";
        segs.forEach(function (g, i) { h += "<div><b>Month " + (i + 1) + "</b><span class=\"roi-note\">" + esc(SHORT(g.from)) + " to " + esc(SHORT(new Date(g.to.getTime() - 86400000))) + '</span><div class="n">' + g.n + ' <span class="roi-of">of ' + floor + '</span></div><span class="st">' + esc(g.state.charAt(0).toUpperCase() + g.state.slice(1)) + "</span></div>"; });
        h += "</div>";
      }
      h += '<p class="roi-note" style="margin:10px 0 0">Miss the floor in a month: the next month is free. Miss all three: fees refunded.<br>Counts only inspections the estimator attended (or exterior access approved) for owners in your ZIPs.</p>';
      h += '<div style="margin-top:10px"><button type="button" class="btn sm" id="roiRepBtn">' + (showRep ? "Hide monthly report" : "Monthly report") + "</button></div>";
      if (showRep) {
        var rp = reportText(cur, fee, floor, segs, ms[0].long);
        h += '<div style="margin-top:10px"><textarea class="roi-rep" id="roiRepTxt" rows="9" readonly aria-label="Monthly report">' + esc(rp) + '</textarea><div style="margin-top:8px"><button type="button" class="btn sm" id="roiCopy">Copy summary</button> <span class="roi-msg" id="roiCopyMsg" aria-live="polite"></span></div></div>';
      }
      h += "</div></div>";
      /* KPI tiles (3) */
      var none = '<div class="roi-none">No inspections logged yet this month</div>';
      var db = dailyBooked();
      h += '<div class="roi-kpis">';
      h += '<div class="card kpi"><span class="label">Inspections booked</span>' + (cur.events ? '<div class="kpi-value">' + cur.booked + "</div>" : none) + '<span class="roi-ctx">this month, last month ' + cm.by[ms[1].key].booked + "</span>" + (db ? '<span class="delta">Daily 50 calls marked ' + db + " booked (counted separately)</span>" : "") + "</div>";
      h += '<div class="card kpi"><span class="label">Inspections done</span>' + (cur.events ? '<div class="kpi-value">' + cur.shown + "</div>" : none) +
        '<span class="roi-ctx">' + (floor != null ? "of " + floor + " target" : "no target set") + "</span></div>";
      h += '<div class="card kpi"><span class="label">Jobs signed</span>' + (cur.events ? '<div class="kpi-value">' + cur.signed + "</div>" : '<div class="roi-none">No jobs signed yet this month</div>') +
        '<span class="roi-ctx">' + (cur.valued ? money(cur.value) + " signed value" : "no signed value logged") + "</span></div></div>";
      if (note) h += '<div class="roi-msg" aria-live="polite">' + esc(note) + "</div>";
      /* months table */
      h += '<div class="card"><div class="card-h"><h3>Last 4 months</h3></div><div class="card-b">';
      if (!hasAny) h += '<div class="roi-note">Nothing to compare yet. Update a lead to Inspection booked, Inspection done or Job signed on the Leads screen, or import signed jobs below.</div>';
      else {
        var max = Math.max.apply(null, ms.map(function (m) { return cm.by[m.key].shown; }).concat([floor || 0, 1]));
        h += '<table class="roi-tbl"><thead><tr><th>Month</th><th>Booked</th><th>Done</th><th class="hide-s">Vs target</th><th>Signed</th><th>Signed value</th></tr></thead><tbody>';
        ms.forEach(function (m) {
          var b = cm.by[m.key];
          h += "<tr><td>" + esc(m.label) + "</td><td>" + b.booked + "</td><td>" + b.shown + '</td><td class="hide-s"><div class="roi-bar" title="' + b.shown + (floor != null ? " of " + floor : "") + '"><i style="width:' + Math.min(100, Math.round(b.shown / max * 100)) + '%"></i></div></td><td>' + b.signed + "</td><td>" + (b.valued ? money(b.value) : "-") + "</td></tr>";
        });
        h += "</tbody></table>";
        h += '<p class="roi-note" style="margin:10px 0 0">Each step counts in the month it was logged. Older leads without a step date use their last status change.' + (S.local ? " " + LOCAL_NOTE + "." : "") + "</p>";
      }
      h += "</div></div>";
      /* quiet settings row */
      if (showSet) h += '<div class="card" id="roiSet"><div class="card-h"><h3>Settings</h3></div><div class="card-b roi-set"><form class="roi-in" data-f="fee"><label class="roi-note" for="roiFee">Monthly fee</label><input id="roiFee" type="number" inputmode="numeric" min="0" max="100000" step="1" required placeholder="Dollars a month"' + (fee > 0 ? ' value="' + esc(fee) + '"' : "") + '><button class="btn sm" type="submit">' + (fee > 0 ? "Update" : "Save") + '</button></form><form class="roi-in" data-f="floor"><label class="roi-note" for="roiFloor">Monthly inspection target</label><input id="roiFloor" type="number" inputmode="numeric" min="0" max="100" step="1" required placeholder="Per month" style="width:100px"' + (floor != null ? ' value="' + esc(floor) + '"' : "") + '><button class="btn sm" type="submit">' + (floor != null ? "Update" : "Save") + '</button></form><form class="roi-in" data-f="pilot"><label class="roi-note" for="roiPilot">Pilot start date</label><input id="roiPilot" type="date" required value="' + esc(S.pilot_start || "") + '" style="width:150px"><button class="btn sm" type="submit">' + (S.pilot_start ? "Update" : "Save") + '</button></form></div></div>';
      /* import */
      h += '<div class="card"><div class="card-h"><h3>Signed jobs from your records</h3></div><div class="card-b"><div class="roi-imp"><input id="roiFile" type="file" accept=".csv,text/csv" aria-label="Choose a CSV file of signed jobs" hidden><button type="button" class="btn sm" id="roiPick">Import CSV</button>' + (imports.length ? '<button type="button" class="btn sm" id="roiClear">Clear ' + imports.length + " imported</button>" : "") + '</div><p class="roi-note" style="margin:8px 0 0">Three columns: address, date, value (for example 123 Main St, 2026-09-14, 18400). Jobs whose address matches a signed lead are not counted twice.' + (imports.length ? " " + cm.inWin + " imported in the last 4 months" + (cm.outWin ? ", " + cm.outWin + " outside the last 4 months" : "") + ", " + cm.matched + " matched to leads." : "") + "</p></div></div>";
      wrap.innerHTML = h;
    }
    function persistImports(list) { var loc = LS.get(lsKey()) || {}; loc.imports = list; LS.set(lsKey(), loc); S.imports = list; }
    wrap.addEventListener("submit", function (e) {
      var f = e.target.closest("form[data-f]"); if (!f) return; e.preventDefault();
      if (f.dataset.f === "pilot") { var pv = f.querySelector("input").value; if (!/^\d{4}-\d{2}-\d{2}$/.test(pv)) { draw("Enter a valid date."); return; } S.pilot_start = pv; if (demo) { draw("Sample only, not saved."); return; } savePilotStart(pv); S.local = true; draw(LOCAL_NOTE); return; }
      var field = f.dataset.f, v = Math.round(Number(f.querySelector("input").value)), max = field === "floor" ? 100 : 100000;
      if (!isFinite(v) || v < 0 || v > max) { draw("Enter a whole number from 0 to " + max.toLocaleString("en-US") + "."); return; }
      if (demo) { S[field] = v; draw("Sample only, not saved."); return; }
      saveSetting(field, v).then(function (res) { S[field] = v; if (res === "local") S.local = true; draw(res === "local" ? LOCAL_NOTE : "Saved"); });
    });
    wrap.addEventListener("click", function (e) {
      if (e.target.id === "roiPick") { var fi = wrap.querySelector("#roiFile"); if (fi) fi.click(); return; }
      if (e.target.dataset && e.target.dataset.open === "set") { showSet = true; draw(); var s = wrap.querySelector("#roiSet"); if (s) { s.scrollIntoView({ block: "center" }); var i = s.querySelector("input"); if (i) i.focus(); } return; }
      if (e.target.id === "roiRepBtn") { showRep = !showRep; draw(); return; }
      if (e.target.id === "roiCopy") {
        var ta = wrap.querySelector("#roiRepTxt"), mg = wrap.querySelector("#roiCopyMsg"), sel = function () { ta.focus(); ta.select(); if (mg) mg.textContent = "Press Ctrl+C to copy."; };
        try { navigator.clipboard.writeText(ta.value).then(function () { if (mg) mg.textContent = "Copied."; }, sel); } catch (er) { sel(); }
        return;
      }
      if (e.target.id === "roiClear") { persistImports([]); draw("Imported jobs cleared."); }
    });
    wrap.addEventListener("change", function (e) {
      if (e.target.id !== "roiFile" || !e.target.files || !e.target.files[0]) return;
      var file = e.target.files[0];
      if (file.size > 1048576) { draw("That file is over 1 MB. Split it and try again."); return; }
      var fr = new FileReader();
      fr.onload = function () {
        var grid = parseCsv(fr.result); if (!grid.length) { draw("The file is empty."); return; }
        var res = importRows(grid); if (res.err) { draw(res.err); return; }
        if (!res.good.length) { draw((res.good.why ? "Skipped: " + res.good.why + ". " : "") + "No usable rows. Each row needs an address, a date (2026-09-14 or 9/14/2026) and a dollar value."); return; }
        var cur = S.imports || [], seen = {}; cur.forEach(function (j) { seen[j.a + "|" + j.d + "|" + j.v] = 1; });
        var add = res.good.filter(function (j) { var k = j.a + "|" + j.d + "|" + j.v; if (seen[k]) return false; seen[k] = 1; return true; });
        var all = cur.concat(add);
        if (demo) { S.imports = all; draw("Sample only, not saved."); return; }
        persistImports(all);
        draw("Imported " + add.length + " job" + (add.length === 1 ? "" : "s") + (res.bad ? ", skipped " + res.bad + " row" + (res.bad === 1 ? "" : "s") + " (" + res.good.why + ")" : "") + ". " + LOCAL_NOTE + ".");
      };
      fr.onerror = function () { draw("Could not read that file."); };
      fr.readAsText(file);
    });
    if (demo) { var d = sample(); S = { floor: d.floor, fee: d.fee, imports: [], pilot_start: (function () { var x = new Date(Date.now() - 60 * 86400000); return x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2) + '-' + ('0' + x.getDate()).slice(-2); })() }; leads = d.leads; draw(); return; }
    var inbox = window.RCInbox;
    Promise.all([loadSettings(), inbox && signedIn() ? inbox.load().then(function () { return inbox.rows(); }, function () { loadErr = true; return []; }) : Promise.resolve([])])
      .then(function (r) { S = r[0]; leads = r[1] || []; draw(); }, function () { S = { imports: [] }; loadErr = true; draw(); });
  }
  window.RCRoi = { render: render };
})();
