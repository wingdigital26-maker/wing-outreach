/* Roof Command demo. storm.js: overview screen, storm response screen, storm catalog modal, storm
   export CSV/door-knock route. Moved verbatim from js/app.js (2026-10-02 split), no behaviour change. */
(function () {
  const RC = window.RC;
  const { $, $$, ic, int, esc } = RC;
  const st = RC.st;

  // ---------- storm export: hit list CSV + door-knock route (no owner names, real home fields only) ----------
  // callers must ensureStormLoaded(st.date) + loadRegionMeta for every contributing region first
  // F21: respects the active Storm Response filters (min hail raises the default 1.00in floor; type,
  // year, value, city, ZIP, customers-only narrow further). With no filters set this returns exactly the
  // same list as before (>=1.00in, residential only, matches catalog homes_1in).
  function hitListFor(sm) {
    const rows = [];
    const thr = RC.STFILT.minHail != null ? Math.round(RC.STFILT.minHail * 100) : 100;
    sm.regions.forEach(rr => {
      const region = RC.REG(rr.id);
      const hail = region.hailCache[sm.date];
      if (!hail || !region.metaView) return;
      const custSet = RC.STFILT.customersOnly ? RC.customerHomeIndexFor(region) : null;
      for (let i = 0; i < region.n; i++) {
        if (hail[i] < thr || region.type[i] > 4) continue; // residential only, matches catalog homes_1in
        if (!RC.homeMatchesFilters(region, i, custSet, true)) continue;
        const m = RC.regionHomeMeta(region, i), c = RC.decodeLonLat(region, i);
        const owner = RC.regionOwnerInfo(region, i);
        rows.push({ ...m, hail: hail[i] / 100, lon: c[0], lat: c[1], ownerName: owner ? owner.name : "", ownerOccupied: owner ? owner.ownerOccupied : false });
      }
    });
    rows.sort((a, b) => b.hail - a.hail);
    return rows;
  }
  RC.hitListFor = hitListFor;
  function csvEsc(v) { return `"${String(v).replace(/"/g, '""')}"`; }
  function hitListCSV(rows) {
    const hasOwners = rows.some(r => r.ownerName);
    const head = ["Address", "City", "ZIP", "Hail (in)", "Year built", "Assessed value", ...(hasOwners ? ["Owner Name", "Owner Occupied"] : [])].join(",");
    const body = rows.map(r => [csvEsc(r.addr), csvEsc(r.city || ""), r.zip || "", r.hail.toFixed(2), r.year || "", r.value || "", ...(hasOwners ? [csvEsc(r.ownerName || ""), r.ownerOccupied ? "Yes" : "No"] : [])].join(","));
    return [head, ...body].join("\n");
  }
  function customersInPathCSV(sm) {
    const rows = st.DATA.customers.filter(c => (c.hail[sm.date] || 0) >= 1).sort((a, b) => b.hail[sm.date] - a.hail[sm.date]);
    const head = ["Customer (sample)", "Address (sample)", "Hail (in)"].join(",");
    const body = rows.map(c => [csvEsc(c.name), csvEsc(c.addr), c.hail[sm.date].toFixed(2)].join(","));
    return [head, ...body].join("\n");
  }
  function downloadText(filename, text, type) {
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

  // ===== overview =====
  RC.SCREENS.overview = () => {
    const ss = st.DATA.catalog; // already newest first
    const latest = RC.latestRealStorm(ss);
    const biggestHail = ss.slice().sort((a, b) => b.max_in - a.max_in)[0];
    const custIn = st.DATA.customers.filter(c => (c.hail[latest.date] || 0) >= 1).length;
    const recent = ss.filter(s => s.homes_1in > 0).slice(0, 6);
    const sv = latest;
    $("#s-overview").innerHTML = `
      <div class="grid kpis">
        <div class="card kpi"><div class="label">${ic("hail")}Latest storm</div><div class="kpi-value">${latest.label}</div><div class="delta">${latest.max_in.toFixed(2)}" max hail, radar-estimated</div></div>
        <div class="card kpi"><div class="label">${ic("home")}Homes hit, latest storm</div><div class="kpi-value">${int(latest.homes_1in)}</div><div class="delta">1 inch or larger hail${latest.bldgs_1in_nonres ? `, plus ${int(latest.bldgs_1in_nonres)} commercial/other buildings` : ""}</div></div>
        <div class="card kpi"><div class="label">${ic("ruler")}Biggest hail on file</div><div class="kpi-value">${biggestHail.max_in.toFixed(2)}"</div><div class="delta">${biggestHail.label}</div></div>
        <div class="card kpi"><div class="label">${ic("users")}Customers in path, latest storm</div><div class="kpi-value">${int(custIn)}</div><div class="delta">Sample customer list</div></div>
      </div>
      <div class="grid ov" style="margin-top:16px">
        <div class="card map-card" id="ov-map"><div class="map-slot"></div>
          <div class="map-title"><b>Hail over the area</b><span>${sv.label} &middot; ${int(sv.homes_1in)} homes at 1 inch or more</span></div>
          ${RC.legend()}${RC.sourceNote(sv)}</div>
        <div class="card"><div class="card-h"><h3>Recent storms</h3><span class="muted">Newest first &middot; ${int(ss.length)} on file since Oct 2020</span></div>
          <div class="card-b" id="recentStorms" style="padding-top:4px"></div></div>
      </div>`;
    $("#recentStorms").innerHTML = recent.map(s => `<button class="row storm-row" data-d="${s.date}" style="width:100%;text-align:left;background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:8px 0">
      <span style="flex:1;font-weight:600">${s.label}</span><span class="muted">${s.max_in.toFixed(2)}" max</span><span class="num" style="min-width:70px;text-align:right">${int(s.homes_1in)} homes</span></button>`).join("");
    $$("#recentStorms .storm-row").forEach(b => b.onclick = () => { st.explicitStorm = b.dataset.d; st.MS.storm = b.dataset.d; location.hash = "#storm"; });
  };
  RC.ENTER.overview = () => { st.lastMapScreen = "overview"; RC.placeMap($("#ov-map .map-slot"), RC.NORMAN, 24); st.mapReady.then(() => { RC.setStorm(RC.latestRealStorm(st.DATA.catalog).date); RC.setCustomerFilter(null); }); };

  // ===== storm =====
  RC.SCREENS.storm = () => {
    const recent = RC.recentStorms(st.DATA.catalog);
    $("#s-storm").innerHTML = `
      <div class="grid storm">
        <div class="card map-card" id="st-map"><div class="map-slot"></div>
          <div class="storm-chips">${recent.map(s => `<button class="chip" data-s="${s.date}">${s.label}</button>`).join("")}<button class="chip" id="allStormsBtn" type="button">All storms (${int(st.DATA.catalog.length)})</button></div>
          ${RC.legend()}<div class="source-note" id="stSrc"></div></div>
        <div class="card panel" id="stPanel"></div>
      </div>`;
    $$("#s-storm .chip[data-s]").forEach(b => b.onclick = () => { st.explicitStorm = b.dataset.s; pickStorm(b.dataset.s, true); });
    $("#allStormsBtn").onclick = () => openStormCatalog();
  };
  RC.ENTER.storm = () => { st.lastMapScreen = "storm"; RC.placeMap($("#st-map .map-slot"), RC.NORMAN, 40); st.mapReady.then(() => { pickStorm(st.explicitStorm || RC.pickDefaultStorm(st.DATA.catalog), false); }); };
  function pickStorm(date, fit) {
    const sm = st.DATA.byDate[date]; if (!sm) return;
    st.MS.storm = date;
    $$("#s-storm .chip[data-s]").forEach(b => b.classList.toggle("on", b.dataset.s === date));
    RC.setStorm(date); // async map repaint; panel below renders instantly from catalog numbers
    RC.setCustomerFilter(st.DATA.customers.filter(c => (c.hail[date] || 0) >= 1).map(c => c.id));
    $("#stSrc").textContent = `Source: NOAA MRMS MESH radar, ${sm.label}. Homes: county tax rolls.`;
    renderStormPanel(sm);
    if (fit) st.map.fitBounds(RC.NORMAN, { padding: 30, duration: 600 });
  }
  RC.pickStorm = pickStorm;
  function renderStormPanel(sm) {
    const custIn = st.DATA.customers.filter(c => (c.hail[sm.date] || 0) >= 1).length;
    const maxSev = Math.max(...sm.severity.map(s => s.homes), 1);
    const sevCol = ["#F2C94C", "#E9A23B", "#E07A3F", "#D0507E", "#7B2D8E"];
    const ago = Math.round((RC.S.today - new Date(sm.date + "T12:00:00")) / RC.S.DAY);
    const cityNames = [...new Set(st.REGIONS.flatMap(r => r.cities || []))].sort();
    $("#stPanel").innerHTML = `
      <div class="card-h"><h3>Storm of ${sm.label}</h3><span class="muted">${ago < 2 ? "last night" : ago < 60 ? ago + " days ago" : ""}</span></div>
      <div class="card-b" style="display:flex;flex-direction:column;gap:14px;flex:1">
        <div class="muted" style="margin-top:-8px">Radar-estimated max hail size at each home in the county.</div>
        <div class="filters-block">
          <button class="filters-toggle" id="filtToggle" type="button" aria-expanded="${filtOpen}">
            <span>Filters</span><span class="cnt ${activeFilterCount() ? "on" : ""}" id="filtCountTag">${activeFilterCount()} active</span>
            <svg class="i chev ${filtOpen ? "open" : ""}"><use href="#i-arrow"/></svg>
          </button>
          <div class="filters-bar" id="filtersBody" ${filtOpen ? "" : "style=\"display:none\""}>
            <select id="fType"><option value="">All home types</option>${RC.TYPE_LABELS.slice(0, 5).map((l, i) => `<option value="${i}" ${RC.STFILT.type === String(i) ? "selected" : ""}>${l}</option>`).join("")}</select>
            <select id="fCity"><option value="">All cities</option>${cityNames.map(c => `<option ${RC.STFILT.city === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
            <div class="frange"><input type="number" id="fYearMin" placeholder="Built after" value="${RC.STFILT.yearMin || ""}"><span>&ndash;</span><input type="number" id="fYearMax" placeholder="Built before" value="${RC.STFILT.yearMax || ""}"></div>
            <div class="frange"><input type="number" id="fValMin" placeholder="Min value $" value="${RC.STFILT.valMin || ""}"><span>&ndash;</span><input type="number" id="fValMax" placeholder="Max value $" value="${RC.STFILT.valMax || ""}"></div>
            <input type="number" id="fMinHail" placeholder="Min hail, in" step="0.25" min="0.75" value="${RC.STFILT.minHail || ""}">
            <input type="text" id="fZip" placeholder="ZIP" maxlength="5" value="${esc(RC.STFILT.zip || "")}">
            <label class="fcheck"><input type="checkbox" id="fCust" ${RC.STFILT.customersOnly ? "checked" : ""}> Customers only</label>
            <button class="btn sm" id="fReset" type="button">Reset filters</button>
          </div>
        </div>
        <div class="muted" id="filtMatch"></div>
        <div class="big-stat">
          <div class="stat"><div class="v">${int(sm.homes_1in)}</div><div class="l">Homes in path, 1 inch+</div></div>
          <div class="stat"><div class="v">${custIn}</div><div class="l">Your customers in path</div></div>
          <div class="stat"><div class="v">${sm.max_in.toFixed(2)}"</div><div class="l">Largest hail on a home</div></div>
          <div class="stat wide"><div class="v">${int(sm.bldgs_1in_nonres)}</div><div class="l">Commercial/other buildings in path, 1 inch+ (Norman)</div></div>
        </div>
        <div><div style="font-size:12.5px;font-weight:600;margin-bottom:4px">Severity breakdown</div>
          ${sm.severity.map((s, i) => `<div class="sev"><span>${s.label}</span><span class="track"><span class="fill" style="display:block;width:${s.homes / maxSev * 100}%;background:${sevCol[i]}"></span></span><span class="n">${int(s.homes)}</span></div>`).join("")}
        </div>
        <div style="margin-top:auto;display:flex;flex-direction:column;gap:8px">
          <button class="btn accent block" id="exportCust" ${custIn ? "" : "disabled"}>${ic("download")}Export customers in path (CSV), ${custIn}</button>
          <button class="btn block" id="canvass" ${sm.homes_1in ? "" : "disabled"}>${ic("house")}Door-knock route, ${int(sm.homes_1in)} homes</button>
          <div class="fineprint">Hail: NOAA MRMS MESH, 1 km radar grid, max over the storm. Homes: county tax rolls, residential parcels. Customers and dollar values are sample data.</div>
        </div>
      </div>`;
    $("#exportCust").onclick = () => downloadText(`customers-in-path-${sm.date}.csv`, customersInPathCSV(sm), "text/csv");
    $("#canvass").onclick = () => openCanvass(sm);
    wireStormFilters(sm);
    if (RC.filtersActive()) RC.renderFilterCount(sm);
  }
  // Filters panel: closed by default each time the panel is rebuilt (new storm picked); the user's open/
  // closed choice persists across filter edits since those don't rebuild the whole panel.
  let filtOpen = false;
  function activeFilterCount() {
    return [RC.STFILT.type, RC.STFILT.yearMin, RC.STFILT.yearMax, RC.STFILT.valMin, RC.STFILT.valMax, RC.STFILT.minHail, RC.STFILT.city, RC.STFILT.zip]
      .filter(v => v !== "" && v !== null && v !== undefined).length + (RC.STFILT.customersOnly ? 1 : 0);
  }
  // F21: selects/checkbox apply immediately; free-typed number/text fields debounce so a keystroke never
  // re-scans 99k homes before the user finishes typing
  let filtDebounce = null;
  function wireStormFilters(sm) {
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
      RC.STFILT.type = $("#fType").value;
      RC.STFILT.yearMin = $("#fYearMin").value ? +$("#fYearMin").value : null;
      RC.STFILT.yearMax = $("#fYearMax").value ? +$("#fYearMax").value : null;
      RC.STFILT.valMin = $("#fValMin").value ? +$("#fValMin").value : null;
      RC.STFILT.valMax = $("#fValMax").value ? +$("#fValMax").value : null;
      RC.STFILT.minHail = $("#fMinHail").value ? parseFloat($("#fMinHail").value) : null;
      RC.STFILT.city = $("#fCity").value;
      RC.STFILT.zip = $("#fZip").value.trim();
      RC.STFILT.customersOnly = $("#fCust").checked;
      refreshCount();
      RC.ensureFilterMeta(sm).then(() => RC.setStorm(sm.date));
    };
    const debounced = () => { clearTimeout(filtDebounce); filtDebounce = setTimeout(apply, 350); };
    $("#fType").onchange = apply; $("#fCity").onchange = apply; $("#fCust").onchange = apply;
    $("#fYearMin").oninput = debounced; $("#fYearMax").oninput = debounced;
    $("#fValMin").oninput = debounced; $("#fValMax").oninput = debounced;
    $("#fMinHail").oninput = debounced; $("#fZip").oninput = debounced;
    $("#fReset").onclick = () => {
      RC.STFILT.type = ""; RC.STFILT.yearMin = null; RC.STFILT.yearMax = null; RC.STFILT.valMin = null; RC.STFILT.valMax = null;
      RC.STFILT.minHail = null; RC.STFILT.city = ""; RC.STFILT.zip = ""; RC.STFILT.customersOnly = false;
      renderStormPanel(sm); RC.setStorm(sm.date);
    };
  }
  // ---------- searchable storm catalog (all storms on file) ----------
  let catSort = { key: "date", dir: -1 }, catPage = 25;
  // F22: "storms that hit a chosen city" is not precomputed anywhere in data/county/catalog.json (it is
  // a per-storm, county-wide file by design), so a city pick scans each storm's own hail/<date>.bin on
  // demand (same cached, resumable fetch-and-cache ensureStormLoaded already uses for a single storm) and
  // keeps the resulting date set cached per city for the rest of the session, no re-scan on reselect.
  const cityStormCache = new Map();
  async function storesForCity(city, onProgress) {
    if (cityStormCache.has(city)) return cityStormCache.get(city);
    const hits = new Set();
    for (let i = 0; i < st.DATA.catalog.length; i++) {
      const s = st.DATA.catalog[i];
      onProgress(i + 1, st.DATA.catalog.length);
      await RC.ensureStormLoaded(s.date);
      await Promise.all(s.regions.map(rr => RC.loadRegionMeta(RC.REG(rr.id))));
      const found = s.regions.some(rr => {
        const region = RC.REG(rr.id), hail = region.hailCache[s.date];
        if (!hail || !region.metaView) return false;
        for (let i2 = 0; i2 < region.n; i2++) {
          if (hail[i2] < 75 || region.type[i2] > 4) continue;
          if (RC.regionHomeMeta(region, i2).city === city) return true;
        }
        return false;
      });
      if (found) hits.add(s.date);
    }
    cityStormCache.set(city, hits);
    return hits;
  }
  function openStormCatalog() {
    catPage = 25;
    const cityNames = [...new Set(st.REGIONS.flatMap(r => r.cities || []))].sort();
    let cityMatches = null; // Set of dates, or null = no city filter active
    const body = `
      <div class="cat-filters" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <input type="text" id="catSearch" placeholder="Search date or city" style="flex:1;min-width:140px">
        <select id="catYear"><option value="">Any year</option>${[...new Set(st.DATA.catalog.map(s => s.date.slice(0, 4)))].sort().reverse().map(y => `<option>${y}</option>`).join("")}</select>
        <input type="number" id="catMinHail" placeholder="Min hail (in)" step="0.25" min="0.75" style="width:110px">
        <select id="catCity"><option value="">Any city</option>${cityNames.map(c => `<option>${esc(c)}</option>`).join("")}</select>
      </div>
      <div class="muted" id="catCount" style="margin-bottom:6px"></div>
      <div style="max-height:360px;overflow:auto;border:1px solid var(--line,#E7E2D8);border-radius:10px">
        <table class="lines" id="catTable" style="width:100%"></table>
      </div>
      <button class="btn sm" id="catMore" type="button" style="margin-top:8px">Show more</button>`;
    RC.modal(`All storms (${int(st.DATA.catalog.length)})`, body, "Close", () => {});
    $(".modal")?.classList.add("lg");
    const render = () => {
      let list = st.DATA.catalog.slice();
      const yr = $("#catYear").value, minHail = parseFloat($("#catMinHail").value), q = $("#catSearch").value.trim().toLowerCase();
      if (yr) list = list.filter(s => s.date.slice(0, 4) === yr);
      if (minHail) list = list.filter(s => s.max_in >= minHail);
      if (q) list = list.filter(s => s.date.includes(q) || s.label.toLowerCase().includes(q));
      if (cityMatches) list = list.filter(s => cityMatches.has(s.date));
      list.sort((a, b) => catSort.dir * (a[catSort.key] > b[catSort.key] ? 1 : a[catSort.key] < b[catSort.key] ? -1 : 0));
      $("#catCount").textContent = `${int(list.length)} of ${int(st.DATA.catalog.length)} storms`;
      const page = list.slice(0, catPage);
      $("#catTable").innerHTML = `<tr><td class="muted" data-k="date" style="cursor:pointer">Date</td><td class="n muted" data-k="max_in" style="cursor:pointer">Max hail</td><td class="n muted" data-k="homes_1in" style="cursor:pointer">Homes 1in+</td><td></td></tr>` +
        page.map(s => `<tr data-d="${s.date}" style="cursor:pointer"><td>${s.label}</td><td class="n">${s.max_in.toFixed(2)}"</td><td class="n">${int(s.homes_1in)}</td><td class="n"><button class="btn sm" data-load="${s.date}" type="button">Load</button></td></tr>`).join("");
      $$("#catTable tr[data-d]").forEach(tr => tr.onclick = e => { if (e.target.closest("[data-load]")) return; loadFromCatalog(tr.dataset.d); });
      $$("#catTable [data-load]").forEach(b => b.onclick = e => { e.stopPropagation(); loadFromCatalog(b.dataset.load); });
      $$("#catTable td[data-k]").forEach(td => td.onclick = () => { const k = td.dataset.k; catSort = { key: k, dir: catSort.key === k ? -catSort.dir : -1 }; render(); });
      $("#catMore").style.display = list.length > catPage ? "" : "none";
    };
    function loadFromCatalog(date) { $(".modal-bg")?.remove(); st.explicitStorm = date; pickStorm(date, true); }
    $("#catYear").onchange = render; $("#catMinHail").oninput = render; $("#catSearch").oninput = render;
    $("#catCity").onchange = async () => {
      const city = $("#catCity").value;
      if (!city) { cityMatches = null; render(); return; }
      if (cityStormCache.has(city)) { cityMatches = cityStormCache.get(city); render(); return; }
      $("#catCount").textContent = `Checking which storms hit ${city}...`;
      cityMatches = await storesForCity(city, (done, total) => { if ($("#catCity")?.value === city) $("#catCount").textContent = `Checking which storms hit ${city}... ${done}/${total}`; });
      if ($("#catCity")?.value === city) render();
    };
    $("#catMore").onclick = () => { catPage += 25; render(); };
    render();
  }
  async function openCanvass(sm) {
    RC.toast("Building the hit list...");
    await RC.ensureStormLoaded(sm.date);
    await Promise.all(sm.regions.map(rr => RC.loadRegionMeta(RC.REG(rr.id))));
    await Promise.all(sm.regions.map(rr => RC.loadRegionOwners(RC.REG(rr.id))));
    const list = hitListFor(sm);
    const ownerNote = list.some(r => r.ownerName) ? "Owner name and owner-occupied status are included where on file (county tax roll)." : "No owner data on file for this area yet.";
    const CAP = 300;
    const capped = list.slice(0, CAP);
    const route = nearestNeighborRoute(capped.map(r => ({ ...r })));
    let miles = 0;
    for (let i = 1; i < route.length; i++) miles += milesBetween(route[i - 1], route[i]);
    // combine every stop on the same street into one row (not just consecutive stops), ordered by first visit
    const groups = [], byStreet = new Map();
    route.forEach(h => {
      const street = RC.streetOf(h.addr);
      let g = byStreet.get(street);
      if (!g) { g = { street, homes: [] }; byStreet.set(street, g); groups.push(g); }
      g.homes.push(h);
    });
    const body = `
      <div class="muted" style="margin-bottom:10px">${int(list.length)} homes took 1 inch or larger radar hail on ${sm.label}, address and ZIP from county tax rolls. ${ownerNote}</div>
      <button class="btn sm accent" id="dlCsv" type="button">${ic("file")}Download hit list CSV (${int(list.length)} homes)</button>
      <hr class="sep">
      <div style="font-weight:600;font-size:12.5px;margin-bottom:4px">Door-knock route &middot; ${int(capped.length)} highest-hail homes, nearest-neighbor order</div>
      <div class="muted" style="margin-bottom:8px">~${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi rough drive distance (straight-line estimate between stops), grouped by street. ${list.length > CAP ? `Full list of ${int(list.length)} homes is in the CSV.` : ""}</div>
      <div style="max-height:260px;overflow:auto;border:1px solid var(--line,#E7E2D8);border-radius:10px;padding:4px 10px">
        ${groups.map(g => `<div class="row" style="padding:5px 0"><span>${esc(g.street)}</span><b class="num">${g.homes.length}</b></div>`).join("")}
      </div>`;
    RC.modal(`Door-knock route, ${sm.label}`, body, "Close", () => {});
    $("#dlCsv").onclick = () => downloadText(`hit-list-${sm.date}.csv`, hitListCSV(list), "text/csv");
  }
})();
