/* Help links: a "Help" link in the sidebar footer, the phone top bar and the sign-in card, plus small "?" links that open the right
   section of the Help centre (help/index.html) next to the hail legend, lead score, pitch label, prices panel and outline notes.
   Self-contained and DOM-observing so it does not need edits inside app.js. Links open in a new tab so nobody loses their place. */
(function () {
  "use strict";
  var HELP = "help/index.html";
  var CTX = [
    { sel: ".map-legend", id: "hail-map", label: "How to read the hail map", corner: true },
    { sel: ".ld-score-h > span", id: "lead-score", label: "How the lead score works" },
    { sel: ".ld-table thead th:first-child", id: "lead-score", label: "How the lead score works" },
    { sel: ".ld-bar + .fineprint", id: "lead-score", label: "How the lead score works" },
    { sel: "#s-roof label:has(#pitchSel)", id: "roof-pitch", label: "Measured and assumed pitch" },
    { sel: "#s-roof .rp-prop-h > b", id: "prices", label: "Prices, proposals and PDF" },
    { sel: "#rsCheckOutline > b", id: "outline", label: "What Check outline means" },
    { sel: "#s-roof .dr-note:not(:has(#retryRoofBtn))", id: "outline", label: "Drawing or redrawing an outline", append: true }
  ];
  var css = ".hc-corner{position:absolute;top:6px;right:6px;margin:0!important;z-index:2;display:inline-flex!important}.hc-q{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;margin-left:6px;border-radius:50%;border:1px solid currentColor;font:600 11px/1 Inter,system-ui,sans-serif;text-decoration:none;color:#6B655B;background:#fff;vertical-align:middle;opacity:.9}.hc-q:hover{color:#8E3E21;opacity:1}.hc-q:focus-visible{outline:3px solid #1F5FA8;outline-offset:2px}" +
    "@media (max-width:860px){.hc-q{width:24px;height:24px;font-size:12px}}" +
    ".hc-link{display:inline-block;padding:6px 4px;margin:6px 10px 0 0;font:inherit;font-size:12px;color:inherit;opacity:.85;text-decoration:underline}.hc-link:hover{opacity:1}" +
    ".hc-bar{font-size:13px;color:inherit;text-decoration:underline;padding:6px 4px;min-height:32px;display:inline-flex;align-items:center}" +
    ".hc-login{margin:12px 0 0;text-align:center;font-size:13px}.hc-login a{color:inherit;text-decoration:underline;opacity:.85}";
  function style() { if (document.getElementById("hcCss")) return; var s = document.createElement("style"); s.id = "hcCss"; s.textContent = css; document.head.appendChild(s); }
  function link(id, label, text) {
    var a = document.createElement("a"); a.href = HELP + (id ? "#" + id : ""); a.target = "_blank"; a.rel = "noopener";
    a.className = "hc-q"; a.textContent = text || "?"; a.setAttribute("aria-label", "Help: " + label); a.title = "Help: " + label;
    a.addEventListener("click", function (e) { e.stopPropagation(); });
    return a;
  }
  function mountStatic() {
    var side = document.querySelector(".side");
    if (side && !side.querySelector("#rcHelpLink")) {
      var h = document.createElement("a"); h.id = "rcHelpLink"; h.className = "hc-link"; h.href = HELP; h.textContent = "Help";
      var cr = side.querySelector(".cr-link"); if (cr) side.insertBefore(h, cr); else side.appendChild(h);
      // sit on one row with the credits link
      var row = document.createElement("div"); row.style.cssText = "display:flex;align-items:center;flex-wrap:wrap";
      side.insertBefore(row, h); row.appendChild(h); if (cr) { cr.style.margin = "6px 0 0"; row.appendChild(cr); }
    }
    var mb = document.querySelector(".mobile-bar");
    if (mb && !mb.querySelector("#rcHelpBar")) { var m = document.createElement("a"); m.id = "rcHelpBar"; m.className = "hc-bar"; m.href = HELP; m.textContent = "Help"; var tag = mb.querySelector(".demo-tag"); mb.insertBefore(m, tag || null); }
    var card = document.querySelector(".auth-card");
    if (card && !card.querySelector(".hc-login")) { var p = document.createElement("p"); p.className = "hc-login"; p.innerHTML = '<a href="' + HELP + '">Help and how it works</a>'; card.appendChild(p); }
  }
  function mountCtx() {
    CTX.forEach(function (c) {
      var els = document.querySelectorAll(c.sel);
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.querySelector(":scope > .hc-q") || (el.nextElementSibling && el.nextElementSibling.classList.contains("hc-q"))) continue;
        var a = link(c.id, c.label, c.append ? "? Help" : "?");
        if (c.corner) { a.className += " hc-corner"; el.appendChild(a); continue; }
        if (c.append) { a.style.cssText = "width:auto;height:auto;border-radius:8px;padding:4px 8px;margin:8px 0 0;display:inline-flex"; el.appendChild(a); } else el.appendChild(a);
      }
    });
  }
  var pending = false;
  function tick() { if (pending) return; pending = true; (window.requestAnimationFrame || setTimeout)(function () { pending = false; mountStatic(); mountCtx(); }); }
  function boot() {
    style(); mountStatic(); mountCtx();
    try { new MutationObserver(tick).observe(document.body, { childList: true, subtree: true }); } catch (e) { }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
