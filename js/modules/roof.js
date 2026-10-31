/* Roof Command demo. roof.js: per-house roof measurement lookup, Roof Measure screen, roof diagram,
   pitch/waste, proposal line items. Moved verbatim from js/app.js (2026-10-02 split), no behaviour change. */
(function () {
  const RC = window.RC;
  const { $, $$, ic, int, esc, money } = RC;
  const st = RC.st;

  // ---------- per-house roof measurement (2026-10-02 rebuild: every home gets ITS OWN footprint/
  // numbers, looked up index-for-index in data/county_roofs/<region>/measure.bin, which is built in the
  // exact same row order as that region's own homes.bin. No more fixed sample house, no more 3-house
  // switcher: "Measure roof" on any house card loads that house, or says honestly it has no footprint
  // on file. measure.bin is a compact parallel-array file (11 bytes/home, 0 = no footprint); the actual
  // polygon ring only lives in a small per-tile geom file, lazy-fetched once per tile and cached. See
  // data/county_roofs/README.md for the exact byte layout. ----------
  const roofMeasureCache = {}, roofTilesCache = {}, roofGeomCache = {};
  function ensureRoofMeasure(region) {
    const key = region.id;
    if (roofMeasureCache[key]) return roofMeasureCache[key];
    roofMeasureCache[key] = fetch(`data/county_roofs/${key}/measure.bin`).then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); })
      .then(buf => {
        const n = region.n;
        const foot = new Uint16Array(buf, 0, n);
        const perim = new Uint16Array(buf, 2 * n, n);
        const roofq = new Uint16Array(buf, 4 * n, n);
        const sq10 = new Uint16Array(buf, 6 * n, n);
        const tileId = new Uint16Array(buf, 8 * n, n);
        const cplx = new Uint8Array(buf, 10 * n, n);
        return { foot, perim, roofq, sq10, cplx, tileId };
      }).catch(() => null); // region has no footprint layer built yet
    return roofMeasureCache[key];
  }
  function ensureRoofTiles(region) {
    const key = region.id;
    if (roofTilesCache[key]) return roofTilesCache[key];
    roofTilesCache[key] = fetch(`data/county_roofs/${key}/tiles.json`).then(r => r.ok ? r.json() : []).catch(() => []);
    return roofTilesCache[key];
  }
  function fetchRoofGeomTile(region, file) {
    const key = region.id + "/" + file;
    if (roofGeomCache[key]) return roofGeomCache[key];
    roofGeomCache[key] = fetch(`data/county_roofs/${region.id}/geom/${file}`).then(r => r.ok ? r.json() : []).catch(() => []);
    return roofGeomCache[key];
  }
  // Returns null if this exact home has no building footprint on file (honest "no match" case, never
  // substitutes another home's numbers). Otherwise a plain object with THIS home's own ring + measurements.
  async function loadRoofForHome(region, id) {
    const m = await ensureRoofMeasure(region);
    if (!m || !m.foot[id]) return null;
    const tiles = await ensureRoofTiles(region);
    const tmeta = tiles[m.tileId[id]];
    if (!tmeta) return null;
    const items = await fetchRoofGeomTile(region, tmeta.file);
    const entry = items.find(e => e.i === id);
    if (!entry) return null;
    const ring = entry.ring.slice();
    const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring : ring.concat([ring[0]]);
    const lons = ring.map(p => p[0]), lats = ring.map(p => p[1]);
    const center = [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
    await RC.loadRegionMeta(region);
    const meta = RC.regionHomeMeta(region, id);
    return {
      regionId: region.id, homeId: id, footprint: closed, center,
      footprint_sqft: entry.sqft, perimeter_ft: entry.perimeter_ft, roof_sqft: entry.roof_sqft,
      squares: entry.squares_est, complexity: entry.complexity, dist_m: entry.dist_m, checkOutline: !!entry.check,
      pitch: "6/12", pitch_factor: 1.118, street: RC.streetOf(meta.addr || "") || meta.city || "Address on file",
      addr: meta.addr, city: meta.city
    };
  }
  RC.loadRoofForHome = loadRoofForHome;

  // ===== roof =====
  st.roofMap = null; st.roofMat = 1; st.roofMapReady = false;
  const MATS = [
    { name: "Architectural", sq: 0, label: "Architectural shingles (30-yr class)" },
    { name: "Class 4 impact", sq: 95, label: "Class 4 impact-rated shingles" },
    { name: "Standing seam", sq: 520, label: "Standing seam metal" }
  ];
  const NORMAN_CENTER = [(RC.NORMAN[0][0] + RC.NORMAN[1][0]) / 2, (RC.NORMAN[0][1] + RC.NORMAN[1][1]) / 2];
  // RF = the roof screen's entire state. status: "empty" (no house clicked yet this session), "loading",
  // "ok" (RF.data has THIS house's own footprint/measurements), "none" (this exact house has no building
  // footprint on file -- an honest dead end, never another house's numbers). A newer click always wins: the
  // loadRoofForHome promise checks RF.region/RF.homeId are still current before applying its result.
  st.RF = { status: "empty", data: null, region: null, homeId: null, addr: null, ll: null };
  function openRoofFor(region, id, ll, addr) {
    st.RF = { status: "loading", data: null, region, homeId: id, addr, ll };
    location.hash = "#roof";
    if (st.built.roof) renderRoofScreen();
    if (st.roofMap) updateRoofMap();
    loadRoofForHome(region, id).then(data => {
      if (st.RF.region !== region || st.RF.homeId !== id) return; // superseded by a newer click, drop silently
      st.RF.status = data ? "ok" : "none"; st.RF.data = data;
      if (st.built.roof) renderRoofScreen();
      if (st.roofMap) updateRoofMap();
    });
  }
  RC.openRoofFor = openRoofFor;
  RC.SCREENS.roof = () => {
    $("#s-roof").innerHTML = `
      <div class="grid roof">
        <div class="card map-card" id="rf-map">
          <div id="roofDiagram" class="roof-diagram"></div>
          <div id="roofmap" class="roof-sat thumb"></div>
          <button class="btn sm roof-sat-toggle" id="satToggle" type="button">${ic("house")}Satellite photo</button>
          <div class="roof-empty" id="roofEmpty"><div class="roof-empty-inner">
            <svg class="i" style="width:32px;height:32px;color:var(--muted)"><use href="#i-house"/></svg>
            <p>Click any house on Overview or Storm Response, then "Measure roof" on its card. This screen shows that one house's own real outline and its own numbers, never a sample.</p>
            <button class="btn accent" id="pickHouseBtn" type="button">Pick a house on the map</button>
          </div></div>
          <div class="map-title"><b id="roofHeadline">Roof Measure</b><span id="roofSub">Click a house, then Measure roof</span>
            <button class="btn sm" id="backToMap" type="button" style="margin-top:8px"><svg class="i" style="transform:scaleX(-1)"><use href="#i-arrow"/></svg>Back to map</button></div>
          <div class="source-note" id="roofSrcNote">Footprint: Microsoft Building Footprints (ODbL), OpenStreetMap fallback.</div></div>
        <div class="card"><div class="card-h"><h3>Measurement</h3><span class="est-badge" style="margin-left:auto">${ic("ruler")}Estimate</span></div>
          <div class="card-b" id="roofCardBody"></div></div>
      </div>`;
    $("#backToMap").onclick = backToMap;
    $("#pickHouseBtn").onclick = () => { location.hash = "#" + (st.lastMapScreen && st.lastMapScreen !== "roof" ? st.lastMapScreen : "storm"); };
    $("#satToggle").onclick = () => setRoofPrimary(roofPrimary === "diagram" ? "satellite" : "diagram");
    $("#roofDiagram").onclick = () => { if ($("#roofDiagram").classList.contains("thumb")) setRoofPrimary("diagram"); };
    $("#roofmap").onclick = () => { if ($("#roofmap").classList.contains("thumb")) setRoofPrimary("satellite"); };
    renderRoofScreen();
  };
  // which view is the big one in the map card: "diagram" (default, crisp to-scale SVG) or "satellite"
  // (aerial imagery, an optional small toggle per Jack's 2026-10-02 note -- satellite does not render
  // legibly at rooftop zoom, so it is never the default)
  let roofPrimary = "diagram";
  function applyRoofPrimary() {
    const d = $("#roofDiagram"), m = $("#roofmap"), btn = $("#satToggle");
    if (!d || !m) return;
    const canToggle = st.RF.status === "ok"; // only a real footprint has a diagram to toggle away from
    const showDiagram = canToggle && roofPrimary === "diagram";
    d.style.display = canToggle ? "" : "none";
    d.classList.toggle("full", showDiagram);
    d.classList.toggle("thumb", canToggle && !showDiagram);
    m.classList.toggle("full", !showDiagram);
    m.classList.toggle("thumb", showDiagram);
    // the satellite box is lazy (no maplibre instance until the toggle is actually clicked); keep it
    // hidden rather than showing an empty beige square while nothing has been loaded into it yet
    m.style.display = st.roofMap ? "" : "none";
    if (btn) {
      btn.style.display = canToggle ? "" : "none";
      btn.innerHTML = roofPrimary === "diagram" ? `${ic("house")}Satellite photo` : `${ic("ruler")}Diagram view`;
    }
    if (st.roofMap) setTimeout(() => st.roofMap.resize(), 0);
  }
  // Satellite is lazy: the maplibre instance + tiles are never created until the roofer actually
  // asks to see the photo (Jack, 2026-10-02: satellite doesn't render legibly at rooftop zoom, so the
  // crisp SVG diagram is always the default and the only thing loaded up front).
  function setRoofPrimary(which) {
    roofPrimary = which;
    if (which === "satellite" && !st.roofMap) initRoofMap();
    else if (st.roofMap) { st.roofMap.resize(); updateRoofMap(); }
    applyRoofPrimary();
  }
  function renderRoofScreen() {
    const head = $("#roofHeadline"), sub = $("#roofSub"), body = $("#roofCardBody");
    if (!head) return;
    $("#roofEmpty")?.classList.toggle("on", st.RF.status === "empty");
    if (st.RF.status === "empty") {
      head.textContent = "Roof Measure"; sub.textContent = "Click a house, then Measure roof";
      body.innerHTML = `<div class="muted" style="padding:6px 0">Click any house on Overview or Storm Response, then "Measure roof" on its card. This screen shows that one house's own outline and its own numbers, never a sample.</div>`;
      applyRoofPrimary();
      return;
    }
    if (st.RF.status === "loading") {
      head.textContent = st.RF.addr || "Loading..."; sub.textContent = "Looking up this address's building footprint";
      body.innerHTML = `<div class="muted" style="padding:6px 0">Loading this home's footprint...</div>`;
      applyRoofPrimary();
      return;
    }
    if (st.RF.status === "none") {
      head.textContent = st.RF.addr || "This address"; sub.textContent = "No footprint on file";
      body.innerHTML = `<div class="muted" style="padding:6px 0">No building outline on file for this address. This home's footprint hasn't been matched against the county building-footprint layer (too close to another home, under the map's size cutoff, or outside current coverage). No measurement is shown rather than guessing.</div>`;
      setRoofPrimary("satellite"); // no diagram possible here; the pinned photo is the only visual
      return;
    }
    const R = st.RF.data;
    roofPrimary = "diagram";
    head.textContent = R.addr || R.street; sub.textContent = (R.city ? R.city + " · " : "") + "building footprint on file";
    const rn = roofNumbersFor(R);
    body.innerHTML = `
      <div class="roof-summary">
        <div class="stat"><div class="v" id="rsFootprint">${int(R.footprint_sqft)}</div><div class="l">Footprint sq ft</div></div>
        <div class="stat"><div class="v" id="rsPerimeter">${int(R.perimeter_ft)}</div><div class="l">Perimeter ft</div></div>
        <div class="stat"><div class="v" id="rsRoofArea">${int(Math.round(rn.roofSqft))}</div><div class="l">Est. roof area sq ft</div></div>
        <div class="stat"><div class="v" id="rsSquares">${rn.squares.toFixed(1)}</div><div class="l">Est. squares</div></div>
      </div>
      <div class="roof-controls">
        <label>Pitch assumed <select id="pitchSel">${PITCH_FACTORS.map(pf => `<option value="${pf.p}" ${pf.p === st.roofPitch ? "selected" : ""}>${pf.p}/12</option>`).join("")}</select></label>
        <label>Waste % <input type="number" id="wasteInput" min="0" max="50" step="1" value="${st.roofWaste}"></label>
      </div>
      <div class="pitch-factor-row" id="pitchFactorTable">${PITCH_FACTORS.map(pf => `<span class="pf-chip ${pf.p === st.roofPitch ? "on" : ""}" data-p="${pf.p}">${pf.p}/12 <b>x${pf.factor.toFixed(2)}</b></span>`).join("")}</div>
      <hr class="sep">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><b style="font-size:13.5px">Proposal</b></div>
      <div class="seg" id="mats">${MATS.map((m, i) => `<button data-m="${i}">${m.name}</button>`).join("")}</div>
      <table class="lines" style="margin-top:10px" id="lineItems"></table>
      <div class="total-row"><span>Total</span><b id="propTotal"></b></div>
      <button class="btn primary block" style="margin-top:14px" id="sendProp">${ic("send")}Send proposal</button>
      <div class="fineprint" style="margin-top:10px" id="roofFineprint"></div>`;
    $$("#mats button").forEach(b => b.onclick = () => { st.roofMat = +b.dataset.m; renderProposal(); });
    $("#sendProp").onclick = () => window.openProposal ? window.openProposal(st.lastProp) : RC.toast("Proposal view failed to load.");
    $("#pitchSel").onchange = e => { st.roofPitch = +e.target.value; renderRoofScreen(); };
    $("#wasteInput").onchange = e => { st.roofWaste = Math.max(0, +e.target.value || 0); renderProposal(); };
    $$("#pitchFactorTable .pf-chip").forEach(c => c.onclick = () => { st.roofPitch = +c.dataset.p; renderRoofScreen(); });
    renderProposal();
    $("#roofDiagram").innerHTML = buildRoofDiagramSVG(R);
    applyRoofPrimary();
  }
  // Pitch is an assumption (no measured-pitch source exists at this scale): rise/12 -> the standard
  // roofing slope-length factor sqrt(1+(rise/12)^2). Editable 4/12-12/12; recomputes roof area, squares
  // and the proposal live. Waste % is the roofer's own order-size cushion, default 10, also editable.
  const PITCH_FACTORS = [4, 5, 6, 7, 8, 9, 10, 11, 12].map(p => ({ p, factor: Math.sqrt(1 + (p / 12) ** 2) }));
  st.roofPitch = 6; st.roofWaste = 10;
  function pitchFactor(p) { return (PITCH_FACTORS.find(pf => pf.p === p) || PITCH_FACTORS[2]).factor; }
  function roofNumbersFor(R) {
    const factor = pitchFactor(st.roofPitch);
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

    // Reserve fixed corners: north arrow top-right, scale bar bottom-left. Footprint + its labels
    // must fit in the remaining margin so they never collide with either.
    const MARGIN = 96, FILL = 0.7;
    const availW = DIAG_W - MARGIN * 2, availH = DIAG_H - MARGIN * 2;
    const scale = FILL * Math.min(availW / bboxW, availH / bboxH);
    const toSvg = ([x, y]) => [DIAG_W / 2 + (x - cxFt) * scale, DIAG_H / 2 - (y - cyFt) * scale]; // north-up
    const svgPts = pts.map(toSvg);
    const poly = svgPts.map(p => p.map(v => v.toFixed(1)).join(",")).join(" ");
    const cx = svgPts.reduce((a, p) => a + p[0], 0) / n, cy = svgPts.reduce((a, p) => a + p[1], 0) / n;
    const insetPts = svgPts.map(([x, y]) => [cx + (x - cx) * 0.55, cy + (y - cy) * 0.55]);
    const insetPoly = insetPts.map(p => p.map(v => v.toFixed(1)).join(",")).join(" ");

    // reserved zones labels may never enter (checked as simple box overlap)
    const northZone = { x: DIAG_W - 76, y: 6, w: 70, h: 78 };
    const scaleZone = { x: 6, y: DIAG_H - 56, w: 150, h: 50 };
    const rectsOverlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

    let labels = "", ridgeLines = "";
    const placed = []; // collision-avoidance: {x,y,w,h} boxes already placed, fixed screen px
    const LABEL_H = 17;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = svgPts[i], [x2, y2] = svgPts[(i + 1) % n];
      ridgeLines += `<line x1="${svgPts[i][0].toFixed(1)}" y1="${svgPts[i][1].toFixed(1)}" x2="${insetPts[i][0].toFixed(1)}" y2="${insetPts[i][1].toFixed(1)}" stroke="rgba(30,28,25,.16)" stroke-width="1"/>`;
      const dxFt = pts[(i + 1) % n][0] - pts[i][0], dyFt = pts[(i + 1) % n][1] - pts[i][1];
      const lenFt = Math.hypot(dxFt, dyFt);
      if (lenFt < 6) continue;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const ex = x2 - x1, ey = y2 - y1, elen = Math.hypot(ex, ey) || 1;
      let nx = -ey / elen, ny = ex / elen;
      if ((mx - cx) * nx + (my - cy) * ny < 0) { nx = -nx; ny = -ny; }
      const labelText = `${Math.round(lenFt)} ft`;
      const boxW = labelText.length * 7 + 10;
      // keep text upright: rotate to the edge angle only when the edge is long enough on screen to
      // read as a line (short edges keep a plain horizontal label, which is easier to scan on a notch)
      let angle = elen >= 46 ? Math.atan2(ey, ex) * 180 / Math.PI : 0;
      if (angle > 90) angle -= 180; else if (angle < -90) angle += 180;
      // one nudge further out along the outward normal if the first spot collides with another
      // label or a reserved corner zone; drop the label entirely rather than stacking it if the
      // nudge still collides (never pile labels in a column)
      let off = 12, lx = mx + nx * off, ly = my + ny * off, box = { x: lx - boxW / 2, y: ly - LABEL_H / 2, w: boxW, h: LABEL_H };
      const collides = b => placed.some(p => rectsOverlap(p, b)) || rectsOverlap(b, northZone) || rectsOverlap(b, scaleZone);
      if (collides(box)) {
        off = 26; lx = mx + nx * off; ly = my + ny * off;
        box = { x: lx - boxW / 2, y: ly - LABEL_H / 2, w: boxW, h: LABEL_H };
        if (collides(box)) continue; // still colliding after one nudge: drop, don't stack
      }
      placed.push(box);
      labels += `<g transform="translate(${lx.toFixed(1)},${ly.toFixed(1)}) rotate(${angle.toFixed(1)})">` +
        `<rect x="${(-boxW / 2).toFixed(1)}" y="${(-LABEL_H / 2).toFixed(1)}" width="${boxW.toFixed(1)}" height="${LABEL_H}" rx="4" fill="var(--bg)" fill-opacity=".92"/>` +
        `<text x="0" y="0" font-size="12.5" font-weight="600" text-anchor="middle" dominant-baseline="middle" fill="var(--ink-2)">${labelText}</text></g>`;
    }
    const north = `<g transform="translate(${DIAG_W - 40},44)">
      <line x1="0" y1="13" x2="0" y2="-9" stroke="var(--muted)" stroke-width="1.6"/>
      <polygon points="0,-13 -4,-6 4,-6" fill="var(--muted)"/>
      <text x="0" y="24" font-size="10.5" font-weight="600" text-anchor="middle" fill="var(--muted)">N</text></g>`;
    // pick a round foot length whose on-screen bar (at this diagram's own px-per-ft scale) lands
    // near a fifth of the footprint's width, so the bar reads sensibly at any house size
    const targetPx = availW / 5;
    const barOpts = [2, 5, 10, 20, 25, 50, 100, 150, 200];
    const barFt = barOpts.reduce((a, b) => Math.abs(b * scale - targetPx) < Math.abs(a * scale - targetPx) ? b : a, barOpts[0]);
    const barPx = barFt * scale;
    const bx = 24, by = DIAG_H - 30;
    const lblW = `${barFt} ft`.length * 6.3 + 8;
    const scaleBar = `<g>
      <line x1="${bx}" y1="${by}" x2="${(bx + barPx).toFixed(1)}" y2="${by}" stroke="var(--ink-2)" stroke-width="1.6"/>
      <line x1="${bx}" y1="${by - 4}" x2="${bx}" y2="${by + 4}" stroke="var(--ink-2)" stroke-width="1.6"/>
      <line x1="${(bx + barPx).toFixed(1)}" y1="${by - 4}" x2="${(bx + barPx).toFixed(1)}" y2="${by + 4}" stroke="var(--ink-2)" stroke-width="1.6"/>
      <rect x="${(bx + barPx / 2 - lblW / 2).toFixed(1)}" y="${(by - 22).toFixed(1)}" width="${lblW.toFixed(1)}" height="15" rx="3" fill="var(--bg)" fill-opacity=".92"/>
      <text x="${(bx + barPx / 2).toFixed(1)}" y="${(by - 14).toFixed(1)}" font-size="11" text-anchor="middle" fill="var(--ink-2)">${barFt} ft</text>
    </g>`;
    const ringLen = Math.round((DIAG_W + DIAG_H) * 2); // rough path length just to drive the draw-in animation
    return `<svg viewBox="0 0 ${DIAG_W} ${DIAG_H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <polygon class="ring" points="${poly}" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" style="--len:${ringLen}" stroke-dasharray="${ringLen}"/>
      <polygon points="${insetPoly}" fill="rgba(180,83,47,.08)" stroke="rgba(142,62,33,.28)" stroke-width="1"/>
      ${ridgeLines}${labels}${north}${scaleBar}
    </svg>`;
  }
  RC.buildRoofDiagramSVG = buildRoofDiagramSVG;
  RC.ENTER.roof = () => { renderRoofScreen(); if (st.roofMap) { st.roofMap.resize(); updateRoofMap(); } };
  // F18: one click back to the exact map screen/camera/house the user left (or the last map screen
  // visited, if Roof was opened straight from the nav rather than a house card). skipMapFit + pendingCamera
  // + restoreHome are consumed once by placeMap() on the next ENTER.<screen> call.
  function backToMap() {
    const rr = st.roofReturn;
    st.skipMapFit = true;
    if (rr) { st.pendingCamera = { center: rr.center, zoom: rr.zoom }; st.restoreHome = { regionId: rr.regionId, homeId: rr.homeId, lng: rr.lng, lat: rr.lat }; }
    location.hash = "#" + (rr ? rr.screen : st.lastMapScreen || "storm");
  }
  st.lastProp = null;
  function renderProposal() {
    if (st.RF.status !== "ok") { st.lastProp = null; return; }
    const R = st.RF.data, m = MATS[st.roofMat];
    const rn = roofNumbersFor(R);
    const squares = Math.round(rn.squares * 10) / 10;
    $$("#mats button").forEach(b => b.classList.toggle("on", +b.dataset.m === st.roofMat));
    const wasteFrac = 1 + st.roofWaste / 100;
    const order = Math.ceil(squares * wasteFrac * 3) / 3; // bundles of 1/3 sq
    const items = [
      ["Tear-off and haul away", `${squares} sq x $75`, squares * 75],
      [m.label, `${order.toFixed(1)} sq with ${st.roofWaste}% waste x $${(268 + m.sq)}`, order * (268 + m.sq)],
      ["Synthetic underlayment + ice and water at valleys", `${squares} sq x $38`, squares * 38],
      ["Drip edge and starter", `${R.perimeter_ft} ft x $3.10`, R.perimeter_ft * 3.1],
      ["Ridge, hip, and flashing allowance", `${squares} sq x $45`, squares * 45],
      ["Pipe boots, vents, flashing", "allowance", 640],
      ["Permit", "", 185]
    ];
    const total = items.reduce((a, x) => a + x[2], 0);
    $("#lineItems").innerHTML = items.map(x => `<tr><td>${x[0]}<span class="q">${x[1]}</span></td><td class="n">${money(Math.round(x[2]))}</td></tr>`).join("");
    $("#propTotal").textContent = money(Math.round(total / 10) * 10);
    const fp = $("#roofFineprint");
    if (fp) fp.textContent = `Footprint area from this address's own building outline (Microsoft Building Footprints, OpenStreetMap fallback: ${int(R.footprint_sqft)} sq ft, ${R.perimeter_ft} ft perimeter) x ${st.roofPitch}/12 assumed pitch factor (${rn.factor.toFixed(3)}), ${st.roofWaste}% material waste (the outline already includes the eaves, no extra overhang added). No facet-by-facet layout at this scale, so ridge/hip/valley length is an allowance, not a measured length. Prices are sample. Verify on site before ordering.`;
    st.lastProp = { roof: { ...R, squares, roof_sqft: Math.round(rn.roofSqft), pitch: st.roofPitch + "/12", pitch_factor: rn.factor }, materialLabel: m.label.toLowerCase(), items, total: Math.round(total / 10) * 10 };
  }
  function fitRoofView(R) {
    st.roofMap.fitBounds([[Math.min(...R.footprint.map(p => p[0])), Math.min(...R.footprint.map(p => p[1]))], [Math.max(...R.footprint.map(p => p[0])), Math.max(...R.footprint.map(p => p[1]))]], { padding: Math.min(110, $("#roofmap").clientWidth / 5), duration: 0, maxZoom: 20 });
  }
  let roofPin = null;
  function clearRoofPin() { if (roofPin) { roofPin.remove(); roofPin = null; } }
  // Draws exactly one house's own outline (status "ok"), or just centers the imagery on the clicked point
  // with a pin and no outline (status "none"/"loading"): never falls back to drawing a different house.
  // Uses roofMapReady (set once, after the "foot" source/layers are added) rather than map.loaded()/
  // once("load", ...): maplibre's "load" event fires exactly once for the map's life, but loaded() can
  // read false right after a jumpTo/flyTo while the raster basemap's new tiles are still in flight, which
  // made an update silently never draw (it registered a second once("load", ...) that was never going to
  // fire again).
  function updateRoofMap() {
    if (!st.roofMap || !st.roofMapReady) return;
    const footFC = st.RF.status === "ok"
      ? { type: "Feature", geometry: { type: "Polygon", coordinates: [st.RF.data.footprint] } }
      : { type: "FeatureCollection", features: [] };
    if (st.roofMap.getSource("foot")) st.roofMap.getSource("foot").setData(footFC);
    clearRoofPin();
    if (st.RF.status === "ok") {
      st.roofMap.setCenter(st.RF.data.center);
      fitRoofView(st.RF.data);
    } else if (st.RF.ll) {
      const el = document.createElement("div"); el.className = "facet-label"; el.textContent = "?";
      roofPin = new maplibregl.Marker({ element: el }).setLngLat([st.RF.ll.lng, st.RF.ll.lat]).addTo(st.roofMap);
      st.roofMap.flyTo({ center: [st.RF.ll.lng, st.RF.ll.lat], zoom: 19, duration: 0 });
    }
  }
  function initRoofMap() {
    window.__roof = () => st.roofMap;
    const startCenter = st.RF.ll ? [st.RF.ll.lng, st.RF.ll.lat] : (st.RF.data ? st.RF.data.center : NORMAN_CENTER);
    st.roofMap = new maplibregl.Map({
      container: "roofmap", center: startCenter, zoom: st.RF.status === "empty" ? 14 : 19, minZoom: 12, maxZoom: 21, attributionControl: false, bearing: 0, trackResize: false,
      style: { version: 8, sources: { sat: window.RC_IMAGERY.source() }, layers: [{ id: "sat", type: "raster", source: "sat", paint: { "raster-saturation": -0.15 } }] },
      scrollZoom: true, dragPan: true, doubleClickZoom: true, keyboard: true, touchZoomRotate: true, boxZoom: false, dragRotate: false, pitchWithRotate: false
    });
    const roofMap = st.roofMap;
    roofMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    roofMap.addControl(new RC.ResetViewControl(() => st.RF.status === "ok" ? fitRoofView(st.RF.data) : st.RF.ll ? roofMap.flyTo({ center: [st.RF.ll.lng, st.RF.ll.lat], zoom: 19, duration: 0 }) : roofMap.flyTo({ center: NORMAN_CENTER, zoom: 14, duration: 0 })), "top-right");
    roofMap.touchZoomRotate.disableRotation();
    roofMap.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "Footprints: Microsoft, Overture Maps | (c) OpenStreetMap contributors" }), "top-right");
    RC.collapseAttrib($("#roofmap"));
    roofMap.on("load", () => {
      roofMap.addSource("foot", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      roofMap.addLayer({ id: "foot-fill", type: "fill", source: "foot", paint: { "fill-color": RC.B.accent, "fill-opacity": 0.16 } });
      roofMap.addLayer({ id: "foot-line", type: "line", source: "foot", paint: { "line-color": "#FFD25A", "line-width": 2.6 } });
      st.roofMapReady = true;
      updateRoofMap();
    });
    let lastW = 0;
    new ResizeObserver(() => { const w = $("#roofmap").clientWidth; if (w < 50) return; roofMap.resize(); if (w > 50 && Math.abs(w - lastW) > 20) { lastW = w; if (st.RF.status === "ok") fitRoofView(st.RF.data); } }).observe($("#roofmap"));
  }
})();
