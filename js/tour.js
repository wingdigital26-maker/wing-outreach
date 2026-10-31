/* First-run walkthrough: five skippable coach marks (storm, hit house, measure roof, proposal, knock mode).
   Seen flag: localStorage per user (rc.tour.seen.<user id or anon>), and for signed-in users also company_settings.prices.tour_seen[user id]
   (no schema change; the prices JSON already tolerates extra keys). Restart: Help centre button, or ?tour=1 in the app URL.
   Self-contained: injects its own styles. Respects prefers-reduced-motion. Esc skips, arrow keys step. */
(function () {
  "use strict";
  var STEPS = [
    { sel: [".storm-chips", "#s-storm .map-legend"], go: "#storm", title: "Pick a storm", body: "The dates across the top are storms that hit homes. The newest one is open. Pick another date to see where the hail fell.", side: "bottom" },
    { sel: ["#mapwrap", "#s-storm .map-legend"], go: "#storm", title: "Open a house that was hit", body: "Click a coloured house on the map. The card shows the radar hail size at that house (an estimate, not an inspection) and its lead score.", side: "right" },
    { sel: ["#nav [data-r=roof]", "#dock [data-r=roof]"], title: "Measure the roof", body: "Press Measure roof on a house card. You get a 3D roof, a 2D plan, ridges, hips, valleys and squares. If the outline is wrong, redraw it.", side: "right" },
    { sel: ["#nav [data-r=roof]", "#dock [data-r=roof]"], title: "Build the proposal", body: "On the roof screen pick a shingle type, open Prices to enter your own numbers, then Print / Save PDF. Until you save your prices it is marked Estimate.", side: "right" },
    { sel: ["#nav [data-knock]", "#dock [data-knock]"], title: "Go knock", body: "Knock mode turns the storm's hit list into a walking route you can use on your phone. Mark each door as you go.", side: "right" }
  ];
  var ls = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { } }, del: function (k) { try { localStorage.removeItem(k); } catch (e) { } } };
  var A = function () { return window.RC_AUTH || null; };
  function uid() { try { var s = A() && A().session && A().session(); return (s && s.user && s.user.id) || "anon"; } catch (e) { return "anon"; } }
  var key = function () { return "rc.tour.seen." + uid(); };
  function seenCloud() { try { var c = A() && A().company && A().company(); var t = c && c.prices && c.prices.tour_seen; return !!(t && t[uid()]); } catch (e) { return false; } }
  function seen() { return ls.get(key()) === "1" || seenCloud(); }
  function markSeen() {
    ls.set(key(), "1");
    var a = A(), id = uid(); if (!a || id === "anon" || !a.company || !a.api || !a.token) return;
    try {
      var c = a.company(); if (!c || !c.company_id) return;
      a.token().then(function (t) {
        var q = "/rest/v1/company_settings?company_id=eq." + c.company_id;
        return a.api(q + "&select=prices", "GET", null, t).then(function (rows) {
          var p = (rows && rows[0] && rows[0].prices) || {}; if (typeof p !== "object" || Array.isArray(p)) return;
          var ts = p.tour_seen && typeof p.tour_seen === "object" ? p.tour_seen : {}; if (ts[id]) return;
          ts[id] = new Date().toISOString().slice(0, 10); p.tour_seen = ts;
          return a.api(q, "PATCH", { prices: p, updated_at: new Date().toISOString() }, t);
        });
      }).catch(function () { });
    } catch (e) { }
  }
  window.RC_TOUR_RESET = function () { ls.del(key()); };

  var reduce = false; try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { }
  var root = null, ring = null, card = null, idx = 0, opener = null, onResize = null, onKey = null, running = false;

  function css() {
    if (document.getElementById("tourCss")) return;
    var s = document.createElement("style"); s.id = "tourCss";
    s.textContent = ".tr-ring{position:fixed;z-index:99990;border-radius:12px;box-shadow:0 0 0 9999px rgba(30,28,25,.5),0 0 0 3px #fff;pointer-events:none;" + (reduce ? "" : "transition:left .25s,top .25s,width .25s,height .25s;") + "}" +
      ".tr-ring.none{box-shadow:0 0 0 9999px rgba(30,28,25,.5);width:0;height:0;border-radius:0}" +
      ".tr-card{position:fixed;z-index:99991;width:min(340px,calc(100vw - 24px));background:#fff;color:#1E1C19;border-radius:16px;padding:16px 18px 14px;box-shadow:0 18px 50px rgba(30,28,25,.35);font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif}" +
      ".tr-card h2{margin:0 0 4px;font-size:16px;letter-spacing:-.01em}.tr-card p{margin:0 0 12px;color:#4A463F}.tr-n{font-size:12px;color:#6B655B;margin-bottom:6px}" +
      ".tr-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.tr-row .grow{flex:1}" +
      ".tr-b{font:inherit;font-weight:600;font-size:14px;min-height:40px;padding:0 14px;border-radius:11px;border:1px solid #D8D2C5;background:#fff;color:#1E1C19;cursor:pointer}" +
      ".tr-b.go{background:#B4532F;border-color:#B4532F;color:#fff}.tr-b.lnk{border:0;background:none;text-decoration:underline;color:#4A463F;padding:0 6px}" +
      ".tr-card a{color:#8E3E21}.tr-b:focus-visible,.tr-card a:focus-visible{outline:3px solid #1F5FA8;outline-offset:2px}" +
      ".tr-dots{display:flex;gap:5px;margin:0 0 8px}.tr-dots i{width:7px;height:7px;border-radius:50%;background:#D8D2C5}.tr-dots i.on{background:#2F5D4E}" +
      "@media (max-width:860px){.tr-card{left:12px!important;right:12px;width:auto;top:auto!important;bottom:calc(88px + env(safe-area-inset-bottom))}.tr-b{min-height:44px}}";
    document.head.appendChild(s);
  }
  function pick(sels) {
    for (var i = 0; i < sels.length; i++) {
      var els = document.querySelectorAll(sels[i]);
      for (var j = 0; j < els.length; j++) { var r = els[j].getBoundingClientRect(); if (r.width > 4 && r.height > 4) return els[j]; }
    }
    return null;
  }
  function place() {
    if (!running) return;
    var st = STEPS[idx], el = pick(st.sel), mobile = window.innerWidth <= 860;
    if (el) {
      var r = el.getBoundingClientRect(), pad = 6;
      ring.className = "tr-ring";
      ring.style.left = (r.left - pad) + "px"; ring.style.top = (r.top - pad) + "px"; ring.style.width = (r.width + pad * 2) + "px"; ring.style.height = (r.height + pad * 2) + "px";
    } else { ring.className = "tr-ring none"; ring.style.left = "50%"; ring.style.top = "50%"; }
    if (mobile) { card.style.left = ""; card.style.top = ""; return; }
    var cw = card.offsetWidth, ch = card.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, x, y;
    if (!el) { x = (vw - cw) / 2; y = (vh - ch) / 2; }
    else {
      var rr = el.getBoundingClientRect();
      if (st.side === "bottom" && rr.bottom + ch + 20 < vh) { x = rr.left; y = rr.bottom + 14; }
      else { x = rr.right + 18; y = rr.top; }
      if (x + cw > vw - 12) x = Math.max(12, vw - cw - 12);
      if (y + ch > vh - 12) y = Math.max(12, vh - ch - 12);
      if (x < 12) x = 12; if (y < 12) y = 12;
      // never sit on top of the target
      if (x < rr.right + 4 && x + cw > rr.left - 4 && y < rr.bottom + 4 && y + ch > rr.top - 4) { x = Math.min(vw - cw - 12, rr.right + 18); if (x + cw > vw - 12 || x < rr.left) { x = Math.max(12, rr.left); y = Math.min(vh - ch - 12, rr.bottom + 14); } }
    }
    card.style.left = Math.round(x) + "px"; card.style.top = Math.round(y) + "px";
  }
  function show(i, dir) {
    idx = i; var st = STEPS[i];
    if (st.go && location.hash !== st.go && !pick(st.sel)) { try { location.hash = st.go; } catch (e) { } }
    var last = i === STEPS.length - 1;
    card.innerHTML = '<div class="tr-n">Step ' + (i + 1) + ' of ' + STEPS.length + '</div><div class="tr-dots" aria-hidden="true">' + STEPS.map(function (s, k) { return '<i class="' + (k === i ? "on" : "") + '"></i>'; }).join("") + '</div>' +
      '<h2 id="trT">' + st.title + '</h2><p id="trB">' + st.body + '</p>' +
      '<div class="tr-row">' + (i ? '<button type="button" class="tr-b" data-t="back">Back</button>' : "") + '<button type="button" class="tr-b go" data-t="next">' + (last ? "Done" : "Next") + '</button><span class="grow"></span><button type="button" class="tr-b lnk" data-t="skip">Skip tour</button></div>' +
      '<p style="margin:10px 0 0;font-size:12px;color:#6B655B">Full guide: <a href="help/index.html" target="_blank" rel="noopener">Help</a>. You can restart this tour from Help.</p>';
    var tries = 0;
    (function wait() {
      var el = pick(st.sel);
      if (!el && tries++ < 20) return setTimeout(wait, 250);
      if (el) { try { el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" }); } catch (e) { } }
      setTimeout(place, reduce ? 0 : 60);
    })();
    place();
    var b = card.querySelector('[data-t="next"]'); if (b) b.focus({ preventScroll: true });
  }
  function end(finished) {
    if (!running) return; running = false;
    markSeen();
    window.removeEventListener("resize", onResize); window.removeEventListener("scroll", onResize, true); document.removeEventListener("keydown", onKey, true);
    if (root && root.parentNode) root.parentNode.removeChild(root); root = null;
    try { if (opener && opener.focus && document.contains(opener)) opener.focus(); } catch (e) { }
    try { window.dispatchEvent(new CustomEvent("rc:tour", { detail: { finished: !!finished } })); } catch (e) { }
  }
  function start() {
    if (running) return; css(); running = true; opener = document.activeElement;
    root = document.createElement("div"); root.id = "rcTour";
    ring = document.createElement("div"); ring.className = "tr-ring none";
    card = document.createElement("div"); card.className = "tr-card"; card.setAttribute("role", "dialog"); card.setAttribute("aria-modal", "false"); card.setAttribute("aria-labelledby", "trT"); card.setAttribute("aria-describedby", "trB");
    root.appendChild(ring); root.appendChild(card); document.body.appendChild(root);
    card.addEventListener("click", function (e) {
      var t = e.target.getAttribute && e.target.getAttribute("data-t");
      if (t === "next") { if (idx >= STEPS.length - 1) end(true); else show(idx + 1, 1); }
      else if (t === "back") show(Math.max(0, idx - 1), -1);
      else if (t === "skip") end(false);
    });
    onResize = function () { place(); };
    onKey = function (e) {
      if (!running) return;
      if (e.key === "Escape") { e.preventDefault(); end(false); }
      else if (e.key === "ArrowRight" && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "")) { e.preventDefault(); if (idx >= STEPS.length - 1) end(true); else show(idx + 1, 1); }
      else if (e.key === "ArrowLeft" && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "")) { e.preventDefault(); show(Math.max(0, idx - 1), -1); }
      else if (e.key === "Tab") { // keep focus inside the card while the tour is open
        var f = card.querySelectorAll("button,a[href]"); if (!f.length) return;
        var first = f[0], lastEl = f[f.length - 1];
        if (!card.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("resize", onResize); window.addEventListener("scroll", onResize, true); document.addEventListener("keydown", onKey, true);
    show(0, 1);
  }
  window.RC_TOUR = { start: start, seen: seen };

  function ready(fn) { var n = 0; (function t() { if (document.querySelector("#nav a, #dock a")) return fn(); if (n++ < 60) setTimeout(t, 500); })(); }
  function boot() {
    var forced = /[?&]tour=1\b/.test(location.search);
    if (forced) { try { var u = new URL(location.href); u.searchParams.delete("tour"); history.replaceState(null, "", u.pathname + (u.search || "") + u.hash); } catch (e) { } ls.del(key()); }
    if (!forced && navigator.webdriver) return; // automated test browsers (other builders' scripts) are not first-time users; ?tour=1 still starts it
    ready(function () {
      var go = function () { if (document.querySelector(".auth-wall")) return setTimeout(go, 1500); if (!forced && !/^(#|#overview|#storm)?$/.test(location.hash.split("?")[0])) return setTimeout(go, 1500); if (forced || !seen()) setTimeout(start, 900); }; // first-run tour waits until the user is on Overview/Storm, so it never covers Today, Results or SEO
      // wait a beat so the signed-in company (and its seen flag) has loaded
      setTimeout(go, forced ? 400 : 1600);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
