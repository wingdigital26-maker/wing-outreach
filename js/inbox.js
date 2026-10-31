/* Homeowner leads inbox (the "Leads" screen). Signed-in users only; RLS limits rows to their own company.
   Rows come from public.homeowner_leads (written by the lead-intake Edge Function from /check?company=<slug>).
   No outbound email or SMS here: the new-lead count is shown in the app only.
   do_not_contact leads show no phone/email and are blank in the CSV.
   ROI loop (migration 008): statuses booked -> shown -> signed, status_at, job_value. If the live database does not have them yet,
   the change is kept in localStorage by lead id (rc.lead.ov) and merged back in when rows load. */
(function () {
  "use strict";
  var A = function () { return window.RC_AUTH; };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var STATUS = [["new", "New"], ["contacted", "Contacted"], ["booked", "Inspection booked"], ["shown", "Inspection done"], ["signed", "Job signed"], ["closed", "Closed (no job)"], ["do_not_contact", "Do not contact"]];
  var NEXT = { "new": ["contacted", "Mark contacted"], contacted: ["booked", "Inspection booked"], booked: ["shown", "Inspection done"], shown: ["signed", "Job signed"] };
  var DBLINE = "Saved on this device until the database update is applied";
  var rows = [], hooks = {}, filter = "all", askJob = null, pending = null;
  var LS = { get: function (k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
  function ovAll() { return LS.get("rc.lead.ov") || {}; }
  function ovSet(id, v) { var o = ovAll(); if (v) o[id] = v; else delete o[id]; LS.set("rc.lead.ov", o); }
  var STAGE = { booked: "booked_at", shown: "shown_at", signed: "signed_at" };
  function copy(r) { var m = {}; for (var k in r) m[k] = r[k]; return m; }
  /* ov[id] = the intended patch (status, status_at, <stage>_at, job_value) that the database has not accepted yet */
  function mergeOv(list) {
    var o = ovAll(), dirty = false;
    var out = list.map(function (r) {
      var p = o[r.id]; if (!p || r._local) return r; /* _local = already merged */
      var same = Object.keys(p).every(function (k) { return r[k] === p[k]; });
      if (same || (r.status_at && p.status_at && r.status_at >= p.status_at)) { delete o[r.id]; dirty = true; return r; } /* database caught up */
      var m = copy(r); for (var k in p) m[k] = p[k]; m._local = true; return m;
    });
    if (dirty) LS.set("rc.lead.ov", o);
    return out;
  }
  function signedIn() { return !!(A() && A().session && A().session()); }
  function load() {
    if (!signedIn()) return Promise.resolve([]);
    return A().token().then(function (t) { return A().api("/rest/v1/homeowner_leads?select=*&order=created_at.desc&limit=1000", "GET", null, t); })
      .then(function (r) { rows = mergeOv(r || []); badge(); return rows; });
  }
  function newCount() { return rows.filter(function (r) { return r.status === "new"; }).length; }
  function badge() {
    var n = newCount();
    [].forEach.call(document.querySelectorAll("[data-r=leads]"), function (a) {
      var b = a.querySelector(".nbadge");
      if (!n) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement("span"); b.className = "nbadge"; a.appendChild(b); }
      b.textContent = n > 99 ? "99+" : n; b.setAttribute("aria-label", n + " new leads");
    });
  }
  function save(id, patch) {
    return A().token().then(function (t) { return A().api("/rest/v1/homeowner_leads?id=eq." + encodeURIComponent(id), "PATCH", patch, t); })
      .then(function (r) { var u = r && r[0]; if (u) rows = rows.map(function (x) { return x.id === id ? u : x; }); badge(); return !!u; }, function () { return false; });
  }
  /* Status change. Only the timestamp of the stage being entered is set (earlier stages keep theirs); a job value edit on a lead that is
     already at that status touches no timestamp. Resolves "db", "local" or "fail". */
  function saveStatus(id, status, jobValue) {
    var cur = rows.filter(function (x) { return x.id === id; })[0] || {}, at = new Date().toISOString(), patch = {};
    if (cur.status !== status) { patch.status = status; patch.status_at = at; if (STAGE[status]) patch[STAGE[status]] = at; }
    if (jobValue != null) patch.job_value = jobValue;
    if (!Object.keys(patch).length) return Promise.resolve("db");
    function keep(p) {
      var o = ovAll(), prev = o[id] || {}; for (var k in p) prev[k] = p[k]; ovSet(id, prev);
      rows = mergeOv(rows.map(function (x) { if (x.id !== id) return x; var m = copy(x); delete m._local; return m; })); badge(); return "local";
    }
    return save(id, patch).then(function (ok) {
      if (ok) { var o = ovAll(); if (o[id]) { Object.keys(patch).forEach(function (k) { delete o[id][k]; }); ovSet(id, Object.keys(o[id]).length ? o[id] : null); } return "db"; }
      /* the live database may not have the new columns / statuses yet: save the plain status if it is one it already accepts */
      if (patch.status && !(patch.status in { shown: 1, signed: 1 })) {
        return save(id, { status: patch.status }).then(function (ok2) { return ok2 ? keep(patch) : "fail"; });
      }
      return keep(patch);
    });
  }
  function fmtTime(iso) { var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); }
  function phoneFmt(p) { var d = String(p || "").replace(/\D/g, ""); return d.length === 10 ? "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6) : (p || ""); }
  function money(n) { return "$" + Number(n).toLocaleString("en-US"); }
  function csv() {
    var head = ["Received", "Status", "Name", "Phone", "Email", "Best time", "Address", "Storms since 2020", "Biggest hail (in)", "Biggest hail date", "Message", "Notes", "Consent given at", "Consent text", "Job value"];
    var q = function (v) { v = String(v == null ? "" : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; /* spreadsheet formula guard: lead fields come from the public form */ return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = rows.map(function (r) {
      var h = r.hail_summary || {}, dnc = r.status === "do_not_contact";
      return [r.created_at, r.status, r.name, dnc ? "" : phoneFmt(r.phone), dnc ? "" : r.email, r.best_time, r.address, h.hits, h.biggest_in, h.biggest_date, r.message, r.notes, r.consent_at, r.consent_text, r.job_value].map(q).join(",");
    });
    var blob = new Blob(["﻿" + head.map(q).join(",") + "\r\n" + lines.join("\r\n")], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "homeowner-leads-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  function card(r) {
    var h = r.hail_summary || {}, dnc = r.status === "do_not_contact", hasHouse = r.region && r.home_idx != null;
    var hail = h.hits != null ? (h.hits ? h.hits + " hail storm" + (h.hits === 1 ? "" : "s") + " since 2020" + (h.biggest_in ? ", biggest " + Number(h.biggest_in).toFixed(2) + " in" : "") : "No hail of 0.75 in or more on radar") : "";
    var contact = dnc ? '<span class="ib-dnc">Do not contact. Phone and email hidden.</span>' :
      (r.phone ? '<a href="tel:' + esc(String(r.phone).replace(/\D/g, "")) + '">' + esc(phoneFmt(r.phone)) + "</a>" : "") + (r.email ? ' <a href="mailto:' + esc(r.email) + '">' + esc(r.email) + "</a>" : "");
    var asking = askJob === r.id;
    return '<article class="card ib-row' + (dnc ? " dnc" : "") + '" data-id="' + esc(r.id) + '">' +
      '<div class="ib-main"><div class="ib-top"><b>' + esc(r.name) + "</b>" + (r.status === "new" ? '<span class="ib-new">New</span>' : "") + '<span class="muted">' + esc(fmtTime(r.created_at)) + "</span></div>" +
      '<div class="ib-addr">' + (hasHouse ? '<button type="button" class="ib-link" data-act="map">' + esc(r.address || "Open house") + '</button> <button type="button" class="btn sm" data-act="roof">Roof</button>' : esc(r.address || "No address")) + "</div>" +
      '<div class="ib-meta">' + (hail ? esc(hail) : "") + (r.best_time ? " | Best time: " + esc(r.best_time) : "") + "</div>" +
      (r.message ? '<div class="ib-msg">' + esc(r.message) + "</div>" : "") +
      '<div class="ib-contact">' + contact + "</div></div>" +
      '<div class="ib-side"><label>Status<select data-act="status">' + STATUS.map(function (s) { return '<option value="' + s[0] + '"' + (r.status === s[0] ? " selected" : "") + ">" + s[1] + "</option>"; }).join("") + "</select></label>" +
      (NEXT[r.status] && !asking ? '<button type="button" class="btn sm accent" data-act="next" data-to="' + NEXT[r.status][0] + '">' + NEXT[r.status][1] + "</button>" : "") +
      (r.status === "signed" && !asking ? '<div class="ib-jv">' + (r.job_value != null ? "Job value " + money(r.job_value) : "No job value yet") + ' <button type="button" class="ib-link" data-act="editjob">' + (r.job_value != null ? "Edit" : "Add") + "</button></div>" : "") +
      (asking ? '<form class="ib-job" data-act="jobform"><label>Job value (dollars)<input type="number" inputmode="numeric" min="0" max="1000000" step="1" name="v" required placeholder="Signed contract amount"' + (r.job_value != null ? ' value="' + esc(r.job_value) + '"' : "") + '></label><div class="ib-jb"><button type="submit" class="btn sm primary">Save</button><button type="button" class="btn sm" data-act="jobskip">' + (r.status === "signed" ? "Cancel" : "Skip value") + "</button></div></form>" : "") +
      '<label>Notes<textarea data-act="notes" rows="2" maxlength="4000" placeholder="Notes for your team">' + esc(r.notes || "") + '</textarea></label><span class="ib-saved" aria-live="polite">' + (r._local ? DBLINE : "") + "</span></div></article>";
  }
  var CSS = ".ib-wrap{max-width:980px;display:flex;flex-direction:column;gap:12px;padding-bottom:30px}.ib-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ib-bar .grow{flex:1}.ib-row{display:flex;gap:18px;padding:14px 16px;flex-wrap:wrap}.ib-main{flex:1 1 360px;min-width:0}.ib-side{flex:0 1 260px;display:flex;flex-direction:column;gap:8px}.ib-side label{font-size:11.5px;color:var(--muted);display:flex;flex-direction:column;gap:3px}.ib-side select,.ib-side textarea,.ib-job input{font:inherit;font-size:13px;padding:7px 9px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--ink)}.ib-side .btn.sm{height:36px}.ib-jv{font-size:12.5px;color:var(--ink-2)}.ib-job{display:flex;flex-direction:column;gap:6px}.ib-jb{display:flex;gap:6px}.ib-top{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}.ib-top .muted{font-size:12px}.ib-new{background:var(--accent-soft);color:var(--accent-ink);border-radius:999px;padding:1px 8px;font-size:11.5px;font-weight:600}.ib-addr{margin-top:4px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ib-link{background:none;border:0;padding:0;font:inherit;font-weight:600;color:var(--accent-ink);text-decoration:underline;cursor:pointer;text-align:left}.ib-meta{font-size:12.5px;color:var(--muted);margin-top:4px}.ib-msg{margin-top:6px;font-size:13px}.ib-contact{margin-top:8px;font-size:13.5px;display:flex;gap:12px;flex-wrap:wrap}.ib-contact a{color:var(--ink)}.ib-dnc{color:var(--muted)}.ib-row.dnc{opacity:.75}.ib-saved{font-size:11.5px;color:var(--muted);min-height:14px}.ib-empty{padding:26px 20px;color:var(--muted)}.nbadge{margin-left:auto;background:var(--accent);color:#fff;border-radius:999px;min-width:18px;height:18px;padding:0 5px;font-size:11px;font-weight:600;display:inline-flex;align-items:center;justify-content:center}";
  function injectCss() { if (document.getElementById("ibCss")) return; var s = document.createElement("style"); s.id = "ibCss"; s.textContent = CSS; document.head.appendChild(s); }
  function render(el) {
    injectCss();
    el.innerHTML = '<div class="ib-wrap" id="ibWrap"></div>';
    var wrap = el.querySelector("#ibWrap");
    function draw() {
      var list = rows.filter(function (r) { return filter === "all" || r.status === filter; });
      wrap.innerHTML = '<div class="ib-bar">' + [["all", "All"]].concat(STATUS).map(function (s) { return '<button type="button" class="chip' + (filter === s[0] ? " on" : "") + '" data-f="' + s[0] + '">' + s[1] + (s[0] === "all" ? " (" + rows.length + ")" : s[0] === "new" ? " (" + newCount() + ")" : "") + "</button>"; }).join("") +
        '<span class="grow"></span><button type="button" class="btn sm" id="ibCsv"' + (rows.length ? "" : " disabled") + ">Export CSV</button></div>" +
        (list.length ? list.map(card).join("") : '<div class="card ib-empty">' + (rows.length ? "No leads with this status." : "No leads yet. When a homeowner submits the form on your hail check page it shows up here.") + "</div>");
    }
    function commit(id, status, jv, tag) {
      tag.textContent = "Saving...";
      saveStatus(id, status, jv).then(function (res) {
        if (res === "fail") { tag.textContent = "Could not save. Try again."; return; }
        askJob = null; pending = null; draw();
        var t2 = wrap.querySelector('.ib-row[data-id="' + id + '"] .ib-saved'); if (t2) t2.textContent = res === "local" ? DBLINE : "Saved";
      });
    }
    function setStatus(row, status) {
      var id = row.dataset.id;
      if (status === "signed") { askJob = id; pending = "signed"; draw(); var inp = wrap.querySelector(".ib-job input"); if (inp) inp.focus(); return; }
      askJob = null; pending = null; commit(id, status, null, row.querySelector(".ib-saved"));
    }
    wrap.addEventListener("click", function (e) {
      var f = e.target.closest("[data-f]"); if (f) { filter = f.dataset.f; draw(); return; }
      if (e.target.closest("#ibCsv")) { csv(); return; }
      var nx = e.target.closest("[data-act=next]"); if (nx) { setStatus(nx.closest(".ib-row"), nx.dataset.to); return; }
      if (e.target.closest("[data-act=editjob]")) { askJob = e.target.closest(".ib-row").dataset.id; pending = null; draw(); var i2 = wrap.querySelector(".ib-job input"); if (i2) i2.focus(); return; }
      if (e.target.closest("[data-act=jobskip]")) {
        var row = e.target.closest(".ib-row"), id = row.dataset.id, r0 = rows.filter(function (x) { return x.id === id; })[0];
        if (r0 && r0.status !== "signed" && pending === "signed") commit(id, "signed", null, row.querySelector(".ib-saved")); else { askJob = null; pending = null; draw(); }
        return;
      }
      var b = e.target.closest("[data-act=map],[data-act=roof]"); if (!b) return;
      var id2 = b.closest(".ib-row").dataset.id, r = rows.filter(function (x) { return x.id === id2; })[0];
      if (r && hooks.house) hooks.house(r.region, r.home_idx, b.dataset.act, r.address);
    });
    wrap.addEventListener("submit", function (e) {
      var f = e.target.closest("[data-act=jobform]"); if (!f) return; e.preventDefault();
      var row = f.closest(".ib-row"), v = Math.round(Number(f.elements.v.value));
      if (!isFinite(v) || v < 0 || v > 1000000) { row.querySelector(".ib-saved").textContent = "Enter a job value between 0 and 1,000,000."; return; }
      commit(row.dataset.id, "signed", v, row.querySelector(".ib-saved"));
    });
    wrap.addEventListener("change", function (e) {
      var row = e.target.closest(".ib-row"); if (!row) return;
      var kind = e.target.dataset.act;
      if (kind === "status") { setStatus(row, e.target.value); return; }
      if (kind !== "notes") return;
      var tag = row.querySelector(".ib-saved"); tag.textContent = "Saving...";
      save(row.dataset.id, { notes: e.target.value || null }).then(function (ok) { tag.textContent = ok ? "Saved" : "Could not save. Try again."; });
    });
    wrap.innerHTML = '<div class="card ib-empty">Loading leads...</div>';
    load().then(draw, function () { wrap.innerHTML = '<div class="card ib-empty">Could not load leads. Try again in a moment.</div>'; });
  }
  window.RCInbox = { signedIn: signedIn, load: load, render: render, newCount: newCount, badge: badge, hooks: hooks, rows: function () { return rows; } };
})();
