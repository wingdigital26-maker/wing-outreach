// leads.js: best-leads score, per-house enrichment facts (assessor roof, re-roof permit, imagery date,
// nearest storm report) and the Storm Response proof layers (NWS report pins + warning polygons).
// Everything is lazy: a data file is fetched only when a house card / hit list / filter / storm needs it.
// No owner names anywhere in this file.
//
// BEST LEADS SCORE, 0-100 (higher = better door to knock after this storm). Weights:
//   Hail at the house      0-40  linear from 0.5 in (0 pts) to 2.0 in+ (40 pts), radar MESH at that house
//   1 in+ storms since 2020 0-15  3 pts per storm, capped at 5 storms (current storm included), history.bin
//   Roof age               0-25  0 pts at 5 yrs or newer, 25 pts at 25 yrs+; unknown year = 8 pts (neutral)
//                                 year = assessor remodel year if it is the newest (Oklahoma County only,
//                                 any remodel, not roof-only), else assessor adjusted year built, else year built
//   Home value band        0-20  <$100k 3 | $100-200k 8 | $200-350k 14 | $350k+ 20 | unknown 6 (tax-roll value)
//   Re-roofed recently     -30   OKC re-roof permit since Oct 2023, or assessor remodel year 2023+
// Score = clamp(sum, 0, 100). Honest limits: no permit does not mean an old roof; remodel year may not be the roof.
(function () {
  "use strict";
  const NOW_YEAR = new Date().getFullYear();
  const RECENT_YEAR = 2023;
  const REROOF_REGIONS = new Set(["okcounty", "cleveland", "canadian"]);
  const WHY = "Why this score (0-100): hail at the house up to 40 (0.5 in = 0, 2 in+ = 40), 1 in+ storms since 2020 up to 15 (3 each, max 5), roof age up to 25 (5 yrs = 0, 25 yrs+ = 25), home value band up to 20, minus 30 if re-roofed since 2023 (permit or assessor remodel). Radar and tax-roll data, not an inspection.";
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monYear = iso => { const p = String(iso).split("-"); return MON[(+p[1] || 1) - 1] + " " + p[0]; };
  const jget = u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);
  const bget = u => fetch(u).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------- per-region enrichment ----------
  const R = {};
  function loadRegion(region) {
    let e = R[region.id];
    if (e) return e.p;
    e = R[region.id] = { hist: null, asr: null, codes: null, rr: null, n: region.n };
    const n = region.n, id = region.id;
    e.p = Promise.all([
      bget(`data/enrich/${id}/history.bin`).then(b => { if (b && b.byteLength === 5 * n) e.hist = new DataView(b); }),
      id === "okcounty" ? Promise.all([bget("data/enrich/okcounty/assessor.bin"), jget("data/enrich/okcounty/assessor_codes.json")]).then(([b, c]) => { if (b && c && b.byteLength === 12 * n) { e.asr = new DataView(b); e.codes = c; } }) : null,
      REROOF_REGIONS.has(id) ? jget(`data/enrich/${id}/reroof.json`).then(j => { if (j && j.homes) e.rr = j; }) : null
    ]).then(() => { e.done = true; return e; });
    return e.p;
  }
  const loaded = region => !!(R[region.id] && R[region.id].done);
  function assessorOf(region, i) {
    const e = R[region.id]; if (!e || !e.asr) return null;
    const n = e.n, v = e.asr, c = e.codes;
    const rt = v.getUint8(i), rc = v.getUint8(n + i);
    return {
      type: c.roof_type_codes[rt] || "", cover: c.roof_cover_codes[rc] || "",
      remodel: v.getUint16(2 * n + 2 * i, true), pct: v.getUint8(4 * n + i), stories: v.getUint8(5 * n + i) / 10,
      adj: v.getUint16(6 * n + 2 * i, true)
    };
  }
  function permitOf(region, i) { const e = R[region.id]; return e && e.rr ? (e.rr.homes[i] || null) : null; }
  function timesOf(region, i) { const e = R[region.id]; return e && e.hist ? e.hist.getUint16(2 * i, true) : null; }
  // sync; call after loadRegion resolved
  function recentlyReroofed(region, i) {
    const p = permitOf(region, i); if (p) return { kind: "permit", date: p };
    const a = assessorOf(region, i);
    if (a && a.remodel >= RECENT_YEAR) return { kind: "remodel", year: a.remodel };
    return null;
  }

  // ---------- score ----------
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  function scoreHome(region, i, hail, meta) {
    const parts = [];
    const hp = Math.round(clamp((hail - 0.5) / 1.5, 0, 1) * 40);
    parts.push({ key: "hail", label: "Hail at the house", pts: hp, max: 40, detail: hail.toFixed(2) + " in" });
    const t = timesOf(region, i);
    if (t == null) parts.push({ key: "storms", label: "1 in+ storms since 2020", pts: 0, max: 15, detail: "not available" });
    else parts.push({ key: "storms", label: "1 in+ storms since 2020", pts: Math.min(t, 5) * 3, max: 15, detail: t + (t === 1 ? " storm" : " storms") });
    const a = assessorOf(region, i);
    let yr = meta && meta.year ? meta.year : 0, basis = "year built";
    if (a) {
      if (a.adj) { yr = a.adj; basis = "adjusted year built"; }
      if (a.remodel && a.remodel >= yr) { yr = a.remodel; basis = "assessor remodel year"; }
    }
    if (yr) { const age = NOW_YEAR - yr; parts.push({ key: "age", label: "Roof age", pts: Math.round(clamp((age - 5) / 20, 0, 1) * 25), max: 25, detail: `${yr} (${basis}), about ${age} yrs` }); }
    else parts.push({ key: "age", label: "Roof age", pts: 8, max: 25, detail: "year unknown (neutral)" });
    const val = meta && meta.value ? meta.value : 0;
    const vp = !val ? 6 : val < 100000 ? 3 : val < 200000 ? 8 : val < 350000 ? 14 : 20;
    parts.push({ key: "value", label: "Home value band", pts: vp, max: 20, detail: val ? "$" + Math.round(val).toLocaleString("en-US") : "unknown" });
    const rr = recentlyReroofed(region, i);
    if (rr) parts.push({ key: "reroof", label: "Re-roofed recently", pts: -30, max: 0, detail: rr.kind === "permit" ? "permit " + monYear(rr.date) : "assessor remodel " + rr.year });
    const raw = parts.reduce((s, p) => s + p.pts, 0);
    const score = Math.round(clamp(raw, 0, 100));
    const reasons = parts.map(p => `${p.label}: ${p.detail} (${p.pts >= 0 ? "+" : ""}${p.pts})`).join("; ");
    return { score, parts, reasons };
  }

  // ---------- imagery date ----------
  let imgP = null;
  function loadImagery() { return imgP || (imgP = jget("data/enrich/imagery_dates.json")); }
  async function imageryOf(lon, lat) {
    return null; // Esri-derived photo dates retired (licence); no data/enrich/imagery_dates.json fetch
    const d = await loadImagery(); if (!d) return null;
    const g = d.grid, key = Math.floor((lon - g.lon0) / g.dlon) + "_" + Math.floor((lat - g.lat0) / g.dlat);
    const si = d.cells[key];
    return si == null ? null : d.sources[si];
  }

  // ---------- storm proof ----------
  let lsrP = null, warnP = null;
  const lsrAll = () => lsrP || (lsrP = jget("data/enrich/lsr_by_storm.json").then(j => j || {}));
  const warnAll = () => warnP || (warnP = jget("data/enrich/warnings_by_storm.json").then(j => j || {}));
  const reportsFor = async d => (await lsrAll())[d] || [];
  const warningsFor = async d => (await warnAll())[d] || [];
  const DIRS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  function distBear(lat1, lon1, lat2, lon2) {
    const R_MI = 3958.8, rad = Math.PI / 180, dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    const mi = 2 * R_MI * Math.asin(Math.sqrt(a));
    const y = Math.sin(dLon) * Math.cos(lat2 * rad), x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos(dLon);
    const br = (Math.atan2(y, x) / rad + 360) % 360;
    return { mi, dir: DIRS[Math.round(br / 22.5) % 16] };
  }
  const localTime = iso => { try { return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }); } catch (e) { return ""; } };
  const titlePlace = p => String(p || "").replace(/\b(Nne|Ene|Ese|Sse|Ssw|Wsw|Wnw|Nnw|Ne|Nw|Se|Sw)\b/g, m => m.toUpperCase());
  async function nearestReport(date, lon, lat, maxMi) {
    const reps = (await reportsFor(date)).filter(r => r.type === "hail" && r.size_in != null);
    let best = null;
    reps.forEach(r => { const d = distBear(lat, lon, r.lat, r.lon); if (d.mi <= maxMi && (!best || d.mi < best.mi)) best = { r, mi: d.mi, dir: d.dir }; });
    return best;
  }
  async function stormProof(date) {
    const [r, w] = await Promise.all([reportsFor(date), warningsFor(date)]);
    const hail = r.filter(x => x.type === "hail" && x.size_in != null);
    return { reports: r.length, hailReports: hail.length, maxHail: hail.reduce((m, x) => Math.max(m, x.size_in), 0), warnings: w.length, tornado: w.filter(x => x.phenom === "TO").length };
  }

  // ---------- house card facts ----------
  async function houseFacts(region, i, lon, lat, date) {
    await loadRegion(region);
    const [img, near] = await Promise.all([imageryOf(lon, lat), date ? nearestReport(date, lon, lat, 5) : null]);
    return { asr: assessorOf(region, i), permit: permitOf(region, i), reroofRecent: recentlyReroofed(region, i), imagery: img, near, regionId: region.id, times: timesOf(region, i) };
  }
  function cardHtml(f, hail, meta, region, i) {
    if (!f) return "";
    const row = (a, b) => `<div class="row ld-row"><span>${a}</span><b class="num">${b}</b></div>`;
    let h = "";
    if (f.asr && (f.asr.cover || f.asr.type)) {
      if (f.asr.cover) h += row("Roof material", esc(f.asr.cover));
      if (f.asr.type) h += row("Roof shape", esc(f.asr.type));
      if (f.asr.stories) h += row("Stories", f.asr.stories);
      if (f.asr.remodel) h += row("Remodel (assessor)", `${esc(f.asr.remodel)}${f.asr.pct ? ` <span class="muted" style="font-weight:400">${esc(f.asr.pct)}%</span>` : ""}`);
    } else if (f.regionId !== "okcounty") {
      h += row("Roof (assessor)", `<span class="muted" style="font-weight:400">Not on file for this county</span>`);
    }
    if (f.permit) h += row("Re-roof permit", `${monYear(f.permit)} <span class="muted" style="font-weight:400">(City of OKC)</span>`);
    // Aerial photo date hidden: it came from Esri imagery metadata (licence risk, see docs/business/DATA-LICENSES.md)
    // if (f.imagery) h += row("Aerial photo", `${monYear(f.imagery.date)} <span class="muted" style="font-weight:400">(Esri)</span>`);
    if (f.near) {
      const r = f.near.r;
      h += `<div class="ld-near"><span class="muted">Nearest report</span><div>${r.size_in.toFixed(2)} in hail, ${f.near.mi < 0.1 ? "under 0.1" : f.near.mi.toFixed(1)} mi ${f.near.dir} of this home (${esc(titlePlace(r.place))}), ${esc(localTime(r.time))} &middot; NWS local storm report</div></div>`;
    }
    if (hail > 0 && region) {
      const s = scoreHome(region, i, hail, meta);
      h += `<div class="ld-score" title="${esc(WHY)}"><div class="ld-score-h"><span>Lead score</span><b class="num">${s.score}/100</b></div><div class="ld-parts">${s.parts.map(p => `<span class="ld-part${p.pts < 0 ? " neg" : ""}" title="${esc(p.detail)}">${esc(p.label)} ${p.pts >= 0 ? "+" : ""}${p.pts}</span>`).join("")}</div></div>`;
    }
    return h;
  }

  // ---------- map layers (reports + warnings) ----------
  const vis = { pins: true, warn: true };
  let layerToken = 0, popup = null;
  const SRC = ["sp-pins", "sp-warn"], LYR = ["sp-warn-sv", "sp-warn-to", "sp-pins", "sp-pins-label"];
  function clearLayers(map) {
    layerToken++;
    if (!map) return;
    try { LYR.forEach(l => { if (map.getLayer(l)) map.removeLayer(l); }); SRC.forEach(s => { if (map.getSource(s)) map.removeSource(s); }); } catch (e) { }
    if (popup) { popup.remove(); popup = null; }
  }
  function applyVis(map) {
    const v = k => k ? "visible" : "none";
    try {
      ["sp-pins", "sp-pins-label"].forEach(l => map.getLayer(l) && map.setLayoutProperty(l, "visibility", v(vis.pins)));
      ["sp-warn-sv", "sp-warn-to"].forEach(l => map.getLayer(l) && map.setLayoutProperty(l, "visibility", v(vis.warn)));
    } catch (e) { }
  }
  async function showLayers(map, date) {
    clearLayers(map);
    const tok = layerToken;
    const [reps, warns] = await Promise.all([reportsFor(date), warningsFor(date)]);
    if (tok !== layerToken || !map) return { reports: reps.length, warnings: warns.length };
    const pins = { type: "FeatureCollection", features: reps.map((r, k) => ({ type: "Feature", id: k, geometry: { type: "Point", coordinates: [r.lon, r.lat] }, properties: { k, type: r.type, size: r.size_in == null ? 0 : r.size_in, label: r.type === "hail" && r.size_in != null ? r.size_in.toFixed(2) + '"' : r.type === "tornado" ? "TOR" : "wind", place: titlePlace(r.place), time: localTime(r.time), source: r.source || "NWS local storm report", wind: r.wind == null ? "" : r.wind + " " + (r.wind_unit || "") } })) };
    const polys = { type: "FeatureCollection", features: warns.map(w => ({ type: "Feature", geometry: { type: "Polygon", coordinates: [w.ring] }, properties: { phenom: w.phenom, sig: w.sig, etn: w.etn, issued: w.issued, expires: w.expires } })) };
    map.addSource("sp-warn", { type: "geojson", data: polys });
    map.addSource("sp-pins", { type: "geojson", data: pins });
    map.addLayer({ id: "sp-warn-sv", type: "line", source: "sp-warn", filter: ["==", ["get", "phenom"], "SV"], layout: { "line-join": "round" }, paint: { "line-color": "#3B3A36", "line-width": 1.4, "line-opacity": 0.85 } });
    map.addLayer({ id: "sp-warn-to", type: "line", source: "sp-warn", filter: ["==", ["get", "phenom"], "TO"], layout: { "line-join": "round" }, paint: { "line-color": "#B3261E", "line-width": 2.6, "line-dasharray": [1.2, 1.6] } });
    map.addLayer({ id: "sp-pins", type: "circle", source: "sp-pins", paint: {
      "circle-radius": ["case", ["==", ["get", "type"], "hail"], ["+", 5, ["*", 3, ["get", "size"]]], 4.5],
      "circle-color": ["case", ["==", ["get", "type"], "hail"], "#1F5FBF", ["==", ["get", "type"], "tornado"], "#B3261E", "#FFFFFF"],
      "circle-stroke-color": ["case", ["==", ["get", "type"], "hail"], "#FFFFFF", "#3B3A36"], "circle-stroke-width": 2, "circle-opacity": 0.95 } });
    map.addLayer({ id: "sp-pins-label", type: "symbol", source: "sp-pins", filter: ["==", ["get", "type"], "hail"], layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"], "text-size": 11, "text-offset": [0, 1.7], "text-allow-overlap": false }, paint: { "text-color": "#14305E", "text-halo-color": "#FFFFFF", "text-halo-width": 1.6 } });
    applyVis(map);
    if (!map.__spWired) {
      map.__spWired = true;
      map.on("click", "sp-pins", e => {
        const f = e.features && e.features[0]; if (!f) return; const p = f.properties;
        const what = p.type === "hail" ? (+p.size).toFixed(2) + " in hail" : p.type === "tornado" ? "Tornado report" : "Wind report" + (p.wind ? ", " + p.wind : "");
        if (popup) popup.remove();
        popup = new maplibregl.Popup({ closeButton: true, offset: 10, maxWidth: "240px" }).setLngLat(f.geometry.coordinates).setHTML(`<div class="pop"><b>${esc(what)}</b><div class="muted" style="margin-top:2px">${esc(p.place)} &middot; ${esc(p.time)} (Central)</div><div class="muted">${esc(p.source)}</div></div>`).addTo(map);
      });
      ["sp-pins"].forEach(l => { map.on("mouseenter", l, () => map.getCanvas().style.cursor = "pointer"); map.on("mouseleave", l, () => map.getCanvas().style.cursor = ""); });
    }
    return { reports: reps.length, warnings: warns.length, tornado: warns.filter(w => w.phenom === "TO").length };
  }
  function setVis(map, kind, on) { vis[kind] = !!on; applyVis(map); }
  function pinAt(map, point) { try { return !!(map.getLayer("sp-pins") && vis.pins && map.queryRenderedFeatures(point, { layers: ["sp-pins"] }).length); } catch (e) { return false; } }
  function legendHtml() {
    return `<div class="sp-legend">
      <label class="sp-tog"><input type="checkbox" id="spPins" ${vis.pins ? "checked" : ""}><svg width="20" height="14" aria-hidden="true"><circle cx="10" cy="7" r="5.5" fill="#1F5FBF" stroke="#fff" stroke-width="2"/></svg><span>NWS reports: blue = hail (inches), white = wind</span></label>
      <label class="sp-tog"><input type="checkbox" id="spWarn" ${vis.warn ? "checked" : ""}><svg width="20" height="14" aria-hidden="true"><line x1="1" y1="7" x2="19" y2="7" stroke="#3B3A36" stroke-width="1.6"/></svg><span>Severe thunderstorm warning (solid line)</span></label>
      <div class="sp-tog sp-sub"><svg width="20" height="14" aria-hidden="true"><line x1="1" y1="7" x2="19" y2="7" stroke="#B3261E" stroke-width="2.8" stroke-dasharray="3 3.5"/></svg><span>Tornado warning (heavy dashed line)</span></div>
      <div class="sp-note" id="spNote"></div></div>`;
  }

  window.Leads = { WHY, loadRegion, scoreHome, recentlyReroofed, houseFacts, cardHtml, imageryOf, nearestReport, stormProof, showLayers, clearLayers, setVis, pinAt, legendHtml, monYear, RECENT_YEAR, loaded };
})();
