/* Roof Command demo. Real: hail swaths (NOAA MRMS MESH), home points (Cleveland County roll),
   roof footprint (OpenStreetMap). Sample: everything about the business (see js/sample.js). */
(function () {
  const B = window.BRAND, S = window.SAMPLE;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ic = (n, cls = "i") => `<svg class="${cls}"><use href="#i-${n}"/></svg>`;
  const money = (v, d = 0) => "$" + Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const int = v => Number(v).toLocaleString("en-US");
  const moneyShort = v => v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : v >= 1e4 ? "$" + Math.round(v / 1e3) + "K" : money(v);
  const fmtDate = (d, o = { month: "short", day: "numeric" }) => new Date(d + (d.length === 10 ? "T12:00:00" : "")).toLocaleDateString("en-US", o);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fill = s => s.replace(/\{company\}/g, B.company);

  // ---------- brand ----------
  function applyBrand() {
    const r = document.documentElement.style;
    r.setProperty("--accent", B.accent);
    const hex = B.accent.replace("#", "");
    const [rr, gg, bb] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
    const mix = (c, w, t) => Math.round(c * (1 - t) + w * t);
    r.setProperty("--accent-soft", B.accentSoft || `rgb(${mix(rr, 250, .86)},${mix(gg, 246, .86)},${mix(bb, 240, .86)})`);
    r.setProperty("--accent-ink", `rgb(${mix(rr, 20, .25)},${mix(gg, 15, .25)},${mix(bb, 10, .25)})`);
    const vals = { ...B, ownerInitial: B.owner[0] };
    $$("[data-b]").forEach(el => el.textContent = vals[el.dataset.b]);
    document.title = `${B.company} | Command`;
    $$(".logo").forEach(el => { el.style.backgroundImage = B.logoUrl ? `url("${B.logoUrl}")` : ""; el.style.backgroundSize = "cover"; el.style.backgroundPosition = "center"; if (B.logoUrl) el.textContent = ""; });
  }
  window.RC_applyBrand = applyBrand;

  // ---------- routes ----------
  const ROUTES = [
    { id: "overview", label: "Overview", icon: "home", title: () => greeting(), sub: () => new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) },
    { id: "storm", label: "Storm Response", icon: "hail", title: () => "Storm Response", sub: () => "Real radar hail over the county" },
    { id: "roof", label: "Roof Measure", icon: "ruler", title: () => "Roof Measure + Proposal", sub: () => "Measured from aerial imagery and the building footprint" },
    ...(window.RCDaily ? [{ id: "today", label: "Today", icon: "phone", title: () => "Today", sub: () => "Your Daily 50: call and text, one at a time" }] : []),
    ...(window.RCInbox && window.RCInbox.signedIn() ? [{ id: "leads", label: "Leads", icon: "users", title: () => "Leads", sub: () => "Homeowners who asked for a free roof inspection" }] : []),
    ...(window.RCRoi && (window.RC_DEMO || (window.RCInbox && window.RCInbox.signedIn())) ? [{ id: "results", label: "Results", icon: "chart", title: () => "Results", sub: () => "Is the service paying for itself" }] : []),
    ...(window.RCSeo && (window.RC_DEMO || (window.RCInbox && window.RCInbox.signedIn())) ? [{ id: "seo", label: "SEO results", icon: "search", title: () => "SEO results", sub: () => "How people find you on Google" }] : []),
    { id: "ask", label: "Ask", icon: "sparkle", title: () => "Ask", sub: () => "Questions answered from your own data" }
  ];
  function greeting() {
    const h = new Date().getHours();
    return `Good ${h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"}, ${B.owner}`;
  }
  function buildNav() {
    $("#nav").innerHTML = `<div class="nav-label">Workspace</div>` + ROUTES.map(r => `<a href="#${r.id}" data-r="${r.id}">${ic(r.icon)}${r.label}</a>`).join("") + `<a href="#storm" data-knock="1">${ic("house")}Knock</a>`;
    $("#nav [data-knock]").addEventListener("click", () => setTimeout(() => window.__knockCurrent && window.__knockCurrent(), 60));
    $("#dock").innerHTML = ROUTES.map((r, i) => (i === ROUTES.length - 1 ? `<span class="sepv"></span>` : "") + `<a href="#${r.id}" data-r="${r.id}" aria-label="${r.label}">${ic(r.icon)}<span class="tip">${r.label}</span></a>`).join("") + `<a href="#storm" data-knock="1" aria-label="Knock">${ic("house")}<span class="tip">Knock</span></a>`;
    $("#dock [data-knock]").addEventListener("click", () => setTimeout(() => window.__knockCurrent && window.__knockCurrent(), 60));
  }

  let DATA = null, current = null;
  const built = {};

  // ---------- per-house roof measurement (2026-10-02 rebuild: every home gets ITS OWN footprint/
  // numbers, looked up index-for-index in data/county_roofs/<region>/measure.bin, which is built in the
  // exact same row order as that region's own homes.bin. No more fixed sample house, no more 3-house
  // switcher: "Measure roof" on any house card loads that house, or says honestly it has no footprint
  // on file. measure.bin is a compact parallel-array file (11 bytes/home, 0 = no footprint); the actual
  // polygon ring only lives in a small per-tile geom file, lazy-fetched once per tile and cached. See
  // data/county_roofs/README.md for the exact byte layout. ----------
  const roofMeasureCache = {}, roofTilesCache = {}, roofGeomCache = {};
  // true when a roof data file failed to load for a reason other than "not built yet" (404): shown as a retryable error, never as "no footprint on file"
  let roofNetFail = false;
  function ensureRoofMeasure(region) {
    const key = region.id;
    if (roofMeasureCache[key]) return roofMeasureCache[key];
    roofMeasureCache[key] = fetch(`data/county_roofs/${key}/measure.bin`).then(r => { if (!r.ok) { if (r.status !== 404) roofNetFail = true; throw 0; } return r.arrayBuffer(); })
      .then(buf => {
        const n = region.n;
        const foot = new Uint16Array(buf, 0, n);
        const perim = new Uint16Array(buf, 2 * n, n);
        const roofq = new Uint16Array(buf, 4 * n, n);
        const sq10 = new Uint16Array(buf, 6 * n, n);
        const tileId = new Uint16Array(buf, 8 * n, n);
        const cplx = new Uint8Array(buf, 10 * n, n);
        return { foot, perim, roofq, sq10, cplx, tileId };
      }).catch(e => { if (e !== 0) roofNetFail = true; if (roofNetFail) delete roofMeasureCache[key]; return null; }); // 404 = region has no footprint layer built yet; any other failure is retried next time
    return roofMeasureCache[key];
  }
  function ensureRoofTiles(region) {
    const key = region.id;
    if (roofTilesCache[key]) return roofTilesCache[key];
    roofTilesCache[key] = fetch(`data/county_roofs/${key}/tiles.json`).then(r => { if (!r.ok) { if (r.status !== 404) { roofNetFail = true; delete roofTilesCache[key]; } return []; } return r.json(); }).catch(() => { roofNetFail = true; delete roofTilesCache[key]; return []; });
    return roofTilesCache[key];
  }
  function fetchRoofGeomTile(region, file) {
    const key = region.id + "/" + file;
    if (roofGeomCache[key]) return roofGeomCache[key];
    roofGeomCache[key] = fetch(`data/county_roofs/${region.id}/geom/${file}`).then(r => { if (!r.ok) { if (r.status !== 404) { roofNetFail = true; delete roofGeomCache[key]; } return []; } return r.json(); }).catch(() => { roofNetFail = true; delete roofGeomCache[key]; return []; });
    return roofGeomCache[key];
  }
  // Measured pitch (3DEP lidar 2018, scripts/build_pitch.py): one small JSON per geom tile, [pitch/12, confidence, planes] by home id.
  const roofPitchCache = {}, roofPitchIndex = {};
  // pitch/index.json lists the tiles that exist; no request at all unless the region catalog says homes.pitch === true (else the 400/404 hit the console on every roof)
  function fetchPitchIndex(region) {
    let missed = false; try { missed = sessionStorage.getItem("rc.nopitch." + region.id) === "1"; } catch (e) { }
    if (!roofPitchIndex[region.id]) roofPitchIndex[region.id] = (missed || !(region.catalog.homes && region.catalog.homes.pitch === true) ? Promise.resolve(null) : fetch(`data/county_roofs/${region.id}/pitch/index.json`).then(r => r.ok ? r.json() : null)).then(j => { if (!j) { try { sessionStorage.setItem("rc.nopitch." + region.id, "1"); } catch (e) { } } const a = Array.isArray(j) ? j : j && (j.tiles || j.files); return Array.isArray(a) ? new Set(a) : null; }).catch(() => null);
    return roofPitchIndex[region.id];
  }
  function fetchRoofPitchTile(region, file) {
    const key = region.id + "/" + file;
    if (!roofPitchCache[key]) roofPitchCache[key] = fetchPitchIndex(region).then(set => set && set.has(file) ? fetch(`data/county_roofs/${region.id}/pitch/${file}`).then(r => r.ok ? r.json() : null).catch(() => null) : null);
    return roofPitchCache[key];
  }
  // Returns null if this exact home has no building footprint on file (honest "no match" case, never
  // substitutes another home's numbers). Otherwise a plain object with THIS home's own ring + measurements.
  // ---- outlines drawn / confirmed by the roofer (js/draw.js): kept in localStorage per region + home index,
  // used instead of the county outline whenever present. source:"drawn" labels them everywhere.
  const drawnKey = (region, id) => "rc_drawn:" + region.id + ":" + id;
  function readDrawn(region, id) { try { const v = JSON.parse(localStorage.getItem(drawnKey(region, id)) || "null"); return v && Array.isArray(v.pts) && v.pts.length >= 3 ? v : null; } catch (e) { return null; } }
  function writeDrawn(region, id, pts, via) { try { localStorage.setItem(drawnKey(region, id), JSON.stringify({ pts, via: via || "hand", t: Date.now() })); return true; } catch (e) { return false; } }
  function eraseDrawn(region, id) { try { localStorage.removeItem(drawnKey(region, id)); } catch (e) { } }
  const srcLabel = R => R && R.source === "drawn" ? (R.drawnVia === "parcel" ? "Outline matched by parcel boundary, confirmed by you" : "Outline drawn by you") : "";
  // data/county_roofs/<region>/no_structure.json = homes with no building found on their parcel; the parcel-match
  // plan (suggested outlines) is a lazy dry-run file, never written by the app. Only regions that ship them are fetched.
  const NO_STRUCT_REGIONS = { mcclain: "data/county_roofs/mcclain/no_structure.json" };
  const PARCEL_PLAN_REGIONS = { mcclain: "data/county_roofs/mcclain/parcel_plan.json" };
  const lazyJson = {};
  function lazyFetch(url) { return lazyJson[url] || (lazyJson[url] = fetch(url).then(r => r.ok ? r.json() : null).catch(() => null)); }
  async function isNoStructure(region, id) { const u = NO_STRUCT_REGIONS[region.id]; if (!u) return false; const j = await lazyFetch(u); if (!j) return false; if (!j._set) j._set = new Set(j); return j._set.has(id); }
  async function parcelSuggestion(region, id) {
    const u = PARCEL_PLAN_REGIONS[region.id]; if (!u) return null; const j = await lazyFetch(u); const e = j && j.new && j.new[id];
    return e && e[3] && e[3].length >= 3 ? { ring: e[3], low: !!e[2], src: e[1] } : null;
  }
  async function drawnToRoof(region, id, pts, via) {
    await loadRegionMeta(region);
    const meta = regionHomeMeta(region, id);
    const ring = pts.map(p => [p[0], p[1]]); ring.push(ring[0]);
    const lons = pts.map(p => p[0]), lats = pts.map(p => p[1]);
    const center = [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
    const sq = Math.round(window.RoofDraw.areaSqft(pts)), per = Math.round(window.RoofDraw.perimeterFt(pts));
    return {
      regionId: region.id, homeId: id, footprint: ring, center, source: "drawn", drawnVia: via || "hand",
      footprint_sqft: sq, perimeter_ft: per, roof_sqft: Math.round(sq * 1.118), squares: Math.round(sq * 1.118) / 100, complexity: null, dist_m: null,
      measuredPitch: null, pitch: "6/12", pitch_factor: 1.118, street: streetOf(meta.addr || "") || meta.city || "Address not on county record", addr: meta.addr, city: meta.city
    };
  }
  async function loadRoofForHome(region, id) {
    roofNetFail = false;
    const dr = readDrawn(region, id);
    if (dr && window.RoofDraw) return drawnToRoof(region, id, dr.pts, dr.via);
    const m = await ensureRoofMeasure(region);
    if (!m || !m.foot[id]) return null;
    const tiles = await ensureRoofTiles(region);
    const tmeta = tiles[m.tileId[id]];
    if (!tmeta) return null;
    const items = await fetchRoofGeomTile(region, tmeta.file);
    const entry = items.find(e => e.i === id);
    if (!entry) return null;
    const pt = await fetchRoofPitchTile(region, tmeta.file), mp = pt && pt.h && pt.h[id];
    const ring = entry.ring.slice();
    const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring : ring.concat([ring[0]]);
    const lons = ring.map(p => p[0]), lats = ring.map(p => p[1]);
    const center = [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
    await loadRegionMeta(region);
    const meta = regionHomeMeta(region, id);
    return {
      regionId: region.id, homeId: id, footprint: closed, center,
      footprint_sqft: entry.sqft, perimeter_ft: entry.perimeter_ft, roof_sqft: entry.roof_sqft,
      squares: entry.squares_est, complexity: entry.complexity, dist_m: entry.dist_m, checkOutline: !!entry.check,
      measuredPitch: mp ? { p: mp[0], conf: mp[1] } : null, // LiDAR 2018, rise/12 (undefined/null = none on file)
      pitch: "6/12", pitch_factor: 1.118, street: streetOf(meta.addr || "") || meta.city || "Address not on county record",
      addr: meta.addr, city: meta.city
    };
  }
  function route() {
    const id = (location.hash || "#overview").slice(1).split("?")[0];
    const r = ROUTES.find(x => x.id === id) || ROUTES[0];
    current = r.id;
    if (r.id !== "roof" && window.Roof3D) window.Roof3D.suspend(); // free the 3D roof's GPU memory when leaving the screen
    $$("[data-r]").forEach(a => a.classList.toggle("on", a.dataset.r === r.id));
    if (map && !["overview", "storm", "ask"].includes(r.id)) $("#mapPark").appendChild($("#mapwrap")); // keep the map sized while hidden
    $$(".screen").forEach(s => s.classList.toggle("on", s.id === "s-" + r.id));
    $("#title").textContent = r.title(); $("#subtitle").textContent = r.sub();
    if (!DATA && !["today", "results", "seo"].includes(r.id)) return; // these screens show their own honest state without map data
    { const hs = hashStorm(); if (hs && r.id === "storm") explicitStorm = hs; }
    if (!built[r.id]) { SCREENS[r.id](); built[r.id] = true; }
    ENTER[r.id] && ENTER[r.id]();
  }

  // ---------- regions (data/regions.json manifest: each region is its own catalog.json + homes.bin,
  // loaded eagerly; homes_meta.bin/streets.json stay lazy per region; per-storm hail/<date>.bin is
  // fetched only for the storm actually selected, cached forever after). A region that 404s (not built
  // yet) is skipped quietly so new counties can be added to regions.json with no code change. ----------
  // regions without parcel-use data (Oklahoma County) store every home as type 0: call it Residential, not Single-family
  function typeLabelFor(region, t) { return t === 0 && region && region.catalog && region.catalog.homes && (region.catalog.homes.type_known === false || region.catalog.homes.footprint_only === true) ? "Residential" : (TYPE_LABELS[t] || "Building"); }
  const TYPE_LABELS = ["Single-family home", "Duplex", "Townhome", "Condo", "Mobile home", "Multifamily", "Commercial building", "Industrial building", "Institutional building", "Agricultural building", "Other building"];
  let REGIONS = [];
  const REG = id => REGIONS.find(r => r.id === id);
  function decodeLonLat(region, i) {
    const b = region.box;
    return [b.lon_min + region.lonq[i] / 65535 * (b.lon_max - b.lon_min), b.lat_min + region.latq[i] / 65535 * (b.lat_max - b.lat_min)];
  }
  async function loadOneRegion(m) {
    try {
      const [catalog, cities] = await Promise.all([
        fetch(m.path + "catalog.json").then(r => { if (!r.ok) throw 0; return r.json(); }),
        fetch(m.path + "cities.json").then(r => r.ok ? r.json() : []).catch(() => [])
      ]);
      const n = catalog.homes.count, box = catalog.box;
      const byDate = Object.fromEntries(catalog.storms.map(s => [s.date, s]));
      // homes.bin (lonq/latq/type) is NOT downloaded here: ensureBin(region) pulls it on demand (region in view,
      // storm hit list, meta, filters) so first paint only waits on the small catalogs.
      return { id: m.id, name: m.name, path: m.path, catalog, n, box, lonq: null, latq: null, type: null, binPromise: null, cities, byDate, hailCache: {}, hailPromise: {}, metaPromise: null, metaView: null, streets: null, owners: null, ownersPromise: null };
    } catch (e) { return null; } // not built yet, skip quietly
  }
  function ensureBin(region) {
    if (!region.binPromise) region.binPromise = (window.RC_BIN ? RC_BIN(region.path + "homes.bin", RC_VER(region.catalog, null)) : fetch(region.path + "homes.bin").then(r => { if (!r.ok) throw new Error("homes.bin " + r.status); return r.arrayBuffer(); })).then(bin => {
      const n = region.n; let o = 0;
      region.lonq = new Uint16Array(bin.slice(o, o + 2 * n)); o += 2 * n;
      region.latq = new Uint16Array(bin.slice(o, o + 2 * n)); o += 2 * n;
      region.type = new Uint8Array(bin, o, n);
      return region;
    }).catch(err => { region.binPromise = null; region.fcLoaded = false; if (!region.binWarned) { region.binWarned = true; console.warn("homes.bin failed for " + region.id + ", will retry on next pan", err); try { dataNotice("homes", region.name); } catch (e2) { } } throw err; });
    return region.binPromise;
  }
  async function loadRegions() {
    let manifest = await fetch("data/regions.json").then(r => r.ok ? r.json() : []).catch(() => []);
    // ?regions=test adds footprint-only counties that are not in regions.json yet (local test only, nothing is written)
    if (/[?&]regions=test/.test(location.search) && !manifest.some(m => m.id === "logan")) manifest.push({ id: "logan", name: "Logan County (footprint-only)", path: "data/fp/logan/" });
    if (window.RC_PLAN) manifest = RC_PLAN.filterManifest(manifest); // plan: only the counties this company pays for (plan.js)
    const results = await Promise.all(manifest.map(loadOneRegion));
    return results.filter(Boolean);
  }
  // combine every region's catalog into one newest-first storm list keyed by date; a storm present in
  // more than one region's catalog has its residential counts summed and both regions' swaths kept
  const SEV_LABELS = ["0.75 to 0.99 in", "1.00 to 1.24 in", "1.25 to 1.49 in", "1.50 to 1.99 in", "2.00 in and up"];
  function buildCombinedCatalog(regions) {
    const byDate = {};
    regions.forEach(rg => rg.catalog.storms.forEach(s => {
      let c = byDate[s.date];
      if (!c) c = byDate[s.date] = { date: s.date, label: fmtDate(s.date, { month: "short", day: "numeric", year: "numeric" }), max_in: 0, homes_075: 0, homes_1in: 0, homes_150: 0, homes_2in: 0, bldgs_1in_nonres: 0, frames: [], severity: SEV_LABELS.map(l => ({ label: l, homes: 0 })), regions: [] };
      c.max_in = Math.max(c.max_in, s.max_in);
      c.homes_075 += s.homes_075 || 0; c.homes_1in += s.homes_1in || 0; c.homes_150 += s.homes_150 || 0; c.homes_2in += s.homes_2in || 0;
      c.bldgs_1in_nonres += s.bldgs_1in_nonres || 0;
      (s.severity || []).forEach((sv, i) => { if (c.severity[i]) c.severity[i].homes += sv.homes || 0; });
      c.regions.push({ id: rg.id, swath: s.swath, hail: s.hail, bounds: s.bounds });
    }));
    return Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
  }
  // hide storms that show 0 homes (the "homes" count these lists actually display is homes_1in; a
  // storm with 0 of those reads as a dead, pointless row even if it grazed something smaller)
  function recentStorms(catalog) {
    const hit = catalog.filter(s => s.homes_1in > 0);
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 24);
    const recent = hit.filter(s => new Date(s.date + "T12:00:00") >= cutoff);
    return recent.length >= 4 ? recent : hit.slice(0, 4);
  }
  function pickDefaultStorm(catalog) { return (catalog.find(s => s.homes_1in >= 100) || catalog.find(s => s.homes_075 > 0) || catalog[0]).date; }
  // Overview's mini map always shows the single most recent REAL storm (hit >=1 home), independent of
  // Storm Response's own "newest with >=100 homes" default picked below.
  function latestRealStorm(catalog) { return catalog.find(s => s.homes_075 > 0) || catalog[0]; }
  // Only an explicit user pick (a chip, a catalog row, a Recent-storms row) should override Storm
  // Response's own default; Overview repainting its own mini map must not silently hijack that choice.
  let explicitStorm = null;
  function fetchHail(region, date) {
    if (region.hailCache[date] !== undefined) return Promise.resolve(region.hailCache[date]);
    const st = region.byDate[date];
    if (!st) { region.hailCache[date] = null; return Promise.resolve(null); }
    if (!region.hailPromise[date]) region.hailPromise[date] = (window.RC_BIN ? RC_BIN(region.path + st.hail, RC_VER(null, st)).catch(() => null) : fetch(region.path + st.hail).then(r => r.ok ? r.arrayBuffer() : null)).then(buf => { const arr = buf ? new Uint8Array(buf) : null; if (!arr) dataNotice("hail"); region.hailCache[date] = arr; return arr; });
    return region.hailPromise[date];
  }
  function ensureStormLoaded(date, activeOnly) {
    const st = DATA.byDate[date]; if (!st) return Promise.resolve();
    return Promise.all(st.regions.filter(rr => !activeOnly || REG(rr.id).fcLoaded).map(rr => Promise.all([ensureBin(REG(rr.id)), fetchHail(REG(rr.id), date)])));
  }
  function loadRegionMeta(region) {
    if (!region.metaPromise) region.metaPromise = Promise.all([
      ensureBin(region),
      fetch(region.path + "streets.json").then(r => r.json()),
      fetch(region.path + "homes_meta.bin").then(r => r.arrayBuffer())
    ]).then(([, streets, buf]) => { region.streets = streets; region.metaView = new DataView(buf); });
    return region.metaPromise;
  }
  // Homeowner names (private, from the public county tax roll, see data/private/README.md).
  // Lazy-loaded per region on first house-card open, cached forever after; a region with no
  // data/private/<id>.json (404) just leaves owner info hidden, never a broken fetch.
  const OWNER_FILE_REGIONS = new Set(["cleveland", "mcclain", "canadian"]); // data/private/<id>.json exists for these only
  function loadRegionOwners(region) {
    if (region.ownersPromise) return region.ownersPromise;
    // only regions that actually ship an owner file are fetched; the rest resolve to null with no request (no 404 in the console)
    if (!OWNER_FILE_REGIONS.has(region.id) || (window.RC_OWNERS_OK && !window.RC_OWNERS_OK())) { region.owners = null; return (region.ownersPromise = Promise.resolve(null)); }
    region.ownersPromise = fetch(`data/private/${region.id}.json`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { region.owners = d; return d; })
      .catch(() => { region.owners = null; return null; });
    return region.ownersPromise;
  }
  // Cloud owner names (signed-in company with owners_enabled): one row per house card, fetched on demand, never bulk, never cached to disk.
  function cloudOwners() { return !!(window.RC_AUTH && RC_AUTH.ownersCloud && RC_AUTH.ownersCloud()); }
  function loadHomeOwner(region, i) {
    if (!cloudOwners()) return Promise.resolve(null);
    const c = region.ownerRows || (region.ownerRows = {});
    if (c[i] !== undefined) return Promise.resolve(c[i]);
    return RC_AUTH.ownerRows(region.id, [i]).then(m => (c[i] = m[i] || null));
  }
  function regionOwnerInfo(region, i) {
    if (cloudOwners()) { const n = region.ownerRows && region.ownerRows[i]; return n ? { name: n, ownerOccupied: false } : null; }
    const o = region.owners;
    if (!o || !o.names || (window.RC_OWNERS_OK && !window.RC_OWNERS_OK())) return null;
    const name = o.names[i];
    if (!name) return null;
    return { name, ownerOccupied: !!(o.homestead && o.homestead[i]) };
  }
  // one shared address formatter: drops a trailing city, collapses spaces, "SW 28th St" casing
  function fmtAddress(addr, city) {
    let a = String(addr || "").replace(/\s+/g, " ").trim(), c = String(city || "").trim();
    if (c && a.toLowerCase().endsWith(" " + c.toLowerCase())) a = a.slice(0, -c.length - 1).trim();
    return a.split(" ").map(w => {
      if (/^\d+(st|nd|rd|th)$/i.test(w)) return w.slice(0, -2) + w.slice(-2).toLowerCase();
      if (/^(n|s|e|w|ne|nw|se|sw)$/i.test(w)) return w.toUpperCase();
      return /^[A-Z0-9]{2,}$/.test(w) && /[A-Z]/.test(w) ? w.charAt(0) + w.slice(1).toLowerCase() : w;
    }).join(" ");
  }
  window.fmtAddress = fmtAddress;
  // layout (data/county/README.md): u16 yearBuilt[n], u32 value[n], u16 houseNo[n], u16 streetId[n], u32 zip[n], u16 cityId[n]
  // distinct, trimmed, non-blank city names across regions (data has stray blanks/leading spaces)
  function cityList() {
    const m = new Map();
    REGIONS.forEach(r => (r.cities || []).forEach(c => { const t = String(c || "").trim(); if (t && t.toLowerCase() !== "unknown" && !m.has(t.toLowerCase())) m.set(t.toLowerCase(), t); }));
    return [...m.values()].sort();
  }
  const isFpOnly = r => !!(r && r.catalog && r.catalog.homes && r.catalog.homes.footprint_only === true);
  function regionHomeMeta(region, i) {
    const n = region.n, v = region.metaView;
    if (isFpOnly(region)) return { addr: "Address not on county record", year: null, value: null, zip: null, streetId: 0, cityId: 0, city: "", type: region.type[i], fp: true }; // homes from building outlines: no street, year, value, city or ZIP
    const year = v.getUint16(i * 2, true);
    const value = v.getUint32(n * 2 + i * 4, true);
    const houseNo = v.getUint16(n * 2 + n * 4 + i * 2, true);
    const streetId = v.getUint16(n * 2 + n * 4 + n * 2 + i * 2, true);
    const zip = v.getUint32(n * 2 + n * 4 + n * 2 + n * 2 + i * 4, true);
    const cityId = v.getUint16(n * 2 + n * 4 + n * 2 + n * 2 + n * 4 + i * 2, true);
    const street = region.streets[streetId] || "";
    const city = String(region.cities[cityId] || "").trim();
    return { addr: fmtAddress(houseNo ? `${houseNo} ${street}` : (street || "Address not on county record"), city), year: year || null, value: value || null, zip: zip || null, streetId, cityId, city, type: region.type[i] };
  }

  // ---------- F21: Storm Response filters (home type, year built, value, min hail, city, ZIP,
  // customers only). Drives map feature-state (filterOk), the "N of M" count, the hit list CSV and the
  // door-knock route; never touches data/*. "Customers only" has no direct ID linking the sample customer
  // list to the county tax roll, so it is answered by a one-time nearest-point match (<=15m, same pattern
  // as the customer map pin matching used elsewhere) cached per region, not a fabricated join.
  const STFILT = { type: "", yearMin: null, yearMax: null, valMin: null, valMax: null, minHail: null, city: "", zip: "", customersOnly: false, hideReroof: false };
  function filtersActive() {
    return !!(STFILT.type || STFILT.yearMin || STFILT.yearMax || STFILT.valMin || STFILT.valMax || STFILT.minHail || STFILT.city || STFILT.zip || STFILT.customersOnly || STFILT.hideReroof);
  }
  function ensureFilterMeta(st) { return Promise.all(st.regions.map(rr => Promise.all([loadRegionMeta(REG(rr.id)), window.Leads ? Leads.loadRegion(REG(rr.id)) : null]))); }
  function ensureLeadData(st) { return Promise.all(st.regions.map(rr => Leads.loadRegion(REG(rr.id)))); }
  const customerIdxCache = new Map();
  function customerHomeIndexFor(region) {
    if (customerIdxCache.has(region.id)) return customerIdxCache.get(region.id);
    const R_EARTH = 111320, set = new Set();
    DATA.customers.forEach(c => {
      let bestD = Infinity, bestI = -1, coslat = Math.cos(c.lat * Math.PI / 180);
      for (let i = 0; i < region.n; i++) {
        const [lo, la] = decodeLonLat(region, i);
        const d = Math.hypot((la - c.lat) * R_EARTH, (lo - c.lon) * R_EARTH * coslat);
        if (d < bestD) { bestD = d; bestI = i; }
      }
      if (bestD <= 15) set.add(bestI);
    });
    customerIdxCache.set(region.id, set);
    return set;
  }
  // non-hail attribute filters only; hail threshold is handled separately (see applyHailToRegion/hitListFor).
  // type and customers-only can be evaluated immediately (region.type[] is always resident, the customer
  // index only needs decoded lon/lat); year/value/city/ZIP need homes_meta.bin, so they pass through (not
  // exclude) until that region's meta has loaded, same as every other lazy-meta feature in this file.
  function homeMatchesFilters(region, i, custSet, haveMeta) {
    if (STFILT.type !== "" && region.type[i] !== +STFILT.type) return false;
    const needsMeta = STFILT.yearMin || STFILT.yearMax || STFILT.valMin || STFILT.valMax || STFILT.city || STFILT.zip;
    if (needsMeta && haveMeta) {
      const m = regionHomeMeta(region, i);
      if (STFILT.yearMin && (!m.year || m.year < STFILT.yearMin)) return false;
      if (STFILT.yearMax && (!m.year || m.year > STFILT.yearMax)) return false;
      if (STFILT.valMin && (!m.value || m.value < STFILT.valMin)) return false;
      if (STFILT.valMax && (!m.value || m.value > STFILT.valMax)) return false;
      if (STFILT.city && (m.city || "").toLowerCase() !== STFILT.city.toLowerCase()) return false;
      if (STFILT.zip && String(m.zip) !== STFILT.zip) return false;
    }
    if (STFILT.customersOnly && (!custSet || !custSet.has(i))) return false;
    if (STFILT.hideReroof && window.Leads && Leads.loaded(region) && Leads.recentlyReroofed(region, i)) return false;
    return true;
  }

  // ---------- data ----------
  let realCust = false;
  async function load() {
    let [regions, customers] = await Promise.all([
      loadRegions(),
      fetch("data/customers.json").then(r => r.json())
    ]);
    REGIONS = regions;
    realCust = false;
    if (window.RC_PLAN && RC_PLAN.active()) { const own = await RC_PLAN.loadCustomers(regions.map(r => r.id)).catch(() => null); if (own && own.length) { customers = own; realCust = true; } } // the company's own imported customers replace the demo sample
    const catalog = buildCombinedCatalog(regions);
    const byDate = Object.fromEntries(catalog.map(s => [s.date, s]));
    return { regions, catalog, byDate, customers };
  }

  // ---------- CSV customer import: match addresses to county homes (js/plan.js onboarding). Exact normalised address first,
  // then street name ignoring direction/type; ZIP or city breaks ties; an optional lat/lon column falls back to the nearest home within 25 m.
  // Footprint-only regions have no addresses, so they can only match by nearest point. Nothing is geocoded over the network.
  const ST_TYPES = { STREET: "ST", AVENUE: "AVE", DRIVE: "DR", ROAD: "RD", LANE: "LN", BOULEVARD: "BLVD", COURT: "CT", CIRCLE: "CIR", PLACE: "PL", TERRACE: "TER", HIGHWAY: "HWY", PARKWAY: "PKWY", TRAIL: "TRL", PLAZA: "PLZ", NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W", NORTHEAST: "NE", NORTHWEST: "NW", SOUTHEAST: "SE", SOUTHWEST: "SW" };
  const DIRS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]), TYPES = new Set(["ST", "AVE", "DR", "RD", "LN", "BLVD", "CT", "CIR", "PL", "TER", "HWY", "PKWY", "TRL", "WAY", "PLZ", "LOOP"]);
  function normStreet(s) { return String(s || "").toUpperCase().replace(/#.*$/, "").replace(/[.,']/g, " ").replace(/\b(APT|UNIT|STE|SUITE)\b.*$/, "").split(/\s+/).filter(Boolean).map(w => ST_TYPES[w] || w).join(" "); }
  function coreStreet(n) { return n.split(" ").filter(w => !DIRS.has(w) && !TYPES.has(w)).join(" "); }
  function splitAddr(a, city, zip) {
    let t = String(a || "").trim().replace(/,?\s*(OK|Oklahoma)\b\.?(\s+\d{5}(-\d{4})?)?\s*$/i, "");
    const zm = /\b(\d{5})(-\d{4})?\s*$/.exec(t); if (zm) { zip = zip || zm[1]; t = t.slice(0, zm.index).trim(); }
    const parts = t.split(",").map(x => x.trim()); if (parts.length > 1) { city = city || parts[parts.length - 1]; t = parts.slice(0, -1).join(" "); }
    const m = /^(\d+)[A-Za-z]?\s+(.+)$/.exec(t.trim()); if (!m) return null;
    return { no: +m[1], street: normStreet(m[2]), zip: String(zip || "").slice(0, 5), city: String(city || "").trim().toLowerCase() };
  }
  async function matchAddresses(recs) {
    const parsed = recs.map(r => splitAddr(r.addr, r.city, r.zip));
    const need = new Set(parsed.filter(Boolean).map(p => p.no));
    const full = new Map(), core = new Map();
    for (const rg of REGIONS) {
      if (isFpOnly(rg)) continue;
      await loadRegionMeta(rg);
      const n = rg.n, v = rg.metaView, sn = rg.streets.map(normStreet), cn = sn.map(coreStreet);
      const hoff = n * 6, soff = hoff + n * 2, zoff = soff + n * 2, coff = zoff + n * 4;
      for (let i = 0; i < n; i++) {
        const no = v.getUint16(hoff + i * 2, true); if (!no || !need.has(no)) continue;
        const sid = v.getUint16(soff + i * 2, true), e = { rg, i, zip: String(v.getUint32(zoff + i * 4, true)), city: String(rg.cities[v.getUint16(coff + i * 2, true)] || "").trim().toLowerCase() };
        const k1 = no + "|" + sn[sid], k2 = no + "|" + cn[sid];
        (full.get(k1) || full.set(k1, []).get(k1)).push(e); (core.get(k2) || core.set(k2, []).get(k2)).push(e);
      }
    }
    const pick = (list, p) => {
      if (!list || !list.length) return null;
      let c = list;
      if (c.length > 1 && p.zip) { const z = c.filter(e => e.zip === p.zip); if (z.length) c = z; else return null; }
      if (c.length > 1 && p.city) { const z = c.filter(e => e.city === p.city); if (z.length) c = z; }
      return c.length === 1 ? c[0] : null; // still ambiguous (duplicate house numbers): do not guess
    };
    const out = [];
    for (let k = 0; k < recs.length; k++) {
      const p = parsed[k]; let e = null, how = "address";
      if (p && p.street) { e = pick(full.get(p.no + "|" + p.street), p) || pick(core.get(p.no + "|" + coreStreet(p.street)), p); }
      if (!e && isFinite(recs[k].lat) && isFinite(recs[k].lon)) { // nearest point within 25 m
        let bd = 25, be = null; const r = recs[k], cl = Math.cos(r.lat * Math.PI / 180);
        for (const rg of REGIONS) { if (!rg.box || r.lon < rg.box.lon_min || r.lon > rg.box.lon_max || r.lat < rg.box.lat_min || r.lat > rg.box.lat_max) continue; await ensureBin(rg); for (let i = 0; i < rg.n; i++) { const [lo, la] = decodeLonLat(rg, i); const d = Math.hypot((la - r.lat) * 111320, (lo - r.lon) * 111320 * cl); if (d < bd) { bd = d; be = { rg, i }; } } }
        if (be) { e = be; how = "point"; }
      }
      if (!e) { out.push(null); continue; }
      const [lo, la] = decodeLonLat(e.rg, e.i);
      out.push({ region: e.rg.id, idx: e.i, lon: +lo.toFixed(6), lat: +la.toFixed(6), how });
    }
    return out;
  }
  window.RC_APP = { matchAddresses };

  // ---------- storm export: hit list CSV + door-knock route (no owner names, real home fields only) ----------
  // callers must ensureStormLoaded(st.date) + loadRegionMeta for every contributing region first
  // F21: respects the active Storm Response filters (min hail raises the default 1.00in floor; type,
  // year, value, city, ZIP, customers-only narrow further). With no filters set this returns exactly the
  // same list as before (>=1.00in, residential only, matches catalog homes_1in).
  function hitListFor(st, noScore) {
    const rows = [];
    const thr = STFILT.minHail != null ? Math.round(STFILT.minHail * 100) : 100;
    st.regions.forEach(rr => {
      const region = REG(rr.id);
      const hail = region.hailCache[st.date];
      if (!hail || !region.metaView) return;
      const custSet = STFILT.customersOnly ? customerHomeIndexFor(region) : null;
      for (let i = 0; i < region.n; i++) {
        if (hail[i] < thr || region.type[i] > 4) continue; // residential only, matches catalog homes_1in
        if (!homeMatchesFilters(region, i, custSet, true)) continue;
        const m = regionHomeMeta(region, i), c = decodeLonLat(region, i);
        const owner = regionOwnerInfo(region, i);
        const row = { ...m, hail: hail[i] / 100, lon: c[0], lat: c[1], ownerName: owner ? owner.name : "", ownerOccupied: owner ? owner.ownerOccupied : false, rid: region.id, idx: i };
        if (!noScore && window.Leads) { const ls = Leads.scoreHome(region, i, row.hail, m); row.score = ls.score; row.parts = ls.parts; row.reasons = ls.reasons; }
        rows.push(row);
      }
    });
    // "Best leads first" is the default order (score, then hail); "hail" sorts by radar size only
    if (!noScore && leadSort === "score") rows.sort((a, b) => (b.score - a.score) || (b.hail - a.hail)); else rows.sort((a, b) => b.hail - a.hail);
    return rows;
  }
  let leadSort = "score";
  function csvEsc(v) { v = String(v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; /* spreadsheet formula guard */ return `"${v.replace(/"/g, '""')}"`; }
  function hitListCSV(rows, withOwners) {
    // no owner names in exports unless the user ticked "include owner names" (owners_enabled companies or local dev only); score + reasons added (see js/leads.js for the weights)
    const head = ["Lead score (0-100)", "Address", "City", "ZIP", "Hail (in)", "Year built", "Assessed value", "Score reasons"].concat(withOwners ? ["Owner name"] : []).join(",");
    const body = rows.map(r => [r.score != null ? r.score : "", csvEsc(r.addr), csvEsc(r.city || ""), r.zip || "", r.hail.toFixed(2), r.year || "", r.value || "", csvEsc(r.reasons || "")].concat(withOwners ? [csvEsc(r.ownerName || "")] : []).join(","));
    return [head, ...body].join("\n");
  }
  // Customers carry the county home index (rid + idx); their hail for ANY storm is read from that storm's own
  // per-region bin, so it works for every storm (the precomputed customers.json hail map is only a fallback).
  const custHailDone = {};
  function ensureCustomerHail(st) {
    if (!st) return Promise.resolve();
    if (custHailDone[st.date]) return custHailDone[st.date];
    const rids = [...new Set(DATA.customers.filter(c => c.rid && c.idx != null).map(c => c.rid))].filter(id => REG(id) && REG(id).byDate[st.date]);
    return custHailDone[st.date] = Promise.all(rids.map(id => fetchHail(REG(id), st.date))).then(() => {
      DATA.customers.forEach(c => {
        if (!c.rid || c.idx == null) return;
        const rg = REG(c.rid), bytes = rg && rg.hailCache[st.date];
        if (bytes) c.hail[st.date] = bytes[c.idx] / 100;
      });
    }).catch(() => { });
  }
  const custInCount = st => DATA.customers.filter(c => (c.hail[st.date] || 0) >= 1).length;
  function refreshCustUi(st) {
    const n = custInCount(st), t = $("#custTile"), b = $("#exportCust");
    if (t) t.textContent = n;
    if (b) { b.disabled = !n; b.innerHTML = `${ic("download")}${n ? `Export ${n} customer${n === 1 ? "" : "s"} in path (CSV)` : "No customers in this path"}`; }
  }
  function customersInPathCSV(st) {
    const rows = DATA.customers.filter(c => (c.hail[st.date] || 0) >= 1).sort((a, b) => b.hail[st.date] - a.hail[st.date]);
    const head = [realCust ? "Customer" : "Customer (sample)", realCust ? "Address" : "Address (sample)", "Hail (in)"].join(",");
    const body = rows.map(c => [csvEsc(c.name), csvEsc(c.addr), c.hail[st.date].toFixed(2)].join(","));
    return [head, ...body].join("\n");
  }
  function downloadText(filename, text, type) {
    if (window.RC_DEMO) { filename = "demo-" + filename; if (/csv/.test(type)) text += "\n" + csvEsc("Demo export: sample company, public data only"); }
    const blob = new Blob([text], { type }), url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function milesBetween(a, b) {
    const R = 3958.8, rad = d => d * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(h));
  }
  function nearestNeighborRoute(points) {
    const pts = points.slice(), route = [];
    if (!pts.length) return route;
    route.push(pts.shift());
    while (pts.length) {
      let bi = 0, bd = Infinity, cur = route[route.length - 1];
      for (let i = 0; i < pts.length; i++) { const d = milesBetween(cur, pts[i]); if (d < bd) { bd = d; bi = i; } }
      route.push(pts.splice(bi, 1)[0]);
    }
    return route;
  }
  // street-name variants (Rd/Road, St/Street, Av/Ave/Avenue...) collapse to one key so one street is one row
  const STREET_ABBR = { rd: "road", st: "street", dr: "drive", ln: "lane", ave: "avenue", av: "avenue", blvd: "boulevard", ct: "court", cir: "circle", trl: "trail", pl: "place", pkwy: "parkway", hwy: "highway", ter: "terrace", terr: "terrace" };
  function streetKey(street) { return fmtAddress(street, "").toLowerCase().replace(/\./g, "").split(" ").filter(Boolean).map(w => STREET_ABBR[w] || w).join(" "); }
  const streetOf = addr => addr.replace(/^\d+\s*/, "") || addr;

  // ---------- shared map ----------
  let map = null, mapResolve = null;
  // mapReady exists from the start so screens can queue on it; initMap() (started after the first screen paints) resolves it
  const mapReady = new Promise(res => { mapResolve = res; });
  const MS = { storm: null, replay: null, onlyCustomers: false };
  const NORMAN = [[-97.56, 35.14], [-97.25, 35.33]];
  const DOT_RAMP = [0.75, "#E3A008", 1.0, "#E07B00", 1.25, "#D9480F", 1.5, "#C2185B", 1.75, "#7B1FA2", 2.25, "#3F0D6E"];
  // ---------- roof <-> map round trip (F18): captured when "Measure roof" is clicked from a house card,
  // consumed once by "Back to map" so the Storm/Overview screen reopens at the exact same camera + house
  // popup instead of re-fitting to the region bounds. lastMapScreen tracks whichever map screen was last
  // entered so "Back to map" from a direct nav-link visit to Roof still has a sane target.
  let roofReturn = null, lastMapScreen = "storm", skipMapFit = false, restoreHome = null, pendingCamera = null;

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
  const pm = n => { try { performance.mark("rc:" + n); } catch (e) { } };
  // "Zoom to storm": frames the dense core of the selected storm's hit area (same fit the screen opens with)
  class ZoomStormControl {
    onAdd(m) {
      this._c = document.createElement("div"); this._c.className = "maplibregl-ctrl maplibregl-ctrl-group zs-ctrl";
      const b = document.createElement("button"); b.type = "button"; b.title = "Zoom to storm"; b.setAttribute("aria-label", "Zoom to storm");
      b.innerHTML = `<svg class="i" viewBox="0 0 24 24" style="width:16px;height:16px"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg><span>Zoom to storm</span>`;
      b.onclick = () => { if (MS.storm) { userMovedMap = false; fitStormSwath(MS.storm, true, { top: 56, bottom: 64, left: 40, right: 40 }); } };
      this._c.appendChild(b); return this._c;
    }
    onRemove() { this._c.remove(); }
  }
  function initMap() {
    pm("initMap");
    map = new maplibregl.Map({
      container: "map", style: "https://tiles.openfreemap.org/styles/positron", transformRequest: window.RC_TRANSFORM,
      bounds: NORMAN, fitBoundsOptions: { padding: 20 }, attributionControl: false, minZoom: 3, maxZoom: 18, trackResize: false,
      // explicit (not just defaults) so a future style/option change can't silently drop any of these:
      scrollZoom: true, dragPan: true, doubleClickZoom: true, keyboard: true, touchZoomRotate: true, boxZoom: false, dragRotate: false, pitchWithRotate: false
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "Hail: NOAA MRMS | Homes: county tax rolls | Footprints: Microsoft, Overture Maps | (c) OpenStreetMap contributors | OpenFreeMap" }), "top-right");
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new ResetViewControl(m => m.fitBounds(NORMAN, { padding: 30, duration: 450 })), "top-right");
    map.addControl(new ZoomStormControl(), "top-right");
    map.touchZoomRotate.disableRotation(); // pinch still zooms; two-finger twist won't tilt a flat hail map
    map.scrollZoom.setWheelZoomRate(1 / 400); map.scrollZoom.setZoomRate(1 / 140); // steady mouse-wheel notch (~0.2 zoom) and a pinch that is not twitchy
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
    // style.load (style parsed) instead of load (waits for basemap tiles): the hail layers and dots go on as soon as the style is in
    let layersStarted = false; const startLayers = () => { if (layersStarted) return; layersStarted = true; pm("layers"); styleBase(); addLayers().then(mapResolve); };
    map.on("style.load", startLayers); map.on("load", startLayers);
    new ResizeObserver(() => { if ($("#map").clientWidth < 50) return; map.resize(); if (pendingFit && $("#map").clientWidth > 50) { map.fitBounds(pendingFit[0], { padding: pendingFit[1], duration: 0 }); pendingFit = null; } }).observe($("#map"));
    collapseAttrib($("#map"));
    // safety net: on a fresh phone load the map kept its 400x300 default canvas (container was 0 wide when
    // created and no resize landed), which stretched the tiles and offset every click. Resync on idle and on
    // viewport changes whenever the container and the camera disagree.
    window.syncMapSize = () => { const el = $("#map"); if (el.clientWidth > 50 && (Math.abs(map.transform.width - el.clientWidth) > 1 || Math.abs(map.transform.height - el.clientHeight) > 1)) map.resize(); };
    map.on("idle", window.syncMapSize); window.addEventListener("resize", window.syncMapSize);
  }
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
  // Speed design: the map no longer holds one 100k-point GeoJSON per county. ONE small source ("homes-view") is
  // rebuilt from the packed arrays for just the houses in (and a little around) the current view. Below z13 it
  // carries the hail-hit houses only (the swath image is the heat layer); from z13 it adds every other house, so
  // each house is a clickable dot at street level in every county. Hail, filter state and region come baked into
  // each point, so changing storm or filters is one rebuild, not 100k feature-state writes.
  const DETAIL_Z = 11.5, GRAY_MINZOOM = 12, HIT_CAP_FAR = 40000, HIT_CAP_NEAR = 60000, GRAY_CAP = 70000; // detail data is built from z11.5 (one half-zoom ahead of the z12 dot layer) so crossing the threshold never leaves a gap; a density layer of ALL homes covers lower zooms // data for the street-level dots is built from z12.5 so it is already there when the layer switches on at z13
  let viewBuilt = null, viewEpoch = 0, viewTimer = 0, lastMoveBuild = 0, homeClickTimer = 0;
  const EMPTY_FC = { type: "FeatureCollection", features: [] };
  const regionKey = () => REGIONS.map(r => (r.lonq ? 1 : 0) + (MS.storm && r.hailCache[MS.storm] ? 2 : 0)).join("");
  // density layer: every home of every loaded region, pre-aggregated once into ~250 m grid cells (count per cell),
  // drawn as a soft gray heatmap so no area ever looks empty at county zoom. Hit houses and dots sit on top.
  let densKey = "";
  function buildDensity(rk) {
    const src = map.getSource("homes-dens"); if (!src) return;
    const key = REGIONS.map(r => (r.lonq ? r.n : 0)).join(","); if (key === densKey) return; densKey = key;
    const CELL = 0.0025, cells = new Map();
    REGIONS.forEach(r => {
      if (!r.lonq) return; const bx = r.box, dx = bx.lon_max - bx.lon_min, dy = bx.lat_max - bx.lat_min, lq = r.lonq, aq = r.latq;
      for (let i = 0, n = r.n; i < n; i++) { const lon = bx.lon_min + lq[i] / 65535 * dx, lat = bx.lat_min + aq[i] / 65535 * dy, k = Math.floor(lon / CELL) * 100000 + Math.floor(lat / CELL); const c = cells.get(k); if (c) c[2]++; else cells.set(k, [lon, lat, 1]); }
    });
    const feats = []; cells.forEach(c => feats.push({ type: "Feature", geometry: { type: "Point", coordinates: [c[0], c[1]] }, properties: { c: c[2] } }));
    src.setData({ type: "FeatureCollection", features: feats });
  }
  function bumpView() { viewEpoch++; viewBuilt = null; scheduleView(); }
  function scheduleView() { if (viewTimer) return; viewTimer = setTimeout(() => { viewTimer = 0; buildView(); }, 0); }
  function buildView() {
    if (!map || !map.getSource("homes-view") || !DATA) return;
    if ($("#map").clientWidth < 50) return;
    const z = map.getZoom(), detail = z >= DETAIL_Z, b = map.getBounds(), rk = regionKey();
    buildDensity(rk);
    // between z11.5 and z12 the dots are prebuilt for the z12 view (half the width), so the swap at z12 is already there
    const pre = detail && z < GRAY_MINZOOM, ctr = map.getCenter(), fz = pre ? Math.pow(2, z - GRAY_MINZOOM) : 1;
    let w0 = b.getWest(), e0 = b.getEast(), s0 = b.getSouth(), n0 = b.getNorth();
    if (pre) { const hw = (e0 - w0) * fz / 2, hh = (n0 - s0) * fz / 2; w0 = ctr.lng - hw; e0 = ctr.lng + hw; s0 = ctr.lat - hh; n0 = ctr.lat + hh; }
    if (viewBuilt && viewBuilt.epoch === viewEpoch && viewBuilt.detail === detail && viewBuilt.rk === rk && !(viewBuilt.thinGray && z >= GRAY_MINZOOM) && w0 >= viewBuilt.w && e0 <= viewBuilt.e && s0 >= viewBuilt.s && n0 <= viewBuilt.n) return;
    const mx = (e0 - w0) * 0.25, my = (n0 - s0) * 0.25, W = w0 - mx, E = e0 + mx, S = s0 - my, N = n0 + my;
    const active = filtersActive(), date = MS.storm;
    // too many hits in view (zoomed far out on a big storm): show an even sample, the heat image carries the rest
    const inView = []; let hitsIn = 0, grayIn = 0;
    REGIONS.forEach((r, ri) => {
      const bx = r.box; if (!r.lonq || bx.lon_max < W || bx.lon_min > E || bx.lat_max < S || bx.lat_min > N) return;
      const dx = bx.lon_max - bx.lon_min, dy = bx.lat_max - bx.lat_min;
      const q = { r, ri, hail: date ? r.hailCache[date] : null, qx0: Math.ceil((W - bx.lon_min) / dx * 65535), qx1: Math.floor((E - bx.lon_min) / dx * 65535), qy0: Math.ceil((S - bx.lat_min) / dy * 65535), qy1: Math.floor((N - bx.lat_min) / dy * 65535), dx, dy };
      inView.push(q);
      { const h = q.hail, lq = r.lonq, aq = r.latq; for (let i = 0, n = r.n; i < n; i++) { if (lq[i] >= q.qx0 && lq[i] <= q.qx1 && aq[i] >= q.qy0 && aq[i] <= q.qy1) { if (h && h[i] >= 75) hitsIn++; else grayIn++; } } }
    });
    const cap = detail ? HIT_CAP_NEAR : HIT_CAP_FAR, stride = Math.max(1, Math.ceil(hitsIn / cap)), gstride = detail ? Math.max(1, Math.ceil(grayIn / GRAY_CAP)) : 1; // thin evenly (every k-th house) so dots spread over the whole swath
    const feats = [];
    inView.forEach(q => {
      const r = q.r, bx = r.box, hail = q.hail, n = r.n, lq = r.lonq, aq = r.latq, dx = q.dx, dy = q.dy;
      const custSet = active && STFILT.customersOnly ? customerHomeIndexFor(r) : null, haveMeta = !!r.metaView;
      for (let i = 0; i < n; i++) {
        const x = lq[i], y = aq[i]; if (x < q.qx0 || x > q.qx1 || y < q.qy0 || y > q.qy1) continue;
        const v = hail ? hail[i] : 0, hit = v >= 75;
        if (hit) { if (stride > 1 && i % stride) continue; } else if (!detail || (gstride > 1 && i % gstride)) continue;
        const ok = active ? homeMatchesFilters(r, i, custSet, haveMeta) : true;
        feats.push({ type: "Feature", geometry: { type: "Point", coordinates: [bx.lon_min + x / 65535 * dx, bx.lat_min + y / 65535 * dy] }, properties: { r: q.ri, i, h: hit ? v / 100 : 0, k: ok ? 1 : 0 } });
      }
    });
    map.getSource("homes-view").setData({ type: "FeatureCollection", features: feats });
    viewBuilt = { w: W, e: E, s: S, n: N, detail, thinGray: gstride > 1, epoch: viewEpoch, rk, count: feats.length };
    pm("view" + feats.length);
  }
  async function addLayers() {
    firstSymbol = map.getStyle().layers.find(l => l.type === "symbol")?.id;
    // one view-limited source; gray homes (only from z13) sit under the hail-hit dots
    map.addSource("homes-view", { type: "geojson", data: EMPTY_FC, tolerance: 0, maxzoom: 16 });
    map.addSource("homes-dens", { type: "geojson", data: EMPTY_FC });
    map.addLayer({ id: "homes-dens", type: "heatmap", source: "homes-dens", maxzoom: 13, paint: densPaint() }, firstSymbol);
    map.addLayer({ id: "homes-view", type: "circle", source: "homes-view", minzoom: GRAY_MINZOOM, filter: ["==", ["get", "h"], 0], paint: grayPaint() }, firstSymbol);
    map.addLayer({ id: "homes-hits", type: "circle", source: "homes-view", filter: [">", ["get", "h"], 0], paint: hitPaint() }, firstSymbol);
    firstHomeLayer = "homes-view";
    ["homes-view", "homes-hits"].forEach(layerId => {
      map.on("click", layerId, e => {
        if (map.queryRenderedFeatures(e.point, { layers: ["cust"] }).length) return; if (window.Leads && Leads.pinAt(map, e.point)) return;
        const f = e.features[0], region = REGIONS[f.properties.r], hid = f.properties.i, c = decodeLonLat(region, hid);
        clearTimeout(homeClickTimer); homeClickTimer = setTimeout(() => homePopup(region, hid, { lng: c[0], lat: c[1] }), 220); // a double-click zooms instead of opening a card
      });
      map.on("mouseenter", layerId, () => map.getCanvas().style.cursor = "pointer");
      map.on("mouseleave", layerId, () => map.getCanvas().style.cursor = "");
    });
    map.on("dblclick", () => clearTimeout(homeClickTimer));
    const cust = { type: "FeatureCollection", features: DATA.customers.map(c => ({ type: "Feature", geometry: { type: "Point", coordinates: [c.lon, c.lat] }, properties: { id: c.id } })) };
    map.addSource("cust", { type: "geojson", data: cust });
    map.addLayer({ id: "cust", type: "circle", source: "cust", paint: custPaint() });
    map.on("click", "cust", e => custPopup(e.features[0].properties.id, e.lngLat));
    map.on("mouseenter", "cust", () => map.getCanvas().style.cursor = "pointer");
    map.on("mouseleave", "cust", () => map.getCanvas().style.cursor = "");
    map.on("moveend", () => { syncRegionData(); scheduleView(); });
    // while moving: rebuild the instant the view leaves the built area or crosses the dot threshold, so the map is never bare mid-zoom
    map.on("move", () => {
      const t = performance.now(); if (t - lastMoveBuild < 90) return;
      const d = map.getZoom() >= DETAIL_Z;
      if (!viewBuilt || viewBuilt.detail !== d || (viewBuilt.thinGray && map.getZoom() >= GRAY_MINZOOM)) { lastMoveBuild = t; return buildView(); }
      let b = map.getBounds();
      if (!(map.getZoom() >= GRAY_MINZOOM)) { const c = map.getCenter(), f = Math.pow(2, map.getZoom() - GRAY_MINZOOM), hw = (b.getEast() - b.getWest()) * f / 2, hh = (b.getNorth() - b.getSouth()) * f / 2; b = { getWest: () => c.lng - hw, getEast: () => c.lng + hw, getSouth: () => c.lat - hh, getNorth: () => c.lat + hh }; }
      if (b.getWest() < viewBuilt.w || b.getEast() > viewBuilt.e || b.getSouth() < viewBuilt.s || b.getNorth() > viewBuilt.n) { lastMoveBuild = t; buildView(); }
    });
    map.on("dragstart", () => { userMovedMap = true; });
    map.on("zoomstart", e => { if (e && e.originalEvent) userMovedMap = true; });
    syncRegionData();
    await setStorm(MS.storm);
  }
  // ---- fit the map to the selected storm's hit area (1st-99th percentile of homes at 1 in+, so a stray home
  // does not zoom us out), unless the user has panned/zoomed since the last fit
  let userMovedMap = false;
  const stormBoundsCache = {};
  async function stormHitBounds(date) {
    if (stormBoundsCache[date] !== undefined) return stormBoundsCache[date];
    const st = DATA.byDate[date]; await ensureStormLoaded(date);
    const xs = [], ys = [];
    // worst-hit core first (1.50 in+ if there are enough homes, else 1.00 in+, else 0.75 in+) so a metro-wide storm frames where the damage is
    [["150", 300], ["100", 60], ["75", 3]].some(([th, need]) => {
      xs.length = 0; ys.length = 0;
      st.regions.forEach(rr => {
        const rg = REG(rr.id), h = rg.hailCache[date]; if (!h || !rg.lonq) return;
        for (let i = 0; i < rg.n; i++) if (h[i] >= +th && rg.type[i] <= 10) { const c = decodeLonLat(rg, i); xs.push(c[0]); ys.push(c[1]); }
      });
      return xs.length >= need;
    });
    let b = null;
    if (xs.length) {
      xs.sort((a, c) => a - c); ys.sort((a, c) => a - c);
      const q = (a, f) => a[Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * f)))];
      b = [[q(xs, 0.06), q(ys, 0.06)], [q(xs, 0.94), q(ys, 0.94)]]; // the dense core of the hit area, not the stray edge homes
    }
    return (stormBoundsCache[date] = b);
  }
  async function fitStormSwath(date, force, pad) {
    const b = await stormHitBounds(date);
    if (!b || !map || MS.storm !== date || (userMovedMap && !force) || $("#map").clientWidth < 50) return;
    userMovedMap = false;
    map.fitBounds(b, { padding: pad, duration: 700, maxZoom: 13, essential: true });
  }
  const hashStorm = () => { const m = /[?&]d=(\d{4}-\d\d-\d\d)/.exec(location.hash); return m && DATA && DATA.byDate[m[1]] ? m[1] : null; };
  function syncStormHash(screen, date) {
    const h = `#${screen}?d=${date}`; if (location.hash === h) return;
    history[hashStorm() ? "pushState" : "replaceState"](null, "", location.pathname + location.search + h);
  }
  const HOME_MINZOOM = 8.5;
  // regions whose box is on screen start loading (arrays + this storm's hail); each arrival repaints the view source
  function syncRegionData() {
    if (!map || map.getZoom() < HOME_MINZOOM) return;
    const b = map.getBounds();
    REGIONS.forEach(r => {
      if (r.fcLoaded) return;
      const bx = r.box;
      if (bx.lon_max < b.getWest() || bx.lon_min > b.getEast() || bx.lat_max < b.getSouth() || bx.lat_min > b.getNorth()) return;
      r.fcLoaded = true;
      Promise.all([ensureBin(r), MS.storm ? fetchHail(r, MS.storm) : null]).then(() => scheduleView()).catch(() => { r.fcLoaded = false; });
    });
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
  const DOT_COLOR = ["interpolate", ["linear"], ["get", "h"], ...DOT_RAMP];
  function densPaint() {
    return {
      "heatmap-weight": ["interpolate", ["linear"], ["get", "c"], 1, 0.25, 12, 0.7, 40, 1],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 12, 1.2],
      "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(163,156,144,0)", 0.15, "rgba(163,156,144,0.35)", 0.5, "rgba(140,132,120,0.55)", 1, "rgba(110,104,94,0.7)"],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 8, 3, 10, 5, 12, 10, 13, 14],
      "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.8, 12, 0.8, 13, 0]
    };
  }
  function grayPaint() {
    return {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 2.2, 14, 3, 16, 5.5, 17.5, 8],
      "circle-color": "#A39C90",
      "circle-opacity": ["case", ["==", ["get", "k"], 0], 0.06, 0.45],
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 13, 0, 15, 0.8],
      "circle-stroke-color": "rgba(255,255,255,.85)"
    };
  }
  function hitPaint() {
    return {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 1, 10, 1.5, 12, 2.2, 14, 3.4, 16, 5.5, 17.5, 8],
      "circle-color": DOT_COLOR,
      "circle-opacity": ["case", ["==", ["get", "k"], 0], 0.06, 0.95],
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 13, 0, 15, 0.8],
      "circle-stroke-color": "rgba(255,255,255,.85)"
    };
  }
  function custPaint() {
    return {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 1.8, 12, 2.4, 14, 4, 16, 7],
      "circle-color": "#FFFFFF",
      "circle-stroke-color": B.accent,
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 1.1, 13, 1.6, 15, 2.4],
      "circle-opacity": 1
    };
  }
  // hail now reaches the map through the view source (buildView); this only counts residential homes matching the
  // Storm Response filters for the panel's "N of M homes match" line (and returns 0 with no filters, as before)
  function applyHailToRegion(region, date) {
    const bytes = region.hailCache[date];
    if (!bytes || !filtersActive()) return 0;
    const haveMeta = !!region.metaView;
    const thr = STFILT.minHail != null ? Math.round(STFILT.minHail * 100) : 75;
    const custSet = STFILT.customersOnly ? customerHomeIndexFor(region) : null;
    let matched = 0;
    for (let i = 0; i < region.n; i++) {
      const v = bytes[i]; if (v < thr || region.type[i] > 4) continue;
      if (homeMatchesFilters(region, i, custSet, haveMeta)) matched++;
    }
    return matched;
  }
  // one image source per swath file, shown by opacity: no in-flight image swaps, no aborted loads
  const swathIds = {};
  function ensureSwathLayer(url, coordinates) {
    let id = swathIds[url];
    if (!id) {
      id = swathIds[url] = "sw" + Object.keys(swathIds).length;
      map.addSource(id, { type: "image", url: window.RC_DATA_URL ? window.RC_DATA_URL(url) : url, coordinates });
      // remote (Supabase) image failed: re-point this source at the local copy
      if (window.RC_DATA_URL && window.RC_DATA_URL(url) !== url) {
        const onErr = e => {
          if (!e || e.sourceId !== id) return;
          map.off("error", onErr);
          const src = map.getSource(id); if (src && src.updateImage) src.updateImage({ url, coordinates });
        };
        map.on("error", onErr);
      }
      map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": 0, "raster-opacity-transition": { duration: 250 }, "raster-resampling": "linear", "raster-fade-duration": 0 } }, firstHomeLayer);
    }
    return id;
  }
  function showSwaths(list) {
    const activeIds = list.map(x => ensureSwathLayer(x.url, x.bounds));
    Object.values(swathIds).forEach(id => map.setPaintProperty(id, "raster-opacity", activeIds.includes(id) ? 0.55 : 0));
  }
  // fetches only the storms actually selected (one hail/<date>.bin per contributing region), never
  // every storm on file; returns a promise so callers that need the map painted can await it, but the
  // storm panel's own KPI numbers come straight from catalog.json and never wait on this
  async function setStorm(date) {
    MS.storm = date; MS.replay = null;
    const st = DATA.byDate[date];
    if (!st) return;
    // heat layer first: the swath images need no home data, so they paint while the arrays are still arriving
    showSwaths(st.regions.map(rr => ({ url: REG(rr.id).path + rr.swath, bounds: rr.bounds })));
    // only regions already on screen (fcLoaded) need their hail now; the rest get it when they scroll into view
    // (syncRegionData). With filters on, every region is loaded so the "N of M match" count stays whole.
    const wide = filtersActive();
    // dots appear as each region lands (don't wait for the slowest county)
    st.regions.filter(rr => wide || REG(rr.id).fcLoaded).forEach(rr => Promise.all([ensureBin(REG(rr.id)), fetchHail(REG(rr.id), date)]).then(() => { if (MS.storm === date) bumpView(); }).catch(() => { }));
    bumpView();
    await ensureStormLoaded(date, !wide);
    if (MS.storm !== date) return; // superseded by a newer selection while this was loading
    bumpView();
    let matched = 0;
    REGIONS.forEach(r => { if (wide || r.fcLoaded) matched += applyHailToRegion(r, date); });
    MS.filterMatch = matched;
    if (current === "storm") renderFilterCount(st);
  }
  // called after setStorm repaints the map (new storm, or filters changed) and whenever the filters bar
  // changes; keeps the "N of M homes match" line and the door-knock/CSV button counts in sync with the
  // active filters without re-rendering the whole panel (avoids losing input focus while typing a filter)
  function renderFilterCount(st) {
    const el = $("#filtMatch");
    if (!el) return;
    const tile = $("#tileHomes"), tl = $("#tileHomesL"), tn = $("#tileNote");
    if (!filtersActive()) { el.textContent = ""; if (tile) { tile.textContent = int(st.homes_1in); tl.textContent = "Homes in path, 1 inch+"; } if (tn) tn.textContent = ""; return; }
    const metaReady = st.regions.every(rr => REG(rr.id).metaView);
    const fpNote = (STFILT.yearMin || STFILT.yearMax || STFILT.valMin || STFILT.valMax || STFILT.city || STFILT.zip) && st.regions.some(rr => isFpOnly(REG(rr.id))) ? ". Homes in footprint-only counties have no year, value, city or ZIP, so these filters skip them" : "";
    el.textContent = metaReady ? `${int(MS.filterMatch)} of ${int(st.homes_075)} homes match these filters${fpNote}` : "Loading filtered homes...";
    if (metaReady) {
      const thr = STFILT.minHail != null ? STFILT.minHail : 0.75;
      if (tile) { tile.textContent = int(MS.filterMatch); tl.textContent = `Homes matching your filters, ${thr.toFixed(2).replace(/0$/, "")} in+`; }
      if (tn) tn.textContent = "Filters apply to the first tile, the map, the route and the CSV. The other tiles show the whole storm.";
      if (!MS.filterMatch) {
        // say why: the biggest hail among homes that pass every OTHER filter
        let mx = 0;
        st.regions.forEach(rr => {
          const rg = REG(rr.id), h = rg.hailCache[st.date]; if (!h) return;
          const cs = STFILT.customersOnly ? customerHomeIndexFor(rg) : null;
          for (let i = 0; i < rg.n; i++) if (h[i] > mx && rg.type[i] <= 4 && homeMatchesFilters(rg, i, cs, true)) mx = h[i];
        });
        const who = STFILT.city ? `${STFILT.city} homes` : "homes matching the other filters";
        el.textContent = STFILT.minHail != null && mx < Math.round(STFILT.minHail * 100)
          ? `No ${who} had ${STFILT.minHail.toFixed(2)} in+ on ${st.label}${mx ? `; the max there was ${(mx / 100).toFixed(2)} in` : "; none were hit at all"}.`
          : `0 of ${int(st.homes_075)} homes match these filters${mx ? "" : " (none of those homes were hit on " + st.label + ")"}.`;
      }
    }
    const ck = $("#canvass");
    if (ck && metaReady) {
      const n = hitListFor(st, true).length;
      ck.innerHTML = `${ic("house")}Door-knock route, ${int(n)} homes`;
      ck.disabled = !n;
    }
  }
  function setCustomerFilter(ids) {
    if (!map.getLayer("cust")) return;
    map.setFilter("cust", ids ? ["in", ["get", "id"], ["literal", ids]] : null);
  }
  let pendingFit = null;
  function placeMap(slot, bounds, pad = 30) {
    slot.appendChild($("#mapwrap"));
    // skipMapFit (set by backToMap) means this entry is a round trip back from Roof Measure: the map
    // already sits at the exact camera it had when "Measure roof" was clicked, so never re-fit it here.
    pendingFit = (bounds && !skipMapFit) ? [bounds, pad] : null;
    requestAnimationFrame(() => {
      if (!map) return; // map not created yet (initMap runs after first paint); its ResizeObserver applies pendingFit
      if ($("#map").clientWidth > 50) map.resize();
      if (pendingFit && $("#map").clientWidth > 50) { map.fitBounds(pendingFit[0], { padding: pendingFit[1], duration: 0 }); pendingFit = null; }
      else if (pendingCamera && $("#map").clientWidth > 50) { map.jumpTo(pendingCamera); pendingCamera = null; }
      if (skipMapFit) skipMapFit = false;
      if (restoreHome) { const rh = restoreHome; restoreHome = null; setTimeout(() => homePopup(REG(rh.regionId), rh.homeId, { lng: rh.lng, lat: rh.lat }, { keepCamera: true }), 0); }
    });
  }
  // MapLibre re-opens its compact attribution on every resize/style event on wide maps, which stretched the credit text
  // across the storm chips. Keep it a collapsed "i" button; it only opens when the user presses the button itself.
  function collapseAttrib(root) {
    const t = setInterval(() => {
      const all = root.querySelectorAll(".maplibregl-ctrl-attrib"), a = all[0];
      if (!a) return;
      all.forEach((x, i) => i && x.remove());
      const bt = a.querySelector(".maplibregl-ctrl-attrib-button");
      if (bt) { bt.style.backgroundRepeat = "no-repeat"; bt.style.backgroundPosition = "center"; }
      const shut = () => { a.classList.remove("maplibregl-compact-show"); a.removeAttribute("open"); };
      let intent = 0, user = false;
      const arm = () => { intent = Date.now(); };
      if (bt) { bt.addEventListener("pointerdown", arm); bt.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") arm(); }); }
      shut();
      new MutationObserver(() => {
        const open = a.hasAttribute("open") || a.classList.contains("maplibregl-compact-show");
        if (Date.now() - intent < 700) { user = open; return; }
        if (open && !user) shut();
        if (!open) user = false;
      }).observe(a, { attributes: true, attributeFilter: ["class", "open"] });
      clearInterval(t);
    }, 200);
    setTimeout(() => clearInterval(t), 8000);
  }
  function custPopup(id, ll) {
    const c = DATA.customers.find(x => x.id === id);
    const h = c.hail[MS.storm];
    new maplibregl.Popup({ closeButton: false, offset: 8 }).setLngLat(ll).setHTML(`<div class="pop"><b>${esc(c.name)}</b> <span class="tag accent">Customer</span><div class="muted" style="margin:2px 0 8px">${esc(c.addr)}${realCust ? "" : " &middot; sample record"}</div>
      <div class="row"><span>Radar hail, ${DATA.byDate[MS.storm].label}</span><b class="num">${h != null ? h.toFixed(2) + " in" : "no data for this storm"}</b></div>
      ${c.roof_year ? `<div class="row"><span>Roof installed</span><span class="num">${c.roof_year}</span></div>` : ""}${c.last_job ? `<div class="row"><span>Last job</span><span>${c.last_job}</span></div>` : ""}</div>`).addTo(map);
  }
  // property card for any county home: address/city/zip/type/year/value from homes_meta.bin (lazy per
  // region), hail at the selected storm plus the worst storms already cached (never fetches all storms
  // on a click); "load full hail history" fetches every remaining storm's bin for this home's region,
  // sequentially, with a progress readout, only when the owner explicitly asks for it.
  function homePopup(region, id, ll, opts) {
    const typeLabel = typeLabelFor(region, region.type[id]);
    // card hangs BELOW the house (anchor top) and is capped to ~58% of the map's height, scrolling inside
    // (Measure roof is sticky at its bottom); the camera eases so the house sits in the visible area above it
    const mapH = map.getContainer().clientHeight || 500, cardH = Math.max(180, Math.min(320, Math.round(mapH * 0.58))), cardGap = 16, topPad = 24;
    const pop = new maplibregl.Popup({ closeButton: true, offset: cardGap, anchor: "top", maxWidth: "272px" }).setLngLat(ll)
      .setHTML(`<div class="pop" style="min-width:210px"><b>${esc(typeLabel)}</b><div class="muted" style="margin:2px 0 8px">Loading property details...</div></div>`).addTo(map);
    pop.getElement().style.setProperty("--card-h", cardH + "px");
    // keep the card fully inside the map whatever the camera does (reset view, zoom out, pan): on every
    // camera move re-pick below/above the house (and left/right at the edges) and cap its height to the
    // room available, scrolling inside (Measure roof is sticky at the bottom); close it once the house leaves the view
    let settled = false;
    function placeCard() {
      if (!pop.isOpen()) return;
      const box = map.getContainer(), W = box.clientWidth, H = box.clientHeight, p = map.project(ll), m = 8, tip = 12;
      const below = H - p.y - cardGap - m - tip, above = p.y - cardGap - m - tip;
      let side, h;
      if (below >= cardH) { side = "top"; h = cardH; }
      else if (above >= cardH) { side = "bottom"; h = cardH; }
      else if (below >= above) { side = "top"; h = below; } else { side = "bottom"; h = above; }
      h = Math.max(96, Math.min(cardH, Math.floor(h)));
      const hz = p.x < 150 ? "-left" : p.x > W - 150 ? "-right" : "";
      const anchor = side + hz;
      pop.getElement().style.setProperty("--card-h", h + "px");
      if (pop.options.anchor !== anchor) { pop.options.anchor = anchor; pop.setLngLat(ll); }
      return p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H;
    }
    const onMove = () => placeCard();
    const onEnd = () => { if (!settled) return; if (placeCard() === false) pop.remove(); };
    map.on("move", onMove); map.on("moveend", onEnd);
    pop.on("close", () => { map.off("move", onMove); map.off("moveend", onEnd); });
    placeCard();
    if (opts && opts.keepCamera) settled = true; else setTimeout(() => { settled = true; }, 900); // after the opening ease lands
    if (!(opts && opts.keepCamera)) {
      const houseY = topPad + Math.max(0, (mapH - topPad - cardH - cardGap - 28) / 2);
      map.easeTo({ center: [ll.lng, ll.lat], zoom: Math.min(map.getMaxZoom(), Math.max(map.getZoom(), 17)), offset: [0, houseY - mapH / 2], duration: 650 });
    }
    let noStructHome = false; // county record: no building found on this parcel
    let miniRoof; // undefined = not checked yet, null = checked/no footprint, object = has one
    let leadFacts = null; // enrichment facts (assessor roof, permit, imagery, nearest report); loads lazily, re-renders the card
    function hailRows() {
      const dates = Object.keys(region.hailCache).filter(d => region.hailCache[d] && region.hailCache[d][id] >= 75);
      return dates.map(d => ({ date: d, label: DATA.byDate[d] ? DATA.byDate[d].label : d, in: region.hailCache[d][id] / 100 })).sort((a, b) => b.in - a.in);
    }
    // honest hail line: distinguishes "haven't fetched this storm's bin yet" from "fetched it, this
    // exact home shows nothing" -- the latter must never read as "not loaded" (F5 fix)
    function hailLine() {
      const curBytes = region.hailCache[MS.storm];
      const stLabel = DATA.byDate[MS.storm] ? DATA.byDate[MS.storm].label : MS.storm;
      if (curBytes === undefined) return { label: `Hail, ${stLabel.replace(/,?\s*\d{4}$/, "")}`, val: `<span class="muted" style="font-weight:400">Loading...</span>` };
      const v = curBytes ? curBytes[id] / 100 : 0;
      return v > 0 ? { label: `Hail, ${stLabel.replace(/,?\s*\d{4}$/, "")}`, val: v.toFixed(2) + " in" } : { label: `Hail, ${stLabel.replace(/,?\s*\d{4}$/, "")}`, val: `None recorded` };
    }
    function render(m) {
      if (!pop.isOpen()) return;
      const hl = hailLine();
      const rows = hailRows().slice(0, 6);
      const allLoaded = DATA.catalog.every(s => !region.byDate[s.date] || region.hailCache[s.date] !== undefined);
      const owner = regionOwnerInfo(region, id);
      const sc = pop.getElement().querySelector(".maplibregl-popup-content"), keepTop = sc ? sc.scrollTop : 0; // re-renders (meta, hail, footprint) must not jump the card's scroll
      pop.setHTML(`<div class="pop" style="min-width:230px"><b>${esc(m.addr)}</b><div class="muted" style="margin:2px 0 8px">${esc(m.city || "")}${m.zip ? " " + m.zip : ""} &middot; ${m.fp ? "estimated from building outline, no county record" : "county tax roll"} &middot; not a current customer (sample)</div>
        ${owner ? `<div class="row"><span>Owner (tax roll)</span><b class="num">${esc(owner.name)}</b></div>` : ""}
        ${owner && owner.ownerOccupied ? `<div class="row"><span></span><span class="muted">Owner-occupied</span></div>` : ""}
        <div class="row"><span>Type</span><span class="num">${esc(typeLabel)}</span></div>
        ${m.year ? `<div class="row"><span>Home built (not roof age)</span><b class="num">${m.year}</b></div>` : ""}
        ${m.fp ? "" : `<div class="row"><span>Assessed value</span><b class="num">${m.value ? money(m.value) : "n/a"}</b></div>`}
        <div class="row"><span>${hl.label}</span><b class="num">${hl.val}</b></div>
        ${leadFacts ? Leads.cardHtml(leadFacts, (region.hailCache[MS.storm] ? region.hailCache[MS.storm][id] / 100 : 0), m, region, id) : ""}
        <div class="muted" style="margin-top:8px;margin-bottom:2px;font-weight:600;font-size:11.5px">Worst storms on file${allLoaded ? "" : " (loaded so far)"}</div>
        ${rows.length ? rows.map(h => `<div class="row"><span>${esc(h.label)}</span><b class="num">${h.in.toFixed(2)} in</b></div>`).join("") : `<div class="muted" style="font-size:12px">No hail loaded for this home yet beyond the selected storm.</div>`}
        ${allLoaded ? "" : `<button class="btn sm block" id="loadHistBtn" style="margin-top:8px">${ic("download")}Load full hail history</button>`}
        ${miniRoof ? `<div class="mini-roof">${buildRoofDiagramSVG(miniRoof, { mini: true })}</div>` : ""}
        ${noStructHome && !miniRoof ? `<div class="row"><span class="muted" style="font-size:12px;line-height:1.4">No building found on this parcel (county record may be vacant land).</span></div>` : ""}
        <button class="btn sm accent block" id="measureBtn" style="margin-top:12px">${ic("ruler")}${noStructHome && !miniRoof ? "Draw this roof" : "Measure roof"}</button></div>`);
      { const sc2 = pop.getElement().querySelector(".maplibregl-popup-content"); if (sc2) sc2.scrollTop = keepTop; }
      $("#measureBtn")?.addEventListener("click", () => {
        roofReturn = { screen: lastMapScreen, center: map.getCenter(), zoom: map.getZoom(), regionId: region.id, homeId: id, lng: ll.lng, lat: ll.lat };
        openRoofFor(region, id, { lng: ll.lng, lat: ll.lat }, m.addr);
      });
      $("#loadHistBtn")?.addEventListener("click", async (e) => {
        const btn = e.currentTarget; btn.disabled = true;
        const need = DATA.catalog.filter(s => region.byDate[s.date] && region.hailCache[s.date] === undefined);
        for (let i = 0; i < need.length; i++) {
          if (!pop.isOpen()) return;
          btn.textContent = `Loading ${i + 1}/${need.length}...`;
          await fetchHail(region, need[i].date);
        }
        if (pop.isOpen()) render(m);
      });
    }
    // auto-load this one region's bin for the currently-selected storm so the hail line is never stuck
    // on "not loaded" just because this home's region wasn't part of whatever screen set MS.storm
    fetchHail(region, MS.storm).then(() => { if (pop.isOpen() && region.metaView) render(regionHomeMeta(region, id)); }); // meta may still be loading; its own .then renders
    Promise.all([loadRegionMeta(region), loadRegionOwners(region), loadHomeOwner(region, id)]).then(() => {
      if (pop.isOpen()) render(regionHomeMeta(region, id));
      if (window.Leads) Promise.all([Leads.houseFacts(region, id, ll.lng, ll.lat, MS.storm), fetchHail(region, MS.storm)]).then(([f]) => { leadFacts = f; if (pop.isOpen()) render(regionHomeMeta(region, id)); }).catch(() => { });
      // best-effort mini footprint preview; never blocks or replaces the main render above
      loadRoofForHome(region, id).then(rd => { miniRoof = rd || null; if (rd && pop.isOpen()) render(regionHomeMeta(region, id)); if (!rd) isNoStructure(region, id).then(ns => { if (ns) { noStructHome = true; if (pop.isOpen()) render(regionHomeMeta(region, id)); } }); });
    });
  }
  // inspection hook: open the house card for the home nearest a lon/lat (used to verify the card without hand-clicking)
  window.__homeAt = async (rid, lon, lat) => { const rg = REG(rid); if (!rg) return null; await ensureBin(rg); let b = 1e9, bi = -1; for (let i = 0; i < rg.n; i++) { const c = decodeLonLat(rg, i), d = Math.hypot(c[0] - lon, c[1] - lat); if (d < b) { b = d; bi = i; } } const c = decodeLonLat(rg, bi); homePopup(rg, bi, { lng: c[0], lat: c[1] }); return bi; };
  const legend = (extra = "") => `<div class="map-legend"><b style="font-size:11.5px;color:var(--ink)">Max hail size (radar)</b><div class="ramp"></div>
    <div class="ramp-l"><span>0.75"</span><span>1"</span><span>1.25"</span><span>1.5"</span><span>1.75"</span><span>2"+</span></div>
    <div class="legend-row"><span class="dot" style="background:#A39C90;opacity:.6"></span>Home outside the swath<span class="dot" style="background:#fff;border:2px solid var(--accent);margin-left:10px"></span>Customer</div>${extra}</div>`;
  const sourceNote = st => `<div class="source-note">Source: NOAA MRMS MESH radar, ${st.label}. Homes: county tax rolls.</div>`;

  // ---------- screens ----------
  const SCREENS = {}, ENTER = {};

  // ===== overview =====
  SCREENS.overview = () => {
    const ss = DATA.catalog; // already newest first
    const latest = latestRealStorm(ss);
    const recent = ss.filter(s => s.homes_1in > 0).slice(0, 6);
    const st = latest;
    $("#s-overview").innerHTML = `
      <div class="grid kpis">
        <div class="card kpi"><div class="label">${ic("hail")}Latest storm</div><div class="kpi-value">${latest.label}</div><div class="delta">${latest.max_in.toFixed(2)}" max hail, radar-estimated</div></div>
        <div class="card kpi"><div class="label">${ic("home")}Homes hit, latest storm</div><div class="kpi-value">${int(latest.homes_1in)}</div><div class="delta">1 inch or larger hail${latest.bldgs_1in_nonres ? `, plus ${int(latest.bldgs_1in_nonres)} commercial/other buildings` : ""}</div></div>
      </div>
      <div class="grid ov" style="margin-top:16px">
        <div class="card map-card" id="ov-map"><div class="map-slot"></div>
          <div class="map-title"><b>Hail over the area</b><span>${st.label} &middot; ${int(st.homes_1in)} homes at 1 inch or more</span></div>
          ${legend()}${sourceNote(st)}</div>
        <div class="card"><div class="card-h"><h3>Recent storms</h3><span class="muted">Newest first &middot; ${int(ss.length)} on file since Oct 2020</span></div>
          <div class="card-b" id="recentStorms" style="padding-top:4px"></div></div>
      </div>`;
    $("#recentStorms").innerHTML = recent.map(s => `<button class="row storm-row" data-d="${s.date}" style="width:100%;text-align:left;background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:8px 0">
      <span style="flex:1;font-weight:600">${s.label}</span><span class="muted">${s.max_in.toFixed(2)}" max</span><span class="num" style="min-width:70px;text-align:right">${int(s.homes_1in)} homes</span></button>`).join("");
    if (window.Leads) $$("#recentStorms .storm-row").forEach(b => Leads.stormProof(b.dataset.d).then(p => { if (!p.reports && !p.warnings) return; const sp = b.querySelector("span"); if (sp) sp.insertAdjacentHTML("beforeend", `<span class="muted sp-rowsub">${p.reports ? p.reports + (p.reports === 1 ? " NWS report" : " NWS reports") : ""}${p.reports && p.warnings ? " &middot; " : ""}${p.warnings ? p.warnings + (p.warnings === 1 ? " warning" : " warnings") : ""}</span>`); const sub = b.querySelector(".sp-rowsub"); if (sub) b.title = b.textContent.replace(/\s+/g, " ").trim(); }));
    $$("#recentStorms .storm-row").forEach(b => b.onclick = () => { explicitStorm = b.dataset.d; MS.storm = b.dataset.d; location.hash = "#storm?d=" + b.dataset.d; });
  };
  ENTER.overview = () => { lastMapScreen = "overview"; if (window.Leads && map) Leads.clearLayers(map); placeMap($("#ov-map .map-slot"), NORMAN, 24); const keep = skipMapFit; userMovedMap = false; mapReady.then(() => { const d = hashStorm() || latestRealStorm(DATA.catalog).date; setStorm(d); setCustomerFilter(null); if (!keep) fitStormSwath(d, true, { top: 30, bottom: 70, left: 30, right: 30 }); }); };

  // ===== storm =====
  SCREENS.storm = () => {
    const recent = recentStorms(DATA.catalog);
    $("#s-storm").innerHTML = `
      <div class="grid storm">
        <div class="card map-card" id="st-map"><div class="map-slot"></div>
          <div class="storm-chips">${recent.map(s => `<button class="chip" data-s="${s.date}">${s.label}</button>`).join("")}<button class="chip" id="allStormsBtn" type="button">All storms (${int(DATA.catalog.length)})</button></div>
          ${legend(window.Leads ? Leads.legendHtml() : "")}<div class="source-note" id="stSrc"></div></div>
        <div class="card panel" id="stPanel"></div>
      </div>`;
    $$("#s-storm .chip[data-s]").forEach(b => b.onclick = () => { explicitStorm = b.dataset.s; pickStorm(b.dataset.s, true); });
    $("#allStormsBtn").onclick = () => openStormCatalog();
    if (window.Leads) { $("#spPins").onchange = e => Leads.setVis(map, "pins", e.target.checked); $("#spWarn").onchange = e => Leads.setVis(map, "warn", e.target.checked); }
  };
  ENTER.storm = () => { lastMapScreen = "storm"; const keep = skipMapFit; userMovedMap = false; placeMap($("#st-map .map-slot"), NORMAN, 40); pickStorm(explicitStorm || pickDefaultStorm(DATA.catalog), false, keep); };
  function pickStorm(date, fit, noFit) {
    const st = DATA.byDate[date]; if (!st) return;
    MS.storm = date;
    $$("#s-storm .chip[data-s]").forEach(b => b.classList.toggle("on", b.dataset.s === date));
    // the panel + chips + hash render NOW from the catalog; everything that touches the map waits for the map (mapReady)
    const hitB = noFit ? null : stormHitBounds(date);
    mapReady.then(() => {
      if (MS.storm !== date) return;
      setStorm(date); // async map repaint
      setCustomerFilter(DATA.customers.filter(c => (c.hail[date] || 0) >= 1).map(c => c.id));
      ensureCustomerHail(st).then(() => { if (MS.storm === date && current === "storm") setCustomerFilter(DATA.customers.filter(c => (c.hail[date] || 0) >= 1).map(c => c.id)); });
      if (window.Leads) Leads.showLayers(map, date).then(r => { const n = $("#spNote"); if (n && MS.storm === date) n.textContent = r.reports || r.warnings ? `${r.reports} NWS reports, ${r.warnings} warnings${r.tornado ? " (" + r.tornado + " tornado)" : ""} for this storm` : "No NWS reports or warnings on file for this storm"; });
      if (hitB) hitB.then(b => { if (b) fitStormSwath(date, !!fit, { top: 56, bottom: 64, left: 40, right: 40 }); else if (fit) map.fitBounds(NORMAN, { padding: 30, duration: 600 }); });
    });
    $("#stSrc").textContent = `Source: NOAA MRMS MESH radar, ${st.label}. Homes: county tax rolls.`;
    renderStormPanel(st);
    if (current === "storm") syncStormHash("storm", date);
  }
  function renderStormPanel(st) {
    const custIn = custInCount(st);
    const maxSev = Math.max(...st.severity.map(s => s.homes), 1);
    const sevCol = ["#F2C94C", "#E9A23B", "#E07A3F", "#D0507E", "#7B2D8E"];
    const ago = Math.round((S.today - new Date(st.date + "T12:00:00")) / S.DAY);
    const cityNames = cityList();
    $("#stPanel").innerHTML = `
      <div class="card-h"><h3>Storm of ${st.label}</h3><span class="muted">${ago < 2 ? "last night" : ago < 60 ? ago + " days ago" : ""}</span></div>
      <div class="card-b" style="display:flex;flex-direction:column;gap:14px;flex:1">
        <div class="muted" style="margin-top:-8px">Radar-estimated max hail size at each home in the county.</div>
        <div class="filters-block">
          <button class="filters-toggle" id="filtToggle" type="button" aria-expanded="${filtOpen}">
            <span>Filters</span><span class="cnt ${activeFilterCount() ? "on" : ""}" id="filtCountTag">${activeFilterCount()} active</span>
            <svg class="i chev ${filtOpen ? "open" : ""}"><use href="#i-arrow"/></svg>
          </button>
          <div class="filters-bar" id="filtersBody" ${filtOpen ? "" : "style=\"display:none\""}>
            <select id="fType"><option value="">All home types</option>${TYPE_LABELS.slice(0, 5).map((l, i) => `<option value="${i}" ${STFILT.type === String(i) ? "selected" : ""}>${i === 0 && REGIONS.some(r => r.catalog.homes && r.catalog.homes.type_known === false) ? "Single-family / residential" : l}</option>`).join("")}</select>
            <select id="fCity"><option value="">All cities</option>${cityNames.map(c => `<option ${STFILT.city === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
            <div class="frange"><input type="number" id="fYearMin" placeholder="Built after" value="${STFILT.yearMin || ""}"><span>&ndash;</span><input type="number" id="fYearMax" placeholder="Built before" value="${STFILT.yearMax || ""}"></div>
            <div class="frange"><input type="number" id="fValMin" placeholder="Min value $" value="${STFILT.valMin || ""}"><span>&ndash;</span><input type="number" id="fValMax" placeholder="Max value $" value="${STFILT.valMax || ""}"></div>
            <input type="number" id="fMinHail" placeholder="Min hail, in" step="0.25" min="0.75" value="${STFILT.minHail || ""}">
            <input type="text" id="fZip" placeholder="ZIP" maxlength="5" value="${esc(STFILT.zip || "")}">
            <label class="fcheck"><input type="checkbox" id="fCust" ${STFILT.customersOnly ? "checked" : ""}> Customers only</label>
            <label class="fcheck sp-reroof" title="Hides homes with an OKC re-roof permit since Oct 2023 or an assessor remodel year of 2023 or later. Permits exist inside OKC limits only; the assessor remodel year (Oklahoma County) is for any remodel, not only roofs."><input type="checkbox" id="fReroof" ${STFILT.hideReroof ? "checked" : ""}> Hide recently re-roofed (permit or assessor remodel since 2023)</label>
            <div class="sp-cap">Re-roof permits exist inside OKC limits only.</div>
            <button class="btn sm" id="fReset" type="button">Reset filters</button>
          </div>
        </div>
        <div class="muted" id="filtMatch"></div>
        <div class="big-stat">
          <div class="stat"><div class="v" id="tileHomes">${int(st.homes_1in)}</div><div class="l" id="tileHomesL">Homes in path, 1 inch+</div></div>
          <div class="stat"><div class="v" id="custTile">${custIn}</div><div class="l">Your customers in path</div></div>
          <div class="stat"><div class="v">${st.max_in.toFixed(2)}"</div><div class="l">Largest hail on any building</div></div>
          <div class="stat wide"><div class="v">${int(st.bldgs_1in_nonres)}</div><div class="l">Commercial/other buildings in path, 1 inch+ (Norman)</div></div>
        </div>
        <div class="muted" id="tileNote" style="margin-top:-8px;font-size:12px"></div>
        <div><div style="font-size:12.5px;font-weight:600;margin-bottom:4px">Severity breakdown (homes only; the largest-hail tile also counts commercial buildings)</div>
          ${st.severity.map((s, i) => `<div class="sev"><span>${s.label}</span><span class="track"><span class="fill" style="display:block;width:${s.homes / maxSev * 100}%;background:${sevCol[i]}"></span></span><span class="n">${int(s.homes)}</span></div>`).join("")}
        </div>
        <div style="margin-top:auto;display:flex;flex-direction:column;gap:8px">
          <button class="btn accent block" id="knockMode" ${st.homes_1in ? "" : "disabled"}>${ic("house")}Knock mode, phone door-by-door</button>
          <button class="btn block" id="bestLeads" ${st.homes_1in ? "" : "disabled"} title="${esc(window.Leads ? Leads.WHY : "")}">${ic("home")}Best leads, ranked list</button>
          <button class="btn block" id="canvass" ${st.homes_1in ? "" : "disabled"}>${ic("house")}Door-knock route, ${int(st.homes_1in)} homes</button>
          <button class="btn block" id="exportCust" ${custIn ? "" : "disabled"}>${ic("download")}${custIn ? `Export ${custIn} customer${custIn === 1 ? "" : "s"} in path (CSV)` : "No customers in this path"}</button>
          <div class="fineprint">Hail: NOAA MRMS MESH, 1 km radar grid, max over the storm. Homes: county tax rolls, residential parcels. Customers and dollar values are sample data.</div>
        </div>
      </div>`;
    $("#exportCust").onclick = () => ensureCustomerHail(st).then(() => downloadText(`customers-in-path-${st.date}.csv`, customersInPathCSV(st), "text/csv"));
    ensureCustomerHail(st).then(() => { if (MS.storm === st.date) refreshCustUi(st); });
    $("#canvass").onclick = () => openCanvass(st);
    $("#knockMode").onclick = () => openKnock(st);
    $("#bestLeads").onclick = () => openLeadsList(st);
    wireStormFilters(st);
    if (filtersActive()) renderFilterCount(st);
  }
  // Filters panel: closed by default each time the panel is rebuilt (new storm picked); the user's open/
  // closed choice persists across filter edits since those don't rebuild the whole panel.
  let filtOpen = false;
  function activeFilterCount() {
    return [STFILT.type, STFILT.yearMin, STFILT.yearMax, STFILT.valMin, STFILT.valMax, STFILT.minHail, STFILT.city, STFILT.zip]
      .filter(v => v !== "" && v !== null && v !== undefined).length + (STFILT.customersOnly ? 1 : 0) + (STFILT.hideReroof ? 1 : 0);
  }
  // F21: selects/checkbox apply immediately; free-typed number/text fields debounce so a keystroke never
  // re-scans 99k homes before the user finishes typing
  let filtDebounce = null;
  function wireStormFilters(st) {
    $("#filtToggle").onclick = () => {
      filtOpen = !filtOpen;
      $("#filtersBody").style.display = filtOpen ? "" : "none";
      $("#filtToggle").setAttribute("aria-expanded", String(filtOpen));
      $("#filtToggle .chev").classList.toggle("open", filtOpen);
    };
    const refreshCount = () => {
      const n = activeFilterCount();
      const tag = $("#filtCountTag");
      if (tag) { tag.textContent = `${n} active`; tag.classList.toggle("on", n > 0); }
    };
    const apply = () => {
      STFILT.type = $("#fType").value;
      STFILT.yearMin = $("#fYearMin").value ? +$("#fYearMin").value : null;
      STFILT.yearMax = $("#fYearMax").value ? +$("#fYearMax").value : null;
      STFILT.valMin = $("#fValMin").value ? +$("#fValMin").value : null;
      STFILT.valMax = $("#fValMax").value ? +$("#fValMax").value : null;
      STFILT.minHail = $("#fMinHail").value ? parseFloat($("#fMinHail").value) : null;
      STFILT.city = $("#fCity").value;
      STFILT.zip = $("#fZip").value.trim();
      STFILT.customersOnly = $("#fCust").checked;
      STFILT.hideReroof = $("#fReroof").checked;
      refreshCount();
      ensureFilterMeta(st).then(() => setStorm(st.date));
    };
    const debounced = () => { clearTimeout(filtDebounce); filtDebounce = setTimeout(apply, 350); };
    $("#fType").onchange = apply; $("#fCity").onchange = apply; $("#fCust").onchange = apply; $("#fReroof").onchange = apply;
    $("#fYearMin").oninput = debounced; $("#fYearMax").oninput = debounced;
    $("#fValMin").oninput = debounced; $("#fValMax").oninput = debounced;
    $("#fMinHail").oninput = debounced; $("#fZip").oninput = debounced;
    $("#fReset").onclick = () => {
      STFILT.type = ""; STFILT.yearMin = null; STFILT.yearMax = null; STFILT.valMin = null; STFILT.valMax = null;
      STFILT.minHail = null; STFILT.city = ""; STFILT.zip = ""; STFILT.customersOnly = false; STFILT.hideReroof = false;
      renderStormPanel(st); setStorm(st.date);
    };
  }
  // ---------- searchable storm catalog (all storms on file) ----------
  let catSort = { key: "date", dir: -1 }, catPage = 25;
  // F22: "storms that hit a chosen city" is not precomputed anywhere in data/county/catalog.json (it is
  // a per-storm, county-wide file by design), so a city pick scans each storm's own hail/<date>.bin on
  // demand (same cached, resumable fetch-and-cache ensureStormLoaded already uses for a single storm) and
  // keeps the resulting date set cached per city for the rest of the session, no re-scan on reselect.
  // One parallel pass over every storm's hail bin (only regions that actually have >=0.75in homes that day)
  // builds city -> (date -> residential homes at 0.75in+) for ALL cities at once, so picking a city (or typing
  // one in the search box) is instant after the first scan. Bins are read, counted and dropped (not cached).
  let cityScan = null;
  function scanCityStorms(onProgress) {
    if (cityScan) return cityScan;
    cityScan = (async () => {
      await Promise.all(REGIONS.map(loadRegionMeta));
      const names = {}, ids = {};
      REGIONS.forEach(r => {
        const n = r.n, v = r.metaView, off = n * 2 + n * 4 + n * 2 + n * 2 + n * 4, a = new Uint16Array(n);
        for (let i = 0; i < n; i++) a[i] = v.getUint16(off + i * 2, true);
        ids[r.id] = a; names[r.id] = r.cities.map(c => String(c || "").trim());
      });
      const jobs = [];
      DATA.catalog.forEach(st => st.regions.forEach(rr => { const r = REG(rr.id), cs = r.byDate[st.date]; if (cs && cs.homes_075 > 0) jobs.push([r, st.date]); }));
      const out = new Map(); let next = 0, done = 0;
      const worker = async () => {
        while (next < jobs.length) {
          const [r, date] = jobs[next++];
          let bytes = r.hailCache[date];
          if (bytes === undefined) { try { const res = await fetch(r.path + r.byDate[date].hail); bytes = res.ok ? new Uint8Array(await res.arrayBuffer()) : null; } catch (e) { bytes = null; } }
          if (bytes) {
            const cid = ids[r.id], cnt = new Map();
            for (let i = 0; i < r.n; i++) if (bytes[i] >= 75 && r.type[i] <= 4) cnt.set(cid[i], (cnt.get(cid[i]) || 0) + 1);
            cnt.forEach((c, k) => {
              const nm = names[r.id][k]; if (!nm) return;
              const key = nm.toLowerCase();
              let m = out.get(key); if (!m) out.set(key, m = new Map());
              m.set(date, (m.get(date) || 0) + c);
            });
          }
          onProgress && onProgress(++done, jobs.length);
        }
      };
      await Promise.all(Array.from({ length: 12 }, worker));
      return out;
    })();
    return cityScan;
  }
  function openStormCatalog() {
    catPage = 25;
    const cityNames = cityList();
    let cityMatches = null, cityCounts = null, cityLabel = ""; // Map(date -> homes) for the active city (dropdown or search), or null
    let scanDone = false, scanPct = "";
    const body = `
      <div class="cat-filters" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <input type="text" id="catSearch" placeholder="Search date or city (try Norman)" style="flex:1;min-width:140px">
        <select id="catYear"><option value="">Any year</option>${[...new Set(DATA.catalog.map(s => s.date.slice(0, 4)))].sort().reverse().map(y => `<option>${y}</option>`).join("")}</select>
        <input type="number" id="catMinHail" placeholder="Min hail (in)" step="0.25" min="0.75" style="width:110px">
        <select id="catCity"><option value="">Any city</option>${cityNames.map(c => `<option>${esc(c)}</option>`).join("")}</select>
      </div>
      <div class="muted" id="catCount" style="margin-bottom:6px"></div>
      <div style="max-height:360px;overflow:auto;border:1px solid var(--line,#E7E2D8);border-radius:10px">
        <table class="lines" id="catTable" style="width:100%"></table>
      </div>
      <button class="btn sm" id="catMore" type="button" style="margin-top:8px">Show more</button>`;
    modal(`All storms (${int(DATA.catalog.length)})`, body, "Close", () => {});
    $(".modal")?.classList.add("lg");
    const render = () => {
      let list = DATA.catalog.slice();
      const yr = $("#catYear").value, minHail = parseFloat($("#catMinHail").value), q = $("#catSearch").value.trim().toLowerCase();
      if (yr) list = list.filter(s => s.date.slice(0, 4) === yr);
      if (minHail) list = list.filter(s => s.max_in >= minHail);
      // typed text that names a city (exact or prefix, 3+ letters) filters storms by that city's hits
      const dd = $("#catCity").value;
      let cm = null, cl = "";
      if (dd) { cm = cityMatches; cl = dd; }
      else if (q.length >= 3 && /[a-z]/.test(q)) {
        const all = cityList(), hit = all.find(c => c.toLowerCase() === q) || all.find(c => c.toLowerCase().startsWith(q));
        if (hit) { cl = hit; if (cityCounts && cityLabel === hit) cm = cityCounts; else loadCity(hit, true); }
      }
      const mo = parseMonthYear(q);
      if (q && !(cl && !dd)) list = mo ? list.filter(s => (mo.m == null || +s.date.slice(5, 7) === mo.m) && (mo.y == null || +s.date.slice(0, 4) === mo.y)) : list.filter(s => s.date.includes(q) || s.label.toLowerCase().includes(q));
      if (cl && !cm) { $("#catCount").textContent = `Checking which storms hit ${cl}...${scanPct}`; return; }
      if (cm) list = list.filter(s => cm.has(s.date));
      list.sort((a, b) => catSort.dir * (a[catSort.key] > b[catSort.key] ? 1 : a[catSort.key] < b[catSort.key] ? -1 : 0));
      $("#catCount").textContent = `${int(list.length)} of ${int(DATA.catalog.length)} storms${cl ? ` hit ${cl} (homes at 0.75 in or more)` : ""}`;
      const page = list.slice(0, catPage);
      $("#catTable").innerHTML = `<tr><td class="muted" data-k="date" style="cursor:pointer">Date</td><td class="n muted" data-k="max_in" style="cursor:pointer">Max hail</td><td class="n muted" data-k="homes_1in" style="cursor:pointer">Homes 1in+</td>${cm ? `<td class="n muted">In ${esc(cl)}</td>` : ""}<td></td></tr>` +
        page.map(s => `<tr data-d="${s.date}" style="cursor:pointer"><td>${s.label}</td><td class="n">${s.max_in.toFixed(2)}"</td><td class="n">${int(s.homes_1in)}</td>${cm ? `<td class="n">${int(cm.get(s.date) || 0)}</td>` : ""}<td class="n"><button class="btn sm" data-load="${s.date}" type="button">Load</button></td></tr>`).join("");
      $$("#catTable tr[data-d]").forEach(tr => tr.onclick = e => { if (e.target.closest("[data-load]")) return; loadFromCatalog(tr.dataset.d); });
      $$("#catTable [data-load]").forEach(b => b.onclick = e => { e.stopPropagation(); loadFromCatalog(b.dataset.load); });
      $$("#catTable td[data-k]").forEach(td => td.onclick = () => { const k = td.dataset.k; catSort = { key: k, dir: catSort.key === k ? -catSort.dir : -1 }; render(); });
      $("#catMore").style.display = list.length > catPage ? "" : "none";
    };
    function loadFromCatalog(date) { $(".modal-bg")?.remove(); explicitStorm = date; pickStorm(date, true); }
    $("#catYear").onchange = render; $("#catMinHail").oninput = render; $("#catSearch").oninput = render;
    // loads (once) the all-cities scan, then renders for the wanted city if it is still the active one
    async function loadCity(city, fromSearch) {
      cityLabel = city; cityCounts = null;
      const m = await scanCityStorms((d, t) => { scanPct = ` ${Math.round(d / t * 100)}%`; const c = $("#catCount"); if (c && !scanDone && cityLabel === city) c.textContent = `Checking which storms hit ${city}...${scanPct}`; });
      scanDone = true;
      if (cityLabel !== city) return;
      cityCounts = m.get(city.toLowerCase()) || new Map();
      if ($("#catCity")) { if (!fromSearch) cityMatches = cityCounts; render(); }
    }
    $("#catCity").onchange = async () => {
      const city = $("#catCity").value;
      if (!city) { cityMatches = null; render(); return; }
      cityMatches = null; render();
      await loadCity(city, false);
    };
    $("#catMore").onclick = () => { catPage += 25; render(); };
    render();
    scanCityStorms().then(() => { scanDone = true; }).catch(() => { }); // warm the city scan while the user reads the list
  }
  async function openLeadsList(st) {
    toast("Scoring the hit list...");
    try {
    await ensureStormLoaded(st.date);
    await Promise.all(st.regions.map(rr => loadRegionMeta(REG(rr.id))));
    await ensureLeadData(st);
    } finally { $(".toast")?.remove(); }
    const draw = () => {
      const list = hitListFor(st), top = list.slice(0, 100);
      $("#ldBody").innerHTML = `<div class="muted" style="margin-bottom:8px">${int(list.length)} homes with 1 inch or larger radar hail on ${st.label}${filtersActive() ? " (filters applied)" : ""}. Showing the top ${int(top.length)}; the CSV has all of them.</div>
        <table class="lines ld-table"><thead><tr><th class="muted" style="text-align:left;font-weight:600;padding:0 12px 6px 6px">Score</th><th class="muted" style="text-align:left;font-weight:600;padding:0 12px 6px 6px">Address</th><th class="muted" style="text-align:right;font-weight:600;padding:0 12px 6px 6px">Hail</th><th class="muted" style="text-align:left;font-weight:600;padding:0 6px 6px 12px">Why</th></tr></thead><tbody>${top.map((r, ri) => `<tr class="ld-row" data-i="${ri}" style="cursor:pointer" title="Show this house on the map"><td style="padding-right:12px"><span class="ld-pill" title="${esc(Leads.WHY)}">${r.score}</span></td><td>${esc(r.addr)}<div class="muted" style="font-size:11px">${esc(r.city || "")}${r.zip ? " " + r.zip : ""}</div></td><td class="n">${r.hail.toFixed(2)}"</td><td><div class="ld-parts">${r.parts.map(p => `<span class="ld-part${p.pts < 0 ? " neg" : ""}" title="${esc(p.detail)}">${esc(p.label)} ${p.pts >= 0 ? "+" : ""}${p.pts}</span>`).join("")}</div></td></tr>`).join("")}</tbody></table>`;
      $("#ldCsv").onclick = () => downloadText(`best-leads-${st.date}.csv`, hitListCSV(list), "text/csv");
      $$("#ldBody tr.ld-row").forEach(tr => tr.onclick = () => {
        const r = top[+tr.dataset.i]; if (!r) return;
        $(".modal-bg")?.remove();
        const rg = REG(r.rid);
        if (!["storm", "overview"].includes(current)) location.hash = "#storm";
        map.once("moveend", () => homePopup(rg, r.idx, { lng: r.lon, lat: r.lat }, { keepCamera: true }));
        map.flyTo({ center: [r.lon, r.lat], zoom: 17, duration: 900 });
      });
    };
    modal(`Best leads, ${st.label}`, `<div class="ld-bar"><label>Sort <select id="ldSort"><option value="score" ${leadSort === "score" ? "selected" : ""}>Best leads first</option><option value="hail" ${leadSort === "hail" ? "selected" : ""}>Largest hail first</option></select></label><button class="btn sm accent" id="ldCsv" type="button">${ic("download")}Download CSV</button></div><div class="fineprint" style="margin:6px 0 10px">${esc(Leads.WHY)}</div><div id="ldBody"></div>`, "Close", () => {});
    $(".modal")?.classList.add("lg");
    $("#ldSort").onchange = e => { leadSort = e.target.value; draw(); };
    draw();
  }
  async function openKnock(st) {
    if (!window.Knock) return toast("Knock mode is still loading, try again.");
    toast("Building the hit list...");
    await ensureStormLoaded(st.date);
    await Promise.all(st.regions.map(rr => loadRegionMeta(REG(rr.id))));
    await ensureLeadData(st);
    const rows = hitListFor(st).map(r => ({ rid: r.rid, idx: r.idx, addr: r.addr, city: r.city, zip: r.zip, lon: r.lon, lat: r.lat, score: r.score, hail: r.hail }));
    window.Knock.open({ date: st.date, label: st.label, rows });
  }
  window.__knockCurrent = () => { const st = DATA && (DATA.catalog.find(x => x.date === MS.storm) || latestRealStorm(DATA.catalog)); if (st) openKnock(st); };
  async function openCanvass(st) {
    toast("Building the hit list...");
    await ensureStormLoaded(st.date);
    await Promise.all(st.regions.map(rr => loadRegionMeta(REG(rr.id))));
    await Promise.all(st.regions.map(rr => loadRegionOwners(REG(rr.id))));
    await ensureLeadData(st);
    const list = hitListFor(st);
    const canOwners = cloudOwners() || list.some(r => r.ownerName);
    const ownerNote = canOwners ? "Owner names are available for this area (county tax roll). They are left out of the CSV unless you tick the box below." : "";
    const CAP = 300;
    const capped = list.slice(0, CAP);
    const route = nearestNeighborRoute(capped.map(r => ({ ...r })));
    let miles = 0;
    for (let i = 1; i < route.length; i++) miles += milesBetween(route[i - 1], route[i]);
    // combine every stop on the same street into one row (not just consecutive stops), ordered by first visit
    const groups = [], byStreet = new Map();
    route.forEach(h => {
      const street = streetOf(h.addr), key = streetKey(street);
      let g = byStreet.get(key);
      if (!g) { g = { street, homes: [] }; byStreet.set(key, g); groups.push(g); }
      else if (street.length > g.street.length) g.street = street; // keep the spelled-out variant (Road over Rd)
      g.homes.push(h);
    });
    const body = `
      <div class="muted" style="margin-bottom:10px">${int(list.length)} homes took 1 inch or larger radar hail on ${st.label}, address and ZIP from county tax rolls. ${ownerNote}</div>
      ${canOwners ? `<label style="display:flex;gap:8px;align-items:flex-start;margin:0 0 8px;font-size:12.5px"><input type="checkbox" id="dlOwners" style="margin-top:2px"><span>Include owner names in the CSV<br><span class="muted">Use limits: for your own roofing marketing and door-knocking only. Do not resell, share or publish these names, and honor do-not-contact requests.</span></span></label>` : ""}
      <button class="btn sm accent" id="dlCsv" type="button">${ic("file")}Download hit list CSV (${int(list.length)} homes)</button>
      <hr class="sep">
      <div style="font-weight:600;font-size:12.5px;margin-bottom:4px">Door-knock route &middot; top ${int(capped.length)} homes by ${leadSort === "score" ? "lead score" : "hail size"}, nearest-neighbor order</div>
      <div class="muted" style="margin-bottom:8px">~${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi rough drive distance (straight-line estimate between stops), grouped by street. ${list.length > CAP ? `Full list of ${int(list.length)} homes is in the CSV.` : ""}</div>
      <div style="max-height:260px;overflow:auto;border:1px solid var(--line,#E7E2D8);border-radius:10px;padding:4px 10px">
        ${groups.map(g => `<div class="row" style="padding:5px 0"><span>${esc(g.street)}</span><b class="num">${g.homes.length}</b></div>`).join("")}
      </div>`;
    modal(`Door-knock route, ${st.label}`, body, "Close", () => {});
    $("#dlCsv").onclick = async () => {
      const wo = !!($("#dlOwners") && $("#dlOwners").checked);
      if (wo && cloudOwners()) { // fetch only the exported homes' rows, in small chunks, on demand
        const by = {}; list.forEach(r => (by[r.rid] || (by[r.rid] = [])).push(r));
        for (const rid of Object.keys(by)) for (let i = 0; i < by[rid].length; i += 150) {
          const part = by[rid].slice(i, i + 150), m = await RC_AUTH.ownerRows(rid, part.map(r => r.idx));
          part.forEach(r => { r.ownerName = m[r.idx] || ""; });
        }
      }
      downloadText(`hit-list-${st.date}.csv`, hitListCSV(list, wo), "text/csv");
    };
  }

  // ===== roof =====
  let roofMap = null, roofMat = 1;
  const MATS = [
    { name: "Architectural", sq: 0, label: "Architectural shingles (30-yr class)" },
    { name: "Class 4 impact", short: "Class 4", sq: 95, label: "Class 4 impact-rated shingles" },
    { name: "Standing seam", sq: 520, label: "Standing seam metal" }
  ];
  const NORMAN_CENTER = [(NORMAN[0][0] + NORMAN[1][0]) / 2, (NORMAN[0][1] + NORMAN[1][1]) / 2];
  // RF = the roof screen's entire state. status: "empty" (no house clicked yet this session), "loading",
  // "ok" (RF.data has THIS house's own footprint/measurements), "none" (this exact house has no building
  // footprint on file -- an honest dead end, never another house's numbers). A newer click always wins: the
  // loadRoofForHome promise checks RF.region/RF.homeId are still current before applying its result.
  let RF = { status: "empty", data: null, region: null, homeId: null, addr: null, ll: null };
  // #roof?r=<region>&i=<idx>: a reload (or shared link) re-opens the same house
  function restoreRoofFromHash() {
    if (RF.status !== "empty") return;
    const m = /[?&]r=([\w-]+)&i=(\d+)/.exec(location.hash); if (!m) return;
    const rg = REG(m[1]), id = +m[2]; if (!rg || !(id >= 0 && id < rg.n)) return;
    Promise.all([ensureBin(rg), loadRegionMeta(rg)]).then(() => {
      if (RF.status !== "empty") return;
      const c = decodeLonLat(rg, id); openRoofFor(rg, id, { lng: c[0], lat: c[1] }, regionHomeMeta(rg, id).addr);
    }).catch(() => { });
  }
  function openRoofFor(region, id, ll, addr) {
    RF = { status: "loading", data: null, region, homeId: id, addr, ll };
    { const h = `#roof?r=${region.id}&i=${id}`; if (location.hash !== h) location.hash = h; }
    if (built.roof) renderRoofScreen();
    if (roofMap) updateRoofMap();
    loadRoofForHome(region, id).then(data => {
      if (RF.region !== region || RF.homeId !== id) return; // superseded by a newer click, drop silently
      RF.status = data ? "ok" : "none"; RF.data = data; RF.netFail = !data && roofNetFail;
      if (built.roof) renderRoofScreen();
      if (roofMap) updateRoofMap();
      if (!data && !RF.netFail) afterNoOutline(region, id);
    });
  }
  // a house with no outline: find out whether the county says no building is on the parcel, and whether a parcel-boundary
  // match was suggested for it (then the review opens straight on the satellite photo)
  function afterNoOutline(region, id) {
    Promise.all([isNoStructure(region, id), parcelSuggestion(region, id)]).then(([ns, sug]) => {
      if (RF.region !== region || RF.homeId !== id || RF.status !== "none") return;
      RF.noStruct = ns; RF.suggest = sug;
      if (sug && !RF.skipSuggest && !RF.drawing) { startDrawing({ suggest: sug }); return; }
      if (built.roof) renderRoofScreen();
    });
  }
  // ---- drawing mode (js/draw.js) ----
  let drawInst = null;
  function startDrawing(opts) {
    if (!window.RoofDraw || !RF.region) return toast("Drawing tool failed to load.");
    opts = opts || {};
    RF.drawing = { suggest: opts.suggest || null, redraw: !!opts.redraw };
    !/^#roof/.test(location.hash) && (location.hash = "#roof");
    if (built.roof) renderRoofScreen();
    roofPrimary = "satellite";
    if (!roofMap) { satFailed = false; initRoofMap(); } else { roofMap.resize(); updateRoofMap(); }
    applyRoofPrimary();
    mountDrawTool();
  }
  function mountDrawTool() {
    const stage = $("#rfStage"); if (!stage || !roofMap || !RF.drawing) return;
    if (drawInst) { drawInst.destroy(); drawInst = null; }
    const R = RF.region, id = RF.homeId;
    drawInst = window.RoofDraw.mount(stage, roofMap, {
      suggest: RF.drawing.suggest, redraw: RF.drawing.redraw,
      onUse: pts => commitDrawn(R, id, pts, "hand"),
      onYes: (ring, sug) => { const pts = ring.slice(); if (pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop(); commitDrawn(R, id, pts, "parcel"); },
      onDraw: () => { if (RF.drawing) { RF.drawing.suggest = null; renderRoofScreen(); } },
      onCancel: () => endDrawing(),
      onSkip: () => { RF.skipSuggest = true; endDrawing(); }
    });
    if (RF.drawing.suggest) { const sg = RF.drawing.suggest.ring, xs = sg.map(p => p[0]), ys = sg.map(p => p[1]); roofMap.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 90, duration: 0, maxZoom: 20 }); }
  }
  function endDrawing() {
    RF.drawing = null;
    if (drawInst) { drawInst.destroy(); drawInst = null; }
    roofPrimary = "diagram";
    renderRoofScreen(); if (roofMap) updateRoofMap();
  }
  function commitDrawn(region, id, pts, via) {
    if (!writeDrawn(region, id, pts, via)) toast("Could not save in this browser; the outline will not come back after a reload.");
    RF.drawing = null; RF.status = "loading";
    if (drawInst) { drawInst.destroy(); drawInst = null; }
    roofPrimary = "diagram";
    renderRoofScreen();
    loadRoofForHome(region, id).then(data => {
      if (RF.region !== region || RF.homeId !== id) return;
      RF.status = data ? "ok" : "none"; RF.data = data; RF.netFail = !data && roofNetFail;
      renderRoofScreen(); if (roofMap) updateRoofMap();
    });
  }
  function removeDrawn() {
    const region = RF.region, id = RF.homeId; eraseDrawn(region, id);
    RF.status = "loading"; renderRoofScreen();
    loadRoofForHome(region, id).then(data => {
      if (RF.region !== region || RF.homeId !== id) return;
      RF.status = data ? "ok" : "none"; RF.data = data; RF.netFail = !data && roofNetFail; renderRoofScreen(); if (roofMap) updateRoofMap();
      if (!data && !RF.netFail) afterNoOutline(region, id);
    });
  }
  window.__roofOpen = (regionId, id) => { const rg = REGIONS.find(r => r.id === regionId); if (!rg) return false; const c = decodeLonLat(rg, id); openRoofFor(rg, id, { lng: c[0], lat: c[1] }, "Test home " + id); return true; }; // inspection hook
  SCREENS.roof = () => {
    $("#s-roof").innerHTML = `
      <div class="grid roof">
        <div class="card map-card" id="rf-map">
          <div class="rf-head">
            <div class="rf-title"><b id="roofHeadline">Roof Measure</b><span id="roofSub">Click a house, then Measure roof</span></div>
            <div class="rf-tools">
              <div class="rf-zoom" id="rfZoom" role="group" aria-label="Zoom the roof drawing">
                <button type="button" id="rfZoomOut" aria-label="Zoom out">&minus;</button>
                <button type="button" id="rfZoomIn" aria-label="Zoom in">+</button>
                <button type="button" id="rfFit" aria-label="Fit drawing to view">Fit</button>
              </div>
              <div class="rf-view" id="rfView" role="group" aria-label="Roof view"><button type="button" data-v="3d">3D</button><button type="button" data-v="2d">2D</button></div>
              <button class="btn sm" id="tourBtn" type="button" title="A guided 3D tour: overview, each facet, ridges, hips, valleys, eaves" hidden>${ic("play")}Tour</button>
              <div class="dr-tour" id="tourCtl" role="group" aria-label="Tour controls" hidden><button class="btn sm" type="button" id="tourPause">Pause</button><button class="btn sm" type="button" id="tourNext">Next</button><button class="btn sm" type="button" id="tourStop">Stop</button><span class="dr-stop" id="tourStopLbl" aria-live="polite"></span></div>
              <button class="btn sm roof-sat-toggle" id="satToggle" type="button">${ic("house")}Satellite photo</button>
              <button class="btn sm" id="backToMap" type="button"><svg class="i" style="transform:scaleX(-1)"><use href="#i-arrow"/></svg>Back to map</button>
            </div>
          </div>
          <div class="rf-stage" id="rfStage">
            <div id="roofDiagram" class="roof-diagram"></div>
            <div id="roof3d" class="roof-diagram roof-3d" style="display:none"></div>
            <div id="roofmap" class="roof-sat"></div>
            <div class="roof-empty" id="roofEmpty"><div class="roof-empty-inner">
              <svg class="i" style="width:32px;height:32px;color:var(--muted)"><use href="#i-house"/></svg>
              <p>Click any house on Overview or Storm Response, then "Measure roof" on its card. This screen shows that one house's own real outline and its own numbers, never a sample.</p>
              <button class="btn accent" id="pickHouseBtn" type="button">Pick a house on the map</button>
            </div></div>
            <div class="source-note" id="roofSrcNote">Footprint: Microsoft Building Footprints (ODbL), OpenStreetMap fallback.</div>
          </div>
          <div class="rf-info" id="rfInfo" aria-live="polite"></div>
        </div>
        <div class="card rf-panel"><div class="card-h"><h3 id="rfPanelH">Roof</h3></div>
          <div class="card-b" id="roofCardBody"></div></div>
      </div>`;
    $("#backToMap").onclick = backToMap;
    // one zoom control set: drives the drawing, or the satellite photo while that view is showing
    const satOn = () => roofPrimary === "satellite" && roofMap;
    const r3 = () => r3dOn() && window.Roof3D.current;
    $("#rfZoomIn").onclick = () => r3() ? r3().zoom(1.5) : satOn() ? roofMap.zoomIn({ duration: 150 }) : rvZoomBy(1.5);
    $("#rfZoomOut").onclick = () => r3() ? r3().zoom(1 / 1.5) : satOn() ? roofMap.zoomOut({ duration: 150 }) : rvZoomBy(1 / 1.5);
    $("#rfFit").onclick = () => { if (r3()) { rvSelect(null); r3().reset(); } else if (satOn()) { RF.status === "ok" && fitRoofView(RF.data); } else rvFit(); };
    $$("#rfView button").forEach(b => b.onclick = () => { roofView = b.dataset.v; applyRoofPrimary(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && rvSel && $("#s-roof")?.classList.contains("on")) rvSelect(null); });
    $("#pickHouseBtn").onclick = () => { location.hash = "#" + (lastMapScreen && lastMapScreen !== "roof" ? lastMapScreen : "storm"); };
    $("#tourBtn").onclick = () => tourStart();
    $("#tourPause").onclick = () => tourPause();
    $("#tourNext").onclick = () => tourNext(true);
    $("#tourStop").onclick = () => tourStop();
    $("#satToggle").onclick = () => setRoofPrimary(roofPrimary === "diagram" ? "satellite" : "diagram");
    renderRoofScreen();
  };
  // which view is the big one in the map card: "diagram" (default, crisp to-scale SVG) or "satellite"
  // (aerial imagery, an optional small toggle per Jack's 2026-10-02 note -- satellite does not render
  // legibly at rooftop zoom, so it is never the default)
  let roofPrimary = "diagram";
  function applyRoofPrimary() {
    const d = $("#roofDiagram"), m = $("#roofmap"), btn = $("#satToggle");
    if (!d || !m) return;
    const drawing = !!RF.drawing;
    if (!drawing && drawInst) { drawInst.destroy(); drawInst = null; }
    if (drawing) roofPrimary = "satellite";
    const canToggle = RF.status === "ok" && !drawing; // only a real footprint has a diagram to toggle away from
    if (!canToggle && !drawing) roofPrimary = "diagram";
    if (!(RF.status === "ok" && !drawing)) tourStop(true);
    const showDiagram = canToggle && roofPrimary === "diagram";
    const showSat = (canToggle || drawing) && roofPrimary === "satellite" && !!roofMap;
    // no-data house: hide the empty stage + info strip, the honest message in the panel is all that shows
    $("#rfStage")?.classList.toggle("none", RF.status === "none" && !drawing);
    $("#rfInfo")?.classList.toggle("none", RF.status === "none" || drawing);
    $("#rf-map")?.classList.toggle("no-stage", RF.status === "none" && !drawing);
    const want3d = showDiagram && r3dOn();
    const h3 = $("#roof3d"); if (h3) h3.style.display = want3d ? "" : "none";
    const rv = $("#rfView"); if (rv) { rv.style.display = canToggle && roofPrimary === "diagram" && r3dCan() ? "" : "none"; $$("#rfView button").forEach(b => b.classList.toggle("on", b.dataset.v === (want3d ? "3d" : "2d"))); }
    d.style.display = showDiagram && !want3d ? "" : "none";
    d.classList.toggle("full", showDiagram);
    if (want3d) mount3d(); else if (window.Roof3D) window.Roof3D.suspend();
    m.style.display = showSat ? "" : "none"; // never a blank box: only visible when the photo view is chosen
    if (btn) {
      btn.style.display = canToggle && !satFailed && !drawing ? "" : "none";
      btn.innerHTML = roofPrimary === "diagram" ? `${ic("house")}Satellite photo` : `${ic("ruler")}Diagram view`;
    }
    const zm = $("#rfZoom"); if (zm) zm.style.display = canToggle || drawing ? "" : "none";
    const tb = $("#tourBtn"); if (tb) tb.hidden = !(RF.status === "ok" && !drawing && showDiagram && !tourOn);
    const inf = $("#rfInfo"); if (inf) inf.style.display = showDiagram ? "" : "none";
    if (showDiagram && d.dataset.built !== "1") requestAnimationFrame(() => mountRoofDiagram());
    if (showSat) setTimeout(() => { roofMap.resize(); if (RF.status === "ok") fitRoofView(RF.data); }, 0);
  }
  let satFailed = false;
  // ===== 3D roof (js/roof3d.js, three.js lazy-loaded on first use). 3D is the default when WebGL works and the
  // house has a roof plan; the 2D plan stays intact behind the 2D toggle. Both views share rvSel / rvSelect. =====
  let roofView = "3d", r3dFailed = false;
  const r3dCan = () => !!(window.Roof3D && !r3dFailed && window.Roof3D.supported());
  function r3dOn() {
    return roofView === "3d" && r3dCan() && roofPrimary === "diagram" && RF.status === "ok" && !!rvGeom && !!rvGeom.plan && RV.key === (RF.region && RF.region.id) + ":" + RF.homeId;
  }
  function r3Label(sel) {
    const g = rvGeom, pl = g && g.plan; if (!sel || !pl) return "";
    if (sel.k === "facet") { const f = pl.facets[sel.i]; return `Facet ${f.label} · ${int(Math.round(f.slopeSqft))} sq ft`; }
    if (sel.k === "eave") return `Eave · ${rvFt(g.eaves[sel.i].lenFt)} ft`;
    const s = sel.k === "ridge" ? pl.ridges[sel.i] : sel.k === "hip" ? pl.hips[sel.i] : sel.k === "rake" ? pl.rakes[sel.i] : pl.valleys[sel.i];
    return `${sel.k[0].toUpperCase() + sel.k.slice(1)} · ${rvFt(s.lenFt)} ft`;
  }
  function mount3d() {
    const host = $("#roof3d");
    if (!host || !r3dOn() || !$("#s-roof")?.classList.contains("on")) return;
    const g = rvGeom, key = RV.key;
    window.Roof3D.mount(host, { key, plan: g.plan, pts: g.pts, pitch: roofPitch, pitchNote: pitchTag().tag, stories: 1 }, {
      label: r3Label,
      onPick: s => rvSelect(s || null),
      onFail: () => { r3dFailed = true; applyRoofPrimary(); }
    }).then(inst => { if (inst && rvSel) inst.select(rvSel, rvMeta, { noFly: !!(inst.S.sel && inst.S.sel.k === rvSel.k && inst.S.sel.i === rvSel.i) }); });
  }
  let rvMeta = null;
  // clicking a Measurements tile (roof area, eaves, ridges, hips, valleys): fly to / highlight that group, one piece
  // per click, cycling "1 of N"; works in both 2D and 3D
  function rfGroup(kind) {
    const g = rvGeom, pl = g && g.plan; if (!pl) return;
    const arr = kind === "eave" ? g.eaves : kind === "facet" ? pl.facets : pl[kind + "s"];
    if (!arr || !arr.length) return;
    const idx = rvSel && rvMeta && rvMeta.group && rvSel.k === kind ? (rvMeta.idx + 1) % arr.length : 0;
    rvSelect({ k: kind, i: idx }, { group: true, n: arr.length, idx });
    $("#rf-map")?.scrollIntoView({ block: "nearest", behavior: reduceMotion() ? "auto" : "smooth" });
  }
  // ===== 3D tour: overview -> each facet -> ridges -> hips -> valleys -> eaves/rakes, ~2.5 s a stop, reuses rvSelect so the
  // camera flight, highlight, callout and info strip are the same ones a click gives. Reduced motion: no timer, Next steps through.
  let tourOn = false, tourI = 0, tourStops = [], tourTimer = 0, tourPaused = false;
  function tourBuild() {
    const g = rvGeom, pl = g && g.plan, st = [{ sel: null, name: "Overview" }];
    if (!pl) return st;
    pl.facets.slice(0, 6).forEach((f, i) => st.push({ sel: { k: "facet", i }, name: "Facet " + f.label }));
    [["ridge", pl.ridges, 3], ["hip", pl.hips, 4], ["valley", pl.valleys, 3], ["eave", g.eaves, 1], ["rake", pl.rakes || [], 1]].forEach(([k, arr, cap]) => {
      arr.slice(0, cap).forEach((x, i) => st.push({ sel: { k, i }, name: k[0].toUpperCase() + k.slice(1) + (arr.length > 1 && k !== "eave" && k !== "rake" ? " " + (i + 1) + " of " + arr.length : "") }));
    });
    st.push({ sel: null, name: "Overview", end: true });
    return st;
  }
  function tourShow() {
    const stop = tourStops[tourI]; if (!stop) return tourStop();
    if (stop.sel) rvSelect(stop.sel, null); else { rvSelect(null); if (r3dOn() && window.Roof3D.current) window.Roof3D.current.reset(); else rvFit(); }
    const l = $("#tourStopLbl"); if (l) l.textContent = `${stop.name} (${tourI + 1} of ${tourStops.length})`;
    clearTimeout(tourTimer);
    if (!reduceMotion() && !tourPaused) tourTimer = setTimeout(() => tourNext(false), 2500);
  }
  function tourNext(manual) {
    if (!tourOn) return;
    if (tourI >= tourStops.length - 1) { if (manual || tourStops[tourI].end) return tourStop(); }
    tourI = Math.min(tourI + 1, tourStops.length - 1);
    tourShow();
    if (!reduceMotion() && !tourPaused && tourStops[tourI].end) { clearTimeout(tourTimer); tourTimer = setTimeout(() => tourStop(), 2500); }
  }
  function tourPause() {
    if (!tourOn) return; tourPaused = !tourPaused;
    const b = $("#tourPause"); if (b) b.textContent = tourPaused ? "Resume" : "Pause";
    clearTimeout(tourTimer); if (!tourPaused && !reduceMotion()) tourTimer = setTimeout(() => tourNext(false), 2500);
  }
  function tourStart() {
    if (RF.status !== "ok" || !rvGeom || !rvGeom.plan) return;
    tourStops = tourBuild(); tourI = 0; tourPaused = false; tourOn = true;
    $("#tourBtn").hidden = true; $("#tourCtl").hidden = false;
    const rm = reduceMotion(); $("#tourPause").hidden = rm; $("#tourPause").textContent = "Pause";
    $("#rf-map")?.scrollIntoView({ block: "nearest", behavior: rm ? "auto" : "smooth" });
    tourShow();
  }
  function tourStop(quiet) {
    clearTimeout(tourTimer);
    if (!tourOn) return;
    tourOn = false; tourPaused = false;
    const c = $("#tourCtl"); if (c) c.hidden = true;
    const b = $("#tourBtn"); if (b) b.hidden = !(RF.status === "ok" && !RF.drawing);
    if (!quiet) { rvSelect(null); if (r3dOn() && window.Roof3D.current) window.Roof3D.current.reset(); else rvFit(); }
  }
  const reduceMotion = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  // Satellite is lazy: the maplibre instance + tiles are never created until the roofer actually
  // asks to see the photo (Jack, 2026-10-02: satellite doesn't render legibly at rooftop zoom, so the
  // crisp SVG diagram is always the default and the only thing loaded up front).
  function setRoofPrimary(which) {
    roofPrimary = which;
    if (which === "satellite" && !roofMap) { satFailed = false; initRoofMap(); }
    else if (roofMap) { roofMap.resize(); updateRoofMap(); }
    applyRoofPrimary();
    if (which === "diagram") requestAnimationFrame(() => mountRoofDiagram());
  }
  function renderRoofScreen() {
    const head = $("#roofHeadline"), sub = $("#roofSub"), body = $("#roofCardBody");
    if (!head) return;
    { const ld = RF.status === "loading" && !RF.drawing, em = $("#roofEmpty");
      if (em) { const p = em.querySelector("p"), b = em.querySelector("button"); if (!em.dataset.msg) em.dataset.msg = p.textContent;
        p.textContent = ld ? "Looking up this home's outline..." : em.dataset.msg; if (b) b.hidden = ld; em.classList.toggle("on", RF.status === "empty" || ld); } }
    { const pn = $("#s-roof .rf-panel"); if (pn) pn.style.display = RF.status === "empty" ? "none" : ""; }
    { const ph = $("#rfPanelH"); if (ph) ph.textContent = RF.status === "ok" && !RF.drawing ? "Measurements" : "Roof"; }
    if (RF.status === "empty") {
      head.textContent = "Roof Measure"; sub.textContent = "Click a house, then Measure roof";
      body.innerHTML = ""; // the stage already says this once (#roofEmpty)
      applyRoofPrimary();
      return;
    }
    if (RF.drawing) {
      head.textContent = (RF.data && RF.data.addr) || RF.addr || "This address";
      sub.textContent = RF.drawing.suggest ? "Check the parcel match" : RF.drawing.redraw ? "Redraw the roof outline" : "Draw this roof";
      body.innerHTML = `<div class="muted" style="padding:6px 0">${RF.drawing.suggest ? "The dashed outline is the building found inside this parcel's boundary. Confirm it if it is the house, or draw it yourself." : "Click the corners of the roof on the satellite photo. Edge lengths show live in feet. When the shape is closed, Use this outline builds the 2D and 3D roof, measurements and proposal from it."}</div>`;
      applyRoofPrimary();
      return;
    }
    if (RF.status === "loading") {
      head.textContent = RF.addr || "Loading..."; sub.textContent = "Looking up this address's building footprint";
      body.innerHTML = `<div class="muted" style="padding:6px 0">Loading this home's footprint...</div>`;
      applyRoofPrimary();
      return;
    }
    if (RF.status === "none" && RF.netFail) {
      head.textContent = RF.addr || "This address"; sub.textContent = "Roof data did not load";
      body.innerHTML = `<div class="muted" style="padding:6px 0">The roof outline data for this area did not load. This is a connection or server problem, not a missing building. Check your connection and try again. <a href="help/index.html#troubleshooting" target="_blank" rel="noopener">Help</a></div>
        <div class="dr-note">You can still trace the roof yourself on the satellite photo.<div class="dr-actions"><button class="btn sm accent" id="retryRoofBtn" type="button">Try again</button><button class="btn sm" id="drawBtn" type="button">${ic("ruler")}Draw this roof</button></div></div>`;
      $("#retryRoofBtn").onclick = () => openRoofFor(RF.region, RF.homeId, RF.ll, RF.addr);
      $("#drawBtn").onclick = () => startDrawing();
      applyRoofPrimary();
      return;
    }
    if (RF.status === "none") {
      head.textContent = RF.addr || "This address"; sub.textContent = RF.noStruct ? "No building found on this parcel" : "No footprint on file";
      body.innerHTML = `<div class="muted" style="padding:6px 0">${RF.noStruct ? "No building found on this parcel (county record may be vacant land)." : "No building outline on file for this address. This home's footprint hasn't been matched against the county building-footprint layer (too close to another home, under the map's size cutoff, or outside current coverage). No measurement is shown rather than guessing."}</div>
        <div class="dr-note">You can trace the roof yourself on the satellite photo and get the same 2D, 3D, measurements and proposal.<div class="dr-actions"><button class="btn sm accent" id="drawBtn" type="button">${ic("ruler")}Draw this roof</button>${RF.suggest ? `<button class="btn sm" id="reviewSugBtn" type="button">Review the parcel match</button>` : ""}</div></div>`;
      $("#drawBtn").onclick = () => startDrawing();
      $("#reviewSugBtn") && ($("#reviewSugBtn").onclick = () => startDrawing({ suggest: RF.suggest }));
      applyRoofPrimary();
      return;
    }
    const R = RF.data;
    syncPitchTo(R);
    roofPrimary = "diagram";
    head.textContent = R.addr || R.street; sub.textContent = (R.city ? R.city + " · " : "") + (srcLabel(R) || "building footprint on file");
    const rn = roofNumbersFor(R);
    const pts = footprintFeet(R);
    currentRoofPlan = (pts.length >= 4 && window.RoofPlan) ? window.RoofPlan.build(pts, roofPitch, { style: roofStyle }) : null;
    const pl = currentRoofPlan ? currentRoofPlan.totals : null;
    body.innerHTML = `
      <div class="rp">
        <div class="rp-nums">
          <div class="rp-stats">
            <div class="stat"><div class="l">Footprint</div><div class="v"><span id="rsFootprint">${int(R.footprint_sqft)}</span><small>sq ft</small></div><div class="s">from outline</div></div>
            <div class="stat rp-click" data-grp="${pl ? "facet" : ""}"><div class="l">Roof area</div><div class="v"><span id="rsRoofArea"></span><small>sq ft</small></div><div class="s" id="rsRoofSub"></div></div>
            <div class="stat key"><div class="l">Squares to order</div><div class="v"><span id="rsOrder"></span><small>sq</small></div><div class="s" id="rsOrderSub"></div></div>
            <div class="stat rp-click" data-grp="${pl ? "eave" : ""}"><div class="l">Eaves / perimeter</div><div class="v"><span id="rsPerimeter">${int(pl ? pl.eaveFt : R.perimeter_ft)}</span><small>ft</small></div><div class="s">drip edge</div></div>
            <div class="stat rp-click" data-grp="${pl && currentRoofPlan.ridges.length ? "ridge" : ""}"><div class="l">Ridges</div><div class="v">${pl ? pl.ridgeFt : "n/a"}<small>${pl ? "ft" : ""}</small></div><div class="s">${pl ? "ridge cap" : ""}</div></div>
            <div class="stat rp-click" data-grp="${pl && pl.hipCount ? "hip" : ""}"><div class="l">Hips</div><div class="v">${pl ? pl.hipFt : "n/a"}<small>${pl ? "ft" : ""}</small></div><div class="s">${pl ? pl.hipCount + " run" + (pl.hipCount === 1 ? "" : "s") : ""}</div></div>
            <div class="stat rp-click" data-grp="${pl && pl.valleyCount ? "valley" : ""}"><div class="l">Valleys</div><div class="v">${pl ? pl.valleyFt : "n/a"}<small>${pl ? "ft" : ""}</small></div><div class="s">${pl ? pl.valleyCount + " run" + (pl.valleyCount === 1 ? "" : "s") : ""}</div></div>
            <div class="stat${pl && pl.rakeCount ? " rp-click" : ""}" data-grp="${pl && pl.rakeCount ? "rake" : ""}"><div class="l">Rakes</div><div class="v">${pl ? pl.rakeFt : "n/a"}<small>${pl ? "ft" : ""}</small></div><div class="s">${pl ? (pl.rakeCount ? pl.rakeCount + " gable edge" + (pl.rakeCount === 1 ? "" : "s") + ", drip edge" : "none, hip roof") : ""}</div></div>
          </div>
          <div class="roof-controls">
            <label>Pitch (${pitchTag().short}) <select id="pitchSel" title="${R.measuredPitch ? `LiDAR 2018 measured ${R.measuredPitch.p}/12, confidence ${R.measuredPitch.conf}%` : "No measured pitch for this house; 6/12 is a typical assumption"}">${PITCH_FACTORS.map(pf => `<option value="${pf.p}" ${pf.p === roofPitch ? "selected" : ""}>${pf.p === 0 ? "flat (0/12)" : pf.p + "/12"}</option>`).join("")}</select></label>
            <label>Roof style <select id="styleSel"><option value="hip" ${roofStyle === "hip" ? "selected" : ""}>Hip</option><option value="gable" ${roofStyle === "gable" ? "selected" : ""}>Gable</option><option value="auto" ${roofStyle === "auto" ? "selected" : ""}>Auto</option></select></label>
            <label>Waste % <input type="number" id="wasteInput" min="0" max="30" step="1" value="${roofWaste}"></label><small id="wasteNote" class="muted" style="display:none">Waste is kept between 0 and 30%.</small>
            <span class="muted rp-factor">Pitch factor <b>x${rn.factor.toFixed(3)}</b>${pl ? ` &middot; ${pl.facetCount} facets` : ""}</span>
          </div>
          <div class="roof-model-label muted">Roof shape modeled from the building outline (${currentRoofPlan ? currentRoofPlan.style : "hip"} roof). Pitch is ${pitchTag().plain}.</div>
          ${R.checkOutline && R.source !== "drawn" ? `<div class="roof-model-label" id="rsCheckOutline"><b>Check outline.</b> Outline matched near this address; check it's the house, or redraw.</div>` : ""}
          <div class="dr-actions">${R.source === "drawn" ? `<span class="dr-tag">${srcLabel(R)}</span><button class="btn sm" id="redrawBtn" type="button">Redraw</button><button class="dr-link" id="rmDrawnBtn" type="button">Remove my outline</button>` : `<button class="btn sm" id="redrawBtn" type="button">Wrong outline? Redraw</button>`}</div>
        </div>
        <div class="rp-prop">
          <div class="rp-prop-h"><b>Proposal <span class="pp-est" id="ppEst">Estimate</span></b><button class="btn sm pp-gear" id="ppGear" type="button" title="Edit your prices" aria-label="Edit your prices" aria-expanded="false">${ic("gear")}Prices</button><div class="seg" id="mats">${MATS.map((m, i) => `<button data-m="${i}" title="${m.name}" aria-label="${m.name}">${m.short || m.name}</button>`).join("")}</div></div>
          <div class="pp-host" id="ppHost" hidden></div>
          <table class="lines" id="lineItems"></table>
          <div class="total-row"><span>Total (rounded to nearest $10)</span><b id="propTotal"></b></div>
          <button class="btn primary block" id="sendProp">${ic("send")}Build proposal</button>
          <button class="btn block" id="dlPdf" type="button">${ic("download")}Download PDF</button>
        </div>
        <div class="fineprint rp-fine" id="roofFineprint"></div>
      </div>`;
    $$("#roofCardBody .rp-click").forEach(t => {
      const k = t.dataset.grp; if (!k) { t.classList.remove("rp-click"); return; }
      t.setAttribute("role", "button"); t.tabIndex = 0; t.title = "Click to see this on the roof";
      t.onclick = () => rfGroup(k);
      t.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); rfGroup(k); } };
    });
    $$("#mats button").forEach(b => b.onclick = () => { roofMat = +b.dataset.m; renderProposal(); });
    $("#sendProp").onclick = () => window.openProposal ? window.openProposal(lastProp) : toast("Proposal view failed to load.");
    $("#ppGear").onclick = () => { const h = $("#ppHost"); if (!window.RoofPrices) return toast("Prices failed to load."); if (!h.hidden && h.innerHTML) { h.innerHTML = ""; h.hidden = true; } else { window.RoofPrices.panel(h, renderProposal); h.scrollIntoView({ block: "nearest" }); } $("#ppGear").setAttribute("aria-expanded", String(!h.hidden)); };
    $("#dlPdf").onclick = downloadProposalPdf;
    $("#redrawBtn").onclick = () => startDrawing({ redraw: true });
    $("#rmDrawnBtn") && ($("#rmDrawnBtn").onclick = removeDrawn);
    $("#pitchSel").onchange = e => { roofPitch = +e.target.value; renderRoofScreen(); };
    $("#styleSel").onchange = e => window.dispatchEvent(new CustomEvent("roof:style", { detail: { style: e.target.value } }));
    $("#wasteInput").onchange = e => { const raw = +e.target.value || 0; roofWaste = Math.min(30, Math.max(0, raw)); e.target.value = roofWaste; const wn = $("#wasteNote"); if (wn) wn.style.display = raw !== roofWaste ? "" : "none"; renderProposal(); };
    renderProposal();
    mountRoofDiagram();
    applyRoofPrimary();
  }
  let currentRoofPlan = null;
  // simplified footprint ring in local feet (north-up, centered on the house's own center), shared by
  // the diagram renderer and the roof-plan geometry builder so both agree on the same outline
  function footprintFeet(R) {
    const ring = R.footprint;
    const lat0 = R.center[1];
    const mPerDegLat = 110574, mPerDegLon = 111320 * Math.cos(lat0 * Math.PI / 180);
    const ftPts = ring.map(([lon, lat]) => [(lon - R.center[0]) * mPerDegLon * 3.28084, (lat - lat0) * mPerDegLat * 3.28084]);
    const closedLen = ftPts.length;
    let pts = (ftPts[0][0] === ftPts[closedLen - 1][0] && ftPts[0][1] === ftPts[closedLen - 1][1]) ? ftPts.slice(0, closedLen - 1) : ftPts.slice();
    return simplifyRing(pts);
  }
  // Pitch is an assumption (no measured-pitch source exists at this scale): rise/12 -> the standard
  // roofing slope-length factor sqrt(1+(rise/12)^2). Editable 4/12-12/12; recomputes roof area, squares
  // and the proposal live. Waste % is the roofer's own order-size cushion, default 10, also editable.
  const PITCH_FACTORS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(p => ({ p, factor: Math.sqrt(1 + (p / 12) ** 2) }));
  let roofPitch = 6, roofWaste = 10, roofStyle = "hip"; // roofStyle: hip | gable | auto (auto = assessor roof type when known, else hip)
  window.addEventListener("roof:style", e => { const v = e.detail && e.detail.style; if (v === "hip" || v === "gable" || v === "auto") { roofStyle = v; if (RF.status === "ok") renderRoofScreen(); } });
  function pitchFactor(p) { return (PITCH_FACTORS.find(pf => pf.p === p) || { factor: Math.sqrt(1 + (p / 12) ** 2) }).factor; }
  // pitch provenance for the current house: measured (LiDAR default), your override of it, or assumed
  let pitchHome = "", pitchWasMeasured = false;
  function syncPitchTo(R) {
    const key = R.regionId + ":" + R.homeId, mp = R.measuredPitch;
    if (key !== pitchHome) { pitchHome = key; if (mp) { roofPitch = Math.max(0, Math.min(12, mp.p)); pitchWasMeasured = true; } else if (pitchWasMeasured) { roofPitch = 6; pitchWasMeasured = false; } }
    R.pitchMeasured = !!(mp && roofPitch === mp.p);
  }
  function pitchTag() {
    const R = RF.data, mp = R && R.measuredPitch;
    if (mp && roofPitch === mp.p) return { short: "measured (LiDAR 2018)", plain: "measured from 2018 LiDAR", tag: "measured", measured: true };
    if (mp) return { short: "your override", plain: `your override (LiDAR 2018 measured ${mp.p}/12)`, tag: "your override", measured: false };
    return { short: "assumed", plain: "assumed, not measured", tag: "assumed", measured: false };
  }
  function roofNumbersFor(R) {
    const factor = pitchFactor(roofPitch);
    const roofSqft = R.footprint_sqft * factor; // no eave allowance: the outline already traces the roof edge, overhang included
    return { roofSqft, squares: roofSqft / 100, factor };
  }
  function complexityLabel(c) {
    if (c == null) return "n/a";
    return c <= 1.2 ? "Simple (rectangular)" : c <= 2 ? "Moderate" : "Complex";
  }
  // Drop near-collinear vertices (tiny jogs that a satellite-derived outline often has) so the diagram
  // reads cleanly: a vertex whose perpendicular distance from the line through its neighbors is under
  // epsilon feet is removed. Several passes since removing one point can straighten its neighbors too.
  function simplifyRing(pts, eps = 1.3) {
    let arr = pts.slice();
    for (let pass = 0; pass < 5 && arr.length > 4; pass++) {
      const n = arr.length, out = [];
      let removedAny = false;
      for (let i = 0; i < n; i++) {
        const prev = arr[(i - 1 + n) % n], cur = arr[i], next = arr[(i + 1) % n];
        const dx = next[0] - prev[0], dy = next[1] - prev[1];
        const len = Math.hypot(dx, dy) || 1;
        const d = Math.abs((cur[0] - prev[0]) * dy - (cur[1] - prev[1]) * dx) / len;
        if (d < eps && n - (out.length + (n - 1 - i)) > 3) { removedAny = true; continue; }
        out.push(cur);
      }
      if (!removedAny || out.length < 4) break;
      arr = out;
    }
    return arr;
  }
  // Crisp, to-scale, north-up SVG of this one house's own footprint ring (projected to local feet
  // around its own center). The viewBox is a FIXED pixel-sized canvas (not sized to the footprint's
  // real-world feet), so every label/stroke/arrow renders at a constant on-screen size no matter how
  // big or small the actual house is; the footprint itself is scaled to fill ~70% of that canvas so a
  // tiny house looks just as prominent as a huge one. Every edge >=6 ft is labelled with its whole-foot
  // length, placed outside the outline near its midpoint; a lighter inset outline gives a simple
  // (non-facet) sense of roof shading, honestly not a measured hip/valley layout. A scale bar and a
  // small fixed-corner north arrow anchor it as a real-world measurement.
  const DIAG_W = 760, DIAG_H = 480; // fixed design canvas, px == viewBox units == rendered px
  function buildRoofDiagramSVG(R, opts = {}) {
    const mini = !!opts.mini;
    const ring = R.footprint;
    const lat0 = R.center[1];
    const mPerDegLat = 110574, mPerDegLon = 111320 * Math.cos(lat0 * Math.PI / 180);
    const ftPts = ring.map(([lon, lat]) => [(lon - R.center[0]) * mPerDegLon * 3.28084, (lat - lat0) * mPerDegLat * 3.28084]);
    const closedLen = ftPts.length;
    let pts = (ftPts[0][0] === ftPts[closedLen - 1][0] && ftPts[0][1] === ftPts[closedLen - 1][1]) ? ftPts.slice(0, closedLen - 1) : ftPts.slice();
    if (!mini) pts = simplifyRing(pts);
    const n = pts.length;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const bboxW = Math.max(maxX - minX, 1), bboxH = Math.max(maxY - minY, 1);
    const cxFt = (minX + maxX) / 2, cyFt = (minY + maxY) / 2;

    if (mini) {
      // small popup thumbnail: no labels/arrow/scale bar, just the shape, padded to fit its own box
      const pad = 8;
      const w = bboxW + pad * 2, h = bboxH + pad * 2;
      const toSvg = ([x, y]) => [pad + (x - minX), pad + (maxY - y)];
      const svgPts = pts.map(toSvg);
      const poly = svgPts.map(p => p.map(v => v.toFixed(1)).join(",")).join(" ");
      const cx = svgPts.reduce((a, p) => a + p[0], 0) / n, cy = svgPts.reduce((a, p) => a + p[1], 0) / n;
      const insetPts = svgPts.map(([x, y]) => [cx + (x - cx) * 0.55, cy + (y - cy) * 0.55]);
      const insetPoly = insetPts.map(p => p.map(v => v.toFixed(1)).join(",")).join(" ");
      return `<svg viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <polygon points="${poly}" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.4" stroke-linejoin="round"/>
        <polygon points="${insetPoly}" fill="rgba(180,83,47,.08)" stroke="rgba(142,62,33,.28)" stroke-width="1"/>
      </svg>`;
    }

    return "";
  }
  // ===== Roof Measure drawing (2026-10-03): straightened (main axis horizontal), zoom/pan, click-to-learn =====
  // The SVG viewBox equals the stage's pixel size. Geometry lives in one <g id="rdWorld"> that is moved
  // with a single transform per animation frame (pan/zoom never re-renders). Strokes use
  // vector-effect:non-scaling-stroke, and every label lives in a separate screen-space layer whose
  // positions are recomputed per frame (constant font size, overlapping labels hidden at low zoom).
  // Rotation is DISPLAY ONLY: all lengths and areas come from the unrotated plan, never from pixels.
  const RV = { k: 1, tx: 0, ty: 0, W: 0, H: 0, S: 1, key: "", raf: 0, ro: null, mt: 0 };
  let rvSel = null, rvEls = {}, rvLabs = [], rvWorld = null, rvSvg = null, rvBar = null, rvGeom = null, rvDrag = false;
  const RV_MINK = 0.5, RV_MAXK = 24;
  const rvFt = v => v >= 10 ? String(Math.round(v)) : v.toFixed(1);
  const RV_TEXT = {
    facet: "One flat section of the roof that the shingles run across.",
    ridge: "The top peak line where two roof sections meet.",
    hip: "A slanted outside corner where two sections meet, running from the ridge down to a corner of the house.",
    valley: "A slanted inside corner where two sections meet and rain runs down. It gets extra waterproofing.",
    eave: "The lower edge of the roof along the outer wall, where water leaves the roof.",
    rake: "The sloped edge at a gable end, where the roof meets the triangle wall. It gets drip edge."
  };
  const RV_HINT = "Click or tap a roof part (facet, ridge, hip, valley or eave edge) to see what it is and how it feeds the proposal. Scroll or pinch to zoom, drag to pan.";
  function mountRoofDiagram() {
    const host = $("#roofDiagram"), stage = $("#rfStage");
    if (!host || !stage || RF.status !== "ok" || !RF.data) return;
    const W = Math.round(stage.clientWidth), H = Math.round(stage.clientHeight);
    if (W < 60 || H < 60) { host.dataset.built = "0"; return; }
    const R = RF.data, key = (RF.region && RF.region.id) + ":" + RF.homeId;
    const pts0 = footprintFeet(R);
    const RP = window.RoofPlan;
    const theta = RP && RP.orient ? RP.orient(pts0) : 0;
    const rp = RP && RP.rotatePlan ? RP.rotatePlan(currentRoofPlan, pts0, theta) : { pts: pts0, plan: currentRoofPlan };
    const pts = rp.pts, plan = rp.plan, n = pts.length;
    if (key !== RV.key) { RV.k = 1; RV.tx = RV.ty = 0; rvSel = null; }
    else if (W !== RV.W || H !== RV.H) { RV.k = 1; RV.tx = RV.ty = 0; }
    RV.key = key; RV.W = W; RV.H = H;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const bw = Math.max(maxX - minX, 1), bh = Math.max(maxY - minY, 1), cxF = (minX + maxX) / 2, cyF = (minY + maxY) / 2;
    const padX = W < 520 ? 44 : 78, padY = W < 520 ? 44 : 56;
    const S = Math.min((W - padX * 2) / bw, (H - padY * 2) / bh);
    RV.S = S;
    const tp = ([x, y]) => [W / 2 + (x - cxF) * S, H / 2 - (y - cyF) * S]; // feet (display-rotated) -> px at zoom 1
    const f1 = v => v.toFixed(1);
    const pstr = ring => ring.map(tp).map(p => f1(p[0]) + "," + f1(p[1])).join(" ");
    const sunRad = 315 * Math.PI / 180;
    const facetColor = deg => `hsl(27 22% ${(44 + 12 * Math.cos(deg * Math.PI / 180 - sunRad)).toFixed(0)}%)`;
    const eaves = pts.map((a, i) => { const b = pts[(i + 1) % n]; return { a, b, lenFt: Math.hypot(b[0] - a[0], b[1] - a[1]) }; });
    const sqPitch = plan ? plan.slopeFactor : 1;
    rvGeom = { plan, eaves, pts, theta, sqPitch };
    window.__roofDebug = () => ({ pts0, plan0: currentRoofPlan, geom: rvGeom, view: { ...RV } }); // inspection hook (before/after rotation checks)
    let facetSvg = "", lineSvg = "";
    rvLabs = [];
    const ctr = pts.reduce((a, p) => { const q = tp(p); return [a[0] + q[0] / n, a[1] + q[1] / n]; }, [0, 0]);
    const addLab = (txt, wx, wy, nx, ny, off, prio, minK, kind) => rvLabs.push({ txt, wx, wy, nx, ny, off, prio, minK, kind, w: txt.length * 6.7 + 12, h: 18 });
    if (plan) {
      plan.facets.forEach((f, i) => {
        const fp = pstr(f.ring), rs = f.ring.map(tp);
        const e0 = rs[0], e1 = rs[1], ex = e1[0] - e0[0], ey = e1[1] - e0[1], el = Math.hypot(ex, ey) || 1;
        const ux = ex / el, uy = ey / el, px = -uy, py = ux;
        const pp = rs.map(p => (p[0] - e0[0]) * px + (p[1] - e0[1]) * py), pa = rs.map(p => (p[0] - e0[0]) * ux + (p[1] - e0[1]) * uy);
        const pMin = Math.min(...pp), pMax = Math.max(...pp), aMin = Math.min(...pa) - 20, aMax = Math.max(...pa) + 20;
        let courses = "";
        for (let d = 15; d < pMax - pMin; d += 15) courses += `<line x1="${f1(e0[0] + px * d + ux * aMin)}" y1="${f1(e0[1] + py * d + uy * aMin)}" x2="${f1(e0[0] + px * d + ux * aMax)}" y2="${f1(e0[1] + py * d + uy * aMax)}"/>`;
        facetSvg += `<clipPath id="fc${i}"><polygon points="${fp}"/></clipPath>
          <polygon class="rd-feat rd-facet" data-k="facet" data-i="${i}" tabindex="0" role="button" aria-label="Roof facet ${f.label}, ${Math.round(f.slopeSqft)} square feet" points="${fp}" fill="${facetColor(f.angleDeg)}"/>
          <g clip-path="url(#fc${i})" class="rd-courses">${courses}</g>`;
        if (f.planSqft >= 18) {
          const c = rs.reduce((a, p) => [a[0] + p[0] / rs.length, a[1] + p[1] / rs.length], [0, 0]);
          addLab(`${f.label}  ${Math.round(f.slopeSqft)} sf`, c[0], c[1], 0, 0, 0, 40 + f.slopeSqft / 1000, 0, "facet");
        }
      });
    }
    const lineEl = (kind, i, s) => {
      const a = tp(s.a), b = tp(s.b);
      return `<g class="rd-feat rd-${kind}" data-k="${kind}" data-i="${i}" tabindex="0" role="button" aria-label="${kind} ${rvFt(s.lenFt)} feet"><line class="hit" x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}"/><line class="vis" x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}"/></g>`;
    };
    const innerLab = (kind, s, prio) => {
      const a = tp(s.a), b = tp(s.b); let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      if (ny > 0.01 || (Math.abs(ny) <= 0.01 && nx < 0)) { nx = -nx; ny = -ny; }
      addLab(`${rvFt(s.lenFt)} ft`, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, nx, ny, 11, prio, 1.7, kind);
    };
    eaves.forEach((s, i) => {
      lineSvg += lineEl("eave", i, s);
      if (s.lenFt < 6) return;
      const a = tp(s.a), b = tp(s.b), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      if ((mx - ctr[0]) * nx + (my - ctr[1]) * ny < 0) { nx = -nx; ny = -ny; }
      addLab(`${Math.round(s.lenFt)} ft`, mx, my, nx, ny, 14, 100 + s.lenFt, 0, "eave");
    });
    if (plan) {
      plan.hips.forEach((s, i) => { lineSvg += lineEl("hip", i, s); innerLab("hip", s, 20 + s.lenFt / 100); });
      plan.valleys.forEach((s, i) => { lineSvg += lineEl("valley", i, s); innerLab("valley", s, 20 + s.lenFt / 100); });
      plan.ridges.forEach((s, i) => { lineSvg += lineEl("ridge", i, s); innerLab("ridge", s, 30 + s.lenFt / 100); });
      (plan.rakes || []).forEach((s, i) => { lineSvg += lineEl("rake", i, s); if (s.lenFt >= 6) innerLab("rake", s, 90 + s.lenFt / 100); });
    }
    rvLabs.sort((a, b) => b.prio - a.prio);
    const labSvg = rvLabs.map((l, i) => `<g class="rd-lab rd-lab-${l.kind}" data-li="${i}"><rect x="${(-l.w / 2).toFixed(1)}" y="-9" width="${l.w.toFixed(1)}" height="18" rx="4"/><text x="0" y="0" text-anchor="middle" dominant-baseline="central">${l.txt}</text></g>`).join("");
    // true north after rotating the drawing by -theta
    const dispN = [Math.cos(-theta) * 0 - Math.sin(-theta) * 1, Math.sin(-theta) * 0 + Math.cos(-theta) * 1]; // rot((0,1), -theta)
    const northDeg = Math.atan2(dispN[0], dispN[1]) * 180 / Math.PI;
    {
      host.innerHTML = `<svg class="rd-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Straightened roof plan, main axis horizontal. Zoom with the wheel or the plus and minus buttons.">
        <g id="rdWorld">${facetSvg}${lineSvg}</g>
        <g id="rdLabels">${labSvg}</g>
        <g class="rd-north" transform="translate(${W - 34},40) rotate(${northDeg.toFixed(1)})"><line x1="0" y1="13" x2="0" y2="-9"/><polygon points="0,-14 -4.5,-6 4.5,-6"/></g>
        <text class="rd-north-n" x="${(W - 34 + 26 * Math.sin(northDeg * Math.PI / 180)).toFixed(1)}" y="${(44 - 26 * Math.cos(northDeg * Math.PI / 180)).toFixed(1)}" text-anchor="middle">N</text>
        <g id="rdBar"><line class="rd-bl" x1="16" y1="${H - 22}" x2="76" y2="${H - 22}"/><line class="rd-bt1" x1="16" y1="${H - 27}" x2="16" y2="${H - 17}"/><line class="rd-bt2" x1="76" y1="${H - 27}" x2="76" y2="${H - 17}"/><text class="rd-bx" x="16" y="${H - 30}">20 ft</text></g>
      </svg>`;
      host.dataset.built = "1";
    }
    rvSvg = $("#roofDiagram .rd-svg");
    rvWorld = $("#rdWorld"); rvBar = $("#rdBar");
    rvEls = {};
    $$("#roofDiagram .rd-feat").forEach(el => { rvEls[el.dataset.k + el.dataset.i] = el; });
    const labEls = $$("#rdLabels .rd-lab"); rvLabs.forEach((l, i) => { l.el = labEls[i]; l.shown = null; });
    rvBind(rvSvg);
    if (!RV.ro && window.ResizeObserver) {
      RV.ro = new ResizeObserver(() => {
        const st = $("#rfStage"), h = $("#roofDiagram");
        if (!st || !h || !h.classList.contains("full") || RF.status !== "ok") return;
        if (Math.abs(st.clientWidth - RV.W) > 1 || Math.abs(st.clientHeight - RV.H) > 1) { clearTimeout(RV.mt); RV.mt = setTimeout(mountRoofDiagram, 60); }
      });
      RV.ro.observe(stage);
    }
    rvApply();
    rvSelect(rvSel && rvEls[rvSel.k + rvSel.i] ? rvSel : null, rvMeta, { quiet: true });
  }
  function rvSchedule() { if (!RV.raf) RV.raf = requestAnimationFrame(rvApply); }
  function rvApply() {
    RV.raf = 0;
    if (!rvWorld) return;
    const { k, tx, ty, W, H } = RV;
    rvWorld.setAttribute("transform", `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(4)})`);
    // labels: screen space, constant size, greedy no-overlap placement in priority order
    const placed = [{ x: 0, y: H - 46, w: 190, h: 46 }, { x: W - 70, y: 0, w: 70, h: 84 }];
    for (const l of rvLabs) {
      const x = k * l.wx + tx + l.nx * l.off * 1, y = k * l.wy + ty + l.ny * l.off;
      const bx = x - l.w / 2, by = y - l.h / 2;
      let ok = k >= l.minK && bx > 2 && by > 2 && bx + l.w < W - 2 && by + l.h < H - 2;
      if (ok) for (const p of placed) if (bx < p.x + p.w && bx + l.w > p.x && by < p.y + p.h && by + l.h > p.y) { ok = false; break; }
      if (ok) placed.push({ x: bx, y: by, w: l.w, h: l.h });
      if (ok) l.el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      if (ok !== l.shown) { l.el.style.display = ok ? "" : "none"; l.shown = ok; }
    }
    // scale bar: longest round length that fits in ~150 px at the current zoom
    const pxFt = RV.S * k;
    let ft = 1; for (const c of [1, 2, 5, 10, 20, 25, 50, 100, 200, 500]) if (c * pxFt <= 150) ft = c;
    const px = Math.max(ft * pxFt, 8), by = H - 22;
    rvBar.querySelector(".rd-bl").setAttribute("x2", (16 + px).toFixed(1));
    rvBar.querySelector(".rd-bt2").setAttribute("x1", (16 + px).toFixed(1)); rvBar.querySelector(".rd-bt2").setAttribute("x2", (16 + px).toFixed(1));
    const bx = rvBar.querySelector(".rd-bx"); bx.textContent = ft + " ft";
  }
  function rvZoomAt(cx, cy, f) {
    const k2 = Math.max(RV_MINK, Math.min(RV_MAXK, RV.k * f)), r = k2 / RV.k;
    RV.tx = cx - (cx - RV.tx) * r; RV.ty = cy - (cy - RV.ty) * r; RV.k = k2;
    rvClamp(); rvSchedule();
  }
  function rvClamp() {
    // keep the house centre (screen centre at zoom 1) inside the stage so it can never be lost
    const cx = RV.W / 2 * RV.k + RV.tx, cy = RV.H / 2 * RV.k + RV.ty;
    // the world point at the stage centre is (W/2,H/2); its screen position is k*W/2 + tx
    RV.tx += Math.max(0, 20 - cx) + Math.min(0, RV.W - 20 - cx);
    RV.ty += Math.max(0, 20 - cy) + Math.min(0, RV.H - 20 - cy);
  }
  function rvZoomBy(f) { rvZoomAt(RV.W / 2, RV.H / 2, f); }
  function rvFit() { RV.k = 1; RV.tx = RV.ty = 0; rvSchedule(); }
  function rvBind(svg) {
    const ptrs = new Map(); let last = null;
    const rel = e => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left) * (RV.W / (r.width || 1)), (e.clientY - r.top) * (RV.H / (r.height || 1))]; };
    const mid = () => { const a = [...ptrs.values()]; return a.length > 1 ? { c: [(a[0][0] + a[1][0]) / 2, (a[0][1] + a[1][1]) / 2], d: Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]) } : { c: a[0], d: 0 }; };
    svg.addEventListener("wheel", e => {
      if (!$("#roofDiagram").classList.contains("full")) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, p = rel(e);
      rvZoomAt(p[0], p[1], Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0016)));
    }, { passive: false });
    svg.addEventListener("pointerdown", e => {
      if (!$("#roofDiagram").classList.contains("full") || (e.pointerType === "mouse" && e.button !== 0)) return;
      ptrs.set(e.pointerId, rel(e)); rvDrag = ptrs.size > 1; last = { ...mid(), x0: ptrs.get(e.pointerId)[0], y0: ptrs.get(e.pointerId)[1] };
    });
    svg.addEventListener("pointermove", e => {
      if (!ptrs.has(e.pointerId)) return;
      const p = rel(e); ptrs.set(e.pointerId, p);
      const m = mid();
      if (ptrs.size > 1) {
        rvDrag = true;
        if (last.d > 0 && m.d > 0) rvZoomAt(last.c[0], last.c[1], m.d / last.d);
        RV.tx += m.c[0] - last.c[0]; RV.ty += m.c[1] - last.c[1]; rvClamp(); rvSchedule();
      } else {
        if (!rvDrag && Math.hypot(p[0] - last.x0, p[1] - last.y0) > 5) { rvDrag = true; try { svg.setPointerCapture(e.pointerId); } catch (_) {} svg.classList.add("panning"); }
        if (rvDrag) { RV.tx += p[0] - last.c[0]; RV.ty += p[1] - last.c[1]; rvClamp(); rvSchedule(); }
      }
      last = { ...last, c: m.c, d: m.d };
    });
    const up = e => { ptrs.delete(e.pointerId); if (!ptrs.size) svg.classList.remove("panning"); else last = { ...last, ...mid() }; };
    svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
    svg.addEventListener("click", e => {
      if (rvDrag) { rvDrag = false; return; }
      if ($("#roofDiagram").classList.contains("thumb")) return;
      const el = e.target.closest && e.target.closest(".rd-feat");
      rvSelect(el ? { k: el.dataset.k, i: +el.dataset.i } : null);
    });
    svg.addEventListener("keydown", e => {
      if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("rd-feat")) { e.preventDefault(); rvSelect({ k: e.target.dataset.k, i: +e.target.dataset.i }); }
    });
  }
  function rvSelect(s, meta, opts) {
    if (rvSel) { const o = rvEls[rvSel.k + rvSel.i]; if (o) o.classList.remove("sel"); }
    for (const k in rvEls) rvEls[k].classList.remove("grp");
    rvSel = s && rvEls[s.k + s.i] ? { k: s.k, i: s.i } : null;
    rvMeta = rvSel && meta && meta.group ? meta : null;
    if (rvSel) rvEls[rvSel.k + rvSel.i].classList.add("sel");
    if (rvMeta) for (const k in rvEls) if (rvEls[k].dataset.k === rvSel.k) rvEls[k].classList.add("grp");
    $$("#roofCardBody [data-grp]").forEach(t => t.classList.toggle("on", !!(rvMeta && rvSel && t.dataset.grp === rvSel.k)));
    if (!(opts && opts.quiet) && window.Roof3D && window.Roof3D.current && r3dOn()) window.Roof3D.current.select(rvSel, rvMeta);
    const box = $("#rfInfo"); if (!box) return;
    box.classList.toggle("has-sel", !!rvSel);
    if (!rvSel || !rvGeom) { box.innerHTML = `<div class="ri-hint">${RV_HINT}</div>`; return; }
    const g = rvGeom, p = roofPitch, pl = g.plan, tot = pl ? pl.totals : null;
    let chips = [], feeds = "";
    if (rvSel.k === "facet") {
      const f = pl.facets[rvSel.i];
      chips = [["Flat area from above", `${int(Math.round(f.planSqft))} sq ft`], [`Sloped area at ${p}/12 (${pitchTag().tag})`, `${int(Math.round(f.slopeSqft))} sq ft`], ["Squares", (f.slopeSqft / 100).toFixed(1)]];
      feeds = `Feeds the proposal: shingles and tear-off. ${(f.slopeSqft / 100).toFixed(1)} sq of ${(tot.slopeSqft / 100).toFixed(1)} sq drawn; the order adds waste, rounded up to bundles.`;
    } else if (rvSel.k === "eave") {
      const s2 = g.eaves[rvSel.i];
      chips = [["Length", `${rvFt(s2.lenFt)} ft`], ["Sloped length", "same, runs level"]];
      feeds = `Feeds the proposal: drip edge and starter, ${rvFt(s2.lenFt)} LF of ${tot ? tot.eaveFt : Math.round(g.eaves.reduce((a, e) => a + e.lenFt, 0))} LF.`;
    } else if (rvSel.k === "rake") {
      const s2 = pl.rakes[rvSel.i];
      chips = [["Flat length from above", `${rvFt(s2.lenPlanFt)} ft`], [`Sloped length at ${p}/12 (${pitchTag().tag})`, `${rvFt(s2.lenFt)} ft`]];
      feeds = `Feeds the proposal: drip edge, ${rvFt(s2.lenFt)} LF (eaves ${tot.eaveFt} LF + rakes ${tot.rakeFt} LF = ${tot.eaveFt + tot.rakeFt} LF).`;
    } else if (rvSel.k === "ridge") {
      const s2 = pl.ridges[rvSel.i];
      chips = [["Length", `${rvFt(s2.lenFt)} ft`], ["Sloped length", "same, runs level"]];
      feeds = `Feeds the proposal: ridge cap, ${rvFt(s2.lenFt)} LF (ridge and hip cap total ${tot.ridgeFt + tot.hipFt} LF).`;
    } else {
      const s2 = rvSel.k === "hip" ? pl.hips[rvSel.i] : pl.valleys[rvSel.i];
      chips = [["Flat length from above", `${rvFt(s2.lenPlanFt)} ft`], [`True length at ${p}/12 (${pitchTag().tag})`, `${rvFt(s2.lenFt)} ft`]];
      feeds = rvSel.k === "hip" ? `Feeds the proposal: hip cap, ${rvFt(s2.lenFt)} LF (ridge and hip cap total ${tot.ridgeFt + tot.hipFt} LF).`
        : `Feeds the proposal: ice and water shield, ${rvFt(s2.lenFt)} ft of ${tot.valleyFt} ft.`;
    }
    const name = (rvSel.k === "facet" ? "Facet " + pl.facets[rvSel.i].label : rvSel.k[0].toUpperCase() + rvSel.k.slice(1)) + (rvMeta ? ` <small class="ri-count">${rvMeta.idx + 1} of ${rvMeta.n}. Click the tile again for the next one.</small>` : "");
    box.innerHTML = `<div class="ri-main"><b>${name}</b><span>${RV_TEXT[rvSel.k]}</span><em>${feeds}</em></div>
      <div class="ri-chips">${chips.map(c => `<div><i>${c[0]}</i><b>${c[1]}</b></div>`).join("")}</div>
      <button type="button" class="ri-x" aria-label="Clear selection">&times;</button>`;
    box.querySelector(".ri-x").onclick = () => rvSelect(null);
  }
  ENTER.roof = () => { tourStop(true); renderRoofScreen(); restoreRoofFromHash(); if (roofMap) { roofMap.resize(); updateRoofMap(); } };
  // F18: one click back to the exact map screen/camera/house the user left (or the last map screen
  // visited, if Roof was opened straight from the nav rather than a house card). skipMapFit + pendingCamera
  // + restoreHome are consumed once by placeMap() on the next ENTER.<screen> call.
  function backToMap() {
    const rr = roofReturn;
    skipMapFit = true;
    if (rr) { pendingCamera = { center: rr.center, zoom: rr.zoom }; restoreHome = { regionId: rr.regionId, homeId: rr.homeId, lng: rr.lng, lat: rr.lat }; }
    location.hash = "#" + (rr ? rr.screen : lastMapScreen || "storm");
  }
  let lastProp = null, lastCalc = null;
  function renderProposal() {
    if (RF.status !== "ok") { lastProp = null; return; }
    const R = RF.data, m = MATS[roofMat];
    const rn = roofNumbersFor(R);
    const squares = Math.round(rn.squares * 10) / 10;
    $$("#mats button").forEach(b => b.classList.toggle("on", +b.dataset.m === roofMat));
    const wasteFrac = 1 + roofWaste / 100;
    const order = Math.ceil(squares * wasteFrac * 3) / 3; // bundles of 1/3 sq
    const pl = currentRoofPlan ? currentRoofPlan.totals : null;
    const ridgeFt = pl ? pl.ridgeFt + pl.hipFt : Math.round(squares * 100 / 30); // hip cap runs ridge + hips
    const valleyFt = pl ? pl.valleyFt : 0;
    const eaveFt = pl ? pl.eaveFt + (pl.rakeFt || 0) : R.perimeter_ft; // drip edge runs eaves + rakes
    const RP = window.RoofPrices;
    const calc = RP ? RP.build({ squares, order, waste: roofWaste, valleyFt, eaveFt, ridgeFt, mat: roofMat, matLabel: m.label, city: R.city }) : { items: [], total: 0, sub: 0, markupPct: 0, markupAmt: 0, taxPct: 0, taxAmt: 0, estimate: true };
    const items = calc.items;
    const total = calc.total;
    lastCalc = calc;
    $("#lineItems").innerHTML = items.map(x => `<tr><td>${x[0]}<span class="q">${x[1]}</span></td><td class="n">${money(Math.round(x[2]))}</td></tr>`).join("")
      + (calc.markupPct ? `<tr><td>Markup<span class="q">${calc.markupPct}% of ${money(Math.round(calc.sub))}</span></td><td class="n">${money(Math.round(calc.markupAmt))}</td></tr>` : "")
      + (calc.taxPct ? `<tr><td>Sales tax<span class="q">${calc.taxPct}%</span></td><td class="n">${money(Math.round(calc.taxAmt))}</td></tr>` : "");
    $("#propTotal").textContent = money(Math.round(total / 10) * 10);
    const est = $("#ppEst"); if (est) { est.hidden = !calc.estimate; est.textContent = calc.estLabel || "Estimate"; est.title = "Starting prices are estimates from public sources, several from outside Oklahoma. Set and save your own in Prices." + (calc.warn ? " " + calc.warn : ""); }
    const setTxt = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    setTxt("#rsRoofArea", int(Math.round(rn.roofSqft)));
    setTxt("#rsRoofSub", `at ${roofPitch}/12 pitch (${pitchTag().tag})`);
    setTxt("#rsOrder", order.toFixed(1));
    setTxt("#rsOrderSub", "incl. waste"); $$(".rp-stats .s").forEach(x => { if (x.id !== "rsOrderSub" && x.textContent) x.title = x.textContent; }); { const o = $("#rsOrderSub"); if (o) o.title = `${squares.toFixed(1)} sq roof + ${roofWaste}% waste, rounded up to full bundles (1/3 sq)`; }
    const fp = $("#roofFineprint");
    const sn = $("#roofSrcNote"); if (sn) sn.textContent = R.source === "drawn" ? srcLabel(R) + "." : "Footprint: Microsoft Building Footprints (ODbL), OpenStreetMap fallback.";
    if (fp) fp.textContent = `Footprint area from ${R.source === "drawn" ? "the outline " + (R.drawnVia === "parcel" ? "matched by parcel boundary and confirmed by you" : "drawn by you on the satellite photo") : "this address's own building outline (Microsoft Building Footprints, OpenStreetMap fallback"}: ${int(R.footprint_sqft)} sq ft, ${R.perimeter_ft} ft perimeter${R.source === "drawn" ? "" : ")"} x ${roofPitch}/12 ${pitchTag().tag} pitch factor (${rn.factor.toFixed(3)}), ${roofWaste}% material waste. The outline already includes the eaves, so no extra overhang is added. Roof shape (ridges, hips, valleys) is modeled from the building outline as a ${currentRoofPlan ? currentRoofPlan.style : "hip"} roof, not a measured facet layout; ridge/hip/valley/eave/rake lengths above come from that model. Unit prices are ${lastCalc && !lastCalc.estimate ? "your saved prices" : "estimates from public sources, several from outside Oklahoma, until every line uses your own price (Prices)"}.${lastCalc && lastCalc.warn ? " " + lastCalc.warn : ""} Verify on site before ordering.`;
    lastProp = { roof: { ...R, squares, roof_sqft: Math.round(rn.roofSqft), pitch: roofPitch + "/12", pitch_factor: rn.factor }, materialLabel: m.label.toLowerCase(), items: items.concat(calc.markupPct ? [["Markup", calc.markupPct + "%", calc.markupAmt]] : [], calc.taxPct ? [["Sales tax", calc.taxPct + "%", calc.taxAmt]] : []), total: Math.round(total / 10) * 10, estimate: calc.estimate };
  }
  // Proposal PDF (js/pdf.js, jsPDF lazy-loaded). Gathers THIS house's data, reusing the card's hail loader.
  async function downloadProposalPdf() {
    const btn = $("#dlPdf"); if (RF.status !== "ok" || !window.RoofPdf || !lastProp) return toast("Open a house with a footprint first.");
    const label = btn.innerHTML; btn.disabled = true; btn.textContent = "Building PDF...";
    try {
      const region = RF.region, id = RF.homeId;
      const need = DATA.catalog.filter(s => region.byDate[s.date] && region.hailCache[s.date] === undefined);
      for (let i = 0; i < need.length; i++) { btn.textContent = `Loading hail ${i + 1}/${need.length}...`; await fetchHail(region, need[i].date); }
      const hail = Object.keys(region.hailCache).filter(d => region.hailCache[d] && region.hailCache[d][id] >= 75)
        .map(d => ({ date: d, label: DATA.byDate[d] ? DATA.byDate[d].label : d, inches: region.hailCache[d][id] / 100 })).sort((a, b) => b.inches - a.inches);
      btn.textContent = "Building PDF...";
      let shot = null;
      const r3 = $("#roof3d"), inst = window.Roof3D && window.Roof3D.current;
      if (r3 && r3.style.display !== "none" && inst && inst.snapshot) shot = { kind: "png", data: inst.snapshot(), label: "3D view" };
      else { const sv = $("#roofDiagram .rd-svg"); if (sv) { const c = window.RoofPdf.inlineSvg(sv); shot = { kind: "svg", data: c.svg, w: c.w, h: c.h, label: "Roof plan (2D, straightened to the house axis)" }; }; }
      const R = RF.data, pl = currentRoofPlan ? currentRoofPlan.totals : null, rn = roofNumbersFor(R);
      const blob = await window.RoofPdf.build({
        brand: window.BRAND, roof: R, calc: lastCalc, matLabel: MATS[roofMat].label, shot, hail, pitch: roofPitch, waste: roofWaste, factor: rn.factor,
        pitchMeasured: !!(R.pitch_measured || R.pitchMeasured), totals: pl, roofSqft: Math.round(rn.roofSqft), squares: lastProp.roof.squares, hailTotalStorms: hail.length
      });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "roof-proposal-" + String(R.addr || R.street || "house").replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".pdf";
      document.body.appendChild(a); a.click(); a.remove(); window.__lastPdfBlobUrl = a.href; setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    } catch (e) { console.warn("pdf failed", e); toast("PDF failed: " + (e && e.message || e)); }
    btn.disabled = false; btn.innerHTML = label;
  }
  function fitRoofView(R) {
    const xs = R.footprint.map(p => p[0]), ys = R.footprint.map(p => p[1]);
    roofMap.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: Math.min(110, $("#roofmap").clientWidth / 5), duration: 0, maxZoom: 20 });
  }
  let roofPin = null, roofMapReady = false;
  function clearRoofPin() { if (roofPin) { roofPin.remove(); roofPin = null; } }
  // Draws exactly one house's own outline (status "ok"), or just centers the imagery on the clicked point
  // with a pin and no outline (status "none"/"loading"): never falls back to drawing a different house.
  // Uses roofMapReady (set once, after the "foot" source/layers are added) rather than map.loaded()/
  // once("load", ...): maplibre's "load" event fires exactly once for the map's life, but loaded() can
  // read false right after a jumpTo/flyTo while the raster basemap's new tiles are still in flight, which
  // made an update silently never draw (it registered a second once("load", ...) that was never going to
  // fire again).
  function updateRoofMap() {
    if (!roofMap || !roofMapReady) return;
    const footFC = RF.status === "ok"
      ? { type: "Feature", geometry: { type: "Polygon", coordinates: [RF.data.footprint] } }
      : { type: "FeatureCollection", features: [] };
    if (roofMap.getSource("foot")) roofMap.getSource("foot").setData(footFC);
    clearRoofPin();
    if (RF.status === "ok") {
      roofMap.setCenter(RF.data.center);
      fitRoofView(RF.data);
    } else if (RF.ll && RF.drawing) {
      roofMap.jumpTo({ center: [RF.ll.lng, RF.ll.lat], zoom: 19 });
    } else if (RF.ll) {
      const el = document.createElement("div"); el.className = "facet-label"; el.textContent = "?";
      roofPin = new maplibregl.Marker({ element: el }).setLngLat([RF.ll.lng, RF.ll.lat]).addTo(roofMap);
      roofMap.flyTo({ center: [RF.ll.lng, RF.ll.lat], zoom: 19, duration: 0 });
    }
  }
  function initRoofMap() {
    window.__roof = () => roofMap;
    const startCenter = RF.ll ? [RF.ll.lng, RF.ll.lat] : (RF.data ? RF.data.center : NORMAN_CENTER);
    roofMap = new maplibregl.Map({
      container: "roofmap", center: startCenter, zoom: RF.status === "empty" ? 14 : 19, minZoom: 12, maxZoom: 21, attributionControl: false, bearing: 0, trackResize: false,
      style: { version: 8, sources: { sat: window.RC_IMAGERY.source() }, layers: [{ id: "sat", type: "raster", source: "sat", paint: { "raster-saturation": -0.15 } }] },
      scrollZoom: true, dragPan: true, doubleClickZoom: true, keyboard: true, touchZoomRotate: true, boxZoom: false, dragRotate: false, pitchWithRotate: false
    });
    roofMap.touchZoomRotate.disableRotation();
    roofMap.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "Footprints: Microsoft, Overture Maps | (c) OpenStreetMap contributors" }), "top-right");
    collapseAttrib($("#roofmap"));
    let satErr = 0;
    roofMap.on("error", e => { if (e && e.sourceId === "sat" && ++satErr >= 3 && !roofMap.areTilesLoaded()) { satFailed = true; roofPrimary = "diagram"; applyRoofPrimary(); requestAnimationFrame(() => mountRoofDiagram()); } });
    roofMap.on("load", () => {
      roofMap.addSource("foot", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      roofMap.addLayer({ id: "foot-fill", type: "fill", source: "foot", paint: { "fill-color": B.accent, "fill-opacity": 0.16 } });
      roofMap.addLayer({ id: "foot-line", type: "line", source: "foot", paint: { "line-color": "#FFD25A", "line-width": 2.6 } });
      roofMapReady = true;
      updateRoofMap();
    });
    let lastW = 0;
    new ResizeObserver(() => { const w = $("#roofmap").clientWidth; if (w < 50) return; roofMap.resize(); if (w > 50 && Math.abs(w - lastW) > 20) { lastW = w; if (RF.status === "ok") fitRoofView(RF.data); } }).observe($("#roofmap"));
  }

  // ===== ask =====
  // Small keyword/regex intent engine. Every answer is computed on the fly from the regions' catalog.json
  // + lazy per-storm hail bins (plus lazy-loaded homes_meta.bin/streets.json/cities.json for street/ZIP/
  // city lookups) and sample.js. No external AI calls, no API keys, never invents a number: unmatched
  // questions say so and point at suggestions.
  const QUESTIONS = [
    "Which storm hit the most homes?",
    "What's the biggest hail on file?",
    "How many homes took hail this year?",
    "How many homes on Cedar Creek Dr took hail?"
  ];
  SCREENS.leads = () => { window.RCInbox.hooks.house = leadHouse; };
  const park = () => { if (map) $("#mapPark").appendChild($("#mapwrap")); };
  SCREENS.today = () => { }; ENTER.today = () => { if (!window.RCDaily) return; park(); window.RCDaily.render($("#s-today")); };
  SCREENS.results = () => { }; ENTER.results = () => { if (!window.RCRoi) return; park(); window.RCRoi.render($("#s-results")); };
  SCREENS.seo = () => { }; ENTER.seo = () => { if (!window.RCSeo) return; park(); window.RCSeo.render($("#s-seo")); };
  ENTER.leads = () => { if (!window.RCInbox) return; if (map) $("#mapPark").appendChild($("#mapwrap")); window.RCInbox.render($("#s-leads")); };
  // Leads screen: open a lead's house on the map or its roof screen
  async function leadHouse(rid, idx, mode, addr) {
    const rg = REG(rid); if (!rg) return false;
    await ensureBin(rg);
    const c = decodeLonLat(rg, idx), ll = { lng: c[0], lat: c[1] };
    if (mode === "roof") { openRoofFor(rg, idx, ll, addr || ("Home " + idx)); return true; }
    location.hash = "#storm";
    const t0 = Date.now();
    const go = () => { if (map && map.loaded()) { map.flyTo({ center: c, zoom: 18, duration: 800 }); homePopup(rg, idx, ll); } else if (Date.now() - t0 < 8000) setTimeout(go, 300); };
    setTimeout(go, 600); return true;
  }
  SCREENS.ask = () => {
    $("#s-ask").innerHTML = `<div class="ask-stage"><div class="card map-card" id="ask-map"><div class="map-slot"></div><div class="ask-veil"></div>${sourceNote(DATA.catalog[0])}</div>
      <div class="palette"><div class="box">
        <form class="in" id="askForm">${ic("sparkle")}<input id="askIn" autocomplete="off" placeholder="${matchMedia("(max-width:560px)").matches ? "Ask about a storm" : "How much have we signed this month?"}"><button class="btn sm primary" type="submit">Ask</button></form>
        <div class="sugs" id="sugs">${QUESTIONS.map((q, i) => `<button class="chip" data-q="${i}" type="button">${q}</button>`).join("")}</div>
        <div id="answer"></div></div></div></div>`;
    $("#askForm").onsubmit = e => { e.preventDefault(); ask($("#askIn").value || "How much have we signed this month?"); };
    $$("#sugs .chip").forEach(b => b.onclick = () => { $("#askIn").value = QUESTIONS[b.dataset.q]; ask(QUESTIONS[b.dataset.q]); });
  };
  ENTER.ask = () => { lastMapScreen = "ask"; placeMap($("#ask-map .map-slot"), NORMAN, { top: 120, bottom: 20, left: 20, right: 20 }); mapReady.then(() => { setStorm(explicitStorm || pickDefaultStorm(DATA.catalog)); }); setTimeout(() => $("#askIn")?.focus(), 50); };

  const MONTH3 = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  // "May 2025", "may", "sept 2024" -> {m, y}; null when the text is not a month (and optional year)
  function parseMonthYear(q) {
    const m = /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?(?:\s+(?:\d{1,2},?\s+)?(\d{4}))?$/.exec(String(q).trim().toLowerCase());
    return m ? { m: MONTH3.indexOf(m[1].slice(0, 3)) + 1, y: m[2] ? +m[2] : null } : null;
  }
  let askTok = 0; // a slower, older answer must never overwrite a newer question's answer
  function ask(text) {
    const t = text.toLowerCase().trim(), tok = ++askTok;
    $("#answer").innerHTML = `<div class="answer"><div class="head"><span class="thinking"><i></i><i></i><i></i></span>Reading storms, homes, jobs, proposals and the calendar</div></div>`;
    setCustomerFilter(null);
    answerQuestion(t).then(r => {
      if (tok !== askTok) return;
      if (!r) { $("#answer").innerHTML = `<div class="answer"><div class="head">${ic("sparkle")}Answer</div><p>I can answer questions about storm hail (by date, size, ZIP or street) and customers in a storm's path. Try one of the suggestions above.</p></div>`; return; }
      $("#answer").innerHTML = `<div class="answer"><div class="head">${ic("sparkle")}Answer</div><h4>${r.big}</h4><p>${r.text}</p>${r.table || ""}<div class="from">${r.from}</div></div>`;
      r.after && r.after();
    });
  }
  function tbl(rows) { return `<table>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${i === r.length - 1 ? "n" : ""}">${c}</td>`).join("")}</tr>`).join("")}</table>`; }

  // ---------- intent parsing helpers (keyword/regex only, no AI) ----------
  const defaultStorm = () => DATA.byDate[MS.storm] || DATA.catalog[0];
  const MONTHS = { january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12 };
  const MONTH_RE = new RegExp("\\b(" + Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|") + ")\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d\\d))?\\b", "i");
  const MONTH_YEAR_RE = new RegExp("\\b(" + Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|") + ")\\.?\\s+(20\\d\\d)\\b", "i");
  const SLASH_DATE_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/;
  const LAST_MONTH_RE = new RegExp("\\blast\\s+(" + Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|") + ")\\b", "i");
  function monthYearQuery(t) { const m = t.match(MONTH_YEAR_RE); return m ? { mo: MONTHS[m[1].toLowerCase()], yr: +m[2] } : null; }
  const ST_SUFFIX = "st|street|dr|drive|ln|lane|ave|avenue|rd|road|ct|court|way|blvd|boulevard|cir|circle|trl|trail|pl|place|pkwy|parkway|run|loop";
  const STREET_RE = new RegExp("\\b(?:on|in|at)\\s+([a-z0-9][a-z0-9'.\\- ]{1,28}?\\s+(?:" + ST_SUFFIX + "))\\b", "i");
  function findStorm(t) {
    const ss = DATA.catalog;
    if (/latest|most recent|newest|last storm/.test(t)) return ss.slice().sort((x, y) => y.date.localeCompare(x.date))[0];
    if (/current storm|this storm|selected storm/.test(t)) return defaultStorm();
    const iso = t.match(/\b(20\d\d-\d\d-\d\d)\b/);
    if (iso && DATA.byDate[iso[1]]) return DATA.byDate[iso[1]];
    const slash = t.match(SLASH_DATE_RE);
    if (slash) {
      let mo = +slash[1], day = +slash[2], yr = +slash[3];
      if (yr < 100) yr += yr < 50 ? 2000 : 1900;
      const hit = ss.find(s => { const d = new Date(s.date + "T12:00:00"); return d.getMonth() + 1 === mo && d.getDate() === day && d.getFullYear() === yr; });
      if (hit) return hit;
    }
    if (/this year/.test(t)) {
      const yr = S.today.getFullYear();
      const hits = ss.filter(s => new Date(s.date + "T12:00:00").getFullYear() === yr);
      if (hits.length) { const top = hits.slice().sort((a, b) => b.homes_1in - a.homes_1in)[0]; top._multiNote = hits.length > 1; return top; }
      return null;
    }
    const lastMonth = t.match(LAST_MONTH_RE);
    if (lastMonth) {
      const mo = MONTHS[lastMonth[1].toLowerCase()], now = S.today;
      const hits = ss.filter(s => { const d = new Date(s.date + "T12:00:00"); return d.getMonth() + 1 === mo && d <= now; }).sort((a, b) => b.date.localeCompare(a.date));
      if (hits.length) return hits[0];
      return null;
    }
    const my = monthYearQuery(t);
    if (my) {
      const hits = ss.filter(s => { const d = new Date(s.date + "T12:00:00"); return d.getMonth() + 1 === my.mo && d.getFullYear() === my.yr; });
      if (hits.length) { const top = hits.slice().sort((a, b) => b.homes_1in - a.homes_1in)[0]; top._multiNote = hits.length > 1; return top; }
      return null; // explicit month/year asked, nothing on file: honest "no storm" handled in answerQuestion
    }
    const m = t.match(MONTH_RE);
    if (m) {
      const mo = MONTHS[m[1].toLowerCase()], day = +m[2], yr = m[3] ? +m[3] : null;
      const hit = ss.filter(s => { const d = new Date(s.date + "T12:00:00"); return d.getMonth() + 1 === mo && d.getDate() === day && (!yr || d.getFullYear() === yr); });
      if (hit.length) return hit[0];
    }
    return null;
  }
  function parseThreshold(t) { const m = t.match(/(?<![\d.])(\d(?:\.\d+)?)\s*(?:inch(?:es)?\b|in\b|")/i); return m ? Math.max(0.75, parseFloat(m[1])) : null; }
  // "this year", "last year", "2025", "May 2025", "spring 2024", "last spring" -> { label, storms } over the catalog
  const SEASONS = { spring: [3, 5], summer: [6, 8], fall: [9, 11], autumn: [9, 11], winter: [12, 2] };
  function findRange(t) {
    const ss = DATA.catalog, now = S.today, cy = now.getFullYear();
    const inYM = (s, y0, m0, y1, m1) => { const k = +s.date.slice(0, 4) * 12 + +s.date.slice(5, 7); return k >= y0 * 12 + m0 && k <= y1 * 12 + m1; };
    const mk = (label, fn) => ({ label, storms: ss.filter(fn) });
    const my = monthYearQuery(t);
    if (my) return mk(`${(Object.keys(MONTHS).find(k => MONTHS[k] === my.mo && k.length > 3) || Object.keys(MONTHS).find(k => MONTHS[k] === my.mo)).replace(/^./, c => c.toUpperCase())} ${my.yr}`, s => inYM(s, my.yr, my.mo, my.yr, my.mo));
    const se = t.match(/\b(?:(last|this)\s+)?(spring|summer|fall|autumn|winter)(?:\s+(?:of\s+)?(20\d\d))?\b/);
    if (se) {
      const [a, b] = SEASONS[se[2]]; let y = se[3] ? +se[3] : cy;
      if (!se[3]) { // no year: the most recent such season that has started; "last" = the one before the current/most recent
        if (new Date(y, a - 1, 1) > now) y -= 1;
        if (se[1] === "last" && new Date(y, b - 1, 28) >= now) y -= 1;
      }
      return mk(`${se[2]} ${y}`, a <= b ? s => inYM(s, y, a, y, b) : s => inYM(s, y - 1, 12, y, 2));
    }
    if (/\bthis year\b/.test(t)) return mk(String(cy), s => +s.date.slice(0, 4) === cy);
    if (/\blast year\b/.test(t)) return mk(String(cy - 1), s => +s.date.slice(0, 4) === cy - 1);
    const y = t.match(/(?<![\d-])(20\d\d)(?![\d-])/);
    if (y) return mk(y[1], s => +s.date.slice(0, 4) === +y[1]);
    return null;
  }
  const hasExplicitDay = t => /\b20\d\d-\d\d-\d\d\b/.test(t) || SLASH_DATE_RE.test(t) || MONTH_RE.test(t) || /latest|most recent|newest|last storm|current storm|this storm|selected storm/.test(t);
  function parseZip(t) { const m = t.match(/\b(\d{5})\b/); return m ? m[1] : null; }
  function parseStreetPhrase(t) { const m = t.match(STREET_RE); return m ? m[1].trim() : null; }
  function parseCityPhrase(t) {
    const sorted = cityList().filter(c => /[a-z]/i.test(c)).sort((a, b) => b.length - a.length);
    for (const name of sorted) {
      const re = new RegExp("\\b" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
      if (re.test(t)) return name;
    }
    return null;
  }
  function findStreetId(region, phrase) {
    if (!phrase || !region.streets) return -1;
    const p = phrase.toLowerCase();
    let best = -1, bestLen = Infinity;
    region.streets.forEach((s, i) => { const sl = s.toLowerCase(); if (sl === p || sl.includes(p) || p.includes(sl)) { if (sl.length < bestLen) { bestLen = sl.length; best = i; } } });
    return best;
  }
  // scans the cached hail/<date>.bin for every home that hit >=0.75in on a storm (only regions/storms
  // already loaded by the caller), optionally filtered by a region-aware predicate
  function homesMatching(st, pred, minC) {
    const out = [];
    st.regions.forEach(rr => {
      const region = REG(rr.id);
      const hail = region.hailCache[st.date];
      if (!hail || !region.metaView) return;
      for (let i = 0; i < region.n; i++) {
        if (hail[i] < (minC || 75) || region.type[i] > 4) continue; // residential only
        const m = regionHomeMeta(region, i);
        if (pred && !pred(region, m)) continue;
        const c = decodeLonLat(region, i);
        out.push({ ...m, hail: hail[i] / 100, lon: c[0], lat: c[1] });
      }
    });
    out.sort((a, b) => b.hail - a.hail);
    return out;
  }
  function countOver(st, inches) {
    const cents = Math.round(inches * 100);
    let c = 0;
    st.regions.forEach(rr => {
      const region = REG(rr.id), hail = region.hailCache[st.date];
      if (!hail) return;
      for (let i = 0; i < region.n; i++) if (hail[i] >= cents && region.type[i] <= 4) c++;
    });
    return c;
  }

  // ---------- dispatcher: most specific intent first, every branch computes from real/sample data ----------
  async function answerQuestion(t) {
    await new Promise(res => setTimeout(res, 700)); // keep the "thinking" beat
    const zip = parseZip(t), streetPhrase = parseStreetPhrase(t), cityPhrase = parseCityPhrase(t), thr = parseThreshold(t);
    const range = hasExplicitDay(t) ? null : findRange(t);
    let storm = range ? null : findStorm(t), note = "";
    if (range) {
      if (!range.storms.length) return { big: "No storm on file", text: `I don't have a storm on record for ${esc(range.label)}.`, from: "From: NOAA MRMS MESH radar archive (real data), Oct 2020 to present" };
      storm = range.storms.slice().sort((a, b) => b.homes_1in - a.homes_1in)[0];
      note = `Using the biggest of ${range.storms.length} storm${range.storms.length > 1 ? "s" : ""} in ${esc(range.label)}, ${storm.label}. `;
    }
    const place = zip || streetPhrase || cityPhrase, wantsHomes = /home|house|hit|took|hail|building/.test(t);
    if (/best lead|top lead|knock first|who should i (?:knock|call|door|visit|hit)|where should i (?:knock|start)|who to knock|hit list/.test(t)) return askBestLeads(storm, cityPhrase, zip, note);
    if (/roof age|age of (?:the |my )?roofs?|how old.*roof|average.*(?:year built|age)|(?:avg|average|typical|median) (?:home|house) age/.test(t)) return askRoofAge(cityPhrase, zip);
    if (place && !storm && !range && /biggest|largest|worst|max(?:imum)? hail|how big/.test(t) && /hail/.test(t)) return askBiggestHailWhere(zip, streetPhrase, cityPhrase);
    if (range && !place && thr == null && wantsHomes && !/customer/.test(t)) return askRange(range);
    if (place && wantsHomes) return askHomesWhere(storm, zip, streetPhrase, cityPhrase, thr, note);
    if (/customer.*(hail|storm|path)|(hail|storm|path).*customer/.test(t)) return askCustomersInPath(storm || latestRealStorm(DATA.catalog));
    if (thr != null && /home|house|hail/.test(t)) { const st0 = storm || DATA.catalog.find(s => s.max_in >= thr && s.homes_075 > 0) || latestRealStorm(DATA.catalog); return askHomesOverThreshold(st0, thr, note || (storm ? "" : `No storm named, so using the latest storm with ${thr.toFixed(2)} inch hail or larger, ${st0.label}. `)); }
    if (storm && /home|house|hit|hail/.test(t)) return askHomesInStorm(storm);
    if (/hail size|size of hail|biggest hail|largest hail|max(?:imum)? hail|how big/.test(t)) return askBiggestHail();
    if (/biggest|worst|largest|most homes|hit the most/.test(t) && /storm/.test(t)) return askStorms();
    if (/sign|revenue|sold|made|money|pipeline|proposal|open|pending|quote|calendar|schedule|inspection|appointment|rep|sales ?person|quarter/.test(t)) return askConnectJobList();
    // catchall: a bare date / storm name ("sep 24", "the may 8 storm", "10/10/2021") with no other
    // intent keyword still deserves that storm's summary instead of the generic fallback.
    if (storm) return askHomesInStorm(storm);
    // a month/year was named ("april 2021") but findStorm came back empty: say so honestly, never guess.
    const my = monthYearQuery(t);
    if (my) {
      const monthName = Object.keys(MONTHS).find(k => MONTHS[k] === my.mo && k.length > 3) || Object.keys(MONTHS).find(k => MONTHS[k] === my.mo);
      return { big: "No storm on file", text: `I don't have a storm on record for ${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${my.yr}. Try one of the dates in the suggestions above.`, from: "From: NOAA MRMS MESH radar archive (real data), Oct 2020 to present" };
    }
    return null;
  }
  function askRange(range) {
    const ss = range.storms.slice().sort((a, b) => b.homes_1in - a.homes_1in), top = ss[0], mx = ss.slice().sort((a, b) => b.max_in - a.max_in)[0];
    return {
      big: `${ss.length} storm${ss.length > 1 ? "s" : ""}`,
      text: `hit the area in ${esc(range.label)}. The biggest by homes was ${top.label} (${int(top.homes_1in)} homes at 1 inch or more); the largest hail was ${mx.max_in.toFixed(2)}" on ${mx.label}. Homes are counted per storm, so the same home is not added up across storms.`,
      table: tbl(ss.slice(0, 5).map(s => [s.label, `${int(s.homes_1in)} homes`, `max ${s.max_in.toFixed(2)}"`])),
      from: "From: NOAA MRMS MESH radar over county tax roll homes (real data)",
      after: () => setStorm(top.date)
    };
  }
  async function askBestLeads(storm, city, zip, note) {
    const pool = storm ? [storm] : DATA.catalog.filter(s => s.homes_075 > 0).slice(0, city || zip ? 5 : 1);
    let st = pool[0], list = [];
    for (const c of pool) {
      await ensureStormLoaded(c.date);
      await Promise.all(c.regions.map(rr => loadRegionMeta(REG(rr.id))));
      await ensureLeadData(c);
      st = c; list = hitListFor(c).filter(r => (!city || String(r.city).toLowerCase() === city.toLowerCase()) && (!zip || String(r.zip) === zip));
      if (list.length) break;
    }
    if (!storm) note = (city || zip) && list.length ? `No storm named, so using the latest storm that hit ${city || "ZIP " + zip} at 1 inch or more, ${st.label}. ` : `No storm named, so using the latest storm on file, ${st.label}. `;
    const top = list.slice(0, 5);
    const where = city || (zip ? "ZIP " + zip : "the whole hit area");
    if (!top.length) return { big: "No leads", text: `${storm ? note : ""}${storm ? "No homes" : "None of the latest " + pool.length + " storms put 1 inch or larger radar hail on homes"} in ${esc(where)}${storm ? " had 1 inch or larger radar hail on " + st.label : ""}. Name a date or year to look at an older storm.`, from: "From: NOAA MRMS MESH radar over county tax roll homes (real data)" };
    return {
      big: `${esc(top[0].addr)}`,
      text: `${note}Top door to knock in ${esc(where)} after ${st.label}, score ${top[0].score} of 100 (out of ${int(list.length)} homes in the path at 1 inch or more). Score = hail at the house, past storms, roof age and home value.`,
      table: tbl(top.map(r => [esc(r.addr), `${r.hail.toFixed(2)}" hail`, `Score ${r.score}`])),
      from: "From: NOAA MRMS MESH radar joined to county tax rolls (real data), Best leads score",
      after: () => { setStorm(st.date); const xs = top.map(h => h.lon), ys = top.map(h => h.lat); map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: { top: Math.min(400, $("#ask-map").clientHeight * .5), bottom: 30, left: 40, right: 40 }, duration: 900, maxZoom: 15.5 }); }
    };
  }
  async function askRoofAge(city, zip) {
    await Promise.all(REGIONS.map(r => loadRegionMeta(r)));
    const yr = new Date().getFullYear(); let n = 0, sum = 0, old = 0;
    REGIONS.forEach(region => {
      for (let i = 0; i < region.n; i++) {
        if (region.type[i] > 4) continue;
        const m = regionHomeMeta(region, i);
        if (!m.year || m.year < 1850 || (city && String(m.city).toLowerCase() !== city.toLowerCase()) || (zip && String(m.zip) !== zip)) continue;
        n++; sum += yr - m.year; if (yr - m.year >= 20) old++;
      }
    });
    const where = city || (zip ? "ZIP " + zip : "all counties on file");
    if (!n) return { big: "No data", text: `The county records have no year built for homes in ${esc(where)}.`, from: "From: county tax rolls (real data)" };
    return {
      big: `${Math.round(sum / n)} years`,
      text: `is the average age of homes in ${esc(where)} (${int(n)} homes with a year built; ${Math.round(old / n * 100)}% are 20 or more years old). That is house age from the county record; the roof may have been replaced since.`,
      from: "From: county tax roll year built (real data)"
    };
  }
  async function askBiggestHailWhere(zip, streetPhrase, cityPhrase) {
    const cands = DATA.catalog.slice().sort((a, b) => b.max_in - a.max_in).slice(0, 10);
    let best = null;
    for (const st of cands) {
      await ensureStormLoaded(st.date);
      await Promise.all(st.regions.map(rr => loadRegionMeta(REG(rr.id))));
      const list = homesMatching(st, (region, m) => (!zip || String(m.zip) === zip) && (!cityPhrase || m.city.toLowerCase() === cityPhrase.toLowerCase()) && (!streetPhrase || region.streets[m.streetId]?.toLowerCase().includes(streetPhrase.toLowerCase())));
      if (list.length && (!best || list[0].hail > best.h.hail)) best = { st, h: list[0] };
    }
    const where = [cityPhrase, streetPhrase, zip ? `ZIP ${zip}` : null].filter(Boolean).join(", ");
    if (!best) return { big: "No hits", text: `None of the 10 largest storms on file put 0.75 inch or larger hail on a home in ${esc(where)}.`, from: "From: NOAA MRMS MESH radar joined to county tax rolls (real data)" };
    return {
      big: `${best.h.hail.toFixed(2)}"`,
      text: `is the biggest radar hail on a home in ${esc(where)} among the 10 largest storms on file, on ${best.st.label} (${esc(best.h.addr)}).`,
      from: "From: NOAA MRMS MESH radar joined to county tax rolls (real data)",
      after: () => setStorm(best.st.date)
    };
  }
  function askHomesInStorm(st) {
    const multi = st._multiNote ? `More than one storm hit that month; showing the biggest, ${st.label}. ` : "";
    return {
      big: `${int(st.homes_1in)} homes`,
      text: `${multi}took 1 inch or larger radar hail on ${st.label} (largest that day: ${st.max_in.toFixed(2)}"). ${int(st.homes_150)} of those saw 1.5 inches or more.`,
      table: tbl(st.severity.map(s => [s.label, `${int(s.homes)} homes`])),
      from: "From: NOAA MRMS MESH radar over county tax roll homes (real data)",
      after: () => setStorm(st.date)
    };
  }
  function askBiggestHail() {
    const ss = DATA.catalog.slice().sort((a, b) => b.max_in - a.max_in);
    const top = ss[0];
    return {
      big: `${top.max_in.toFixed(2)}"`,
      text: `is the largest hail stone radar-estimated over the area, during the ${top.label} storm.`,
      table: tbl(ss.slice(0, 4).map(s => [s.label, `max ${s.max_in.toFixed(2)}"`])),
      from: "From: NOAA MRMS MESH radar (real data)",
      after: () => setStorm(top.date)
    };
  }
  async function askHomesOverThreshold(st, thr, note) {
    await ensureStormLoaded(st.date);
    const c = countOver(st, thr);
    const multi = note ? note + "That count is for homes that " : "";
    return {
      big: `${int(c)} homes`,
      text: `${multi}took ${thr.toFixed(2)} inch or larger radar hail on ${st.label}.`,
      from: "From: NOAA MRMS MESH radar over county tax roll homes (real data)",
      after: () => setStorm(st.date)
    };
  }
  async function askHomesWhere(st, zip, streetPhrase, cityPhrase, thr, note) {
    const minC = Math.round((thr || 0.75) * 100), where = [cityPhrase, streetPhrase, zip ? `ZIP ${zip}` : null].filter(Boolean).join(", ") || "the area";
    const match = (region, m) => (!zip || String(m.zip) === zip) && (!cityPhrase || m.city.toLowerCase() === cityPhrase.toLowerCase()) && (!streetPhrase || region.streets[m.streetId]?.toLowerCase() === region.streets[findStreetId(region, streetPhrase)]?.toLowerCase());
    if (!st) { // no storm named: newest storm (of the latest 4) that actually hit this place
      const cands = DATA.catalog.filter(s => s.homes_075 > 0 && s.max_in >= minC / 100).slice(0, thr && thr > 0.75 ? 8 : 6);
      for (const c of cands) {
        await ensureStormLoaded(c.date); await Promise.all(c.regions.map(rr => loadRegionMeta(REG(rr.id))));
        if (homesMatching(c, match, minC).length) { st = c; note = `No storm named, so using the latest storm that hit ${esc(where)}${thr ? " at " + thr.toFixed(2) + " inch or more" : ""}, ${c.label}. `; break; }
      }
      if (!st) { st = cands[0]; note = `No storm named, and none of the latest ${cands.length} storms with that hail size hit ${esc(where)}; showing the newest, ${st.label}. `; }
    }
    await ensureStormLoaded(st.date);
    await Promise.all(st.regions.map(rr => loadRegionMeta(REG(rr.id))));
    if (streetPhrase && !st.regions.some(rr => findStreetId(REG(rr.id), streetPhrase) >= 0)) {
      return { big: "No match", text: `I couldn't find a street matching "${esc(streetPhrase)}" on the county tax rolls. Try the exact street name, like "Cedar Creek Dr".`, from: "From: county tax roll street lists (real data)" };
    }
    const list = homesMatching(st, match, minC);
    return {
      big: `${int(list.length)} homes`,
      text: `${note ? note + "Homes " : ""}on the county tax rolls in ${esc(where)} took ${(minC / 100).toFixed(2)} inch or larger radar hail on ${st.label}.`,
      table: list.length ? tbl(list.slice(0, 5).map(h => [esc(h.addr), h.year ? "Built " + h.year : "", h.hail.toFixed(2) + '"'])) : "",
      from: "From: NOAA MRMS MESH radar joined to county tax rolls (real data)",
      after: () => { setStorm(st.date); if (list.length) { const xs = list.map(h => h.lon), ys = list.map(h => h.lat); map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: { top: Math.min(400, $("#ask-map").clientHeight * .5), bottom: 30, left: 40, right: 40 }, duration: 900, maxZoom: 15.5 }); } }
    };
  }
  async function askCustomersInPath(st) {
    await ensureCustomerHail(st);
    const list = DATA.customers.filter(c => (c.hail[st.date] || 0) >= 1).sort((a, b) => b.hail[st.date] - a.hail[st.date]);
    return {
      big: `${list.length} customers`,
      text: realCust ? `took 1 inch or larger hail on ${st.label}. They are highlighted on the map.` : `took 1 inch or larger hail on ${st.label}. ${list.filter(c => c.roof_year <= 2012).length} of them have roofs installed in 2012 or earlier. They are highlighted on the map.`,
      table: tbl(list.slice(0, 5).map(c => [esc(c.name), esc(c.addr), c.roof_year ? `Roof ${c.roof_year}` : "", c.hail[st.date].toFixed(2) + '"'])),
      from: realCust ? "From: NOAA MRMS radar hail (real) joined to your customer list" : "From: NOAA MRMS radar hail (real) joined to your customer list (sample)",
      after: () => {
        setStorm(st.date); setCustomerFilter(list.map(c => c.id));
        if (list.length) { const xs = list.map(c => c.lon), ys = list.map(c => c.lat); map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: { top: Math.min(520, $("#ask-map").clientHeight * .6), bottom: 30, left: 40, right: 40 }, duration: 900, maxZoom: 14 }); }
      }
    };
  }
  function askStorms() {
    const ss = DATA.catalog.slice().sort((a, b) => b.homes_1in - a.homes_1in);
    return {
      big: ss[0].label,
      text: `hit the most homes since the radar archive began in Oct 2020: ${int(ss[0].homes_1in)} homes at 1 inch or larger.`,
      table: tbl(ss.slice(0, 10).map(s => [s.label, `max ${s.max_in.toFixed(2)}"`, `${int(s.homes_1in)} homes`])),
      from: "From: NOAA MRMS MESH radar over county tax roll homes (real data)"
    };
  }
  function askConnectJobList() {
    return {
      big: "Not connected yet",
      text: "Connect your job list (CSV export from your CRM) to answer this.",
      from: "Storm and home questions are answered from real data today."
    };
  }

  // ---------- modal / toast ----------
  function modal(title, body, okLabel, onOk) {
    const bg = document.createElement("div"); bg.className = "modal-bg";
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="mh"><h3>${title}</h3><button class="btn sm" style="margin-left:auto" data-x aria-label="Close">${ic("x")}</button></div><div class="mb">${body}</div><div class="mf">${okLabel === "Close" ? `<button class="btn primary" data-x>Close</button>` : `<button class="btn" data-x>Cancel</button><button class="btn primary" data-ok>${okLabel}</button>`}</div></div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.onclick = e => { if (e.target === bg || e.target.closest("[data-x]")) close(); if (e.target.closest("[data-ok]")) { close(); onOk && onOk(); } };
  }
  let toastT;
  // persistent plain-language notice under the page header when map data (hail or homes) failed to load; the cache keeps failures until reload, so the action is Reload
  function dataNotice(kind, name) {
    if (document.getElementById("dataNotice")) return;
    const top = $(".main > .top"); if (!top) return; // screens rebuild their own innerHTML, so the notice lives between the header and the screens
    const d = document.createElement("div"); d.id = "dataNotice"; d.setAttribute("role", "status");
    d.style.cssText = "margin:0 0 12px;padding:12px 14px;border-radius:12px;background:#F6E7DF;color:#1E1C19;font-size:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap";
    d.innerHTML = `<span style="flex:1;min-width:220px">${kind === "hail" ? "Some hail data for this storm did not load, so parts of the map may look empty and the counts may be low." : "Homes for " + esc(name || "one county") + " did not load, so part of the map may look empty."} This is usually the connection.</span><button class="btn sm accent" type="button" id="dataNoticeRetry">Reload</button><a class="btn sm" style="text-decoration:none;color:inherit" href="help/index.html#troubleshooting" target="_blank" rel="noopener">Help</a>`;
    top.insertAdjacentElement("afterend", d);
    d.querySelector("#dataNoticeRetry").onclick = () => location.reload();
  }
  function toast(msg) { $(".toast")?.remove(); const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 3200); }

  // ---------- boot ----------
  if (window.BRAND && /555-01\d\d/.test(BRAND.phone || "")) BRAND.phone = ""; // fictional sample number: never print it on a proposal
  applyBrand(); buildNav(); if (window.RCInbox && window.RCInbox.signedIn()) window.RCInbox.load().then(() => window.RCInbox.badge(), () => { });
  $("#openAsk").onclick = () => location.hash = "#ask";
  window.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); location.hash = "#ask"; } if (e.key === "Escape") $(".modal-bg")?.remove(); });
  window.addEventListener("hashchange", route);
  route();
  // map is created after the first screen paints (initMap below); the 400ms timer covers hidden tabs where rAF never fires
  load().then(d => { DATA = d; window.RC_DAILY_SRC = { data: () => DATA, reg: REG, pickDefaultStorm, ensureStormLoaded: dt => ensureStormLoaded(dt), loadRegionMeta, regionHomeMeta }; MS.storm = pickDefaultStorm(DATA.catalog); route(); { let started = false; const go = () => { if (started) return; { const c = document.getElementById("mlcss"); if (c && !window.__mlcss) { if (!c._w) { c._w = 1; c.addEventListener("load", () => go()); c.addEventListener("error", () => go()); } return; } } if (!window.maplibregl) { const t = document.getElementById("mlib"); if (t && !t._w) { t._w = 1; t.addEventListener("load", () => { go(); }); } return; } started = true; initMap(); window.__demo = { map, DATA, REGIONS }; }; requestAnimationFrame(() => setTimeout(go, 0)); setTimeout(go, 400); } }).catch(err => { console.error(err); $(".main").insertAdjacentHTML("beforeend", `<div class="card" id="bootFail" style="padding:18px"><b>The storm data did not load.</b><p class="muted" style="margin:6px 0 12px">This is usually a dropped connection or a short outage on our side. Nothing you saved is lost. Check your connection and try again. If it keeps happening, open Help for what to check.</p><button class="btn accent" id="bootRetry" type="button">Try again</button> <a class="btn" style="text-decoration:none;color:inherit" href="help/index.html#troubleshooting" target="_blank" rel="noopener">Help</a></div>`); { const b = document.getElementById("bootRetry"); if (b) b.onclick = () => location.reload(); } });
})();
