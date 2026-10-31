/* Roof Command demo. map.js: shared map, roof<->map round trip, Storm Response filters, house click.
   Moved verbatim from js/app.js (2026-10-02 split), no behaviour change. */
(function () {
  const RC = window.RC;
  const { $, $$, ic, int, esc } = RC;
  const st = RC.st;

  // ---------- F21: Storm Response filters (home type, year built, value, min hail, city, ZIP,
  // customers only). Drives map feature-state (filterOk), the "N of M" count, the hit list CSV and the
  // door-knock route; never touches data/*. "Customers only" has no direct ID linking the sample customer
  // list to the county tax roll, so it is answered by a one-time nearest-point match (<=15m, same pattern
  // as the customer map pin matching used elsewhere) cached per region, not a fabricated join.
  const STFILT = { type: "", yearMin: null, yearMax: null, valMin: null, valMax: null, minHail: null, city: "", zip: "", customersOnly: false };
  RC.STFILT = STFILT;
  function filtersActive() {
    return !!(STFILT.type || STFILT.yearMin || STFILT.yearMax || STFILT.valMin || STFILT.valMax || STFILT.minHail || STFILT.city || STFILT.zip || STFILT.customersOnly);
  }
  RC.filtersActive = filtersActive;
  function ensureFilterMeta(s) { return Promise.all(s.regions.map(rr => RC.loadRegionMeta(RC.REG(rr.id)))); }
  RC.ensureFilterMeta = ensureFilterMeta;
  const customerIdxCache = new Map();
  function customerHomeIndexFor(region) {
    if (customerIdxCache.has(region.id)) return customerIdxCache.get(region.id);
    const R_EARTH = 111320, set = new Set();
    st.DATA.customers.forEach(c => {
      let bestD = Infinity, bestI = -1, coslat = Math.cos(c.lat * Math.PI / 180);
      for (let i = 0; i < region.n; i++) {
        const [lo, la] = RC.decodeLonLat(region, i);
        const d = Math.hypot((la - c.lat) * R_EARTH, (lo - c.lon) * R_EARTH * coslat);
        if (d < bestD) { bestD = d; bestI = i; }
      }
      if (bestD <= 15) set.add(bestI);
    });
    customerIdxCache.set(region.id, set);
    return set;
  }
  RC.customerHomeIndexFor = customerHomeIndexFor;
  // non-hail attribute filters only; hail threshold is handled separately (see applyHailToRegion/hitListFor).
  // type and customers-only can be evaluated immediately (region.type[] is always resident, the customer
  // index only needs decoded lon/lat); year/value/city/ZIP need homes_meta.bin, so they pass through (not
  // exclude) until that region's meta has loaded, same as every other lazy-meta feature in this file.
  function homeMatchesFilters(region, i, custSet, haveMeta) {
    if (STFILT.type !== "" && region.type[i] !== +STFILT.type) return false;
    const needsMeta = STFILT.yearMin || STFILT.yearMax || STFILT.valMin || STFILT.valMax || STFILT.city || STFILT.zip;
    if (needsMeta && haveMeta) {
      const m = RC.regionHomeMeta(region, i);
      if (STFILT.yearMin && (!m.year || m.year < STFILT.yearMin)) return false;
      if (STFILT.yearMax && (!m.year || m.year > STFILT.yearMax)) return false;
      if (STFILT.valMin && (!m.value || m.value < STFILT.valMin)) return false;
      if (STFILT.valMax && (!m.value || m.value > STFILT.valMax)) return false;
      if (STFILT.city && (m.city || "").toLowerCase() !== STFILT.city.toLowerCase()) return false;
      if (STFILT.zip && String(m.zip) !== STFILT.zip) return false;
    }
    if (STFILT.customersOnly && (!custSet || !custSet.has(i))) return false;
    return true;
  }
  RC.homeMatchesFilters = homeMatchesFilters;

  // ---------- shared map ----------
  st.map = null; st.mapReady = null;
  st.MS = { storm: null, replay: null, onlyCustomers: false };
  const NORMAN = RC.NORMAN, DOT_RAMP = RC.DOT_RAMP;
  // ---------- roof <-> map round trip (F18): captured when "Measure roof" is clicked from a house card,
  // consumed once by "Back to map" so the Storm/Overview screen reopens at the exact same camera + house
  // popup instead of re-fitting to the region bounds. lastMapScreen tracks whichever map screen was last
  // entered so "Back to map" from a direct nav-link visit to Roof still has a sane target.
  st.roofReturn = null; st.lastMapScreen = "storm"; st.skipMapFit = false; st.restoreHome = null; st.pendingCamera = null;

  // F17: a reset-view control, one per map, that fits back to a caller-supplied bounds getter (so the
  // Storm map resets to the full county view and the Roof map resets to the current house's footprint).
  class ResetViewControl {
    constructor(onReset) { this._onReset = onReset; } // onReset(map) does the actual fit; caller decides bounds/padding
    onAdd(m) {
      this._map = m;
      this._container = document.createElement("div");
      this._container.className = "maplibregl-ctrl maplibregl-ctrl-group";
      const btn = document.createElement("button");
      btn.type = "button"; btn.title = "Reset view"; btn.setAttribute("aria-label", "Reset view");
      btn.innerHTML = `<svg class="i" style="width:16px;height:16px;margin:auto"><use href="#i-reset"/></svg>`;
      btn.style.display = "flex";
      btn.onclick = () => this._onReset(m);
      this._container.appendChild(btn);
      return this._container;
    }
    onRemove() { this._container.parentNode.removeChild(this._container); this._map = undefined; }
  }
  RC.ResetViewControl = ResetViewControl;
  function initMap() {
    st.map = new maplibregl.Map({
      container: "map", style: "https://tiles.openfreemap.org/styles/positron",
      bounds: NORMAN, fitBoundsOptions: { padding: 20 }, attributionControl: false, minZoom: 3, maxZoom: 18, trackResize: false,
      // explicit (not just defaults) so a future style/option change can't silently drop any of these:
      scrollZoom: true, dragPan: true, doubleClickZoom: true, keyboard: true, touchZoomRotate: true, boxZoom: false, dragRotate: false, pitchWithRotate: false
    });
    const map = st.map;
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "Hail: NOAA MRMS | Homes: county tax rolls | Footprints: Microsoft, Overture Maps | (c) OpenStreetMap contributors | OpenFreeMap" }), "top-right");
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new ResetViewControl(m => m.fitBounds(NORMAN, { padding: 30, duration: 450 })), "top-right");
    map.touchZoomRotate.disableRotation(); // pinch still zooms; two-finger twist won't tilt a flat hail map
    map.scrollZoom.setWheelZoomRate(1 / 600);
    // patch the base style's null-prone filters as early as "styledata" (parsed, before the first tile
    // render) instead of waiting for "load", so the very first paint never evaluates the original filter.
    let filtersPatched = false;
    map.on("styledata", () => {
      if (filtersPatched) return;
      const layers = map.getStyle() && map.getStyle().layers;
      if (!layers) return;
      filtersPatched = true;
      for (const l of layers) { if (l.filter) { try { map.setFilter(l.id, nullSafeFilter(l.filter)); } catch (e) { /* filter shape not editable */ } } }
    });
    st.mapReady = new Promise(res => map.on("load", () => { styleBase(); addLayers().then(res); }));
    new ResizeObserver(() => { if ($("#map").clientWidth < 50) return; map.resize(); if (st.pendingFit && $("#map").clientWidth > 50) { map.fitBounds(st.pendingFit[0], { padding: st.pendingFit[1], duration: 0 }); st.pendingFit = null; } }).observe($("#map"));
    collapseAttrib($("#map"));
  }
  RC.initMap = initMap;
  // the base positron style ships a few filters like ["<=", ["get", "ref_length"], 6] that read a
  // vector-tile property missing (null) on features with no highway ref/admin_level/rank; maplibre
  // warns "Expected value to be of type number, but found null instead." on every such feature. Coalesce
  // a safe fallback so the comparison still resolves the same way (feature just never matches) without
  // ever handing a null to a numeric comparison.
  function nullSafeFilter(f) {
    if (!Array.isArray(f)) return f;
    const op = f[0];
    if ((op === "<=" || op === "<" || op === ">=" || op === ">") && Array.isArray(f[1]) && f[1][0] === "get" && typeof f[2] === "number") {
      const fallback = (op === "<=" || op === "<") ? f[2] + 1 : f[2] - 1;
      return [op, ["coalesce", f[1], fallback], f[2]];
    }
    return f.map(nullSafeFilter);
  }
  function styleBase() {
    const map = st.map;
    for (const l of map.getStyle().layers) {
      const id = l.id;
      try {
        if (l.type === "background") map.setPaintProperty(id, "background-color", "#F2EEE7");
        else if (l.type === "fill" && /water/.test(id)) map.setPaintProperty(id, "fill-color", "#D8E1E3");
        else if (l.type === "fill" && /park|wood|grass|landcover|landuse/.test(id)) map.setPaintProperty(id, "fill-color", "#E9E7DC");
        else if (l.type === "fill" && /building/.test(id)) { map.setPaintProperty(id, "fill-color", "#E6E0D5"); }
        else if (l.type === "line" && /water|river/.test(id)) map.setPaintProperty(id, "line-color", "#CBD7DA");
        else if (l.type === "symbol") { map.setPaintProperty(id, "text-color", "#857F75"); map.setPaintProperty(id, "text-halo-color", "#F5F2EC"); }
      } catch (e) { /* layer may not support the property */ }
    }
  }
  let firstSymbol, firstHomeLayer;
  // one source+layer per region (each region's homes stay a separate MapLibre source so adding a new
  // region to data/regions.json is cheap: no rebuild of other regions' data). Per-home hail color comes
  // from feature-state (set by applyHailToRegion), not baked into the GeoJSON, so switching storms never
  // re-sends the whole points payload, only a sparse set of feature-state writes for homes in that storm.
  function buildRegionFC(region) {
    const feats = new Array(region.n);
    for (let i = 0; i < region.n; i++) {
      const c = RC.decodeLonLat(region, i);
      feats[i] = { type: "Feature", id: i, geometry: { type: "Point", coordinates: c }, properties: { t: region.type[i] } };
    }
    return { type: "FeatureCollection", features: feats };
  }
  async function addLayers() {
    const map = st.map;
    firstSymbol = map.getStyle().layers.find(l => l.type === "symbol")?.id;
    st.REGIONS.forEach((region, idx) => {
      const layerId = "homes-" + region.id, heatId = layerId + "-heat";
      if (idx === 0) firstHomeLayer = layerId;
      map.addSource(layerId, { type: "geojson", data: buildRegionFC(region), buffer: 0, tolerance: 0 });
      // F17: low-zoom aggregate so 100k+ points never paint individually below z12 (heavy at low zoom,
      // not meaningfully readable as dots anyway); circles take over from z11.5 with a half-zoom crossfade.
      map.addLayer({ id: layerId, type: "circle", source: layerId, paint: regionPaint() }, firstSymbol);
      map.on("click", layerId, e => { if (map.queryRenderedFeatures(e.point, { layers: ["cust"] }).length) return; RC.homePopup(region, e.features[0].id, e.lngLat); });
      map.on("mouseenter", layerId, () => map.getCanvas().style.cursor = "pointer");
      map.on("mouseleave", layerId, () => map.getCanvas().style.cursor = "");
    });
    const cust = { type: "FeatureCollection", features: st.DATA.customers.map(c => ({ type: "Feature", geometry: { type: "Point", coordinates: [c.lon, c.lat] }, properties: { id: c.id } })) };
    map.addSource("cust", { type: "geojson", data: cust });
    map.addLayer({ id: "cust", type: "circle", source: "cust", paint: custPaint() });
    map.on("click", "cust", e => RC.custPopup(e.features[0].properties.id, e.lngLat));
    map.on("mouseenter", "cust", () => map.getCanvas().style.cursor = "pointer");
    map.on("mouseleave", "cust", () => map.getCanvas().style.cursor = "");
    await setStorm(st.MS.storm);
  }
  // weight: homes hit by the selected storm count by their hail size; everything else contributes a small
  // flat weight so the heatmap still reads as "this is where the buildings are" below the storm's own glow
  function heatPaint() {
    return {
      "heatmap-weight": ["case", ["==", ["boolean", ["feature-state", "filterOk"], true], false], 0,
        ["case", ["boolean", ["feature-state", "hit"], false], ["interpolate", ["linear"], ["coalesce", ["feature-state", "hailv"], 0], 0.75, 0.45, 2.5, 1], 0.04]],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 8, 0.35, 12, 0.9],
      "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.2, "rgba(242,238,231,0.6)", 0.45, "rgba(240,180,90,0.75)", 0.7, "rgba(226,120,70,0.85)", 1, "rgba(180,70,90,0.9)"],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 8, 5, 12, 14],
      "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.45, 11.5, 0.6, 12.5, 0]
    };
  }
  function regionPaint() {
    return {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 0.5, 10, 0.9, 12, 1.6, 14, 3, 16, 5.5, 17.5, 8],
      "circle-color": ["case", ["boolean", ["feature-state", "hit"], false], ["interpolate", ["linear"], ["coalesce", ["feature-state", "hailv"], 0], ...DOT_RAMP], "#A39C90"],
      "circle-opacity": ["case", ["==", ["boolean", ["feature-state", "filterOk"], true], false], 0.06,
        ["boolean", ["feature-state", "hit"], false], 0.95, 0.45],
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 13, 0, 15, 0.8],
      "circle-stroke-color": "rgba(255,255,255,.85)"
    };
  }
  function custPaint() {
    return {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 1.8, 12, 2.4, 14, 4, 16, 7],
      "circle-color": "#FFFFFF",
      "circle-stroke-color": RC.B.accent,
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 1.1, 13, 1.6, 15, 2.4],
      "circle-opacity": 1
    };
  }
  // writes feature-state for homes that hit hail this storm (hit/hailv, gated by the min-hail filter if
  // set) plus filterOk for the non-hail Storm Response filters (F21); returns a residential match count
  // for the panel's "N of M homes match" line. Touches every feature in the region once per storm pick,
  // not every frame, so it stays cheap even at 100k+ points.
  function applyHailToRegion(region, date) {
    const map = st.map;
    const layerId = "homes-" + region.id;
    if (!map.getLayer(layerId)) return 0;
    map.removeFeatureState({ source: layerId });
    const bytes = region.hailCache[date];
    if (!bytes) return 0;
    const active = filtersActive();
    const haveMeta = !!region.metaView;
    const thr = STFILT.minHail != null ? Math.round(STFILT.minHail * 100) : 75;
    const custSet = STFILT.customersOnly ? customerHomeIndexFor(region) : null;
    let matched = 0;
    for (let i = 0; i < region.n; i++) {
      const v = bytes[i];
      if (v >= 75) map.setFeatureState({ source: layerId, id: i }, { hit: true, hailv: v / 100 });
      if (active) {
        const ok = homeMatchesFilters(region, i, custSet, haveMeta);
        if (!ok) map.setFeatureState({ source: layerId, id: i }, { filterOk: false });
        if (ok && v >= thr && region.type[i] <= 4) matched++;
      }
    }
    return matched;
  }
  RC.applyHailToRegion = applyHailToRegion;
  // one image source per swath file, shown by opacity: no in-flight image swaps, no aborted loads
  const swathIds = {};
  function ensureSwathLayer(url, coordinates) {
    const map = st.map;
    let id = swathIds[url];
    if (!id) {
      id = swathIds[url] = "sw" + Object.keys(swathIds).length;
      map.addSource(id, { type: "image", url, coordinates });
      map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": 0, "raster-opacity-transition": { duration: 250 }, "raster-resampling": "linear", "raster-fade-duration": 0 } }, firstHomeLayer);
    }
    return id;
  }
  function showSwaths(list) {
    const map = st.map;
    const activeIds = list.map(x => ensureSwathLayer(x.url, x.bounds));
    Object.values(swathIds).forEach(id => map.setPaintProperty(id, "raster-opacity", activeIds.includes(id) ? 0.55 : 0));
  }
  // fetches only the storms actually selected (one hail/<date>.bin per contributing region), never
  // every storm on file; returns a promise so callers that need the map painted can await it, but the
  // storm panel's own KPI numbers come straight from catalog.json and never wait on this
  async function setStorm(date) {
    st.MS.storm = date; st.MS.replay = null;
    const s = st.DATA.byDate[date];
    if (!s) return;
    await RC.ensureStormLoaded(date);
    if (st.MS.storm !== date) return; // superseded by a newer selection while this was loading
    showSwaths(s.regions.map(rr => ({ url: RC.REG(rr.id).path + rr.swath, bounds: rr.bounds })));
    let matched = 0;
    st.REGIONS.forEach(r => { matched += applyHailToRegion(r, date); });
    st.MS.filterMatch = matched;
    if (st.current === "storm") RC.renderFilterCount(s);
  }
  RC.setStorm = setStorm;
  // called after setStorm repaints the map (new storm, or filters changed) and whenever the filters bar
  // changes; keeps the "N of M homes match" line and the door-knock/CSV button counts in sync with the
  // active filters without re-rendering the whole panel (avoids losing input focus while typing a filter)
  function renderFilterCount(s) {
    const el = $("#filtMatch");
    if (!el) return;
    if (!filtersActive()) { el.textContent = ""; return; }
    const metaReady = s.regions.every(rr => RC.REG(rr.id).metaView);
    el.textContent = metaReady ? `${int(st.MS.filterMatch)} of ${int(s.homes_075)} homes match these filters` : "Loading filtered homes...";
    const ck = $("#canvass");
    if (ck && metaReady) {
      const n = RC.hitListFor(s).length;
      ck.innerHTML = `${ic("house")}Door-knock route, ${int(n)} homes`;
      ck.disabled = !n;
    }
  }
  RC.renderFilterCount = renderFilterCount;
  function setCustomerFilter(ids) {
    const map = st.map;
    if (!map.getLayer("cust")) return;
    map.setFilter("cust", ids ? ["in", ["get", "id"], ["literal", ids]] : null);
  }
  RC.setCustomerFilter = setCustomerFilter;
  st.pendingFit = null;
  function placeMap(slot, bounds, pad = 30) {
    slot.appendChild($("#mapwrap"));
    // skipMapFit (set by backToMap) means this entry is a round trip back from Roof Measure: the map
    // already sits at the exact camera it had when "Measure roof" was clicked, so never re-fit it here.
    st.pendingFit = (bounds && !st.skipMapFit) ? [bounds, pad] : null;
    requestAnimationFrame(() => {
      const map = st.map;
      if ($("#map").clientWidth > 50) map.resize();
      if (st.pendingFit && $("#map").clientWidth > 50) { map.fitBounds(st.pendingFit[0], { padding: st.pendingFit[1], duration: 0 }); st.pendingFit = null; }
      else if (st.pendingCamera && $("#map").clientWidth > 50) { map.jumpTo(st.pendingCamera); st.pendingCamera = null; }
      if (st.skipMapFit) st.skipMapFit = false;
      if (st.restoreHome) { const rh = st.restoreHome; st.restoreHome = null; setTimeout(() => RC.homePopup(RC.REG(rh.regionId), rh.homeId, { lng: rh.lng, lat: rh.lat }), 0); }
    });
  }
  RC.placeMap = placeMap;
  function collapseAttrib(root) {
    const t = setInterval(() => { const a = root.querySelector(".maplibregl-ctrl-attrib"); if (a) { a.classList.remove("maplibregl-compact-show"); a.removeAttribute("open"); clearInterval(t); } }, 200);
    setTimeout(() => clearInterval(t), 8000);
  }
  RC.collapseAttrib = collapseAttrib;
})();
