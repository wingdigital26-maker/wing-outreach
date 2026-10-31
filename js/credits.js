// "About the data / Credits" modal. Self-contained: injects its own link (sidebar footer, /check footer) and styles.
(function () {
  const ROWS = [
    ["Hail and storm data", "NOAA MRMS MESH radar (National Severe Storms Laboratory), NWS storm warnings and Local Storm Reports via the Iowa Environmental Mesonet (Iowa State University), and NOAA Storm Prediction Center reports. U.S. government data. Credit only; no endorsement by NOAA or NWS is implied."],
    ["Census data", "U.S. Census Bureau TIGER/Line boundaries and American Community Survey estimates, shown as area-level context only. This product uses the Census Bureau Data API but is not endorsed or certified by the Census Bureau."],
    ["Maps", "(c) OpenStreetMap contributors (ODbL). Basemap tiles by OpenFreeMap, (c) OpenMapTiles, data from OpenStreetMap."],
    ["Building footprints", "Microsoft Building Footprints (Open Data Commons Open Database License, ODbL) and Overture Maps Foundation buildings ((c) OpenStreetMap contributors, Overture Maps Foundation; ODbL and CC BY 4.0)."],
    ["Aerial imagery", "USDA National Agriculture Imagery Program (NAIP), served by USGS The National Map. Public domain. Imagery is from a multi-year survey cycle and may not show the current roof."],
    ["Elevation", "USGS 3D Elevation Program (3DEP) LiDAR. Public domain."],
    ["Property records", "County assessor offices: Cleveland, Oklahoma, Canadian, McClain, Payne, Logan and Pottawatomie counties, Oklahoma. Public records, as of each county's last published roll."],
    ["Permits", "City of Oklahoma City re-roof permit records."],
    ["Software", "three.js (MIT licence), MapLibre GL JS (BSD-3-Clause licence) and jsPDF (MIT licence). Their licence texts are published with each project."]
  ];
  const LIMITS = [
    "Hail sizes are radar estimates for a spot on the map. They are not an inspection and not a statement that a roof is damaged.",
    "Roof pitch is assumed unless a measurement is shown. Roof sizes and squares are estimates, not a quote.",
    "Property and owner details come from public records and can be out of date."
  ];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function css() {
    if (document.getElementById("creditsCss")) return;
    const s = document.createElement("style"); s.id = "creditsCss";
    s.textContent = ".cr-link,.cr-link:hover{background:none!important;border:0!important;box-shadow:none!important;width:auto;display:inline-block;padding:6px 4px;margin:6px 0 0;font:inherit;font-size:12px;color:inherit;opacity:.75;text-decoration:underline;cursor:pointer;text-align:left}.cr-link:hover{opacity:1}" +
      ".cr-ov{position:fixed;inset:0;z-index:99999;background:rgba(15,18,24,.55);display:flex;align-items:center;justify-content:center;padding:16px}.cr-ov[hidden]{display:none}" +
      ".cr-box{background:#fff;color:#16181d;max-width:640px;width:100%;max-height:86vh;overflow:auto;border-radius:14px;padding:22px 24px;box-shadow:0 20px 60px rgba(0,0,0,.35);font:14px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}" +
      ".cr-box h2{margin:0 0 4px;font-size:20px}.cr-box h3{margin:16px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#555b66}.cr-box p{margin:0 0 8px}.cr-box ul{margin:0;padding-left:18px}.cr-box b{font-weight:650}" +
      ".cr-x{float:right;border:1px solid #c9ccd3;background:#fff;color:#16181d;border-radius:8px;padding:6px 12px;font:inherit;cursor:pointer}";
    document.head.appendChild(s);
  }
  function build() {
    let ov = document.getElementById("creditsModal"); if (ov) return ov;
    css();
    ov = document.createElement("div"); ov.id = "creditsModal"; ov.className = "cr-ov"; ov.hidden = true;
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-labelledby", "crTitle");
    ov.innerHTML = '<div class="cr-box"><button type="button" class="cr-x" id="crClose">Close</button><h2 id="crTitle">About the data</h2><p>Where the numbers and pictures come from, and what they can and cannot tell you.</p>' +
      "<h3>Credits</h3>" + ROWS.map(r => "<p><b>" + esc(r[0]) + ".</b> " + esc(r[1]) + "</p>").join("") +
      "<h3>Limits</h3><ul>" + LIMITS.map(l => "<li>" + esc(l) + "</li>").join("") + "</ul></div>";
    document.body.appendChild(ov);
    const close = () => { ov.hidden = true; if (open.last) open.last.focus(); };
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    ov.querySelector("#crClose").onclick = close;
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !ov.hidden) close(); });
    return ov;
  }
  function open() { const ov = build(); open.last = document.activeElement; ov.hidden = false; ov.querySelector("#crClose").focus(); }
  window.RC_CREDITS = { open };
  function mount() {
    css();
    const mk = () => { const b = document.createElement("button"); b.type = "button"; b.className = "cr-link"; b.textContent = "About the data / Credits"; b.onclick = open; return b; };
    const side = document.querySelector(".side");
    if (side && !side.querySelector(".cr-link")) side.appendChild(mk());
    const ft = document.querySelector("footer");
    if (ft && !ft.querySelector(".cr-link")) { ft.appendChild(document.createTextNode(" ")); ft.appendChild(mk()); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
