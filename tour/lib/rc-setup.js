/* rc-setup.js: "Company setup", opened from the account menu (lib/auth.js). Read only, every line comes from the
   roofer registry (lib/brand.js), the shared rules (lib/rc-state.js) and the copy library (lib/rc-copy.js, loaded on
   first open). Nothing here sends. One value saves on this device: the public site for home pages (proofBase), so
   Proof Page links in drafts point at a real site, never localhost. Other changes go through Wing Digital. */
(function () {
  "use strict";
  var dlg = null, copyP = null;
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function loadCopy() {
    if (window.RC && RC.copy) return Promise.resolve(RC.copy);
    if (copyP) return copyP;
    copyP = new Promise(function (res) {
      var s = document.createElement("script"); s.src = "lib/rc-copy.js";
      s.onload = function () { res(window.RC && RC.copy || null); }; s.onerror = function () { res(null); };
      document.head.appendChild(s);
    });
    return copyP;
  }
  function css() {
    if (document.getElementById("rcs-css")) return;
    var st = document.createElement("style"); st.id = "rcs-css";
    st.textContent =
      "" +
      ".rcs{width:min(640px,calc(100vw - 24px));max-height:min(86vh,860px);padding:0;border:1px solid rgba(11,16,32,.14);border-radius:8px;background:#fff;color:#0B1020;font-family:'Inter',system-ui,sans-serif;box-shadow:0 24px 60px rgba(11,16,32,.22)}" +
      ".rcs::backdrop{background:rgba(11,16,32,.32)}" +
      ".rcs .hd{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:12px;padding:18px 22px 14px;background:#fff;border-bottom:1px solid rgba(11,16,32,.10)}" +
      ".rcs .pbf{display:flex;gap:8px}.rcs .pbf input{flex:1;min-width:0;height:44px;box-sizing:border-box;border:1px solid rgba(11,16,32,.2);border-radius:6px;padding:0 12px;font:inherit;font-size:15px}.rcs .pbf input[aria-invalid=true]{border-color:#9A3412}.rcs #rcsPBm.no{color:#9A3412}" +
      ".rcs section.hl{background:#FFF8E6;margin:0 -22px;padding:16px 22px;transition:background 1.2s}.rcs .hd h2{margin:0;font-size:20px;font-weight:600;letter-spacing:-.01em;flex:1}" +
      ".rcs .x{min-width:44px;height:44px;border:1px solid rgba(11,16,32,.14);border-radius:6px;background:#fff;font:inherit;font-size:14px;font-weight:600;cursor:pointer;padding:0 14px}" +
      ".rcs .x:hover{background:#F3F4F7}" +
      ".rcs .bd{padding:6px 22px 22px}" +
      ".rcs section{padding:16px 0;border-bottom:1px solid rgba(11,16,32,.08)}.rcs section:last-child{border-bottom:0}" +
      ".rcs .lbl{font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#5A6378;margin:0 0 10px}" +
      ".rcs dl{display:grid;grid-template-columns:minmax(120px,190px) 1fr;gap:8px 16px;margin:0;font-size:15px;line-height:1.45}" +
      ".rcs dt{color:#465065}.rcs dd{margin:0;font-weight:500}" +
      ".rcs .chips{display:flex;flex-wrap:wrap;gap:6px}.rcs .chips span{border:1px solid rgba(11,16,32,.14);border-radius:4px;padding:3px 9px;font-size:14px;font-weight:500;background:#F7F8FA}" +
      ".rcs .co{display:flex;align-items:center;gap:14px;margin-bottom:12px}.rcs .co .mk{height:40px;min-width:40px;padding:0 7px;border-radius:6px;display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none}.rcs .co .mk img{height:30px!important;width:auto!important;display:block}" +
      ".rcs .co b{font-size:17px;font-weight:600}" +
      ".rcs details{border:1px solid rgba(11,16,32,.12);border-radius:6px;margin-top:8px;background:#fff}" +
      ".rcs summary{display:flex;align-items:center;gap:10px;min-height:44px;padding:0 14px;cursor:pointer;font-size:15px;font-weight:600;list-style:none}.rcs summary::-webkit-details-marker{display:none}" +
      ".rcs summary .d{font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;font-size:12px;font-weight:400;color:#5A6378;min-width:52px}" +
      ".rcs summary .ch{margin-left:auto;font-size:13px;font-weight:500;color:#465065}" +
      ".rcs summary::after{content:'+';font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;color:#5A6378;margin-left:10px}.rcs details[open] summary::after{content:'-'}" +
      ".rcs pre{margin:0;padding:12px 14px 14px;border-top:1px solid rgba(11,16,32,.08);white-space:pre-wrap;font:inherit;font-size:14px;line-height:1.5;color:#1F2633;background:#F7F8FA}" +
      ".rcs .sub{font-weight:600;display:block;margin-bottom:6px}" +
      ".rcs .note{font-size:14px;line-height:1.5;color:#465065;margin:10px 0 0}" +
      "@media (max-width:599px){.rcs{width:100vw;max-width:100vw;max-height:100dvh;height:100dvh;border-radius:0;margin:0}.rcs dl{grid-template-columns:1fr;gap:2px 0}.rcs dd{margin-bottom:10px}.rcs .hd{padding:12px 16px}.rcs .bd{padding:4px 16px 24px}}";
    document.head.appendChild(st);
  }
  function build() {
    var r = window.activeRoofer ? activeRoofer() : {}, RCx = window.RC || {};
    var tw = RCx.textWindow ? RCx.textWindow() : null, user = window.RCT_AUTH && RCT_AUTH.user ? RCT_AUTH.user() : null;
    var cities = (r.area || "").split(/,\s*|\s+and\s+/).filter(Boolean);
    var hq = r.hq || {};
    var h = '<div class="hd"><h2 id="rcs-t">Company setup</h2><button type="button" class="x" data-x>Close</button></div><div class="bd">' +
      '<section><p class="lbl">Company</p><div class="co"><span class="mk" style="background:' + esc(r.markBg || r.accent || "#0B1020") + '">' + (r.logo || "") + '</span><b>' + esc(r.name || "Your company") + '</b></div>' +
      '<dl><dt>Owner</dt><dd>' + esc(r.owner || "") + '</dd>' +
      (user && user.email ? '<dt>Signed in as</dt><dd>' + esc(user.email) + '</dd>' : '') +
      '<dt>Map base</dt><dd>' + esc(hq.name || r.name || "") + (hq.approx ? ' (central ' + esc(r.city || cities[0] || "") + ' until the office address is added)' : '') + '</dd>' +
      '<dt>State</dt><dd>' + esc(r.state || "") + '</dd></dl></section>' +
      '<section><p class="lbl">Service area</p><div class="chips">' + cities.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join("") + '</div>' +
      '<p class="note">Storms, the Daily 50 and the CRM only show homes in these cities.</p></section>' +
      '<section><p class="lbl">Outreach rules</p><dl>' +
      (tw ? '<dt>Texting hours</dt><dd>' + esc(tw.label) + '</dd>' : '') +
      '<dt>Texts per home</dt><dd>At most ' + esc(RCx.TEXT_CAP || 3) + ' in any 24 hours</dd>' +
      '<dt>Channels</dt><dd>Text and email. No calls, no mail.</dd>' +
      '<dt>Who sends</dt><dd>A person taps Send on every first text. Nothing goes out on its own.</dd>' +
      '<dt>Opt outs</dt><dd>STOP is honored on every home, on every screen.</dd></dl></section>' +
      '<section><p class="lbl">Follow-up messages</p><p class="note" style="margin:0 0 4px">The words each home gets, in order. Shown with an example street; the real message fills in that home\'s own storm, hail and roof facts.</p><div data-tpl><p class="note">Loading the messages...</p></div></section>' +
      '<section id="rcsMail"><p class="lbl">Mailing address</p>' + (r.mailingAddress ? '<p class="note" style="margin:0;color:#0B1020;font-size:15px;font-weight:500">' + esc(r.mailingAddress) + '</p>' : '<p class="note" style="margin:0">Not added yet. The law (CAN-SPAM) puts your business mailing address at the bottom of every email, so Open in Mail stays off until it is on file. Message your Wing Digital contact with the address to add it.</p>') + '</section>' +
      '<section id="rcsSite"><p class="lbl">Public site for home pages</p><p class="note" style="margin:0 0 8px">The web address your Proof Page links use in texts and emails, for example the site Wing Digital set up for you. Until it is set, drafts show a placeholder and Send stays off.</p>' +
      '<div class="pbf"><input type="url" id="rcsPB" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://" value="' + esc(pbNow()) + '" aria-describedby="rcsPBm"><button type="button" class="x" id="rcsPBs">Save</button></div><p class="note" id="rcsPBm" role="status" style="margin:6px 0 0"></p></section>' +
      '<section><p class="lbl">Changes</p><p class="note" style="margin:0">Your company details, cities, hours and messages are set up by Wing Digital. To change any of them, message your Wing Digital contact.</p></section>' +
      '</div>';
    return h;
  }
  function fillTemplates(root) {
    var host = root.querySelector("[data-tpl]");
    return loadCopy().then(function (c) {
      if (!c || !c.cadence) { host.innerHTML = '<p class="note">The message library did not load. Reopen this panel to try again.</p>'; copyP = null; return; }
      var r = window.activeRoofer ? activeRoofer() : {}, st = window.RC && RC.facts && RC.facts.storm || {};
      var f = { street: "123 Example St", city: r.city || "", stormISO: st.iso || "", roofer: r.name, rep: r.owner, rooferCity: r.city || "", phone: "" };
      host.innerHTML = c.cadence.slice(0, 5).map(function (s) {
        var out; try { out = c.next(f, s.step, "cold"); } catch (e) { out = null; }
        if (!out || !out.body) return "";
        var body = (out.subject ? "Subject: " + out.subject + "\n\n" : "") + out.body;
        return '<details><summary><span class="d">Day ' + s.day + '</span>' + (s.channel === "text" ? "First text" : "Follow-up email") + '<span class="ch">' + (s.channel === "text" ? "Text" : "Email") + '</span></summary><pre>' + esc(body) + '</pre></details>';
      }).join("") || '<p class="note">No messages to show.</p>';
    });
  }
  // the public site for home pages: saved on this device through RC (rc-state.js), read back by activeRoofer (brand.js)
  var pbKey = function () { return "proofBase." + (window.rooferKey ? rooferKey() : "default"); };
  function pbNow() { var v = window.RC && RC.__get ? RC.__get(pbKey(), null) : null; return v || ((window.activeRoofer && activeRoofer()) || {}).proofBase || ""; }
  function pbCheck(v) {
    v = String(v || "").trim(); if (!v) return { ok: true, v: "" };
    if (!/^https?:\/\//i.test(v)) v = "https://" + v;
    var u; try { u = new URL(v); } catch (e) { return { ok: false, m: "That does not look like a web address. Try something like https://yourcompany.com/proof/" }; }
    var h = u.hostname.toLowerCase();
    if (h === "localhost" || /\.localhost$/.test(h) || /^127\./.test(h) || h === "0.0.0.0" || h === "[::1]" || /\.test$/.test(h)) return { ok: false, m: "That is a test address on this computer. Homeowners cannot open it. Use your public website." };
    if (h.indexOf(".") < 0) return { ok: false, m: "Add the full web address, with the ending like .com." };
    var out = u.origin + u.pathname; if (!/\/$/.test(out)) out += "/";
    return { ok: true, v: out };
  }
  function wirePB(root) {
    var inp = root.querySelector("#rcsPB"), btn = root.querySelector("#rcsPBs"), msg = root.querySelector("#rcsPBm"); if (!inp || !btn) return;
    btn.onclick = function () {
      var c = pbCheck(inp.value); msg.classList.toggle("no", !c.ok);
      if (!c.ok) { msg.textContent = c.m; inp.setAttribute("aria-invalid", "true"); inp.focus(); return; }
      inp.removeAttribute("aria-invalid");
      if (window.RC && RC.__set) RC.__set(pbKey(), c.v || null);
      inp.value = c.v; msg.textContent = c.v ? "Saved on this device. New drafts link to " + c.v : "Cleared. Drafts show the placeholder until a site is set.";
    };
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); btn.click(); } });
  }
  function open(field) {
    css();
    if (!dlg) {
      dlg = document.createElement("dialog"); dlg.className = "rcs"; dlg.setAttribute("aria-labelledby", "rcs-t");
      dlg.addEventListener("click", function (e) { if (e.target === dlg || e.target.closest("[data-x]")) dlg.close(); });
      document.body.appendChild(dlg);
    }
    dlg.innerHTML = build();
    var tp = fillTemplates(dlg);
    wirePB(dlg);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    var x = dlg.querySelector("[data-x]"), sec = field === "site" ? dlg.querySelector("#rcsSite") : field === "mail" ? dlg.querySelector("#rcsMail") : null;
    if (!sec) { if (x) x.focus(); return; }
    // opened from a blocked draft: land on the missing field, marked for a moment
    var land = function () { if (dlg.open) sec.scrollIntoView({ block: "center" }); };
    land(); tp.then(land);   // the message list fills in above the field after it loads: land again so it stays in view
    sec.classList.add("hl"); setTimeout(function () { sec.classList.remove("hl"); }, 1800);
    var inp = field === "site" && dlg.querySelector("#rcsPB"); if (inp) inp.focus({ preventScroll: true }); else if (x) x.focus({ preventScroll: true });
  }
  window.RC_SETUP = { open: open };
})();
