/* daily.js: the "Today" screen, the Daily 50. A call/text queue a person works one home at a time.
   The app NEVER sends anything. Call and Text are plain tel: and sms: links that open the user's own phone.
   Phones arrive by CSV import (skip trace is done outside the app). No owner names anywhere in this file.
   Contract: db/migrations/008_gtm.sql (daily_contacts, contact_attempts). Until that is applied the queue is
   kept in localStorage on this device. Demo mode is a fictional sample with 405-555-01xx numbers.
   Needs: js/modules/guard.js (window.RC_GUARD), js/leads.js (window.Leads), core.js (window.RC), auth.js (RC_AUTH). */
(function () {
  "use strict";
  const TZ = "America/Chicago", PER_DAY = 50, POOL = 600, SEEN_MAX = 3000;
  const OUT = { no_answer: "No answer", talked: "Talked", booked: "Booked", do_not_contact: "Do not contact" };
  const FLAGS = ["dnc_federal", "dnc_ok", "company_dnc", "opted_out"];
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const A = () => window.RC_AUTH || null;
  const G = () => window.RC_GUARD;
  // data bridge. app.js keeps its data in closures, so the orchestrator exposes ONE object (see report):
  //   window.RC_DAILY_SRC = { data: () => DATA, reg: REG, pickDefaultStorm, ensureStormLoaded, loadRegionMeta, regionHomeMeta }
  // (the split modules in js/modules/core.js expose the same names on window.RC, used as a fallback)
  const SRC = () => {
    if (window.RC_DAILY_SRC) return window.RC_DAILY_SRC;
    const R = window.RC; if (!R || !R.st) return null;
    return { data: () => R.st.DATA, reg: R.REG, pickDefaultStorm: R.pickDefaultStorm, ensureStormLoaded: R.ensureStormLoaded, loadRegionMeta: R.loadRegionMeta, regionHomeMeta: R.regionHomeMeta };
  };
  const dayOf = ms => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  const keyOf = r => r.region + ":" + r.idx;
  const ph = p => G().normalize(p);                       // the only form that ever reaches a tel:/sms: link or the database
  const flagged = r => FLAGS.some(f => r[f]) || (!!r.phone && !!S && S.dnc.has(ph(r.phone)));
  const recentAtt = list => (list || []).filter(a => { const t = Date.parse(a && a.at); return !(t < Date.now() - 48 * 3600e3); }); // keep unreadable ones: they fail closed in the guard
  const fmtPhone = p => p && p.length === 10 ? "(" + p.slice(0, 3) + ") " + p.slice(3, 6) + "-" + p.slice(6) : "";
  const noDash = s => String(s || "").replace(/[—–]/g, "-");

  let S = null;            // screen state, one per render() call chain
  const pickCache = {};    // storm date -> scored candidates (scored once per storm load, never per render)

  // ---------- which store ----------
  function modeNow() {
    if (window.RC_DEMO) return "demo";
    const a = A();
    if (a && a.session && a.session() && a.company && a.company()) return "cloud";
    return "local";
  }
  const companyId = () => { const a = A(); const c = a && a.company && a.company(); return c ? c.company_id : null; };
  const companyName = () => {
    const a = A(), c = a && a.company && a.company();
    return (c && (c.brand_name || c.name)) || (window.BRAND && window.BRAND.company) || "our roofing team";
  };
  const lsKey = () => "rc.daily.v1:" + (S.mode === "demo" ? "demo" : (companyId() || "device"));
  function lsRead() { try { return JSON.parse(localStorage.getItem(lsKey()) || "null"); } catch (e) { return null; } }
  function lsWrite() {
    try { localStorage.setItem(lsKey(), JSON.stringify({ date: S.today, rows: S.rows, attempts: recentAtt(S.attempts), seen: S.seen })); } catch (e) { S.err = "This device could not save your work (storage is full or blocked)."; }
  }
  // permanent do-not-contact list: company_dnc table (cloud) plus a device copy that never expires with the day
  const dncKey = () => "rc.daily.v1:dnc:" + (S && S.mode === "demo" ? "demo" : (companyId() || "device"));
  function dncLocalRead() { try { return JSON.parse(localStorage.getItem(dncKey()) || "[]").map(ph).filter(x => x.length === 10); } catch (e) { return []; } }
  function dncLocalWrite() { try { localStorage.setItem(dncKey(), JSON.stringify([...S.dnc])); } catch (e) { S.err = "This device could not save the do-not-contact list."; } }
  async function addDnc(phone, reason) {
    const p = ph(phone); if (p.length !== 10) return;
    S.dnc.add(p); dncLocalWrite();
    if (S.mode !== "cloud" || S.dncLocalOnly) return;
    try { await API("/rest/v1/company_dnc", "POST", { company_id: companyId(), phone: p, reason }); }
    catch (e) {
      if (isMissing(e)) S.dncLocalOnly = true;
      else if (e.status !== 409 && !/duplicate|unique/i.test(e.message || "")) S.err = "Could not save the do-not-contact number to the database. It is blocked on this device.";
    }
  }
  const tableMissing = (e, t) => !!e && /PGRST205|42P01|does not exist|schema cache/i.test(e.message || "") && new RegExp(t).test(e.message || "");
  const isMissing = e => !!e && (e.status === 404 || /PGRST2|PGRST1|schema cache|does not exist|relation/i.test(e.message || ""));
  const API = (path, method, body) => A().token().then(t => A().api(path, method, body, t));

  // ---------- demo sample (fictional, no real people or numbers) ----------
  function demoRows() {
    const streets = ["Sample Oak Dr", "Example Maple Ct", "Demo Cedar Ln", "Fictional Elm St", "Sample Pine Way", "Example Birch Rd", "Demo Willow Ave"];
    const rows = [];
    for (let i = 0; i < 14; i++) {
      const yr = 1988 + (i * 3) % 24, hail = [1.75, 1.5, 2.0, 1.25, 1.75, 1.0, 1.5][i % 7];
      const age = 2026 - yr;
      rows.push({
        region: "demo", idx: i, address: (1100 + i * 37) + " " + streets[i % 7], city: "Demoville", zip: "73069",
        phone: i < 10 ? "40555501" + String(i + 1).padStart(2, "0") : "",
        dnc_federal: i === 4, dnc_ok: false, company_dnc: false, opted_out: false,
        outcome: i === 1 ? "talked" : null,
        line: `Roof: ${yr} (year built), about ${age} yrs. Hail ${hail.toFixed(2)} in, sample storm. Score ${92 - i * 4}.`
      });
    }
    return rows;
  }

  // ---------- data: today's storm, scoring, picking ----------
  function stormDate() {
    const X = SRC(), D = X && X.data(); if (!D || !D.catalog || !D.catalog.length) return null;
    return X.pickDefaultStorm(D.catalog);
  }
  async function ensureData(date) {
    const X = SRC(), st = X.data().byDate[date]; if (!st) throw new Error("storm missing");
    await X.ensureStormLoaded(date);
    const regs = st.regions.map(rr => X.reg(rr.id)).filter(Boolean);
    await Promise.all(regs.map(r => Promise.all([X.loadRegionMeta(r), window.Leads.loadRegion(r)])));
    return { st, regs };
  }
  const monYear = d => { try { return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" }); } catch (e) { return d; } };
  function lineFor(sc, hail, date) {
    const age = sc.parts.find(p => p.key === "age");
    return `Roof: ${age ? age.detail : "age unknown"}. Hail ${hail.toFixed(2)} in, ${monYear(date)}. Score ${sc.score}.`;
  }
  // score every residential home that saw 1 in+ hail ONCE per storm; keep the best POOL
  function candidates(date, regs) {
    if (pickCache[date]) return pickCache[date];
    const L = window.Leads, X = SRC(), out = [];
    regs.forEach(region => {
      const hail = region.hailCache[date]; if (!hail || !region.metaView) return;
      for (let i = 0; i < region.n; i++) {
        if (hail[i] < 100 || region.type[i] > 4) continue;
        if (L.recentlyReroofed(region, i)) continue;               // re-roofed recently: not a lead
        const m = X.regionHomeMeta(region, i);
        if (!/^\d/.test(m.addr)) continue;                          // need a real street number to call about
        const h = hail[i] / 100, sc = L.scoreHome(region, i, h, m);
        out.push({ region: region.id, idx: i, score: sc.score, hail: h, address: m.addr, city: m.city || "", zip: m.zip ? String(m.zip) : "", line: lineFor(sc, h, date) });
      }
    });
    out.sort((a, b) => (b.score - a.score) || (b.hail - a.hail));
    return (pickCache[date] = out.slice(0, POOL));
  }
  function pickFresh(cands, seen) {
    const s = new Set(seen), rows = [];
    // storm follow-up boost (knock.js): those homes first, then the normal ranking; cleared once used for a list
    const bk = "rc.daily.boost." + (S && S.mode === "demo" ? "demo" : (companyId() || "device"));
    try {
      const b = JSON.parse(localStorage.getItem(bk) || "null");
      if (Array.isArray(b) && b.length) {
        const rank = new Map(b.map((x, i) => [x.region + ":" + x.home_idx, i]));
        cands = cands.filter(c => rank.has(c.region + ":" + c.idx)).sort((a, z) => rank.get(a.region + ":" + a.idx) - rank.get(z.region + ":" + z.idx)).concat(cands.filter(c => !rank.has(c.region + ":" + c.idx)));
        localStorage.removeItem(bk);
      }
    } catch (e) { }
    for (const c of cands) {
      if (s.has(c.region + ":" + c.idx)) continue;
      rows.push({ region: c.region, idx: c.idx, address: c.address, city: c.city, zip: c.zip, phone: "", dnc_federal: false, dnc_ok: false, company_dnc: false, opted_out: false, outcome: null, line: c.line });
      if (rows.length >= PER_DAY) break;
    }
    return rows;
  }
  // rows read back from the database only carry address; fill city, zip and the roof/hail line from the loaded data
  function hydrate(rows, date, regs) {
    const L = window.Leads;
    rows.forEach(r => {
      if (r.line && r.city) return;
      const region = regs.find(x => x.id === r.region), hail = region && region.hailCache[date];
      if (!region || !hail || !region.metaView) return;
      const m = SRC().regionHomeMeta(region, r.idx), h = hail[r.idx] / 100;
      r.city = m.city || ""; r.zip = m.zip ? String(m.zip) : "";
      if (h > 0) r.line = lineFor(L.scoreHome(region, r.idx, h, m), h, date);
    });
  }

  // ---------- load / save ----------
  async function load() {
    S.mode = modeNow(); S.today = dayOf(Date.now()); S.note = ""; S.err = ""; S.rows = []; S.attempts = []; S.seen = []; S.focus = null; S.dnc = new Set(); S.dncLocalOnly = false;
    S.dnc = new Set(dncLocalRead());
    if (S.mode === "demo") {
      const d = lsRead();
      S.attempts = recentAtt(d && d.attempts);
      if (d && d.date === S.today) S.rows = d.rows;
      else { S.rows = demoRows(); lsWrite(); }
      S.note = "Demo sample: fictional homes and numbers. Nothing here is real.";
      return;
    }
    const date = stormDate();
    if (!date) throw new Error("nodata");
    const { regs } = await ensureData(date);
    S.date = date;
    if (S.mode === "cloud") {
      try {
        const cut = new Date(Date.now() - 48 * 3600e3).toISOString();
        try {
          const dn = await API("/rest/v1/company_dnc?select=phone&limit=20000", "GET");
          (dn || []).forEach(x => { const p = ph(x.phone); if (p.length === 10) S.dnc.add(p); });
        } catch (e) { if (isMissing(e)) S.dncLocalOnly = true; else throw e; }
        const [rows, att] = await Promise.all([
          API("/rest/v1/daily_contacts?select=*&queued_on=eq." + S.today + "&order=id.asc&limit=200", "GET"),
          API("/rest/v1/contact_attempts?select=phone,channel,at,outcome&at=gte." + encodeURIComponent(cut) + "&order=at.desc&limit=2000", "GET")
        ]);
        S.attempts = att || [];
        if (rows && rows.length) { S.rows = rows.map(r => Object.assign({}, r, { idx: r.home_idx, line: "", city: "", zip: "" })); hydrate(S.rows, date, regs); return; }
        const prior = await API("/rest/v1/daily_contacts?select=region,home_idx&queued_on=lt." + S.today + "&order=id.desc&limit=" + SEEN_MAX, "GET");
        S.seen = (prior || []).map(p => p.region + ":" + p.home_idx);
        S.rows = pickFresh(candidates(date, regs), S.seen);
        if (S.rows.length) {
          const body = S.rows.map(r => ({ company_id: companyId(), region: r.region, home_idx: r.idx, address: r.address, queued_on: S.today }));
          const saved = await API("/rest/v1/daily_contacts", "POST", body);
          (saved || []).forEach(sv => { const r = S.rows.find(x => x.region === sv.region && x.idx === sv.home_idx); if (r) r.id = sv.id; });
        }
        return;
      } catch (e) {
        if (!isMissing(e)) throw e;
        S.mode = "local";
        S.note = "Saved on this device until the database update is applied";
      }
    }
    // local (also the cloud fallback and the signed-out dev copy)
    if (!S.note) S.note = "Saved on this device";
    const d = lsRead();
    S.rows = []; S.attempts = []; S.seen = [];
    if (d) {
      S.attempts = recentAtt(d.attempts);
      S.seen = d.seen || [];
      if (d.date === S.today) S.rows = d.rows || [];
      else S.seen = S.seen.concat((d.rows || []).map(keyOf)).slice(-SEEN_MAX);
    }
    if (!S.rows.length) { S.rows = pickFresh(candidates(date, regs), S.seen); }
    hydrate(S.rows, date, regs);
    lsWrite();
  }
  async function patchRow(r, fields) {
    Object.assign(r, fields);
    if (S.mode !== "cloud") { lsWrite(); return; }
    if (!r.id) { return; }
    try { await API("/rest/v1/daily_contacts?id=eq." + r.id, "PATCH", fields); }
    catch (e) {
      if (isMissing(e)) { S.mode = "local"; S.note = "Saved on this device until the database update is applied"; lsWrite(); }
      else S.err = "Could not save to the database. Check your connection and try again.";
    }
  }
  // Cloud: the server must accept the attempt BEFORE the tel:/sms: link opens. Returns { ok, reason }.
  async function logAttempt(r, channel) {
    const p = ph(r.phone), at = new Date().toISOString();
    if (S.mode !== "cloud") { S.attempts.push({ phone: p, channel, at }); lsWrite(); return { ok: true }; }
    try { await API("/rest/v1/contact_attempts", "POST", { company_id: companyId(), phone: p, channel }); }
    catch (e) {
      const m = String((e && e.message) || "");
      // fail closed: only a genuinely missing contact_attempts table (migration not applied) drops to device mode
      if (tableMissing(e, "contact_attempts")) { S.mode = "local"; S.note = "Saved on this device until the database update is applied"; S.attempts.push({ phone: p, channel, at }); lsWrite(); return { ok: true }; }
      if (/outside_contact_hours/.test(m)) return { ok: false, reason: "The database blocked this: calls and texts are only allowed 8 am to 8 pm Central" };
      if (/three_per_24h/.test(m)) { S.attempts.push({ phone: p, channel, at }); return { ok: false, reason: "The database blocked this: already tried 3 times in the last 24 hours" }; }
      if (/do_not_contact/.test(m)) { S.dnc.add(p); dncLocalWrite(); return { ok: false, reason: "The database blocked this: the number is on a do-not-contact list" }; }
      return { ok: false, reason: "Could not record the attempt, so the link was not opened. Check your connection and try again." };
    }
    S.attempts.push({ phone: p, channel, at });
    return { ok: true };
  }

  // ---------- derived ----------
  const hiddenRows = () => S.rows.filter(flagged);
  const shown = () => S.rows.filter(r => !flagged(r));
  const verdict = r => G().canContact(r.phone, S.attempts, r, Date.now(), S.dnc);
  const ready = () => shown().filter(r => r.phone && !r.outcome);
  const needPhone = () => shown().filter(r => !r.phone && !r.outcome);
  const done = () => shown().filter(r => r.outcome);
  function current() {
    const rd = ready();
    return rd.find(r => keyOf(r) === S.focus) || rd.find(r => verdict(r).ok) || rd[0] || null;
  }
  function smsBody(r) {
    let stamp = ""; try { stamp = window.RC_COMPLY && window.RC_COMPLY.stamp ? String(window.RC_COMPLY.stamp() || "") : ""; } catch (e) { }
    return noDash("Hi, this is " + companyName() + ", a local roofing company." + (stamp ? " " + stamp.trim().replace(/([^.!?])$/, "$1.") : "") +
      " Hail came through your area recently and we can take a quick look at your roof if you would like. New roof? Reply 1 to keep the same material, 2 to switch (metal, tile, impact), 3 not sure. Reply STOP and we will not contact you again.");
  }

  // ---------- html ----------
  function nowCard(r) {
    const v = verdict(r), k = esc(keyOf(r)), first = !S.focus;
    const body = smsBody(r);
    const call = v.ok ? `<a class="btn accent dy-big" href="tel:+1${ph(r.phone)}" data-act="call" data-k="${k}">Call</a>` : `<button class="btn dy-big" type="button" disabled aria-disabled="true">Call</button>`;
    const text = v.ok ? `<a class="btn dy-big" href="sms:+1${ph(r.phone)}?&body=${encodeURIComponent(body)}" data-act="text" data-k="${k}">Text</a>` : `<button class="btn dy-big" type="button" disabled aria-disabled="true">Text</button>`;
    return `<section class="card dy-now" aria-label="Up next">
      <h3 class="dy-h dy-nowh">${first ? "Up next" : "Working on"}</h3>
      <h2 class="dy-addr">${esc(r.address)}</h2>
      <div class="muted">${esc([r.city, r.zip].filter(Boolean).join(" "))}</div>
      <p class="dy-line">${esc(r.line || "")}</p>
      <div class="dy-phone num">${esc(fmtPhone(ph(r.phone)))}</div>
      <div class="dy-go">${call}${text}</div>
      ${v.ok ? "" : `<div class="dy-why" role="status">${esc(v.reason)}</div>`}
      <div class="dy-out" role="group" aria-label="How did it go">${Object.keys(OUT).map(o => `<button class="btn dy-o${o === "do_not_contact" ? " dy-dnc" : ""}" type="button" data-act="out" data-o="${o}" data-k="${k}">${OUT[o]}</button>`).join("")}</div>
      <details class="dy-prev"><summary><span>Show the text message</span><svg class="dy-chev" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></summary><p>${esc(body)}</p></details>
    </section>`;
  }
  function rowBtn(r, why) {
    return `<button class="dy-row" type="button" data-act="focus" data-k="${esc(keyOf(r))}"><span class="dy-ra">${esc(r.address)}</span><span class="dy-rs num">${esc(fmtPhone(ph(r.phone)))}</span><span class="dy-rl muted">${esc(r.line || "")}</span>${why ? `<span class="dy-rw muted">${esc(why)}</span>` : ""}</button>`;
  }
  function phonePair(np) {
    return `<div class="dy-phones" role="group" aria-label="Skip trace"><button class="dy-lnk" type="button" data-act="export">Export for skip trace${np.length ? " (" + np.length + ")" : ""}</button><button class="dy-lnk" type="button" data-act="import">Import traced phones</button></div>`;
  }
  function html() {
    const sh = shown(), rd = ready(), np = needPhone(), dn = done(), hid = hiddenRows().length;
    const booked = S.rows.filter(r => r.outcome === "booked").length, worked = S.rows.filter(r => r.outcome).length;
    const cur = current();
    let h = `<div class="dy">
      <div class="dy-sum" role="list">
        <div class="dy-n" role="listitem"><b class="num">${sh.length}</b><span>Today</span></div>
        <div class="dy-n" role="listitem"><b class="num">${rd.length}</b><span>Ready</span></div>
        <div class="dy-n" role="listitem"><b class="num">${worked}</b><span>Worked</span></div>
        <div class="dy-n" role="listitem"><b class="num">${booked}</b><span>Booked</span></div>
      </div>
`;
    if (!np.length) h += phonePair(np);
    if (S.note) h += `<div class="muted dy-note" role="status">${esc(S.note)}</div>`;
    if (S.msg) h += `<div class="dy-msg" role="status">${esc(S.msg)}</div>`;
    if (S.err) h += `<div class="dy-err" role="alert">${esc(S.err)}</div>`;
    if (!S.rows.length) {
      h += `<div class="card dy-empty"><b>No homes in today's list</b><p class="muted">No home with 1 in+ hail and an address is left to queue. Newer storms add homes here.</p></div>`;
    } else if (cur) {
      h += `<div class="dy-cols">` + nowCard(cur);
    } else if (!rd.length) {
      h += `<div class="card dy-empty"><b>${np.length ? "No phones yet" : "Today's list is worked"}</b><p class="muted">${np.length ? "Export the list for skip trace, then import the traced phones. Calls and texts start from there." : "Nothing left to call today."}</p></div>`;
    }
    const rest = rd.filter(r => r !== cur);
    if (rest.length) h += `<div class="dy-side"><h3 class="dy-h">Next in line <span class="muted">${rest.length}</span></h3><div class="dy-list">${rest.map(r => rowBtn(r)).join("")}</div></div>`;
    if (cur && S.rows.length) h += `</div>`;
    if (np.length) h += `<div class="dy-hh"><h3 class="dy-h">Needs a phone <span class="muted">${np.length}</span></h3>${phonePair(np)}</div><div class="dy-list">${np.map(r => `<div class="dy-row dy-static"><span class="dy-ra">${esc(r.address)}</span><span class="dy-rl muted">${esc(r.line || "")}</span></div>`).join("")}</div>`;
    if (dn.length) h += `<h3 class="dy-h">Done today <span class="muted">${dn.length}</span></h3><div class="dy-list">${dn.map(r => `<div class="dy-row dy-static"><span class="dy-ra">${esc(r.address)}</span><span class="dy-rs">${esc(OUT[r.outcome] || "")}</span><button class="btn sm" type="button" data-act="undo" data-k="${esc(keyOf(r))}">Undo</button></div>`).join("")}</div>`;
    h += `<input type="file" id="dyFile" accept=".csv,text/csv" hidden>`;
    if (hid) h += `<div class="muted dy-hid">${hid} hidden: do not contact</div>`;
    return h + `</div>`;
  }
  function paint() { if (S && S.el) { S.el.innerHTML = html(); } }

  // ---------- csv ----------
  const csvEsc = v => { v = String(v == null ? "" : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
  function parseCsv(text) {
    const rows = []; let row = [], f = "", q = false;
    text = String(text).replace(/^﻿/, "");
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); f = ""; if (row.some(x => x !== "")) rows.push(row); row = []; }
      else f += c;
    }
    row.push(f); if (row.some(x => x !== "")) rows.push(row);
    return rows;
  }
  function exportCsv() {
    const list = needPhone().length ? needPhone() : shown();
    const lines = ["address,city,zip,region,home_idx"].concat(list.map(r => [csvEsc(r.address), csvEsc(r.city), csvEsc(r.zip), csvEsc(r.region), r.idx].join(",")));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: "text/csv" }));
    a.download = "daily-" + S.today + "-skip-trace.csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    S.msg = list.length + " homes exported (address, city, zip, region, home index). Phones come back through Import traced phones."; S.err = ""; paint();
  }
  const truthy = v => /^(1|y|yes|true|t|x)$/i.test(String(v || "").trim());
  const normAddr = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  async function importCsv(text) {
    const t = parseCsv(text);
    if (t.length < 2) { S.err = "That file has no rows."; S.msg = ""; paint(); return; }
    const head = t[0].map(x => x.trim().toLowerCase().replace(/[\s-]+/g, "_"));
    const col = (...names) => head.findIndex(h => names.includes(h));
    const cIdx = col("home_idx", "idx"), cReg = col("region"), cAddr = col("address"), cPhone = col("phone", "phone_number", "mobile", "cell");
    if (cPhone < 0 || (cIdx < 0 && cAddr < 0)) { S.err = "The file needs a phone column and either home_idx or address."; S.msg = ""; paint(); return; }
    const cF = { dnc_federal: col("dnc_federal", "dnc", "federal_dnc"), dnc_ok: col("dnc_ok", "ok_dnc", "oklahoma_dnc"), company_dnc: col("company_dnc"), opted_out: col("opted_out", "stop") };
    let matched = 0, added = 0, bad = 0, nof = 0, amb = 0;
    const jobs = [], dncs = [];
    const REASON = { dnc_federal: "dnc_federal", dnc_ok: "dnc_ok", company_dnc: "other", opted_out: "opted_out" };
    t.slice(1).forEach(rw => {
      let r = null, ambiguous = false;
      const idxv = cIdx >= 0 ? String(rw[cIdx] || "").trim() : "", regv = cReg >= 0 ? String(rw[cReg] || "").trim() : "";
      const addrv = cAddr >= 0 ? normAddr(rw[cAddr]) : "";
      let c = idxv === "" ? [] : S.rows.filter(x => String(x.idx) === idxv && (!regv || x.region === regv));
      if (c.length === 1) r = c[0];
      else {
        // no unique home_idx (no region column and the same idx in two regions, or no idx): fall back to the address
        const pool = c.length > 1 ? c : S.rows;
        const m = addrv ? pool.filter(x => normAddr(x.address) === addrv) : [];
        if (m.length === 1) r = m[0]; else if (m.length > 1 || c.length > 1) ambiguous = true;
      }
      if (ambiguous) { amb++; return; }
      if (!r) { nof++; return; }
      matched++;
      const p = ph(rw[cPhone] || "");
      const f = {};
      Object.keys(cF).forEach(k => { if (cF[k] >= 0 && truthy(rw[cF[k]])) f[k] = true; });
      if (p.length === 10) { f.phone = p; added++; } else if (String(rw[cPhone] || "") !== "") bad++;
      Object.keys(f).forEach(k => { if (REASON[k] && p.length === 10) dncs.push([p, REASON[k]]); });
      if (Object.keys(f).length) jobs.push([r, f]);
    });
    for (const [pp, why] of dncs) await addDnc(pp, why);   // before anything is shown: a flagged number never appears again
    for (const [r, f] of jobs) { await patchRow(r, f); }
    const flaggedN = hiddenRows().length;
    S.msg = `Matched ${matched} of ${t.length - 1} rows. ${added} phones added` + (bad ? `, ${bad} skipped (not a 10 digit number)` : "") + (nof ? `, ${nof} not in today's list` : "") + (amb ? `, ${amb} rows skipped: could not tell which home` : "") + `. ${flaggedN} hidden: do not contact.`;
    S.err = S.err || ""; paint();
  }

  // ---------- events ----------
  async function onClick(e) {
    const b = e.target.closest("[data-act]"); if (!b || !S) return;
    const act = b.dataset.act, r = b.dataset.k ? S.rows.find(x => keyOf(x) === b.dataset.k) : null;
    S.msg = ""; S.err = "";
    if (act === "call" || act === "text") {
      const v = r ? verdict(r) : { ok: false, reason: "" };
      if (!v.ok) { e.preventDefault(); paint(); return; }          // the clock or a limit changed since paint
      if (S.mode === "cloud") {
        e.preventDefault();                                          // cloud: the server accepts the attempt first, then the link opens
        if (S.busy) return; S.busy = true;
        const href = b.getAttribute("href");
        const res = await logAttempt(r, act); S.busy = false;
        if (!res.ok) { S.err = res.reason; paint(); return; }
        window.location.href = href;
        setTimeout(paint, 600);
      } else { logAttempt(r, act); setTimeout(paint, 600); }          // device copy: the browser follows the link
    } else if (act === "focus" && r) { S.focus = keyOf(r); paint(); window.scrollTo && window.scrollTo(0, 0); }
    else if (act === "out" && r) {
      const o = b.dataset.o;
      if (o === "do_not_contact") {
        await addDnc(r.phone, "asked");
        for (const x of S.rows.filter(x => x.phone && ph(x.phone) === ph(r.phone))) await patchRow(x, { outcome: "do_not_contact", company_dnc: true });
      } else await patchRow(r, { outcome: o });
      S.focus = null; paint(); window.scrollTo && window.scrollTo(0, 0);
    } else if (act === "undo" && r) { await patchRow(r, { outcome: null }); paint(); }
    else if (act === "export") exportCsv();
    else if (act === "import") { const f = S.el.querySelector("#dyFile"); if (f) f.click(); }
  }
  function onChange(e) {
    if (!e.target || e.target.id !== "dyFile" || !e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    if (file.size > 2e6) { S.err = "That file is too large for this list."; paint(); return; }
    const fr = new FileReader();
    fr.onload = () => importCsv(String(fr.result || "")).catch(() => { S.err = "Could not read that file."; paint(); });
    fr.readAsText(file);
  }

  // ---------- entry ----------
  async function render(el) {
    if (!el) return;
    if (!S || S.el !== el) { S = { el, rows: [], attempts: [], seen: [], dnc: new Set(), msg: "", err: "" }; el.addEventListener("click", onClick); el.addEventListener("change", onChange); }
    S.el = el;
    el.innerHTML = `<div class="dy"><div class="muted dy-load" role="status">Loading today's list...</div></div>`;
    const my = S;
    try { await load(); }
    catch (e) {
      el.innerHTML = `<div class="dy"><div class="card dy-empty"><b>${e && e.message === "nodata" ? "Hail data has not loaded yet" : "Today's list did not load"}</b><p class="muted">Check your connection, then try again.</p><button class="btn" type="button" id="dyRetry">Try again</button></div></div>`;
      const b = el.querySelector("#dyRetry"); if (b) b.onclick = () => render(el);
      return;
    }
    if (S !== my) return;
    S.rows.forEach(r => { if (r.phone && FLAGS.some(f => r[f])) { S.dnc.add(ph(r.phone)); } }); dncLocalWrite();
    paint();
  }
  window.RCDaily = { render, _parseCsv: parseCsv };
})();
