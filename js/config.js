// ---- Accounts switch. OFF by default: the app behaves exactly as before (no login, no company brand from the cloud).
// Set AUTH_REQUIRED to true to require a Supabase sign-in before any data loads (see docs/ACCOUNTS.md).
// The anon key is public by design (row level security protects the tables); the service key never goes in client code.
window.RC_CONFIG = {
  AUTH_REQUIRED: false,
  DATA_PRIVATE: false, // true once the Storage bucket "app-data" is private: data is read only with a signed-in session (hosted copy: scripts/build_deploy.py sets it)
  SHOW_OWNERS: true,   // local flag: owner names come only from data/private on this machine; set false for any hosted copy
  SUPABASE_URL: "https://wbtrsujvprbdojmxlkpe.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndidHJzdWp2cHJiZG9qbXhsa3BlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNjc0MzcsImV4cCI6MjEwNjY0MzQzN30.rzSf_wXbb9W0uajLg_5Ur04VyobSwgz3pLXgFSyG_5I"
};
// Local dev while the bucket is private: open the app once with ?auth=1 (persists) and sign in; ?auth=0 turns it off again.
try { var _qa = /[?&]auth=([01])/.exec(location.search); if (_qa) localStorage.setItem("rc.auth", _qa[1]); if (localStorage.getItem("rc.auth") === "1") window.RC_CONFIG.AUTH_REQUIRED = true; } catch (e) { }
// Gate decided here (not only in auth.js) because config.js's own prefetch below must not fire while signed out.
try { var _s = JSON.parse(localStorage.getItem("rc.session") || "null"); window.RC_GATED = !!window.RC_CONFIG.AUTH_REQUIRED && !(_s && _s.access_token && _s.expires_at > Date.now() / 1000 + 10); } catch (e) { window.RC_GATED = !!window.RC_CONFIG.AUTH_REQUIRED; }
// Data location. App data (packed binaries, catalogs, swath PNGs, footprints) is served from the Supabase
// Storage public bucket "app-data" (same relative paths as local data/). Anything that fails there falls back
// to the local data/ copy. Append ?data=local to the page URL to force local. data/private is never remote.
//
// Speed: this file runs before app.js parses, so it also starts the first-paint downloads right away
// (regions.json, catalogs, the storm in the URL or the default storm: its hail bins, then every region's homes.bin)
// and hands them to app.js through the same fetch()/RC_BIN() calls it already makes. Big binaries go through the
// browser Cache API (keyed by a version string from the catalog) so a repeat visit does not download them again.
(function () {
  var LOCAL = /[?&]data=local\b/.test(location.search);
  var rel = function (u) {
    if (typeof u !== "string") return null;
    var m = /^(?:\.\.?\/)?data\/(.+)$/.exec(u);
    return m && !/^private\//.test(m[1]) ? m[1] : null;
  };
  // ---- signed-in access. With a Supabase session the data is read through the authenticated Storage endpoint
  // (the bucket is private). Signed out there is no remote data URL at all: only the local data/ copy (local dev) is tried, never a public bucket URL.
  var SB = window.RC_CONFIG.SUPABASE_URL, KEY = window.RC_CONFIG.SUPABASE_ANON_KEY, AUTH_BASE = SB + "/storage/v1/object/authenticated/app-data/";
  var nowS = function () { return Math.floor(Date.now() / 1000); };
  var sess = function () { try { var s = JSON.parse(localStorage.getItem("rc.session") || "null"); return s && s.access_token ? s : null; } catch (e) { return null; } };
  var token = function () { var s = sess(); return s && s.expires_at > nowS() + 15 ? s.access_token : null; };
  var refreshing = false;
  var refresh = function () {
    var s = sess(); if (!s || !s.refresh_token || refreshing || s.expires_at > nowS() + 120) return;
    refreshing = true;
    f0(SB + "/auth/v1/token?grant_type=refresh_token", { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: s.refresh_token }) })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (t) {
        if (t && t.access_token) localStorage.setItem("rc.session", JSON.stringify({ access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at || (nowS() + (t.expires_in || 3600)), user: (t.user && { id: t.user.id, email: t.user.email }) || s.user }));
      }).catch(function () { }).then(function () { refreshing = false; });
  };
  setInterval(refresh, 30000); setTimeout(refresh, 0);
  var hdrs = function (h) { var t = token(); if (!t) return h; var o = {}; if (h) { new Headers(h).forEach(function (v, k) { o[k] = v; }); } o.apikey = KEY; o.Authorization = "Bearer " + t; return o; };
  var viaAuth = function (r) { return token() ? AUTH_BASE + r : null; };
  window.RC_DATA_URL = function (u) { var r = LOCAL ? null : rel(u); return r && token() ? viaAuth(r) : u; };
  // MapLibre: pass as transformRequest so swath images (and anything else under the bucket) carry the user's JWT.
  window.RC_TRANSFORM = function (url) {
    if (typeof url === "string" && url.indexOf(AUTH_BASE) === 0) { var t = token(); if (t) return { url: url, headers: { apikey: KEY, Authorization: "Bearer " + t } }; }
    return { url: url };
  };
  var f0 = window.fetch.bind(window);
  var raw = function (input, init) {
    var r = LOCAL || typeof input !== "string" ? null : rel(input);
    if (!r) return f0(input, init);
    if (window.RC_GATED) return new Promise(function () { }); // signed out: no app data request leaves the page
    if (!token()) return f0(input, init); // signed out: local data/ only (the hosted build is gated and never gets here)
    var ai = Object.assign({}, init || {}, { headers: hdrs(init && init.headers) });
    return f0(viaAuth(r), ai).then(function (res) { return res.ok || res.status === 206 ? res : f0(input, init); }, function () { return f0(input, init); });
  };
  var PRE = {}; // data-relative path -> in-flight Response promise started before app.js ran
  window.fetch = function (input, init) {
    var r = typeof input === "string" && !init ? rel(input) : null;
    if (r && PRE[r]) return PRE[r].then(function (res) { return res.clone(); });
    return raw(input, init);
  };
  // ---- binary cache (Cache API). ver changes when the catalog says the file changed.
  var BINS = {};
  window.RC_BIN = function (url, ver) {
    var k = url + "|" + ver;
    if (BINS[k]) return BINS[k];
    var key = location.origin + "/__rcbin/" + encodeURI(url) + "?v=" + encodeURIComponent(ver);
    var cs = window.caches ? caches.open("rc-bin-v1") : Promise.reject();
    var net = function (c) {
      return raw(url).then(function (res) {
        if (!res.ok) throw new Error(url + " " + res.status);
        if (c) { c.keys().then(function (ks) { ks.forEach(function (q) { if (q.url.split("?")[0] === key.split("?")[0] && q.url !== key) c.delete(q); }); }).catch(function () { }); c.put(key, res.clone()).catch(function () { }); }
        return res.arrayBuffer();
      });
    };
    return (BINS[k] = cs.then(function (c) { return c.match(key).then(function (hit) { return hit ? hit.arrayBuffer() : net(c); }); }, function () { return net(null); })
      .catch(function (e) { delete BINS[k]; throw e; }));
  };
  window.RC_VER = function (region, st) { return st ? [st.source_key || "", st.homes_075, st.homes_1in, st.max_in].join(":") : [region.homes.count, region.box.lon_min, region.box.lat_min].join(":"); };
  // ---- first-paint prefetch
  if (LOCAL || /\/check(\/|$)/.test(location.pathname) || !/#(storm|overview|ask)?(\?|$)/.test(location.hash || "#")) return; // /check reads nothing from the bucket (public lookup function)
  setTimeout(function () { if (window.RC_GATED) return; try {
    var want = (/[?&]d=(\d{4}-\d\d-\d\d)/.exec(location.hash) || [])[1] || null;
    PRE["customers.json"] = raw("data/customers.json");
    PRE["regions.json"] = raw("data/regions.json");
    PRE["regions.json"].then(function (res) { return res.clone().json(); }).then(function (man) {
      var pc = window.RC_AUTH && window.RC_AUTH.enabled && !window.RC_AUTH.demo && window.RC_AUTH.company && window.RC_AUTH.company(); // plan: do not prefetch counties the company does not pay for (they would be refused)
      if (pc) { var okIds = (pc.counties && pc.counties.length) ? pc.counties : (pc.plan === "pro" ? null : ["cleveland"]); if (okIds) man = man.filter(function (m) { return okIds.indexOf(m.id) >= 0; }); }
      var cats = man.map(function (m) {
        PRE[m.path.replace(/^data\//, "") + "cities.json"] = raw(m.path + "cities.json");
        var p = (PRE[m.path.replace(/^data\//, "") + "catalog.json"] = raw(m.path + "catalog.json"));
        return p.then(function (res) { return res.clone().json(); }).then(function (c) { return { m: m, c: c }; }).catch(function () { return null; });
      });
      return Promise.all(cats);
    }).then(function (all) {
      all = all.filter(Boolean);
      // same rule as the app's default: newest storm with >=100 homes at 1 in+, summed over regions
      var by = {};
      all.forEach(function (x) { x.c.storms.forEach(function (s) { var a = by[s.date] || (by[s.date] = { d: s.date, h1: 0, h75: 0 }); a.h1 += s.homes_1in || 0; a.h75 += s.homes_075 || 0; }); });
      var dates = Object.keys(by).sort().reverse();
      var onStorm = /^#storm/.test(location.hash);
      var d = want && by[want] ? want : (onStorm ? dates.find(function (x) { return by[x].h1 >= 100; }) : null) || dates.find(function (x) { return by[x].h75 > 0; }) || dates[0];
      if (!d) return;
      var jobs = [];
      all.forEach(function (x) {
        var st = x.c.storms.filter(function (s) { return s.date === d; })[0];
        if (st) jobs.push([0, x.c.homes.count, function () { return window.RC_BIN(x.m.path + st.hail, window.RC_VER(null, st)); }]);
        jobs.push([1, x.c.homes.count, function () { return window.RC_BIN(x.m.path + "homes.bin", window.RC_VER(x.c, null)); }]);
      });
      jobs.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }).forEach(function (j) { j[2]().catch(function () { }); });
    }).catch(function () { });
  } catch (e) { } }, 0);
})();
