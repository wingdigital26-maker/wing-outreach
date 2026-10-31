/* Accounts + demo mode. Loads right after config.js (head, sync). See docs/ACCOUNTS.md.
   - RC_CONFIG.AUTH_REQUIRED=false (default): the app is unchanged (only demo mode and the owner flag exist).
   - AUTH_REQUIRED=true: no data request leaves the page until a Supabase session exists (config.js honours RC_GATED).
   Plain REST against Supabase Auth/PostgREST, no SDK. Only the public anon key is used; RLS does the isolation. */
(function () {
  var C = window.RC_CONFIG || {};
  var f0 = window.fetch.bind(window);
  var SK = "rc.session", CK = "rc.company", DK = "rc.demo";
  var ls = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { } }, del: function (k) { try { localStorage.removeItem(k); } catch (e) { } } };
  var q = new URLSearchParams(location.search);
  if (q.get("demo") === "1") ls.set(DK, "1"); else if (q.get("demo") === "0") ls.del(DK);
  var DEMO = ls.get(DK) === "1" || q.get("demo") === "1";
  var now = function () { return Math.floor(Date.now() / 1000); };
  var jget = function (k) { try { return JSON.parse(ls.get(k) || "null"); } catch (e) { return null; } };
  var session = function () { var s = jget(SK); return s && s.access_token ? s : null; };
  var listeners = []; var fetchedCo = null;

  function api(path, method, body, token) {
    return f0(C.SUPABASE_URL + path, { method: method || "GET", headers: { apikey: C.SUPABASE_ANON_KEY, Authorization: "Bearer " + (token || C.SUPABASE_ANON_KEY), "Content-Type": "application/json", Prefer: "return=representation" }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.text().then(function (t) {
          var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { }
          if (!r.ok) { var er = new Error((j && (j.msg || j.error_description || j.message)) || ("HTTP " + r.status)); er.status = r.status; throw er; }
          return j;
        });
      });
  }
  function store(tok) {
    var s = { access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: tok.expires_at || (now() + (tok.expires_in || 3600)), user: { id: tok.user && tok.user.id, email: tok.user && tok.user.email } };
    var old = session(); if (!s.user.id && old) s.user = old.user;
    ls.set(SK, JSON.stringify(s)); return s;
  }
  function ensureToken() {
    var s = session(); if (!s) return Promise.reject(new Error("signed out"));
    if (s.expires_at > now() + 60) return Promise.resolve(s.access_token);
    return api("/auth/v1/token?grant_type=refresh_token", "POST", { refresh_token: s.refresh_token }).then(function (t) { return store(t).access_token; });
  }
  function fetchCompany(token) {
    return api("/rest/v1/company_settings?select=*,companies(name,slug,owners_enabled,plan,status,trial_ends_at,seats,counties)&order=updated_at.asc&limit=1", "GET", null, token).then(function (rows) {
      var r = rows && rows[0]; if (!r) return null;
      var s = session();
      var c = { company_id: r.company_id, name: (r.companies && r.companies.name) || r.brand_name, brand_name: r.brand_name, initials: r.initials, logo_url: r.logo_url, accent: r.accent, phone: r.phone, city: r.city, contact_name: r.contact_name, avg_ticket: r.avg_ticket, price_per_square: r.price_per_square, prices: r.prices || {}, owners_enabled: !!(r.companies && r.companies.owners_enabled), plan: r.companies && r.companies.plan, status: r.companies && r.companies.status, trial_ends_at: r.companies && r.companies.trial_ends_at, seats: r.companies && r.companies.seats, counties: (r.companies && r.companies.counties) || [], logo_path: r.logo_path, onboarding: r.onboarding || {}, user_id: s && s.user && s.user.id };
      ls.set(CK, JSON.stringify(c)); return c;
    });
  }
  function company() { var s = session(), c = jget(CK); return s && c && c.user_id === (s.user && s.user.id) ? c : null; }
  function applyBrandFrom(c, B) {
    if (!c || !B) return;
    if (c.brand_name || c.name) B.company = c.brand_name || c.name;
    if (c.initials) B.initials = c.initials; else if (B.company) B.initials = B.company.split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
    if (c.accent && /^#[0-9a-fA-F]{6}$/.test(c.accent)) B.accent = c.accent;
    if (c.phone) B.phone = c.phone;
    if (c.city) B.city = c.city;
    if (c.contact_name) B.owner = c.contact_name;
    if (c.avg_ticket) B.avgTicket = +c.avg_ticket;
    if (c.price_per_square) B.pricePerSquare = +c.price_per_square;
    B.logoUrl = /^https:\/\//.test(c.logo_url || "") ? c.logo_url : null;
  }
  function logout() {
    var s = session();
    var done = function () { ls.del(SK); ls.del(CK); location.reload(); };
    if (!s) return done();
    api("/auth/v1/logout", "POST", null, s.access_token).then(done, done);
  }
  function savePrices(p) {
    var c = company(); if (!c) return Promise.resolve(false);
    return ensureToken().then(function (t) { return api("/rest/v1/company_settings?company_id=eq." + c.company_id, "PATCH", { prices: p, updated_at: new Date().toISOString() }, t); })
      .then(function (rows) { if (rows && rows[0]) { c.prices = rows[0].prices; ls.set(CK, JSON.stringify(c)); return true; } return false; }, function () { return false; });
  }
  function login(email, pw) {
    return api("/auth/v1/token?grant_type=password", "POST", { email: email, password: pw }).then(function (t) {
      var s = store(t);
      return fetchCompany(s.access_token).then(function () { return s; });
    });
  }

  // Cloud owner names: only for a signed-in user whose company has owners_enabled (RLS enforces it too). Single-row reads for the house card.
  function ownersCloud() { var c = company(); return !!(c && c.owners_enabled && !DEMO && session()); }
  function ownerRows(region, idxs) {
    if (!ownersCloud() || !idxs.length) return Promise.resolve({});
    return ensureToken().then(function (t) {
      return api("/rest/v1/owner_names?select=home_idx,owner_name&region=eq." + encodeURIComponent(region) + "&home_idx=in.(" + idxs.join(",") + ")", "GET", null, t);
    }).then(function (rows) { var m = {}; (rows || []).forEach(function (r) { m[r.home_idx] = r.owner_name; }); return m; }, function () { return {}; });
  }
  // Operator/owner tools: the "admin" Edge Function (checks the caller server side; the service key never reaches the browser).
  function adminCall(action, payload) {
    return ensureToken().then(function (t) {
      return f0(C.SUPABASE_URL + "/functions/v1/admin", { method: "POST", headers: { apikey: C.SUPABASE_ANON_KEY, Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ action: action }, payload || {})) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var er = new Error(j.error || ("HTTP " + r.status)); er.status = r.status; throw er; } return j; }); });
    });
  }
  // Existing accounts are added to a company only after they accept here (admin function: pending_invites).
  function inviteModal(inv) {
    var w = document.createElement("div"); w.className = "auth-wall";
    var f = document.createElement("div"); f.className = "auth-card"; f.setAttribute("role", "dialog"); f.setAttribute("aria-label", "Join company");
    var h = document.createElement("h1"); h.textContent = "Join " + inv.company_name + "?";
    var p = document.createElement("p"); p.textContent = "You were invited to the " + inv.company_name + " workspace" + (inv.role === "owner" ? " as an owner" : "") + ". Joining lets this company’s team see your sign-in email.";
    var yes = document.createElement("button"); yes.className = "btn"; yes.type = "button"; yes.textContent = "Join " + inv.company_name;
    var no = document.createElement("button"); no.className = "lnk"; no.type = "button"; no.textContent = "Not now";
    var m = document.createElement("div"); m.className = "auth-msg"; m.setAttribute("aria-live", "polite");
    [h, p, yes, no, m].forEach(function (e) { f.appendChild(e); }); w.appendChild(f); document.body.appendChild(w);
    yes.onclick = function () { yes.disabled = true; adminCall("accept_invite", { invite_id: inv.id }).then(function () { ls.del(CK); location.reload(); }, function () { yes.disabled = false; m.textContent = "Could not join. The invite may have expired or the team is full."; }); };
    no.onclick = function () { adminCall("decline_invite", { invite_id: inv.id }).then(function () { w.remove(); }, function () { w.remove(); }); };
  }
  window.RC_OWNERS_OK = function () { return C.SHOW_OWNERS !== false && !DEMO; };
  window.RC_DEMO = DEMO;
  window.RC_AUTH = {
    enabled: !!C.AUTH_REQUIRED, demo: DEMO, session: session, company: company,
    applyBrand: function (B) { applyBrandFrom(company(), B); },
    ownersCloud: ownersCloud, ownerRows: ownerRows, token: ensureToken, api: api, admin: adminCall, savePrices: savePrices, logout: logout, login: login, on: function (fn) { listeners.push(fn); if (fetchedCo) { try { fn(fetchedCo); } catch (e) { } } },
    setDemo: function (on) { if (on) ls.set(DK, "1"); else ls.del(DK); var u = new URL(location.href); u.searchParams.delete("demo"); location.href = u.toString(); }
  };

  // ---- gate
  var s0 = session();
  var expired = !!C.AUTH_REQUIRED && !!s0 && s0.expires_at <= now() + 10;
  if (C.AUTH_REQUIRED && (!s0 || expired)) window.RC_GATED = true;
  // a paused workspace (expired trial / canceled, from the cached company) loads no data: js/plan.js shows the lock screen instead of the login form
  (function () { var cc = jget(CK); if (C.AUTH_REQUIRED && s0 && !expired && !DEMO && cc && s0.user && cc.user_id === s0.user.id && (cc.status === "canceled" || (cc.plan === "trial" && cc.trial_ends_at && new Date(cc.trial_ends_at).getTime() < Date.now()))) { window.RC_GATED = true; window.RC_LOCKED = true; } })();
  if (expired) ensureToken().then(function () { location.reload(); }, function () { ls.del(SK); ls.del(CK); location.reload(); });
  if (C.AUTH_REQUIRED && s0 && !expired) {
    ensureToken().then(fetchCompany).then(function (c) {
      var B = window.BRAND;
      if (c && B && !DEMO) { applyBrandFrom(c, B); if (window.RC_applyBrand) window.RC_applyBrand(); }
      fetchedCo = c; // late listeners (deferred scripts) still get the fresh company
      listeners.forEach(function (fn) { try { fn(c); } catch (e) { } });
    }).catch(function (e) { if (e && (e.status === 401 || e.status === 403)) { ls.del(SK); ls.del(CK); location.reload(); } });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var st = document.createElement("style");
    st.textContent = ".auth-wall{position:fixed;inset:0;z-index:9999;background:var(--bg,#F4F0E8);display:grid;place-items:center;padding:20px}.auth-card{width:min(380px,100%);background:var(--surface,#fff);border-radius:16px;box-shadow:var(--shadow-sm,0 2px 12px rgba(0,0,0,.08));padding:26px 24px}.auth-card h1{font-size:20px;margin:0 0 4px}.auth-card p{margin:0 0 16px;color:var(--muted,#7a7367);font-size:13px}.auth-card label{display:block;font-size:12px;color:var(--muted,#7a7367);margin:10px 0 4px}.auth-card input{width:100%;box-sizing:border-box;min-height:44px;padding:0 12px;border:1px solid var(--line,#D8D0C2);border-radius:10px;font:inherit;background:#fff}.auth-card .btn{width:100%;min-height:44px;margin-top:16px}.auth-card .lnk{background:none;border:0;color:var(--muted,#7a7367);font:inherit;font-size:12.5px;text-decoration:underline;cursor:pointer;margin-top:12px;padding:6px 0}.auth-msg{min-height:18px;font-size:12.5px;margin-top:10px}.side-tools{display:flex;flex-wrap:wrap;gap:4px 12px;padding:0 10px 8px}.side-tools button{background:none;border:0;padding:4px 0;font:inherit;font-size:12px;color:var(--muted,#7a7367);text-decoration:underline;cursor:pointer;min-height:24px}";
    document.head.appendChild(st);
    var foot = document.querySelector(".side-foot");
    if (foot) {
      var t = document.createElement("div"); t.className = "side-tools";
      t.innerHTML = '<button type="button" id="rcDemoBtn" aria-pressed="' + DEMO + '">Demo mode: ' + (DEMO ? "on" : "off") + '</button>' + (session() ? '<button type="button" id="rcOutBtn">Sign out</button>' : "");
      foot.parentNode.insertBefore(t, foot);
      t.querySelector("#rcDemoBtn").onclick = function () { window.RC_AUTH.setDemo(!DEMO); };
      var ob = t.querySelector("#rcOutBtn"); if (ob) ob.onclick = logout;
      if (session()) adminCall("my_invites").then(function (r) { var inv = r && r.invites && r.invites[0]; if (inv) inviteModal(inv); }, function () { });
      if (session()) adminCall("me").then(function (m) { if (m && (m.operator || m.owner)) { var l = document.createElement("button"); l.type = "button"; l.id = "rcAdminBtn"; l.textContent = "Admin"; l.onclick = function () { location.href = "admin.html"; }; t.insertBefore(l, t.firstChild); } }, function () { });
    }
    if (!window.RC_GATED || window.RC_LOCKED) return;
    var w = document.createElement("div"); w.className = "auth-wall";
    w.innerHTML = '<form class="auth-card" id="rcLogin" novalidate><h1>Sign in</h1><p>Use the email and password for your company workspace.</p>' +
      '<label for="rcEm">Email</label><input id="rcEm" type="email" autocomplete="username" required>' +
      '<label for="rcPw">Password</label><input id="rcPw" type="password" autocomplete="current-password" required>' +
      '<button class="btn" type="submit" id="rcGo">Sign in</button><button class="lnk" type="button" id="rcForgot">Forgot password?</button><div class="auth-msg" id="rcMsg" aria-live="polite"></div></form>';
    document.body.appendChild(w);
    var msg = function (m) { w.querySelector("#rcMsg").textContent = m; };
    w.querySelector("#rcLogin").onsubmit = function (e) {
      e.preventDefault();
      var em = w.querySelector("#rcEm").value.trim(), pw = w.querySelector("#rcPw").value;
      if (!em || !pw) return msg("Enter your email and password.");
      msg("Signing in..."); w.querySelector("#rcGo").disabled = true;
      login(em, pw).then(function () { location.reload(); }, function (err) { w.querySelector("#rcGo").disabled = false; msg(err.status === 400 ? "Email or password is not right." : "Could not sign in. Try again."); });
    };
    w.querySelector("#rcForgot").onclick = function () {
      var em = w.querySelector("#rcEm").value.trim(); if (!em) return msg("Type your email above first.");
      api("/auth/v1/recover?redirect_to=" + encodeURIComponent(new URL("reset.html", location.href).href), "POST", { email: em }).then(function () { msg("If that email has an account, a reset link is on its way."); }, function () { msg("Could not send the reset email. Try again later."); });
    };
  });
})();
