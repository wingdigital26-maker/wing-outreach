/* Door-knock mode. Phone-first walking/driving route over a storm's hit list. Local-only state (localStorage). */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const STATUS = [["knocked", "Knocked"], ["nothome", "Not home"], ["interested", "Interested"], ["booked", "Booked"], ["dnk", "Do not knock"]];
  const LABEL = Object.fromEntries(STATUS);
  const COLOR = { knocked: "#6B7280", nothome: "#B08A3E", interested: "#2F7D5B", booked: "#1F5FA8", dnk: "#A33A3A", none: "#B4532F" };
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const kMarks = d => "kn:v1:marks:" + d, kRoute = d => "kn:v1:route:" + d, kRep = "kn:v1:rep";
  const key = r => r.rid + ":" + r.idx;

  function xy(p) { return [p.lon * Math.cos(p.lat * Math.PI / 180), p.lat]; }
  function dist(a, b) { const A = xy(a), B = xy(b); return Math.hypot(A[0] - B[0], A[1] - B[1]); }
  function street(addr) { return String(addr || "").replace(/^\s*\d+\S*\s+/, "").trim().toLowerCase(); }
  // nearest neighbour (same-street bias) from the point closest to `start`, then 2-opt on the open path
  function order(pts, start) {
    const left = pts.slice(), out = [];
    left.sort((a, b) => dist(start, a) - dist(start, b));
    let cur = left.shift(); out.push(cur);
    while (left.length) {
      let bi = 0, bd = 1e9;
      for (let i = 0; i < left.length; i++) { const d = dist(cur, left[i]) * (street(cur.addr) === street(left[i].addr) ? 0.6 : 1); if (d < bd) { bd = d; bi = i; } }
      cur = left.splice(bi, 1)[0]; out.push(cur);
    }
    let improved = true, guard = 0;
    while (improved && guard++ < 40) {
      improved = false;
      for (let i = 0; i < out.length - 2; i++) for (let j = i + 2; j < out.length; j++) {
        const a = out[i], b = out[i + 1], c = out[j], d = out[j + 1];
        const before = dist(a, b) + (d ? dist(c, d) : 0), after = dist(a, c) + (d ? dist(b, d) : 0);
        if (after < before - 1e-12) { const seg = out.slice(i + 1, j + 1).reverse(); out.splice(i + 1, seg.length, ...seg); improved = true; }
      }
    }
    return out;
  }
  function stripCity(a, c) { a = String(a || ""); c = String(c || ""); return c && a.toLowerCase().endsWith(" " + c.toLowerCase()) ? a.slice(0, -c.length - 1).trim() : a; }
  function miles(list) { let m = 0; const R = 3958.8, t = Math.PI / 180; for (let i = 1; i < list.length; i++) { const a = list[i - 1], b = list[i]; const x = Math.sin((b.lat - a.lat) * t / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin((b.lon - a.lon) * t / 2) ** 2; m += 2 * R * Math.asin(Math.sqrt(x)); } return m; }

  let S = null; // session state
  function close() { if (S && S.map) { try { S.map.remove(); } catch (e) { } } const o = $(".kn-ov"); if (o) o.remove(); document.body.classList.remove("kn-lock"); S = null; }
  function shell(inner) { return `<div class="kn-top"><b>Door-knock mode</b><span class="kn-sub">${esc(S.label)}</span><button class="btn sm" data-kn="close" type="button" aria-label="Close">Close</button></div><div class="kn-body">${inner}<div class="kn-note">Saved on this device. Sharing between reps needs accounts (coming with the database).</div></div>`; }
  function mount(inner) {
    let o = $(".kn-ov");
    if (!o) { o = document.createElement("div"); o.className = "kn-ov"; o.setAttribute("role", "dialog"); o.setAttribute("aria-label", "Door-knock mode"); document.body.appendChild(o); document.body.classList.add("kn-lock"); o.addEventListener("click", onClick); }
    o.innerHTML = shell(inner);
  }

  function open(opts) {
    if (S) close();
    S = { date: opts.date, label: opts.label, rows: opts.rows || [], marks: lsGet(kMarks(opts.date)) || {}, route: null, pos: 0, map: null, count: 25 };
    const saved = lsGet(kRoute(opts.date));
    if (saved && saved.list && saved.list.length) S.saved = saved;
    setup();
  }
  function avail() { return S.rows.filter(r => !S.marks[key(r)]); }
  function setup() {
    const rep = lsGet(kRep) || "";
    const a = avail(), hidden = S.rows.length - a.length;
    const sv = S.saved, svDone = sv ? sv.list.filter(h => S.marks[h.k]).length : 0;
    mount(`${sv ? `<div class="kn-card"><b>Route in progress</b><div class="muted">${svDone} of ${sv.list.length} doors done.</div><button class="btn accent block kn-big" data-kn="resume" type="button">Resume route</button></div>` : ""}
      <div class="kn-card"><b>New route</b>
        <div class="muted">${a.length.toLocaleString()} homes on the hit list${hidden ? `, ${hidden} hidden because you already marked them on this device` : ""}. Best-scored homes within reach of your start point.</div>
        <label class="kn-l">Your name (shown on exports)<input id="knRep" class="kn-in" type="text" maxlength="40" autocomplete="off" value="${esc(rep)}" placeholder="First name"></label>
        <div class="kn-l">How many doors</div>
        <div class="kn-seg" role="group" aria-label="Door count">${[25, 50, 100].map(n => `<button type="button" data-kn="count" data-n="${n}" class="${n === S.count ? "on" : ""}">${n}</button>`).join("")}</div>
        <div class="kn-l">Start point</div>
        <div class="kn-explain">Using your location is optional. If you allow it, the route starts at the house nearest you. Your location stays in this browser and is never sent anywhere.</div>
        <div class="kn-two"><button class="btn block kn-big" data-kn="gps" type="button">Use my location</button><button class="btn accent block kn-big" data-kn="first" type="button">Start at house 1</button></div>
        <div class="muted" id="knMsg" role="status"></div></div>
      <div class="kn-card" id="knStorm"><b>Storm follow-up</b>
        <div class="muted" id="knAud">Counting who you can contact...</div>
        <div class="kn-two"><button class="btn block kn-big" data-kn="boost" type="button">Load hardest-hit into tomorrow's Daily 50</button><button class="btn block kn-big" data-kn="walk" type="button">Export walk route (CSV)</button></div>
        <button class="btn block kn-big" data-kn="drafts" type="button">Review message drafts</button>
        <div class="muted" id="knBoostMsg" role="status"></div>
        <div class="kn-explain">Norman requires a solicitor licence for door-to-door ($100 per 30 days, $10,000 bond). Check other cities before knocking.</div></div>`);
    audience();
  }
  function audience() {
    const S0 = S; if (!window.RCAudience) { const e = $("#knAud"); if (e) e.textContent = "Contact counts unavailable."; return; }
    window.RCAudience.forStorm(S0.date).then(a => {
      if (S !== S0) return; S.aud = a;
      const e = $("#knAud"); if (e) e.textContent = `${a.optedIn.length} opted-in homeowners in this storm, ${a.pastCustomers.length} past customers in this storm (email only).`;
    }, () => { const e = $("#knAud"); if (e) e.textContent = "Contact counts unavailable."; });
  }
  function coKey() { if (window.RC_DEMO) return "demo"; const a = window.RC_AUTH, c = a && a.company && a.company(); return (c && c.company_id) || "device"; }
  function hardest() { return S.rows.slice().sort((a, b) => ((b.hail || 0) - (a.hail || 0)) || ((b.score || 0) - (a.score || 0))).slice(0, 50); }
  function boost() {
    const list = hardest().map(r => ({ region: r.rid, home_idx: r.idx })), m = $("#knBoostMsg");
    const ok = lsSet("rc.daily.boost." + coKey(), list);
    if (m) m.textContent = ok ? `Saved ${list.length} hardest-hit homes for tomorrow's Daily 50.` : "This device could not save the list.";
  }
  function walkCsv() {
    const src = S.saved && S.saved.list && S.saved.list.length ? S.saved.list.map(h => ({ addr: h.addr, city: h.city, zip: h.zip, lat: h.lat, lon: h.lon, hail: h.hail, score: h.score })) : hardest().map(r => ({ addr: stripCity(r.addr, r.city), city: r.city, zip: r.zip, lat: r.lat, lon: r.lon, hail: r.hail, score: r.score }));
    const lines = [["stop", "address", "city", "zip", "hail_in", "score", "lat", "lon"].map(cell).join(",")];
    src.forEach((h, i) => lines.push([i + 1, h.addr, h.city, h.zip, h.hail != null ? Number(h.hail).toFixed(2) : "", h.score, h.lat, h.lon].map(cell).join(",")));
    const text = lines.join("\r\n"), a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); a.download = `${window.RC_DEMO ? "demo-" : ""}walk-route-${S.date}.csv`; document.body.appendChild(a); a.click(); a.remove();
    window.__lastWalkCsv = text; setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }
  function drafts() {
    const a = S.aud || { optedIn: [], pastCustomers: [] };
    mount(`<div class="kn-card"><b>Message drafts</b><button class="btn sm" data-kn="back" type="button">Back</button></div>${window.RCAudience.draftsHtml(a.optedIn.concat(a.pastCustomers), S.date)}`);
  }
  function build(start) {
    const rep = $("#knRep") ? $("#knRep").value.trim() : ""; if (rep) lsSet(kRep, rep);
    const pool = avail().slice(0, 600);
    if (!pool.length) { $("#knMsg").textContent = "No homes left on this storm's list (all marked on this device)."; return; }
    const s = start || pool[0];
    const near = pool.slice().sort((a, b) => dist(s, a) - dist(s, b)).slice(0, S.count);
    const seq = order(near, s);
    const list = seq.map(r => ({ k: key(r), addr: stripCity(r.addr, r.city), city: r.city || "", zip: r.zip || "", lon: r.lon, lat: r.lat, score: r.score, hail: r.hail }));
    S.saved = { list, made: Date.now() }; lsSet(kRoute(S.date), S.saved);
    run();
  }
  function run() {
    S.route = S.saved.list; S.pos = S.route.findIndex(h => !S.marks[h.k]); if (S.pos < 0) S.pos = S.route.length;
    draw();
  }
  function counts() { const c = { done: 0, interested: 0, booked: 0 }; S.route.forEach(h => { const m = S.marks[h.k]; if (m) { c.done++; if (m.s === "interested") c.interested++; if (m.s === "booked") c.booked++; } }); return c; }
  function draw() {
    const c = counts(), n = S.route.length, h = S.route[S.pos], fin = !h;
    const mi = miles(S.route);
    const card = fin ? `<div class="kn-card"><b>Route finished</b><div class="muted">${c.done} of ${n} doors done, ${c.interested} interested, ${c.booked} booked.</div><div class="kn-two"><button class="btn accent block kn-big" data-kn="csv" type="button">Export CSV</button><button class="btn block kn-big" data-kn="new" type="button">Build a new route</button></div></div>`
      : `<div class="kn-card kn-cur"><div class="kn-cnt" style="text-transform:none;letter-spacing:0;font-size:13px">Door ${S.pos + 1} of ${n}${S.marks[h.k] ? " (marked " + esc(LABEL[S.marks[h.k].s]) + ")" : ""}</div><div class="kn-addr">${esc(stripCity(h.addr, h.city))}</div><div class="muted">${esc(h.city)} ${esc(h.zip)}${h.score != null ? ` &middot; lead score ${h.score}` : ""}${h.hail ? ` &middot; ${Number(h.hail).toFixed(2)} in hail` : ""}</div>
        <a class="btn block kn-big kn-maps" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${h.lat.toFixed(6)},${h.lon.toFixed(6)}">Open in Google Maps</a>
        <textarea id="knNote" class="kn-in" rows="2" maxlength="300" placeholder="Note for this door (optional)">${esc((S.marks[h.k] || {}).note || "")}</textarea>
        <div class="kn-btns">${STATUS.map(([k, l]) => `<button type="button" class="btn kn-s kn-s-${k}" data-kn="mark" data-s="${k}">${l}</button>`).join("")}</div>
        <div class="kn-two"><button class="btn sm" data-kn="prev" type="button">Previous</button><button class="btn sm" data-kn="skip" type="button">Skip for now</button></div></div>`;
    const rows = S.route.map((x, i) => { const m = S.marks[x.k]; return `<li class="kn-row ${i === S.pos ? "cur" : ""}" data-kn="goto" data-i="${i}"><span class="kn-dot" style="background:${COLOR[m ? m.s : "none"]}"></span><span class="kn-ra">${i + 1}. ${esc(stripCity(x.addr, x.city))}</span><span class="kn-rs">${m ? esc(LABEL[m.s] || "") : ""}</span></li>`; }).join("");
    mount(`<div class="kn-prog"><b>${c.done} of ${n}</b> done, ${c.interested} interested, ${c.booked} booked <span class="muted" style="display:block;margin-top:2px">~${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi straight-line</span><div class="kn-bar"><i style="width:${n ? c.done / n * 100 : 0}%"></i></div></div>
      <div class="kn-grid"><div class="kn-left">${card}<div class="kn-tools"><button class="btn sm" data-kn="csv" type="button">Export CSV</button><button class="btn sm" data-kn="new" type="button">New route</button></div></div>
      <div class="kn-right"><div id="knMap" class="kn-map" aria-label="Route map"></div><ol class="kn-list">${rows}</ol></div></div>`);
    initMap();
    const l = $(".kn-list"), cur = $(".kn-row.cur"); if (l && cur) l.scrollTop = Math.max(0, cur.offsetTop - l.offsetTop - 40);
  }
  function geo() {
    return { type: "FeatureCollection", features: S.route.map((h, i) => { const m = S.marks[h.k]; return { type: "Feature", properties: { c: COLOR[m ? m.s : "none"], cur: i === S.pos ? 1 : 0, n: i + 1 }, geometry: { type: "Point", coordinates: [h.lon, h.lat] } }; }) };
  }
  function initMap() {
    if (S.map) { try { S.map.remove(); } catch (e) { } S.map = null; }
    const el = $("#knMap"); if (!el) return;
    if (!window.maplibregl) { el.textContent = "Map unavailable. The list still works."; return; }
    try {
      const map = new maplibregl.Map({ container: el, style: "https://tiles.openfreemap.org/styles/positron", center: [S.route[0].lon, S.route[0].lat], zoom: 14, attributionControl: { compact: true, customAttribution: "(c) OpenStreetMap contributors | OpenFreeMap" } });
      S.map = map;
      { const bt = el.querySelector(".maplibregl-ctrl-attrib-button"); if (bt) { bt.style.backgroundRepeat = "no-repeat"; bt.style.backgroundPosition = "center"; } }
      let ready = false;
      const onReady = () => {
        if (ready || S.map !== map) return; ready = true;
        map.addSource("kr", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: S.route.map(h => [h.lon, h.lat]) } } });
        map.addLayer({ id: "kr-l", type: "line", source: "kr", paint: { "line-color": "#B4532F", "line-width": 2, "line-opacity": .55, "line-dasharray": [2, 2] } });
        map.addSource("kp", { type: "geojson", data: geo() });
        map.addLayer({ id: "kp-c", type: "circle", source: "kp", paint: { "circle-radius": ["case", ["==", ["get", "cur"], 1], 10, 6], "circle-color": ["get", "c"], "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
        const b = new maplibregl.LngLatBounds(); S.route.forEach(h => b.extend([h.lon, h.lat]));
        map.fitBounds(b, { padding: 36, maxZoom: 17, duration: 0 });
        map.on("click", "kp-c", e => { S.pos = e.features[0].properties.n - 1; draw(); });
        map.on("mouseenter", "kp-c", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "kp-c", () => { map.getCanvas().style.cursor = ""; });
      };
      map.on("style.load", onReady); map.on("load", onReady); if (map.isStyleLoaded()) onReady();
    } catch (e) { el.textContent = "Map unavailable. The list still works."; }
  }
  function mark(st) {
    const h = S.route[S.pos]; if (!h) return;
    const note = ($("#knNote") || {}).value || "";
    S.marks[h.k] = { s: st, note: note.trim(), t: new Date().toISOString(), rep: lsGet(kRep) || "", addr: stripCity(h.addr, h.city) + (h.city ? ", " + h.city : "") + (h.zip ? " " + h.zip : "") };
    lsSet(kMarks(S.date), S.marks);
    let nx = S.route.findIndex((x, i) => i > S.pos && !S.marks[x.k]);
    if (nx < 0) nx = S.route.findIndex(x => !S.marks[x.k]);
    S.pos = nx < 0 ? S.route.length : nx;
    draw();
  }
  function cell(v) { let s = String(v == null ? "" : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
  function csv() {
    const lines = [["address", "status", "note", "time", "rep"].map(cell).join(",")];
    S.route.forEach(h => { const m = S.marks[h.k]; if (m) lines.push([m.addr, LABEL[m.s] || m.s, m.note, m.t, m.rep].map(cell).join(",")); });
    if (window.RC_DEMO) lines.push(cell("Demo export: sample company, public data only"));
    const text = lines.join("\r\n"), a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); a.download = `${window.RC_DEMO ? "demo-" : ""}door-knock-${S.date}.csv`; document.body.appendChild(a); a.click(); a.remove();
    window.__lastKnockCsv = text; setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }
  function gps() {
    const msg = $("#knMsg"); if (!navigator.geolocation) { msg.textContent = "This browser has no location. Use Start at house 1."; return; }
    msg.textContent = "Waiting for your permission...";
    navigator.geolocation.getCurrentPosition(p => build({ lat: p.coords.latitude, lon: p.coords.longitude, addr: "" }),
      () => { const m = $("#knMsg"); if (m) m.textContent = "Location was not shared. Use Start at house 1, or allow location for this site."; }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
  }
  function onClick(e) {
    const t = e.target.closest("[data-kn]"); if (!t || !S) return;
    const a = t.dataset.kn;
    if (a === "close") return close();
    if (a === "count") { S.count = +t.dataset.n; t.parentNode.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === t)); return; }
    if (a === "first") return build(null);
    if (a === "gps") return gps();
    if (a === "resume") return run();
    if (a === "new") { S.saved = null; return setup(); }
    if (a === "mark") return mark(t.dataset.s);
    if (a === "csv") return csv();
    if (a === "boost") return boost();
    if (a === "walk") return walkCsv();
    if (a === "drafts") return window.RCAudience ? drafts() : undefined;
    if (a === "back") return setup();
    if (a === "skip") { const n = S.route.length; for (let k = 1; k <= n; k++) { const i = (S.pos + k) % n; if (!S.marks[S.route[i].k]) { S.pos = i; break; } } return draw(); }
    if (a === "prev") { S.pos = Math.max(0, S.pos - 1); return draw(); }
    if (a === "goto") { S.pos = +t.dataset.i; return draw(); }
  }
  window.Knock = { open, close, map: () => S && S.map };
})();
