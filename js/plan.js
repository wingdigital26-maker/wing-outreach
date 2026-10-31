/* Plans, trial lock, county limits, billing panel, owner onboarding. Loads after auth.js (see docs/PLANS.md, docs/STRIPE.md).
   Active only with a signed-in company (RC_CONFIG.AUTH_REQUIRED) and not demo mode; otherwise every helper is a no-op and the app is unchanged.
   Limits are enforced for real in the database (db/migrations/006_plans.sql triggers); this file is the friendly front of them.
   Payment is not built: "Contact us to upgrade" is a mailto to RC_CONFIG.SALES_EMAIL (placeholder {SALES_EMAIL} until Jack sets it). */
(function () {
  var A = window.RC_AUTH, C = window.RC_CONFIG || {};
  if (!A) return;
  var PAGE_APP = !!document.querySelector("#nav") || /index\.html$|\/$/.test(location.pathname);
  var NAMES = { cleveland: "Cleveland County", mcclain: "McClain County", canadian: "Canadian County", payne: "Payne County", okcounty: "Oklahoma County", logan: "Logan County", pottawatomie: "Pottawatomie County" };
  var LIMITS = {
    trial: { label: "Free trial", price: "14 days free", seats: 5, counties: 3, check: true, permits: false },
    solo: { label: "Solo", price: "$99 / month", seats: 1, counties: 1, check: false, permits: false },
    team: { label: "Team", price: "$249 / month", seats: 5, counties: 3, check: true, permits: false },
    pro: { label: "Pro", price: "$449 / month", seats: 15, counties: 999, check: true, permits: true }
  };
  var manifest = [];
  function sales() { return C.SALES_EMAIL || "{SALES_EMAIL}"; }
  function mailto(sub) { return "mailto:" + sales() + "?subject=" + encodeURIComponent(sub || "Roof Command plan"); }
  function co() { return A.enabled && !A.demo && A.session() ? A.company() : null; }
  function daysLeft(c) { if (!c || !c.trial_ends_at) return null; return Math.ceil((new Date(c.trial_ends_at).getTime() - Date.now()) / 86400000); }
  function lockOf(c) {
    if (!c) return null;
    if (c.status === "canceled") return "canceled";
    if (c.plan === "trial" && c.trial_ends_at && new Date(c.trial_ends_at).getTime() < Date.now()) return "trial";
    return null;
  }
  // region ids this company may load. Pro with none picked = all; anything else with none picked falls back to Cleveland (the home county).
  function allowedIds(c) {
    if (!c) return null;
    var ids = (c.counties || []).filter(function (x) { return NAMES[x]; });
    if (c.plan === "pro" && !ids.length) return null; // all
    if (!ids.length) ids = ["cleveland"];
    var max = (LIMITS[c.plan] || LIMITS.trial).counties;
    return ids.slice(0, max);
  }
  function filterManifest(m) {
    manifest = m.slice();
    setTimeout(function () { var c0 = co(); if (c0 && typeof sideNote === 'function' && STATE) sideNote(c0); }, 0);
    var c = co(), ids = allowedIds(c);
    if (!c || !ids) return m;
    return m.filter(function (x) { return ids.indexOf(x.id) >= 0; });
  }
  function lockedRegions() { var c = co(), ids = allowedIds(c); return ids ? manifest.filter(function (x) { return ids.indexOf(x.id) < 0; }) : []; }
  window.RC_PLAN = { LIMITS: LIMITS, NAMES: NAMES, active: function () { return !!co(); }, filterManifest: filterManifest, lockedRegions: lockedRegions, allowedIds: function () { return allowedIds(co()); }, check: function (c) { c = c || co(); return !c || (LIMITS[c.plan] || LIMITS.trial).check; }, daysLeft: daysLeft, lock: function () { return lockOf(co()); }, mailto: mailto, sales: sales, manifest: function () { return manifest; } };

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === "text") e.textContent = attrs[k]; else if (k === "on") Object.keys(attrs.on).forEach(function (ev) { e.addEventListener(ev, attrs.on[ev]); }); else if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  window.RC_PLAN.h = h;

  // the company's own imported customers (matched rows only), shaped like data/customers.json entries; hail is filled per storm by the app
  window.RC_PLAN.loadCustomers = function (regionIds) {
    var c = co(); if (!c) return Promise.resolve(null);
    var all = [];
    function page(off) {
      return A.token().then(function (t) { return A.api("/rest/v1/company_customers?select=id,name,address,lat,lon,region,home_idx&company_id=eq." + c.company_id + "&matched=eq.true&order=id&limit=1000&offset=" + off, "GET", null, t); }).then(function (rows) {
        (rows || []).forEach(function (r) { if (regionIds.indexOf(r.region) >= 0) all.push({ id: "c" + r.id, name: r.name || "Customer", addr: r.address, lon: r.lon, lat: r.lat, rid: r.region, idx: r.home_idx, hail: {}, real: true }); });
        return rows && rows.length === 1000 ? page(off + 1000) : all;
      });
    }
    return page(0);
  };

  // ---------- billing panel (shared with admin.html). c: {plan,status,trial_ends_at,seats,counties}, used: member count
  window.RC_PLAN.billingEl = function (c, used) {
    var L = LIMITS[c.plan] || LIMITS.trial, d = daysLeft(c), n = (c.counties || []).length;
    var maxC = L.counties > 50 ? "all" : String(L.counties);
    var rows = [["Plan", L.label + (L.price ? " (" + L.price + ")" : "")], ["Status", c.status === "past_due" ? "Payment past due" : c.status === "canceled" ? "Canceled" : "Active"], ["Seats", (used == null ? "?" : used) + " of " + c.seats + " used"], ["Counties", (c.plan === "pro" && !n ? "All" : n) + " selected, plan includes " + maxC], ["Homeowner /check page", L.check ? "Included" : "Not on this plan"], ["Permit signals", L.permits ? "Included" : "Pro plan"]];
    if (c.plan === "trial") rows.splice(2, 0, ["Trial", d == null ? "No end date" : d > 0 ? d + " day" + (d === 1 ? "" : "s") + " left" : "Ended"]);
    var dl = h("dl", { class: "bill" });
    rows.forEach(function (r) { dl.appendChild(h("dt", { text: r[0] })); dl.appendChild(h("dd", { text: r[1] })); });
    return h("div", { class: "billpanel" }, [dl,
      h("p", { class: "bill-note", text: "Online payment is not set up yet. To change your plan, add seats or counties, or pay, contact us." }),
      h("a", { class: "btn primary sm", href: mailto("Upgrade my Roof Command plan"), "data-sales": "1", text: "Contact us to upgrade" })]);
  };

  if (!PAGE_APP) return; // everything below is the main app only
  var CK = "rc.company";

  var st = document.createElement("style");
  st.textContent = ".plan-note{margin:0 10px 10px;padding:10px 12px;border:1px solid var(--line,#D8D0C2);border-radius:12px;background:var(--surface-2,#faf7f1);font-size:12px;color:var(--muted,#7a7367);line-height:1.45}.plan-note b{color:var(--ink,#1c1a16);font-weight:600}.plan-note a{color:inherit;text-decoration:underline}" +
    ".lock-card{width:min(440px,100%);background:var(--surface,#fff);border-radius:16px;box-shadow:var(--shadow-sm,0 2px 12px rgba(0,0,0,.08));padding:28px 26px}.lock-card h1{font-size:21px;margin:0 0 8px}.lock-card p{margin:0 0 14px;color:var(--muted,#7a7367);font-size:14px;line-height:1.5}.lock-card .row{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px}.lock-card a.btn,.ob-body a.btn{text-decoration:none}" +
    ".ob-pill{position:fixed;right:18px;bottom:18px;z-index:850;border:1px solid var(--line,#D8D0C2);background:var(--surface,#fff);color:var(--ink,#1c1a16);border-radius:999px;min-height:44px;padding:0 16px;font:inherit;font-size:13px;font-weight:600;box-shadow:var(--shadow-sm,0 4px 16px rgba(0,0,0,.12));cursor:pointer}" +
    ".ob-panel{position:fixed;right:18px;bottom:18px;z-index:860;width:min(390px,calc(100vw - 24px));max-height:min(78vh,720px);overflow:auto;background:var(--surface,#fff);border:1px solid var(--line,#D8D0C2);border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.16);padding:16px 16px 12px}" +
    ".ob-panel h2{font-size:15px;margin:0 0 2px}.ob-panel .sub{font-size:12.5px;color:var(--muted,#7a7367);margin:0 0 10px}.ob-bar{height:5px;background:var(--line-2,#ece6da);border-radius:4px;overflow:hidden;margin-bottom:10px}.ob-bar i{display:block;height:100%;background:var(--accent,#2F5D50)}" +
    ".ob-step{border-top:1px solid var(--line-2,#ece6da);padding:8px 0}.ob-step>button.ob-h{all:unset;display:flex;align-items:center;gap:10px;width:100%;cursor:pointer;min-height:36px;font-size:13.5px;font-weight:600}.ob-step .ob-n{width:22px;height:22px;border-radius:50%;border:1.5px solid var(--line,#D8D0C2);display:grid;place-items:center;font-size:11px;flex:none}.ob-step.done .ob-n{background:var(--accent,#2F5D50);border-color:var(--accent,#2F5D50);color:#fff}.ob-step .ob-d{font-weight:400;font-size:12px;color:var(--muted,#7a7367);margin-left:auto}" +
    ".ob-body{padding:6px 0 4px 32px;font-size:12.5px}.ob-body label{display:block;font-size:11.5px;color:var(--muted,#7a7367);margin:8px 0 3px}.ob-body input[type=text],.ob-body input[type=email],.ob-body input[type=url]{width:100%;box-sizing:border-box;min-height:38px;padding:0 10px;border:1px solid var(--line,#D8D0C2);border-radius:9px;font:inherit;background:#fff}.ob-body .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center}.ob-msg{min-height:16px;margin-top:6px;font-size:12px;color:var(--muted,#7a7367)}.ob-msg.bad{color:#B3261E}.ob-chk{display:flex;gap:8px;align-items:center;min-height:30px;font-size:13px}.ob-chk input{width:18px;height:18px}" +
    ".ob-body table{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:6px}.ob-body td{padding:3px 4px;border-top:1px solid var(--line-2,#ece6da)}.ob-link{background:none;border:0;padding:6px 0;font:inherit;font-size:12px;color:var(--muted,#7a7367);text-decoration:underline;cursor:pointer}" +
    ".ob-body textarea{width:100%;box-sizing:border-box;min-height:96px;padding:8px 10px;border:1px solid var(--line,#D8D0C2);border-radius:9px;font:inherit;line-height:1.45;background:#fff;resize:vertical}.ob-body input[inputmode=numeric]{width:100%;box-sizing:border-box;min-height:38px;padding:0 10px;border:1px solid var(--line,#D8D0C2);border-radius:9px;font:inherit;background:#fff}" +
    "@media(max-width:820px){.ob-pill,.ob-panel{bottom:84px;right:12px}}";
  document.head.appendChild(st);

  // ---------- lock screen
  function lockScreen(kind) {
    if (document.getElementById("rcLock")) return;
    var w = h("div", { class: "auth-wall", id: "rcLock", role: "dialog", "aria-modal": "true", "aria-labelledby": "rcLockH" });
    var title = kind === "canceled" ? "This workspace is paused" : "Your free trial has ended";
    var body = kind === "canceled" ? "Your subscription is not active, so the workspace is paused. Nothing has been deleted. Contact us and we will get you going again." : "Thanks for trying Roof Command. Your settings, prices and customer list are saved and will be right here when you continue. Contact us to pick a plan.";
    var card = h("div", { class: "lock-card" }, [h("h1", { id: "rcLockH", text: title }), h("p", { text: body }),
      h("div", { class: "row" }, [h("a", { class: "btn primary", href: mailto("Continue my Roof Command trial"), id: "rcLockMail", text: "Contact us" }), h("button", { class: "btn", type: "button", id: "rcLockOut", text: "Sign out", on: { click: function () { A.logout(); } } })])]);
    w.appendChild(card); document.body.appendChild(w);
  }

  // ---------- sidebar note: trial days, counties on other plans
  function sideNote(c) {
    var old = document.getElementById("planNote"); if (old) old.remove();
    var foot = document.querySelector(".side-tools") || document.querySelector(".side-foot"); if (!foot) return;
    var lines = [], d = daysLeft(c), lr = lockedRegions();
    if (c.plan === "trial" && d != null && d > 0) lines.push(h("div", {}, [h("b", { text: "Free trial: " + d + " day" + (d === 1 ? "" : "s") + " left." })]));
    if (c.status === "past_due") lines.push(h("div", {}, [h("b", { text: "Payment is past due." }), " Contact us to keep your plan."]));
    if (lr.length) lines.push(h("div", { id: "planLocked", style: lines.length ? "margin-top:6px" : "" }, ["Upgrade to see " + lr.map(function (x) { return x.name.replace(/ County$/, ""); }).join(", ") + (lr.length === 1 ? " county" : " counties") + ". "]));
    if (!lines.length) return;
    var n = h("div", { class: "plan-note", id: "planNote" }, lines);
    n.appendChild(h("div", { style: "margin-top:6px" }, [h("a", { href: "admin.html#billing", text: "Plan and billing" }), " · ", h("a", { href: mailto("Upgrade my Roof Command plan"), text: "Contact us" })]));
    foot.parentNode.insertBefore(n, foot);
  }

  // ---------- onboarding (owners)
  var STATE = { c: null, ob: {}, owner: false, open: false, members: null };
  var STEPS = [["brand", "Confirm your brand"], ["compliance", "Registration and notice"], ["prices", "Set your prices"], ["counties", "Pick your service area"], ["customers", "Import past customers"], ["team", "Invite your team"]];
  function cid() { return STATE.c && STATE.c.company_id; }
  function isDone(k) {
    var ob = STATE.ob || {};
    if (k === "compliance") { var cp = window.RC_COMPLY && window.RC_COMPLY.read(); return !!(cp && /^[0-9]{1,12}$/.test(String(cp.cib || ""))); }
    if (k === "prices") return !!ob.prices || !!(STATE.c && STATE.c.prices && STATE.c.prices.vals && Object.keys(STATE.c.prices.vals).length);
    if (k === "team") return !!ob.team || (STATE.members != null && STATE.members > 1);
    return !!ob[k];
  }
  function cacheMerge(patch) { try { var c = JSON.parse(localStorage.getItem(CK) || "null"); if (c) { Object.assign(c, patch); localStorage.setItem(CK, JSON.stringify(c)); } } catch (e) { } Object.assign(STATE.c, patch); }
  function saveOb(patch) {
    STATE.ob = Object.assign({}, STATE.ob, patch);
    return A.token().then(function (t) { return A.api("/rest/v1/company_settings?company_id=eq." + cid(), "PATCH", { onboarding: STATE.ob, updated_at: new Date().toISOString() }, t); }).then(function () { cacheMerge({ onboarding: STATE.ob }); }, function () { });
  }
  function patchSettings(p) {
    p.updated_at = new Date().toISOString();
    return A.token().then(function (t) { return A.api("/rest/v1/company_settings?company_id=eq." + cid(), "PATCH", p, t); }).then(function (rows) { if (!rows || !rows[0]) throw new Error("Could not save. Only owners can change this."); return rows[0]; });
  }
  function msgEl() { return h("div", { class: "ob-msg", "aria-live": "polite" }); }
  function say(n, m, bad) { n.textContent = m; n.className = "ob-msg" + (bad ? " bad" : ""); }
  function reopenAfterReload() { try { sessionStorage.setItem("rc.ob.open", "1"); } catch (e) { } location.reload(); }

  function logoSigned(c) {
    if (!c.logo_path || /^https:\/\//.test(c.logo_url || "")) return;
    A.token().then(function (t) { return A.api("/storage/v1/object/sign/company-assets/" + c.logo_path, "POST", { expiresIn: 43200 }, t); }).then(function (r) {
      if (!r || !r.signedURL) return; var B = window.BRAND; if (!B) return;
      B.logoUrl = C.SUPABASE_URL + "/storage/v1" + r.signedURL; if (window.RC_applyBrand) window.RC_applyBrand();
    }, function () { });
  }

  function stepBrand(body) {
    var c = STATE.c, B = window.BRAND || {}, m = msgEl();
    var name = h("input", { type: "text", id: "obName", value: c.brand_name || c.name || "", maxlength: "120" });
    var phone = h("input", { type: "text", id: "obPhone", value: c.phone || "", maxlength: "40" });
    var accent = h("input", { type: "text", id: "obAccent", value: c.accent || B.accent || "", placeholder: "#2F5D50", maxlength: "7" });
    var file = h("input", { type: "file", id: "obLogoFile", accept: "image/png,image/jpeg,image/webp" });
    var url = h("input", { type: "url", id: "obLogoUrl", value: /^https:\/\//.test(c.logo_url || "") ? c.logo_url : "", placeholder: "https://..." });
    body.appendChild(h("label", { for: "obName", text: "Company name" })); body.appendChild(name);
    body.appendChild(h("label", { for: "obPhone", text: "Phone" })); body.appendChild(phone);
    body.appendChild(h("label", { for: "obAccent", text: "Accent colour (hex)" })); body.appendChild(accent);
    body.appendChild(h("label", { for: "obLogoFile", text: "Logo: upload (PNG, JPG or WebP, up to 1 MB, stored privately)" })); body.appendChild(file);
    body.appendChild(h("label", { for: "obLogoUrl", text: "or a link to your logo (https)" })); body.appendChild(url);
    body.appendChild(h("div", { class: "row" }, [h("button", { class: "btn primary sm", type: "button", id: "obBrandSave", text: "Save brand", on: { click: function () {
      var a = accent.value.trim(); if (a && !/^#[0-9a-fA-F]{6}$/.test(a)) return say(m, "Accent must look like #2F5D50.", true);
      var f = file.files && file.files[0], u = url.value.trim();
      if (u && !/^https:\/\//.test(u)) return say(m, "The logo link must start with https://", true);
      if (f && (f.size > 1048576 || !/^image\/(png|jpeg|webp)$/.test(f.type))) return say(m, "Logo must be PNG, JPG or WebP, 1 MB or smaller.", true);
      say(m, "Saving...");
      var p = { brand_name: name.value.trim() || null, phone: phone.value.trim() || null, accent: a || null }, up = Promise.resolve();
      if (f) {
        var ext = f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg", path = cid() + "/logo." + ext;
        up = A.token().then(function (t) { return fetch(C.SUPABASE_URL + "/storage/v1/object/company-assets/" + path, { method: "POST", headers: { apikey: C.SUPABASE_ANON_KEY, Authorization: "Bearer " + t, "Content-Type": f.type, "x-upsert": "true" }, body: f }); })
          .then(function (r) { if (!r.ok) throw new Error("Logo upload failed."); p.logo_path = path; p.logo_url = null; });
      } else if (u) { p.logo_url = u; p.logo_path = null; }
      up.then(function () { return patchSettings(p); }).then(function (row) {
        cacheMerge({ brand_name: row.brand_name, phone: row.phone, accent: row.accent, logo_url: row.logo_url, logo_path: row.logo_path });
        var Bn = window.BRAND; if (Bn && A.applyBrand) { A.applyBrand(Bn); } if (window.RC_applyBrand) window.RC_applyBrand();
        logoSigned(STATE.c); say(m, "Saved."); return saveOb({ brand: true }).then(function () { draw(); });
      }, function (e) { say(m, e.message || "Could not save.", true); });
    } } })]));
    body.appendChild(m);
  }

  // ---------- Oklahoma registration number + deductible notice (59 O.S. 1151.17(C), 1151.30). Columns come from db/migrations/008_gtm.sql.
  // Until that migration is applied the PATCH fails, so the values stay in localStorage (flagged pending) and are pushed on the next sign-in once the columns exist.
  var COMPLY_NOTE = "";
  var NOT_OWNER = "Could not save. Only owners can change this.";
  function syncCompliance(c) {
    var K = window.RC_COMPLY; if (!K || !c) return;
    A.token().then(function (t) { return A.api("/rest/v1/company_settings?select=cib_number,deductible_notice&company_id=eq." + c.company_id, "GET", null, t); }).then(function (rows) {
      var r = rows && rows[0]; if (!r) return;
      var loc = K.read();
      if (r.cib_number || r.deductible_notice) K.save({ cib: r.cib_number || "", notice: r.deductible_notice || "", pending: false });
      else if (loc.pending && loc.cib) patchSettings({ cib_number: loc.cib, deductible_notice: loc.notice || null }).then(function () { K.save({ pending: false }); }, function () { });
    }, function () { }); // column not there yet: keep the device copy
  }
  function stepCompliance(body) {
    var K = window.RC_COMPLY, cur = K.read(), m = msgEl();
    body.appendChild(h("div", { text: "Oklahoma requires your Construction Industries Board roofing registration number on every proposal, and a written deductible notice with your estimate. Both print on every proposal automatically." }));
    var num = h("input", { type: "text", id: "obCib", inputmode: "numeric", maxlength: "12", autocomplete: "off", value: cur.cib || "", placeholder: "Digits only" });
    var note = h("textarea", { id: "obNotice", maxlength: "2000", rows: "5" }); note.value = cur.notice || K.DEFAULT_NOTICE;
    body.appendChild(h("label", { for: "obCib", text: "Registration number (digits only)" })); body.appendChild(num);
    body.appendChild(h("label", { for: "obNotice", text: "Deductible notice printed on every proposal" })); body.appendChild(note);
    body.appendChild(h("div", { class: "ob-msg", text: "The default wording is a draft. Have your attorney review it before you rely on it." }));
    body.appendChild(h("div", { class: "row" }, [h("button", { class: "btn primary sm", type: "button", id: "obCibSave", text: "Save registration", on: { click: function () {
      var v = num.value.trim(), n = note.value.trim() || K.DEFAULT_NOTICE;
      if (!/^[0-9]{1,12}$/.test(v)) return say(m, "Use digits only, 1 to 12 of them.", true);
      say(m, "Saving...");
      patchSettings({ cib_number: v, deductible_notice: n === K.DEFAULT_NOTICE ? null : n }).then(function () { K.save({ cib: v, notice: n === K.DEFAULT_NOTICE ? "" : n, pending: false }); say(m, "Saved."); return saveOb({ compliance: true }).then(function () { draw(); }); }, function (e) {
        if (e && e.message === NOT_OWNER) return say(m, e.message, true);
        K.save({ cib: v, notice: n === K.DEFAULT_NOTICE ? "" : n, pending: true }); COMPLY_NOTE = "Saved on this device until the database update is applied."; draw();
      });
    } } }), h("button", { class: "ob-link", type: "button", id: "obNoticeReset", text: "Use the default notice", on: { click: function () { note.value = K.DEFAULT_NOTICE; } } })]));
    if (COMPLY_NOTE) { say(m, COMPLY_NOTE); COMPLY_NOTE = ""; }
    body.appendChild(m);
  }
  window.RC_PLAN.canEditCompliance = function () { return !!STATE.owner; };
  window.RC_PLAN.openCompliance = function () { if (!STATE.owner) return false; STATE.open = true; OPEN_STEP = "compliance"; draw(); return true; };

  function stepPrices(body) {
    var m = msgEl();
    body.appendChild(h("div", { text: "Your own material and labour prices feed every proposal. Change anything, then press Done." }));
    var host = h("div", { class: "pp-host", id: "obPricesHost" }); body.appendChild(host);
    if (window.RoofPrices && window.RoofPrices.panel) { try { window.RoofPrices.panel(host, function () { }); } catch (e) { say(m, "Prices could not open.", true); } } else say(m, "Prices are still loading. Close and reopen this step.", true);
    body.appendChild(h("div", { class: "row" }, [h("button", { class: "btn primary sm", type: "button", text: "Done with prices", on: { click: function () { saveOb({ prices: true }).then(draw); } } })]));
    body.appendChild(m);
  }

  function stepCounties(body) {
    var c = STATE.c, L = LIMITS[c.plan] || LIMITS.trial, max = L.counties, m = msgEl();
    var cur = (allowedIds(c) || manifest.map(function (x) { return x.id; }));
    var list = manifest.length ? manifest : Object.keys(NAMES).map(function (k) { return { id: k, name: NAMES[k] }; });
    body.appendChild(h("div", { text: "Your plan (" + L.label + ") includes " + (max > 50 ? "every county" : max + " count" + (max === 1 ? "y" : "ies")) + "." }));
    var boxes = [];
    list.forEach(function (r) {
      var cb = h("input", { type: "checkbox", id: "obC_" + r.id, value: r.id }); if (cur.indexOf(r.id) >= 0) cb.checked = true;
      cb.addEventListener("change", function () { var n = boxes.filter(function (b) { return b.checked; }).length; if (n > max) { cb.checked = false; say(m, "Your plan includes " + max + " count" + (max === 1 ? "y" : "ies") + ". Upgrade to add more.", true); } else say(m, ""); });
      boxes.push(cb); body.appendChild(h("label", { class: "ob-chk", for: "obC_" + r.id }, [cb, r.name]));
    });
    body.appendChild(h("div", { class: "row" }, [h("button", { class: "btn primary sm", type: "button", id: "obCountySave", text: "Save service area", on: { click: function () {
      var ids = boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; });
      if (!ids.length) return say(m, "Pick at least one county.", true);
      say(m, "Saving...");
      A.admin("set_counties", { company_id: cid(), counties: ids }).then(function () { return saveOb({ counties: true }); }).then(function () { say(m, "Saved. Reloading..."); reopenAfterReload(); }, function (e) { say(m, e.message, true); });
    } } }), h("a", { class: "ob-link", href: mailto("More counties on my Roof Command plan"), text: "Need more counties? Contact us" })]));
    body.appendChild(m);
  }

  // ---- CSV
  function parseCSV(text) {
    var rows = [], row = [], cur = "", q = false, i, ch;
    for (i = 0; i < text.length; i++) {
      ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some(function (x) { return x.trim() !== ""; })) rows.push(row); row = []; }
      else cur += ch;
    }
    row.push(cur); if (row.some(function (x) { return x.trim() !== ""; })) rows.push(row);
    return rows;
  }
  function toRecords(rows) {
    if (!rows.length) return [];
    var head = rows[0].map(function (x) { return x.trim().toLowerCase(); }), idx = { addr: -1, city: -1, zip: -1, name: -1, lat: -1, lon: -1 }, hasHead = false;
    head.forEach(function (hd, i) {
      if (/^(address|street|street address|addr|property address|site address)$/.test(hd)) { idx.addr = i; hasHead = true; }
      else if (/^(city|town)$/.test(hd)) idx.city = i; else if (/^(zip|zip code|zipcode|postal|postal code)$/.test(hd)) idx.zip = i;
      else if (/^(name|customer|customer name|full name)$/.test(hd)) idx.name = i; else if (/^(lat|latitude)$/.test(hd)) idx.lat = i; else if (/^(lon|lng|long|longitude)$/.test(hd)) idx.lon = i;
    });
    var body = rows;
    if (hasHead) body = rows.slice(1); else idx = { addr: 0, city: 1, zip: 2, name: 3, lat: -1, lon: -1 };
    var g = function (r, k) { return idx[k] >= 0 && r[idx[k]] != null ? String(r[idx[k]]).trim() : ""; };
    return body.map(function (r) { return { addr: g(r, "addr"), city: g(r, "city"), zip: g(r, "zip"), name: g(r, "name"), lat: parseFloat(g(r, "lat")), lon: parseFloat(g(r, "lon")) }; }).filter(function (r) { return r.addr; });
  }

  function stepCustomers(body) {
    var c = STATE.c, m = msgEl(), file = h("input", { type: "file", id: "obCsv", accept: ".csv,text/csv" }), out = h("div", { id: "obCsvOut" });
    var stat = (STATE.ob || {}).customers_stat;
    body.appendChild(h("div", { text: "Upload a CSV with a header row: address, city, zip, name (name is optional). Homes are matched to the county record by address. Your list is private to your company and never shared." }));
    if (stat) body.appendChild(h("div", { id: "obCsvPrev", style: "margin-top:6px", text: "Saved list: " + stat.matched + " of " + stat.total + " matched to homes (" + Math.round(100 * stat.matched / Math.max(1, stat.total)) + "%)." }));
    body.appendChild(h("label", { for: "obCsv", text: "CSV file (up to 20,000 rows)" })); body.appendChild(file); body.appendChild(out); body.appendChild(m);
    var pending = null;
    file.addEventListener("change", function () {
      var f = file.files && file.files[0]; out.innerHTML = ""; pending = null; if (!f) return;
      if (f.size > 5 * 1048576) return say(m, "That file is over 5 MB.", true);
      if (!window.RC_APP || !window.RC_APP.matchAddresses) return say(m, "The map data is still loading. Try again in a moment.", true);
      say(m, "Reading and matching...");
      f.text().then(function (t) {
        var recs = toRecords(parseCSV(t)); if (!recs.length) throw new Error("No addresses found. The first row needs a header like: address, city, zip, name.");
        if (recs.length > 20000) throw new Error("Over 20,000 rows. Split the file.");
        return window.RC_APP.matchAddresses(recs).then(function (res) {
          var ok = res.filter(Boolean).length, pct = Math.round(100 * ok / recs.length);
          pending = { recs: recs, res: res, ok: ok };
          out.appendChild(h("div", { id: "obMatchRate", style: "margin-top:8px;font-weight:600", text: "Matched " + ok + " of " + recs.length + " (" + pct + "%)" }));
          var miss = recs.filter(function (r, i) { return !res[i]; }).slice(0, 5);
          if (miss.length) { var tb = h("table"); miss.forEach(function (r) { tb.appendChild(h("tr", {}, [h("td", { text: r.addr }), h("td", { text: "no match" })])); }); out.appendChild(h("div", { class: "ob-msg", text: "First unmatched rows (counties outside your plan, new builds and PO boxes will not match):" })); out.appendChild(tb); }
          out.appendChild(h("div", { class: "row" }, [h("button", { class: "btn primary sm", type: "button", id: "obCsvSave", text: "Save " + recs.length + " customers", on: { click: save } })]));
          say(m, "");
        });
      }).catch(function (e) { say(m, e.message || "Could not read that file.", true); });
    });
    function save() {
      if (!pending) return; say(m, "Saving...");
      var rows = pending.recs.map(function (r, i) { var x = pending.res[i]; return { company_id: cid(), name: r.name || null, address: r.addr.slice(0, 300), city: r.city ? r.city.slice(0, 80) : null, zip: r.zip ? r.zip.slice(0, 12) : null, region: x ? x.region : null, home_idx: x ? x.idx : null, lat: x ? x.lat : null, lon: x ? x.lon : null, matched: !!x }; });
      A.token().then(function (t) {
        return A.api("/rest/v1/company_customers?company_id=eq." + cid(), "DELETE", null, t).then(function () {
          var p = Promise.resolve();
          for (var i = 0; i < rows.length; i += 500) (function (chunk) { p = p.then(function () { return A.api("/rest/v1/company_customers", "POST", chunk, t); }); })(rows.slice(i, i + 500));
          return p;
        });
      }).then(function () { return saveOb({ customers: true, customers_stat: { total: rows.length, matched: pending.ok } }); }).then(function () { say(m, "Saved. Reloading..."); reopenAfterReload(); }, function (e) { say(m, e.message || "Could not save.", true); });
    }
    if (stat) body.appendChild(h("div", { class: "row" }, [h("button", { class: "btn sm", type: "button", id: "obCsvClear", text: "Remove imported customers", on: { click: function () {
      if (!confirm("Remove your imported customers? The app goes back to the sample list.")) return;
      A.token().then(function (t) { return A.api("/rest/v1/company_customers?company_id=eq." + cid(), "DELETE", null, t); }).then(function () { return saveOb({ customers: false, customers_stat: null }); }).then(function () { reopenAfterReload(); }, function (e) { say(m, e.message, true); });
    } } })]));
  }

  function stepTeam(body) {
    var c = STATE.c, m = msgEl(), box = h("div"), em = h("input", { type: "email", id: "obInvEm", placeholder: "name@company.com" });
    body.appendChild(h("div", { id: "obSeats", text: "Seats: " + (STATE.members == null ? "?" : STATE.members) + " of " + c.seats + " used on the " + (LIMITS[c.plan] || LIMITS.trial).label + " plan." }));
    body.appendChild(h("label", { for: "obInvEm", text: "Teammate email" })); body.appendChild(em);
    body.appendChild(h("div", { class: "row" }, [h("button", { class: "btn primary sm", type: "button", id: "obInvGo", text: "Create invite link", on: { click: function () {
      say(m, "Creating..."); box.innerHTML = "";
      A.admin("invite", { company_id: cid(), email: em.value.trim(), role: "member", redirect_to: new URL("reset.html", location.href).href }).then(function (r) {
        say(m, (r.message || "Invite saved.") + " No email was sent.");
        if (r.link) { var li = h("input", { type: "text", readonly: "", value: r.link, "aria-label": "Invite link" }); box.appendChild(li); }
        if (!r.already_member) STATE.members = (STATE.members || 0) + (r.link || /Account created/.test(r.message || "") ? 1 : 0);
        return saveOb({ team: true });
      }, function (e) { say(m, e.message, true); });
    } } }), h("a", { class: "ob-link", href: "admin.html", text: "Manage team" })]));
    body.appendChild(box); body.appendChild(m);
  }

  var OPEN_STEP = null;
  function draw() {
    var pill = document.getElementById("obPill"), panel = document.getElementById("obPanel");
    if (pill) pill.remove(); if (panel) panel.remove();
    if (!STATE.owner || !STATE.c || (STATE.ob || {}).dismissed && !STATE.open) return;
    var done = STEPS.filter(function (s) { return isDone(s[0]); }).length;
    if (done === STEPS.length && !STATE.open) return;
    if (!STATE.open) {
      document.body.appendChild(h("button", { class: "ob-pill", id: "obPill", type: "button", text: "Setup " + done + " of " + STEPS.length, on: { click: function () { STATE.open = true; draw(); } } }));
      return;
    }
    var p = h("section", { class: "ob-panel", id: "obPanel", "aria-label": "Setup checklist" });
    p.appendChild(h("h2", { text: "Set up your workspace" }));
    p.appendChild(h("p", { class: "sub", text: done + " of " + STEPS.length + " done. Take your time, everything saves as you go." }));
    p.appendChild(h("div", { class: "ob-bar" }, [h("i", { style: "width:" + Math.round(100 * done / STEPS.length) + "%" })]));
    STEPS.forEach(function (s, i) {
      var d = isDone(s[0]), open = OPEN_STEP === s[0];
      var step = h("div", { class: "ob-step" + (d ? " done" : ""), "data-step": s[0] });
      step.appendChild(h("button", { class: "ob-h", type: "button", "aria-expanded": String(open), on: { click: function () { OPEN_STEP = open ? null : s[0]; draw(); } } }, [h("span", { class: "ob-n", text: d ? "✓" : String(i + 1) }), s[1], h("span", { class: "ob-d", text: d ? "Done" : "" })]));
      if (open) { var b = h("div", { class: "ob-body" }); step.appendChild(b); ({ brand: stepBrand, compliance: stepCompliance, prices: stepPrices, counties: stepCounties, customers: stepCustomers, team: stepTeam })[s[0]](b); }
      p.appendChild(step);
    });
    p.appendChild(h("div", { class: "row", style: "display:flex;gap:12px;margin-top:8px" }, [
      h("button", { class: "ob-link", type: "button", id: "obClose", text: "Close", on: { click: function () { STATE.open = false; draw(); } } }),
      h("button", { class: "ob-link", type: "button", id: "obDismiss", text: "Hide setup for good", on: { click: function () { STATE.open = false; saveOb({ dismissed: true }).then(draw); } } })]));
    document.body.appendChild(p);
  }

  function initOnboarding(c) {
    STATE.c = c; STATE.ob = c.onboarding || {};
    A.admin("me").then(function (me) {
      STATE.owner = !!(me && (me.companies || []).some(function (x) { return x.company_id === c.company_id && x.role === "owner"; }));
      if (!STATE.owner) return;
      return A.admin("list_members", { company_id: c.company_id }).then(function (r) { STATE.members = (r.members || []).length; }, function () { }).then(function () {
        var tools = document.querySelector(".side-tools");
        if (tools && !document.getElementById("rcSetupBtn")) { var b = h("button", { type: "button", id: "rcSetupBtn", text: "Setup", on: { click: function () { STATE.open = true; draw(); } } }); tools.insertBefore(b, tools.firstChild); }
        try { if (sessionStorage.getItem("rc.ob.open") === "1") { sessionStorage.removeItem("rc.ob.open"); STATE.open = true; } } catch (e) { }
        if (!STATE.open && !(STATE.ob || {}).seen && !(STATE.ob || {}).dismissed && !STEPS.some(function (s) { return isDone(s[0]); })) { STATE.open = true; saveOb({ seen: true }); } // first login: open once
        draw();
      });
    }, function () { });
  }

  var changedReload = false;
  function onCompany(c) {
    if (!c || A.demo) return;
    var lk = lockOf(c); if (lk) { lockScreen(lk); return; }
    if (!lk && window.RC_LOCKED && !changedReload) { changedReload = true; location.reload(); return; } // was paused, now active again
    // the app loaded regions from the cached company: if the server says the county set changed, reload once
    var loaded = (window.__rcPlanLoaded || "") , now = (allowedIds(c) || ["*"]).join(",");
    if (loaded && loaded !== now && !changedReload) { changedReload = true; location.reload(); return; }
    sideNote(c); logoSigned(c); syncCompliance(c); initOnboarding(c);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var c = co(); if (!c) return;
    window.__rcPlanLoaded = (allowedIds(c) || ["*"]).join(",");
    var lk = lockOf(c); if (lk) lockScreen(lk);
    sideNote(c);
  });
  A.on(function (c) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { onCompany(c); }); else onCompany(c); });
})();
