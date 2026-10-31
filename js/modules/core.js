/* Roof Command demo. core.js: shared namespace, helpers, brand, routes/nav/route(), modal/toast,
   data load, regions loader. Moved verbatim from js/app.js (2026-10-02 split), no behaviour change. */
(function () {
  window.RC = window.RC || {};
  const RC = window.RC;
  RC.st = {
    DATA: null, current: null, built: {},
    REGIONS: [],
    explicitStorm: null
  };

  const B = window.BRAND, S = window.SAMPLE;
  RC.B = B; RC.S = S;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ic = (n, cls = "i") => `<svg class="${cls}"><use href="#i-${n}"/></svg>`;
  const money = (v, d = 0) => "$" + Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const int = v => Number(v).toLocaleString("en-US");
  const moneyShort = v => v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : v >= 1e4 ? "$" + Math.round(v / 1e3) + "K" : money(v);
  const fmtDate = (d, o = { month: "short", day: "numeric" }) => new Date(d + (d.length === 10 ? "T12:00:00" : "")).toLocaleDateString("en-US", o);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fill = s => s.replace(/\{company\}/g, B.company);
  Object.assign(RC, { $, $$, ic, money, int, moneyShort, fmtDate, esc, fill });

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
  }
  RC.applyBrand = applyBrand;

  // ---------- routes ----------
  const ROUTES = [
    { id: "overview", label: "Overview", icon: "home", title: () => greeting(), sub: () => new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) },
    { id: "storm", label: "Storm Response", icon: "hail", title: () => "Storm Response", sub: () => "Real radar hail over the county" },
    { id: "roof", label: "Roof Measure", icon: "ruler", title: () => "Roof Measure + Proposal", sub: () => "Measured from aerial imagery and the building footprint" },
    { id: "ask", label: "Ask", icon: "sparkle", title: () => "Ask", sub: () => "Questions answered from your own data" }
  ];
  RC.ROUTES = ROUTES;
  function greeting() {
    const h = new Date().getHours();
    return `Good ${h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"}, ${B.owner}`;
  }
  function buildNav() {
    $("#nav").innerHTML = `<div class="nav-label">Workspace</div>` + ROUTES.map(r => `<a href="#${r.id}" data-r="${r.id}">${ic(r.icon)}${r.label}</a>`).join("");
    $("#dock").innerHTML = ROUTES.map((r, i) => (i === ROUTES.length - 1 ? `<span class="sepv"></span>` : "") + `<a href="#${r.id}" data-r="${r.id}" aria-label="${r.label}">${ic(r.icon)}<span class="tip">${r.label}</span></a>`).join("");
  }
  RC.buildNav = buildNav;

  // SCREENS/ENTER are shared across every screen module (overview/storm in storm.js, roof in roof.js,
  // ask in ask.js); declared once here so each module can add its own properties.
  RC.SCREENS = {}; RC.ENTER = {};

  function route() {
    const id = (location.hash || "#overview").slice(1);
    const r = ROUTES.find(x => x.id === id) || ROUTES[0];
    RC.st.current = r.id;
    $$("[data-r]").forEach(a => a.classList.toggle("on", a.dataset.r === r.id));
    if (RC.st.map && !["overview", "storm", "ask"].includes(r.id)) $("#mapPark").appendChild($("#mapwrap")); // keep the map sized while hidden
    $$(".screen").forEach(s => s.classList.toggle("on", s.id === "s-" + r.id));
    $("#title").textContent = r.title(); $("#subtitle").textContent = r.sub();
    if (!RC.st.DATA) return;
    if (!RC.st.built[r.id]) { RC.SCREENS[r.id](); RC.st.built[r.id] = true; }
    RC.ENTER[r.id] && RC.ENTER[r.id]();
  }
  RC.route = route;

  // ---------- regions (data/regions.json manifest: each region is its own catalog.json + homes.bin,
  // loaded eagerly; homes_meta.bin/streets.json stay lazy per region; per-storm hail/<date>.bin is
  // fetched only for the storm actually selected, cached forever after). A region that 404s (not built
  // yet) is skipped quietly so new counties can be added to regions.json with no code change. ----------
  const TYPE_LABELS = ["Single-family home", "Duplex", "Townhome", "Condo", "Mobile home", "Multifamily", "Commercial building", "Industrial building", "Institutional building", "Agricultural building", "Other building"];
  RC.TYPE_LABELS = TYPE_LABELS;
  const REG = id => RC.st.REGIONS.find(r => r.id === id);
  RC.REG = REG;
  function decodeLonLat(region, i) {
    const b = region.box;
    return [b.lon_min + region.lonq[i] / 65535 * (b.lon_max - b.lon_min), b.lat_min + region.latq[i] / 65535 * (b.lat_max - b.lat_min)];
  }
  RC.decodeLonLat = decodeLonLat;
  async function loadOneRegion(m) {
    try {
      const catalog = await fetch(m.path + "catalog.json").then(r => { if (!r.ok) throw 0; return r.json(); });
      const [bin, cities] = await Promise.all([
        fetch(m.path + "homes.bin").then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); }),
        fetch(m.path + "cities.json").then(r => r.ok ? r.json() : []).catch(() => [])
      ]);
      const n = catalog.homes.count, box = catalog.box;
      let o = 0;
      const lonq = new Uint16Array(bin.slice(o, o + 2 * n)); o += 2 * n;
      const latq = new Uint16Array(bin.slice(o, o + 2 * n)); o += 2 * n;
      const type = new Uint8Array(bin, o, n);
      const byDate = Object.fromEntries(catalog.storms.map(s => [s.date, s]));
      return { id: m.id, name: m.name, path: m.path, catalog, n, box, lonq, latq, type, cities, byDate, hailCache: {}, hailPromise: {}, metaPromise: null, metaView: null, streets: null, owners: null, ownersPromise: null };
    } catch (e) { return null; } // not built yet, skip quietly
  }
  async function loadRegions() {
    const manifest = await fetch("data/regions.json").then(r => r.ok ? r.json() : []).catch(() => []);
    const results = await Promise.all(manifest.map(loadOneRegion));
    return results.filter(Boolean);
  }
  // combine every region's catalog into one newest-first storm list keyed by date; a storm present in
  // more than one region's catalog has its residential counts summed and both regions' swaths kept
  const SEV_LABELS = ["0.75 to 0.99 in", "1.00 to 1.24 in", "1.25 to 1.49 in", "1.50 to 1.99 in", "2.00 in and up"];
  RC.SEV_LABELS = SEV_LABELS;
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
  RC.recentStorms = recentStorms;
  function pickDefaultStorm(catalog) { return (catalog.find(s => s.homes_1in >= 100) || catalog.find(s => s.homes_075 > 0) || catalog[0]).date; }
  RC.pickDefaultStorm = pickDefaultStorm;
  // Overview's mini map always shows the single most recent REAL storm (hit >=1 home), independent of
  // Storm Response's own "newest with >=100 homes" default picked below.
  function latestRealStorm(catalog) { return catalog.find(s => s.homes_075 > 0) || catalog[0]; }
  RC.latestRealStorm = latestRealStorm;
  function fetchHail(region, date) {
    if (region.hailCache[date] !== undefined) return Promise.resolve(region.hailCache[date]);
    const st = region.byDate[date];
    if (!st) { region.hailCache[date] = null; return Promise.resolve(null); }
    if (!region.hailPromise[date]) region.hailPromise[date] = fetch(region.path + st.hail).then(r => r.ok ? r.arrayBuffer() : null).then(buf => { const arr = buf ? new Uint8Array(buf) : null; region.hailCache[date] = arr; return arr; });
    return region.hailPromise[date];
  }
  RC.fetchHail = fetchHail;
  function ensureStormLoaded(date) {
    const st = RC.st.DATA.byDate[date]; if (!st) return Promise.resolve();
    return Promise.all(st.regions.map(rr => fetchHail(REG(rr.id), date)));
  }
  RC.ensureStormLoaded = ensureStormLoaded;
  function loadRegionMeta(region) {
    if (!region.metaPromise) region.metaPromise = Promise.all([
      fetch(region.path + "streets.json").then(r => r.json()),
      fetch(region.path + "homes_meta.bin").then(r => r.arrayBuffer())
    ]).then(([streets, buf]) => { region.streets = streets; region.metaView = new DataView(buf); });
    return region.metaPromise;
  }
  RC.loadRegionMeta = loadRegionMeta;
  // Homeowner names (private, from the public county tax roll, see data/private/README.md).
  // Lazy-loaded per region on first house-card open, cached forever after; a region with no
  // data/private/<id>.json (404) just leaves owner info hidden, never a broken fetch.
  function loadRegionOwners(region) {
    if (region.ownersPromise) return region.ownersPromise;
    region.ownersPromise = fetch(`data/private/${region.id}.json`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { region.owners = d; return d; })
      .catch(() => { region.owners = null; return null; });
    return region.ownersPromise;
  }
  RC.loadRegionOwners = loadRegionOwners;
  function regionOwnerInfo(region, i) {
    const o = region.owners;
    if (!o || !o.names) return null;
    const name = o.names[i];
    if (!name) return null;
    return { name, ownerOccupied: !!(o.homestead && o.homestead[i]) };
  }
  RC.regionOwnerInfo = regionOwnerInfo;
  // layout (data/county/README.md): u16 yearBuilt[n], u32 value[n], u16 houseNo[n], u16 streetId[n], u32 zip[n], u16 cityId[n]
  function regionHomeMeta(region, i) {
    const n = region.n, v = region.metaView;
    const year = v.getUint16(i * 2, true);
    const value = v.getUint32(n * 2 + i * 4, true);
    const houseNo = v.getUint16(n * 2 + n * 4 + i * 2, true);
    const streetId = v.getUint16(n * 2 + n * 4 + n * 2 + i * 2, true);
    const zip = v.getUint32(n * 2 + n * 4 + n * 2 + n * 2 + i * 4, true);
    const cityId = v.getUint16(n * 2 + n * 4 + n * 2 + n * 2 + n * 4 + i * 2, true);
    const street = region.streets[streetId] || "";
    const city = region.cities[cityId] || "";
    return { addr: houseNo ? `${houseNo} ${street}` : (street || "Address on file"), year: year || null, value: value || null, zip: zip || null, streetId, cityId, city, type: region.type[i] };
  }
  RC.regionHomeMeta = regionHomeMeta;
  const streetOf = addr => addr.replace(/^\d+\s*/, "") || addr;
  RC.streetOf = streetOf;

  // ---------- data ----------
  async function load() {
    const [regions, customers] = await Promise.all([
      loadRegions(),
      fetch("data/customers.json").then(r => r.json())
    ]);
    RC.st.REGIONS = regions;
    const catalog = buildCombinedCatalog(regions);
    const byDate = Object.fromEntries(catalog.map(s => [s.date, s]));
    return { regions, catalog, byDate, customers };
  }
  RC.load = load;

  // ---------- shared map constants / markup used by more than one screen module ----------
  const NORMAN = [[-97.56, 35.14], [-97.25, 35.33]];
  const DOT_RAMP = [0.75, "#E3A008", 1.0, "#E07B00", 1.25, "#D9480F", 1.5, "#C2185B", 1.75, "#7B1FA2", 2.25, "#3F0D6E"];
  RC.NORMAN = NORMAN; RC.DOT_RAMP = DOT_RAMP;
  const legend = (extra = "") => `<div class="map-legend"><b style="font-size:11.5px;color:var(--ink)">Max hail size (radar)</b><div class="ramp"></div>
    <div class="ramp-l"><span>0.75"</span><span>1"</span><span>1.25"</span><span>1.5"</span><span>1.75"</span><span>2"+</span></div>
    <div class="legend-row"><span class="dot" style="background:#A39C90;opacity:.6"></span>Home outside the swath<span class="dot" style="background:#fff;border:2px solid var(--accent);margin-left:10px"></span>Customer</div>${extra}</div>`;
  const sourceNote = st => `<div class="source-note">Source: NOAA MRMS MESH radar, ${st.label}. Homes: county tax rolls.</div>`;
  RC.legend = legend; RC.sourceNote = sourceNote;

  // ---------- modal / toast ----------
  function modal(title, body, okLabel, onOk) {
    const bg = document.createElement("div"); bg.className = "modal-bg";
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="mh"><h3>${title}</h3><button class="btn sm" style="margin-left:auto" data-x aria-label="Close">${ic("x")}</button></div><div class="mb">${body}</div><div class="mf"><button class="btn" data-x>Cancel</button><button class="btn primary" data-ok>${okLabel}</button></div></div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.onclick = e => { if (e.target === bg || e.target.closest("[data-x]")) close(); if (e.target.closest("[data-ok]")) { close(); onOk && onOk(); } };
  }
  RC.modal = modal;
  let toastT;
  function toast(msg) { $(".toast")?.remove(); const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 3200); }
  RC.toast = toast;
})();
