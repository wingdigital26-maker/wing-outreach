/* Admin page: operators manage every company, owners manage their own. Talks only to the "admin" Edge Function (js/auth.js adminCall).
   Invites never send email: operators get a set-password link for brand-new accounts to hand over; owners never do. Existing accounts accept the invite after they sign in. */
(function () {
  var A = window.RC_AUTH, root = document.getElementById("adm");
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === "text") e.textContent = attrs[k]; else if (k === "on") Object.keys(attrs.on).forEach(function (ev) { e.addEventListener(ev, attrs.on[ev]); }); else if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function field(label, id, val, type, ph) { var i = h("input", { id: id, type: type || "text", value: val == null ? "" : val, placeholder: ph || "" }); return h("div", {}, [h("label", { for: id, text: label }), i]); }
  function note() { return h("div", { class: "note", "aria-live": "polite" }); }
  function say(n, m, bad) { n.textContent = m; n.className = "note" + (bad ? " bad" : ""); }
  function val(scope, id) { return scope.querySelector("#" + id).value; }

  function loginView() {
    root.innerHTML = "";
    var n = note();
    var f = h("form", { class: "auth-card", novalidate: "" }, [h("h1", { text: "Admin sign in" }), h("p", { text: "Operators and company owners only." }),
      h("label", { for: "aEm", text: "Email" }), h("input", { id: "aEm", type: "email", autocomplete: "username" }),
      h("label", { for: "aPw", text: "Password" }), h("input", { id: "aPw", type: "password", autocomplete: "current-password" }),
      h("button", { class: "btn primary", type: "submit", text: "Sign in" }), n]);
    f.style.margin = "60px auto";
    f.onsubmit = function (e) { e.preventDefault(); say(n, "Signing in..."); A.login(val(f, "aEm").trim(), val(f, "aPw")).then(start, function () { say(n, "Email or password is not right.", true); }); };
    root.appendChild(f);
  }

  function top(sub) {
    return h("div", { class: "adm-top" }, [h("h1", { text: "Admin" }), h("span", { class: "chip", text: sub }), h("span", { class: "sp" }),
      h("a", { class: "btn sm", href: "index.html", text: "Back to app" }), h("button", { class: "btn sm", type: "button", text: "Sign out", on: { click: function () { A.logout(); } } })]);
  }

  // Plan and billing: owners see plan, seats, trial days and a Contact us link (payment is not built, see docs/STRIPE.md); operators can also edit plan, status, trial end, seats and counties.
  function planSection(c, operator, reload, p) {
    var P = window.RC_PLAN, wrap = h("div", { class: "plan-sec", id: "billing-" + (c.slug || c.id.slice(0, 6)) }), pn = note();
    wrap.appendChild(h("h4", { text: "Plan and billing" }));
    wrap.appendChild(P.billingEl({ plan: c.plan, status: c.status, trial_ends_at: c.trial_ends_at, seats: c.seats, counties: c.counties || [] }, (c.memberships || []).length));
    if (!operator) return wrap;
    var plan = h("select", { id: p + "plan" }), status = h("select", { id: p + "status" }), seats = h("input", { id: p + "seats", type: "number", min: "1", max: "200", value: c.seats });
    ["trial", "solo", "team", "pro"].forEach(function (k) { var o = h("option", { value: k, text: P.LIMITS[k].label }); if (k === c.plan) o.selected = true; plan.appendChild(o); });
    ["active", "past_due", "canceled"].forEach(function (k) { var o = h("option", { value: k, text: k.replace("_", " ") }); if (k === c.status) o.selected = true; status.appendChild(o); });
    var trial = h("input", { id: p + "trial", type: "date", value: c.trial_ends_at ? String(c.trial_ends_at).slice(0, 10) : "" });
    plan.addEventListener("change", function () { seats.value = P.LIMITS[plan.value].seats; });
    wrap.appendChild(h("h4", { text: "Operator: set plan" }));
    wrap.appendChild(h("div", { class: "grid" }, [h("div", {}, [h("label", { for: p + "plan", text: "Plan" }), plan]), h("div", {}, [h("label", { for: p + "status", text: "Status" }), status]), h("div", {}, [h("label", { for: p + "trial", text: "Trial ends (blank = none)" }), trial]), h("div", {}, [h("label", { for: p + "seats", text: "Seats" }), seats])]));
    var cbs = [], row = h("div", { class: "row", style: "gap:14px" });
    Object.keys(P.NAMES).forEach(function (k) { var cb = h("input", { type: "checkbox", id: p + "c_" + k, value: k, style: "width:auto;min-height:0" }); if ((c.counties || []).indexOf(k) >= 0) cb.checked = true; cbs.push(cb); row.appendChild(h("label", { for: p + "c_" + k, style: "display:flex;gap:6px;align-items:center;margin:0" }, [cb, P.NAMES[k]])); });
    wrap.appendChild(h("label", { text: "Counties (Pro with none ticked = all)", style: "margin-top:10px" })); wrap.appendChild(row);
    wrap.appendChild(h("div", { class: "row" }, [h("button", { class: "btn primary sm", type: "button", "data-saveplan": c.slug || "", text: "Save plan", on: { click: function () {
      say(pn, "Saving...");
      A.admin("set_plan", { company_id: c.id, plan: plan.value, status: status.value, seats: Number(seats.value), trial_ends_at: trial.value ? new Date(trial.value + "T23:59:59Z").toISOString() : null, counties: cbs.filter(function (x) { return x.checked; }).map(function (x) { return x.value; }) }).then(function () { reload("Plan saved for " + c.name + "."); }, function (e) { say(pn, e.message, true); });
    } } })]));
    wrap.appendChild(pn);
    return wrap;
  }

  function companyCard(c, operator, reload) {
    var s = (Array.isArray(c.company_settings) ? c.company_settings[0] : c.company_settings) || {};
    var card = h("section", { class: "card", "data-slug": c.slug || "" });
    var head = h("div", { class: "card-h" }, [h("h3", { text: c.name }), h("span", { class: "slug", text: c.slug || "" })]);
    var b = h("div", { class: "card-b" });
    card.appendChild(head); card.appendChild(b);
    var sn = note();
    var p = "s" + c.id.slice(0, 6) + "_";
    var grid = h("div", { class: "grid" }, [field("Brand name", p + "brand", s.brand_name), field("Phone", p + "phone", s.phone), field("City", p + "city", s.city), field("Accent colour", p + "accent", s.accent, "text", "#2F5D50"), field("Average ticket ($)", p + "avg", s.avg_ticket, "number"), field("Price per square ($)", p + "psq", s.price_per_square, "number")]);
    var pr = h("textarea", { id: p + "prices", spellcheck: "false" }); pr.value = JSON.stringify(s.prices || {}, null, 1);
    b.appendChild(h("h4", { text: "Settings" })); b.appendChild(grid);
    b.appendChild(h("div", { style: "margin-top:10px" }, [h("label", { for: p + "prices", text: "Prices (JSON: vals, markup, tax)" }), pr]));
    b.appendChild(h("div", { class: "row" }, [h("button", { class: "btn primary sm", type: "button", text: "Save settings", on: { click: function () {
      var pj; try { pj = JSON.parse(pr.value || "{}"); } catch (e) { return say(sn, "Prices must be valid JSON.", true); }
      say(sn, "Saving...");
      A.admin("update_settings", { company_id: c.id, settings: { brand_name: val(b, p + "brand"), phone: val(b, p + "phone"), city: val(b, p + "city"), accent: val(b, p + "accent"), avg_ticket: val(b, p + "avg"), price_per_square: val(b, p + "psq"), prices: pj } }).then(function () { say(sn, "Saved."); }, function (e) { say(sn, e.message, true); });
    } } })]));
    b.appendChild(sn);

    b.appendChild(planSection(c, operator, reload, p));

    b.appendChild(h("h4", { text: "Members" }));
    var mt = h("table"), mn = note();
    b.appendChild(mt);
    function members() {
      A.admin("list_members", { company_id: c.id }).then(function (r) {
        mt.innerHTML = "";
        (r.members || []).forEach(function (m) {
          mt.appendChild(h("tr", {}, [h("td", { text: m.email }), h("td", { text: m.role }), h("td", { class: "r" }, [h("button", { class: "btn sm", type: "button", "data-remove": m.email, text: "Remove", on: { click: function () {
            if (!confirm("Remove " + m.email + " from " + c.name + "?")) return;
            A.admin("remove_member", { company_id: c.id, user_id: m.user_id }).then(function () { say(mn, "Removed " + m.email + "."); members(); }, function (e) { say(mn, e.message, true); });
          } } })])]));
        });
        if (!(r.members || []).length) mt.appendChild(h("tr", {}, [h("td", { text: "No members yet." })]));
      }, function (e) { say(mn, e.message, true); });
    }
    members();
    b.appendChild(mn);

    b.appendChild(h("h4", { text: "Invite a user" }));
    var role = h("select", { id: p + "role" }, [h("option", { value: "member", text: "Member" })]);
    if (operator) role.appendChild(h("option", { value: "owner", text: "Owner" }));
    var inn = note(), box = h("div");
    var inv = h("div", { class: "grid" }, [field("Email", p + "em", "", "email", "name@company.com"), h("div", {}, [h("label", { for: p + "role", text: "Role" }), role])]);
    b.appendChild(inv);
    b.appendChild(h("div", { class: "row" }, [h("button", { class: "btn accent sm", type: "button", text: operator ? "Invite (link for new users)" : "Invite", on: { click: function () {
      say(inn, "Creating..."); box.innerHTML = "";
      A.admin("invite", { company_id: c.id, email: val(b, p + "em"), role: role.value, redirect_to: new URL("reset.html", location.href).href }).then(function (r) {
        say(inn, (r.message || "Invite saved.") + " No email was sent.");
        if (r.link) {
          var li = h("input", { type: "text", readonly: "", value: r.link, "aria-label": "Invite link" });
          box.appendChild(h("div", { class: "linkbox" }, [h("div", { text: "Send this one-time link to the person yourself. They set their own password." }), li,
            h("button", { class: "btn sm", type: "button", text: "Copy link", on: { click: function () { li.select(); try { navigator.clipboard.writeText(r.link); } catch (e) { } } } })]));
        }
        members();
      }, function (e) { say(inn, e.message, true); });
    } } })]));
    b.appendChild(inn); b.appendChild(box);
    return card;
  }

  function newCompany(reload) {
    var n = note(), card = h("section", { class: "card", id: "newCo" });
    var b = h("div", { class: "card-b" });
    b.appendChild(h("h4", { text: "New company", style: "margin-top:0" }));
    b.appendChild(h("div", { class: "grid" }, [field("Company name", "ncName", ""), field("Slug", "ncSlug", "", "text", "lowercase-letters"), field("Brand name", "ncBrand", ""), field("Phone", "ncPhone", ""), field("City", "ncCity", "")]));
    b.appendChild(h("div", { class: "row" }, [h("button", { class: "btn primary sm", type: "button", text: "Create company", on: { click: function () {
      say(n, "Creating...");
      A.admin("create_company", { name: val(b, "ncName"), slug: val(b, "ncSlug"), brand: val(b, "ncBrand"), phone: val(b, "ncPhone"), city: val(b, "ncCity") }).then(function () { reload("Company created."); }, function (e) { say(n, e.message, true); });
    } } })]));
    b.appendChild(n); card.appendChild(b);
    return card;
  }

  // Operator only: demo / pilot requests from the marketing site (table demo_requests; RLS lets only platform_admins read it).
  function demoRequests() {
    var card = h("section", { class: "card", id: "demoReqs" }), b = h("div", { class: "card-b" }), n = note(), t = h("table");
    b.appendChild(h("h4", { text: "Demo and pilot requests", style: "margin-top:0" })); b.appendChild(t); b.appendChild(n); card.appendChild(b);
    A.token().then(function (tk) { return A.api("/rest/v1/demo_requests?select=created_at,company,name,email,phone,city,crews,message,source&order=created_at.desc&limit=100", "GET", null, tk); }).then(function (rows) {
      (rows || []).forEach(function (r) {
        var line = [r.name, r.company, r.email, r.phone, r.city, r.crews ? r.crews + " crews" : "", (r.source || "").replace("site:", "")].filter(Boolean).join(" | ");
        t.appendChild(h("tr", {}, [h("td", {}, [h("div", { text: new Date(r.created_at).toLocaleString() + "  " + line }), r.message ? h("div", { class: "note", text: r.message }) : null])]));
      });
      if (!(rows || []).length) say(n, "No requests yet.");
    }, function (e) { say(n, "Could not load requests: " + e.message, true); });
    return card;
  }

  // Operator only: every roofer on one table, from the admin function "overview" action (read-only, no owner names or phones).
  function overview() {
    var card = h("section", { class: "card", id: "allRoofers" }), b = h("div", { class: "card-b", style: "overflow-x:auto" }), n = note(), t = h("table");
    b.appendChild(h("h4", { text: "All roofers", style: "margin-top:0" })); b.appendChild(t); b.appendChild(n); card.appendChild(b);
    function d(v) { return v == null ? "n/a" : String(v); }
    function floorText(r) { if (r.pilot_floor == null) return "no floor set"; if (r.signed == null) return "n/a"; return r.signed >= r.pilot_floor ? "met" : "behind"; }
    A.admin("overview").then(function (r) {
      var rows = r.companies || [];
      if (!rows.length) return say(n, "No companies yet.");
      var head = ["Company", "Plan", "Counties", "New", "Booked", "Shown", "Signed", "Job value", "Floor", "Daily 50 today", "Daily 50 month", "Last SEO"];
      t.appendChild(h("tr", {}, head.map(function (x) { return h("td", { text: x, style: "color:var(--muted);font-size:12px" }); })));
      rows.forEach(function (c) {
        var plan = c.plan + (c.status && c.status !== "active" ? " (" + String(c.status).replace("_", " ") + ")" : "") + (c.plan === "trial" && c.trial_ends_at ? " to " + String(c.trial_ends_at).slice(0, 10) : "");
        var floor = floorText(c) + (c.pilot_floor != null ? " (" + d(c.signed) + " of " + c.pilot_floor + ")" : "");
        var cells = [c.name, plan, d(c.counties), d(c.leads_new), d(c.booked), d(c.shown), d(c.signed), c.job_value == null ? "n/a" : "$" + c.job_value.toLocaleString(), floor, d(c.attempts_today), d(c.attempts_month), c.last_seo_date || "n/a"];
        t.appendChild(h("tr", {}, cells.map(function (x) { return h("td", { text: x, style: "padding-right:12px;white-space:nowrap" }); })));
      });
      say(n, "This month so far. n/a means that number is not set up yet.");
    }, function (e) { say(n, e && (e.status === 404 || e.message === "Unknown action.") ? "Overview needs the admin function update (deploy is Jack's call)." : "Could not load the overview: " + (e && e.message ? e.message : "try again") + ". Overview needs the admin function update (deploy is Jack's call) if this keeps happening.", true); });
    return card;
  }

  function start(flash) {
    if (!A.session()) return loginView();
    A.admin("me").then(function (me) {
      if (!me.operator && !me.owner) { root.innerHTML = ""; root.appendChild(top("No access")); root.appendChild(h("p", { class: "note", text: "This page is for operators and company owners." })); return; }
      A.admin("list_companies").then(function (r) {
        root.innerHTML = "";
        root.appendChild(top(me.operator ? "Operator" : "Owner"));
        if (typeof flash === "string") root.appendChild(h("p", { class: "note", text: flash }));
        if (me.operator) root.appendChild(overview());
        if (me.operator) root.appendChild(demoRequests());
        if (me.operator) root.appendChild(newCompany(start));
        (r.companies || []).forEach(function (c) { root.appendChild(companyCard(c, me.operator, start)); });
        if (!(r.companies || []).length) root.appendChild(h("p", { class: "note", text: "No companies yet." }));
      });
    }, function (e) { if (e.status === 401 || e.message === "signed out") loginView(); else { root.innerHTML = ""; root.appendChild(h("p", { class: "note bad", text: e.message })); } });
  }
  start();
})();
