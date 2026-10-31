/* opp-data.js: builds the home records lib/opp-score.js scores, from files the app already ships (window.OPPD).
   Plain script; needs lib/st-meta.js (STM.BASE) and lib/opp-score.js; uses lib/rc-state.js (RC.pipeline) and
   lib/rc-scores.js (RCS.eligibility, the do-not-contact rules) when they are on the page.

   Sources (all under STM.BASE = lib/st-data-dfw/):
     meta/scores/scores.json + homes.bin  per home: roof year + evidence code, squares, pitch, re-roofs nearby (100 m, 90 days)
     meta/scores/hits.bin                 every 0.75 in+ MRMS radar hail hit at a home (storm, size)
     meta/roof-evidence.json              the exact re-roof permit date per home (day or month) and whether its scope is unclear
     meta/wind.json                       peak gust per airport per day (KDFW + 8 DFW airports) + NWS wind reports (lat/lon, mph)
     homes.bin                            lon/lat per home (nearest wind station, nearby wind reports)
   Not on file yet (their points stay 0, the card says so): sale (deed) date, roof material, homestead. */
(function () {
  'use strict';
  if (window.OPPD) return;
  const BASE = (window.STM && STM.BASE) || 'lib/st-data-dfw/';
  const J = u => fetch(BASE + u).then(r => r.ok ? r.json() : null).catch(() => null);
  const B = u => fetch(BASE + u).then(r => r.ok ? r.arrayBuffer() : null).catch(() => null);
  const mi = (lon1, lat1, lon2, lat2) => { const kx = 69.17 * Math.cos(lat1 * Math.PI / 180), dx = (lon2 - lon1) * kx, dy = (lat2 - lat1) * 69.05; return Math.sqrt(dx * dx + dy * dy); };
  let P = null;

  function load() {
    if (P) return P;
    P = Promise.all([J('meta/scores/scores.json'), B('meta/scores/homes.bin'), B('meta/scores/hits.bin'), J('meta/roof-evidence.json'),
      J('meta/wind.json'), B('homes.bin'), J('catalog.json')]).then(([M, hb, hitb, ev, wind, xyb, cat]) => {
      if (!M || !hb) throw new Error('Score data is not built (scripts/scores/build_scores.py).');
      const n = M.n, C = {};
      M.cols.forEach(([k, t, o]) => { C[k] = t === 'u2' ? new Uint16Array(hb, o, n) : new Uint8Array(hb, o, n); });
      const k = M.hits.k, H = { gi: new Uint32Array(hitb, 0, k), st: new Uint8Array(hitb, k * 4, k), v: new Uint8Array(hitb, k * 5, k) };
      const XY = new Float32Array(xyb, 0, n * 2);
      // exact permit dates: "region:idx" -> gi via the catalog offsets
      const off = {}; (cat.regions || []).forEach(r => { off[r.id] = r.offset; });
      const permit = new Map();
      for (const key of Object.keys(ev.rows || {})) { const [rid, idx] = key.split(':'); if (off[rid] == null) continue; permit.set(off[rid] + +idx, ev.rows[key]); }
      // hits by home (hits.bin is sorted by gi)
      const hitStart = new Int32Array(n).fill(-1), hitEnd = new Int32Array(n);
      for (let i = 0; i < k; i++) { const g = H.gi[i]; if (hitStart[g] < 0) hitStart[g] = i; hitEnd[g] = i + 1; }
      return { M, C, H, hitStart, hitEnd, XY, permit, wind, n };
    });
    return P;
  }

  // the nearest wind station's gust per wind day + measured reports within REPORT_MILES, for one home
  function windFor(D, lon, lat) {
    const W = D.wind; if (!W || !isFinite(lon)) return [];
    let near = null, nd = 1e9;
    for (const s of W.stations) { const d = mi(lon, lat, s.lon, s.lat); if (d < nd) { nd = d; near = s; } }
    const out = [];
    const Wc = OPP.CONFIG.wind;
    for (const day of W.days) {
      // the nearest airport only when it is close enough to stand for this house, and never a lone-airport spike nothing backs
      const a = nd <= Wc.maxStationMiles && !day.single_station ? day.airports.find(x => x.id === near.id) : null;
      if (a) out.push({ iso: day.day, mph: a.gust_mph, src: `${a.id} ${a.name}`, miles: nd });
      for (const r of day.reports) if (r.mph && r.mph >= 50) { const d = mi(lon, lat, r.lon, r.lat); if (d <= Wc.reportMiles) out.push({ iso: day.day, mph: r.mph, src: `an NWS report near ${r.place}`, miles: d }); }
    }
    return out;
  }

  function home(D, gi) {
    const { M, C, H } = D, ev = C.ev[gi] & 7, y = C.roofYear[gi], p = D.permit.get(gi);
    let roof;
    if (p && p[1] !== 2) roof = { source: 'permit', year: p[0], date: p[2] || String(p[0]), ambiguous: p[1] === 1 };
    else if (ev === 1 && y) roof = { source: 'permit', year: y, date: String(y), ambiguous: !!(C.ev[gi] & 64) };
    else if ((ev === 2 || ev === 3) && y) roof = { source: 'built', year: y };
    else roof = { source: 'none' };
    const hits = [];
    if (D.hitStart[gi] >= 0) for (let i = D.hitStart[gi]; i < D.hitEnd[gi]; i++) hits.push({ iso: M.storms[H.st[i]], inches: H.v[i] / 100 });
    const lon = D.XY[gi * 2], lat = D.XY[gi * 2 + 1];
    const nb = M.config.neighborhood || { radiusM: 100, days: 90 };
    const id = 'm' + gi, pipe = window.RC && RC.pipeline ? RC.pipeline() : {};
    const el = window.RCS && RCS.eligibility && RCS.meta && RCS.meta() ? RCS.eligibility(gi) : (window.RC && RC.optedOut && RC.optedOut(id) ? { ok: false, reason: 'Opted out' } : { ok: true });
    return { gi, roof, hits, wind: windFor(D, lon, lat), sale: null, nbr: { count: C.nbr[gi], days: nb.days, meters: nb.radiusM },
      squares: C.sq[gi] || null, pitch: C.pitch[gi] || null, material: null, homestead: null,
      inPipeline: !!pipe[id], dnc: !el.ok, dncWhy: el.reason || '', dataAsOf: (M.sources && M.sources.radar_through) || M.asof,
      lon, lat, city: M.cities[C.city[gi]] || '', zip: M.zips[C.zip[gi]] || '', type: M.types[C.ptype[gi] & 127] || '' };
  }

  // rank every home. A cheap upper bound skips homes that cannot reach the current 50th place (most of 271k), so the full
  // record (wind, dates) is built only for real contenders.
  function top(opts) {
    opts = opts || {};
    return load().then(D => {
      const now = opts.now ? new Date(opts.now) : new Date(), cfg = opts.config, limit = opts.limit || 50;
      const best = [], dropped = {}; let scored = 0, floor = -1;
      // a tight upper bound per home from the columns alone: its exact score without wind, plus wind at full points. The full
      // record (wind by nearest station, do-not-contact, pipeline) is built only for homes that can still make the top list,
      // so the do-not-contact and pipeline counts below are among those contenders.
      const CF = OPP.merged(cfg), nowMs = now.getTime();
      const KNOWN = { sale: false, material: false, homestead: false };   // not loaded yet (home() sets them null for every home)
      const ST = D.M.storms.map(d => Date.parse(d + 'T00:00:00Z')), YM = D.M.storms.map(d => d.slice(0, 7));
      for (let gi = 0; gi < D.n; gi++) {
        if ((D.M.types[D.C.ptype[gi] & 127] || '') === 'Mobile home') continue;
        // the quick pass (OPP.quick, numbers only) uses the real permit date, so its "re-roofed after the storm" drop is exact
        const ev = D.C.ev[gi] & 7, y = D.C.roofYear[gi], p = D.permit.get(gi);
        const roof = p && p[1] !== 2 ? { source: 'permit', date: p[2] || String(p[0]) } : ev === 1 && y ? { source: 'permit', date: String(y) } : (ev === 2 || ev === 3) && y ? { source: 'built', year: y } : { source: 'none' };
        const hits = []; if (D.hitStart[gi] >= 0) for (let i = D.hitStart[gi]; i < D.hitEnd[gi]; i++) { const st = D.H.st[i]; hits.push([ST[st], D.H.v[i] / 100, YM[st]]); }
        const q = OPP.quick(roof, hits, D.C.nbr[gi], D.C.sq[gi], D.C.pitch[gi], nowMs, CF, KNOWN);
        if (q.drop) { dropped['Re-roofed after the storm'] = (dropped['Re-roofed after the storm'] || 0) + 1; continue; }
        if (best.length >= limit && q.ub + 1 <= floor) continue;
        const h = home(D, gi), s = OPP.score(h, { now, config: cfg });
        if (s.drop) { const key = /^Roof permit/.test(s.drop) ? 'Re-roofed after the storm' : s.drop.replace(/ \(.*$/, ''); dropped[key] = (dropped[key] || 0) + 1; continue; }
        scored++;
        if (best.length < limit || s.total > floor) {
          s.home = h; best.push(s); best.sort((a, b) => b.total - a.total || b.parts.hail.pts - a.parts.hail.pts);
          if (best.length > limit) best.length = limit;
          floor = best.length >= limit ? best[best.length - 1].total : -1;
        }
      }
      return { ranked: best, scored, dropped, asOf: D.M.sources && D.M.sources.radar_through, windBuilt: D.wind && D.wind.built, n: D.n };
    });
  }

  window.OPPD = { load, home: gi => load().then(D => home(D, +gi)), top };
})();
