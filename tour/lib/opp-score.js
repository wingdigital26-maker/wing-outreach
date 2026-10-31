/* opp-score.js: the Opportunity Score v2 (0 to 100) for Wing Outreach (Jack, 10-29). ONE module, pure functions, no DOM and
   no fetch: the page (tour/opportunity.html) and lib/opp-data.js hand it one plain home record, the tests
   (tour/lib/test_opp_score.mjs) hand it fixtures. Works as a browser script (window.OPP) and as a Node module.

   A home record (every field optional; missing = not on file, never guessed):
     { gi,
       roof:     { source: 'permit' | 'built' | 'none', year, date: 'YYYY-MM[-DD]', ambiguous },   // last re-roof, else year built
       hits:     [{ iso, inches }],                    // NOAA MRMS radar hail at this address, one per storm
       wind:     [{ iso, mph, src, miles }],           // the day's peak gust at the nearest station, or a measured report nearby
       sale:     { date } | null,                      // last sale (deed) date
       saleRoofPermitMonths,                           // months between the sale and the nearest roof permit (null = none)
       nbr:      { count, days, meters },              // re-roof permits nearby in the last `days`
       squares, pitch,                                 // roof size (squares) and rise in 12, estimates
       material, homestead,                            // slots: roof material (Nearmap later), owner-occupied (homestead)
       inPipeline, dnc, dncWhy,                        // hard filters from the CRM and the contact store
       dataAsOf: 'YYYY-MM-DD' }
   score(home, { now, config }) ->
     { drop: null | reason, total, parts: { key: { pts, max, label, lines:[evidence], estimated } }, confidence, confWhy } */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.OPP = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CONFIG = {
    version: 2,
    weights: { roofAge: 30, hail: 25, wind: 15, purchase: 10, neighbors: 10, jobValue: 10, material: 0, owner: 0 },
    roofAge: { bands: [[5, 0], [10, 6], [15, 13], [20, 23], [25, 28], [Infinity, 30]], builtCap: 13 },
    hail: { bands: [[0.75, 0], [1.0, 4], [1.5, 10], [2.0, 17], [2.5, 22], [Infinity, 25]], fullMonths: 12, halfMonths: 24 },
    wind: { bands: [[50, 0], [60, 4], [70, 8], [Infinity, 12]], ageMult: [[10, 0.5], [20, 1], [Infinity, 1.25]], unknownAgeMult: 1, estimatedAgeMaxMult: 1, months: 24, maxStationMiles: 10, reportMiles: 3 },
    purchase: { bands: [[3, 10], [6, 8], [12, 6], [24, 3], [Infinity, 0]], permitWithinMonths: 6 },
    neighbors: { bands: [[0, 0], [1, 4], [3, 7], [Infinity, 10]] },
    jobValue: { baselineSquares: 30, sizePts: 7, pitchPts: 3, pitchBands: [[4, 0], [6, 1], [8, 2], [Infinity, 3]] },
    material: { _note: 'slot: points per material once Nearmap reads it (weight 0 until then)', pts: { 'three-tab': 1, wood: 1, architectural: 0.6, metal: 0, tile: 0 } },
    owner: { _note: 'slot: owner-occupied (homestead) gets full points when weighted', pts: { yes: 1, no: 0 } },
    confidence: { freshDays: 30 }
  };

  const DAY = 864e5;
  const toDate = s => { if (!s) return null; const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(String(s)); return m ? new Date(Date.UTC(+m[1], (+m[2] || 1) - 1, +m[3] || 1)) : null; };
  const months = (a, b) => (b - a) / (DAY * 30.4375);
  // bands: [[upper bound (exclusive for 'below'), points]]; first band whose bound the value is under
  const band = (v, bands) => { for (const [lim, p] of bands) if (v < lim) return p; return bands[bands.length - 1][1]; };
  // roof-age bands are inclusive on the top ("0 to 5 yrs = 0")
  const bandIncl = (v, bands) => { for (const [lim, p] of bands) if (v <= lim) return p; return bands[bands.length - 1][1]; };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const nice = s => { const d = toDate(s); if (!d) return ''; const day = String(s).length >= 10 ? ' ' + d.getUTCDate() + ',' : ''; return MON[d.getUTCMonth()] + day + ' ' + d.getUTCFullYear(); };
  const merge = (a, b) => { const o = Array.isArray(a) ? a.slice() : Object.assign({}, a); if (b) for (const k of Object.keys(b)) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? merge(a[k] || {}, b[k]) : b[k]; return o; };

  // the date of the last roof (a permit date; year built counts as Jan 1 of that year) or null
  function roofDate(h) {
    const r = h.roof || {};
    if (r.source === 'permit') return toDate(r.date || r.year);
    if (r.source === 'built' && r.year) return toDate(String(r.year));
    return null;
  }

  function roofAge(h, C, now) {
    const r = h.roof || {}, W = C.weights.roofAge;
    if (r.source === 'permit' && (r.date || r.year)) {
      const d = toDate(r.date || r.year), yrs = Math.max(0, (now - d) / (DAY * 365.25)), pts = bandIncl(Math.floor(yrs), C.roofAge.bands);
      return { pts: Math.min(W, pts), max: W, years: yrs, estimated: false,
        lines: [`Roof permit ${nice(r.date || r.year)}${r.ambiguous ? ' (scope unclear, may be a repair)' : ''}: about ${Math.floor(yrs)} years old.`] };
    }
    if (r.source === 'built' && r.year) {
      const yrs = Math.max(0, now.getUTCFullYear() - r.year), pts = Math.min(bandIncl(yrs, C.roofAge.bands), C.roofAge.builtCap);
      return { pts: Math.min(W, pts), max: W, years: yrs, estimated: true,
        lines: [`No re-roof permit on file. Built ${r.year} (${yrs} years), so the roof age is estimated and capped at ${C.roofAge.builtCap} points.`] };
    }
    return { pts: 0, max: W, years: null, estimated: true, lines: ['Roof age unknown: no permit and no year built. Unknown never counts as old.'] };
  }

  // hail: the best storm after the last roof; size points x recency
  function hail(h, C, now, rd) {
    const W = C.weights.hail, H = C.hail;
    let best = null;
    for (const x of h.hits || []) {
      const d = toDate(x.iso); if (!d || (rd && d <= rd)) continue;
      const age = months(d, now), size = band(x.inches, H.bands), rec = age <= H.fullMonths ? 1 : age <= H.halfMonths ? 0.5 : 0;
      const pts = size * rec;
      if (!best || pts > best.pts || (pts === best.pts && x.inches > best.inches)) best = { pts, iso: x.iso, inches: x.inches, size, rec };
    }
    if (!best) return { pts: 0, max: W, storm: null, estimated: false, lines: [(h.hits || []).length ? 'Every radar hail reading here is from before the last roof.' : 'No radar hail at this address on file.'] };
    const recWord = best.rec === 1 ? 'within 12 months, full points' : best.rec === 0.5 ? '12 to 24 months ago, half points' : 'over 24 months ago, no points';
    return { pts: Math.min(W, best.pts), max: W, storm: best, estimated: false,
      lines: [`Radar (NOAA MRMS) put ${best.inches.toFixed(2)} in of hail at this address on ${nice(best.iso)} (${best.size} pts for size), ${recWord}.`] };
  }

  function wind(h, C, now, rd, ageYears, ageEstimated) {
    const W = C.weights.wind, Wc = C.wind;
    let best = null;
    for (const x of h.wind || []) {
      const d = toDate(x.iso); if (!d || (rd && d <= rd) || months(d, now) > Wc.months) continue;
      if (!best || x.mph > best.mph) best = x;
    }
    if (!best) return { pts: 0, max: W, estimated: false, lines: ['No 50 mph+ gust near this home since the last roof.'] };
    // an estimated (year-built) roof age never earns the old-roof boost, the same way its points are capped
    let mult = ageYears == null ? Wc.unknownAgeMult : band(ageYears, Wc.ageMult);
    if (ageEstimated && mult > Wc.estimatedAgeMaxMult) mult = Wc.estimatedAgeMaxMult;
    const base = band(best.mph, Wc.bands);
    const pts = Math.min(W, base * mult);
    return { pts, max: W, estimated: false, gust: best,
      lines: [`${best.mph} mph gust on ${nice(best.iso)} at ${best.src}${best.miles != null ? ', ' + best.miles.toFixed(1) + ' miles away' : ''} (${base} pts)` +
        (mult !== 1 ? `, x${mult} for ${ageYears == null ? 'unknown' : Math.floor(ageYears) + '-year'} roof age.` : ageEstimated && ageYears >= 20 ? ' (x1: the roof age is an estimate).' : '.')] };
  }

  function purchase(h, C, now) {
    const W = C.weights.purchase;
    const d = h.sale && toDate(h.sale.date);
    if (!d) return { pts: 0, max: W, estimated: false, missing: true, lines: ['Sale date not on file yet (deed records not loaded), so no points.'] };
    const m = Math.max(0, months(d, now));
    if (h.saleRoofPermitMonths != null && Math.abs(h.saleRoofPermitMonths) <= C.purchase.permitWithinMonths)
      return { pts: 0, max: W, estimated: false, lines: [`Sold ${nice(h.sale.date)}, but a roof permit was pulled within ${C.purchase.permitWithinMonths} months of the sale.`] };
    const pts = bandIncl(Math.floor(m), C.purchase.bands);
    return { pts: Math.min(W, pts), max: W, estimated: false, lines: [`Sold ${nice(h.sale.date)} (${Math.floor(m)} months ago).`] };
  }

  function neighbors(h, C) {
    const W = C.weights.neighbors, n = (h.nbr && h.nbr.count) || 0;
    const pts = Math.min(W, bandIncl(n, C.neighbors.bands));
    const where = h.nbr && h.nbr.meters ? `within about ${h.nbr.meters} m (about a block)` : 'within about a block';
    const when = h.nbr && h.nbr.days ? ` in the last ${h.nbr.days} days` : '';
    return { pts, max: W, estimated: false, lines: [n ? `${n} re-roof permit${n === 1 ? '' : 's'} ${where}${when} (city and county permit records).` : `No re-roof permits ${where}${when}.`] };
  }

  function jobValue(h, C) {
    const W = C.weights.jobValue, J = C.jobValue, sq = h.squares || 0, rise = h.pitch || 0;
    const ratio = sq / J.baselineSquares;
    const sizePts = sq ? Math.max(0, Math.min(1, ratio - 0.5)) * J.sizePts : 0;   // half the baseline = 0, 1.5x = full
    const pitchPts = rise ? bandIncl(rise, J.pitchBands) : 0;
    const raw = (sizePts + pitchPts) * W / (J.sizePts + J.pitchPts);
    return { pts: Math.min(W, raw), max: W, estimated: true,
      lines: [sq ? `About ${sq} squares (${Math.round(ratio * 100)}% of the ${J.baselineSquares}-square market baseline).` : 'Roof size not on file.',
        rise ? `Pitch about ${rise}/12.` : 'Pitch not on file.'] };
  }

  function slot(key, h, C) {
    const W = C.weights[key];
    if (key === 'material') {
      const m = h.material; if (!m) return { pts: 0, max: W, estimated: false, lines: ['Roof material not read yet (Nearmap, coming).'] };
      const f = C.material.pts[m] != null ? C.material.pts[m] : 0;
      return { pts: W * f, max: W, estimated: false, lines: [`Roof material: ${m}.`] };
    }
    const o = h.homestead; if (o == null) return { pts: 0, max: W, estimated: false, lines: ['Owner-occupied status not loaded.'] };
    return { pts: W * (o ? C.owner.pts.yes : C.owner.pts.no), max: W, estimated: false, lines: [o ? 'Owner-occupied (homestead exemption).' : 'No homestead exemption on file.'] };
  }

  // hard filters: drop the home entirely
  function hardFilter(h, rd, hailPart) {
    if (h.dnc) return 'Do not contact' + (h.dncWhy ? ' (' + h.dncWhy + ')' : '');
    if (h.inPipeline) return 'Already in the pipeline';
    // a roof permit dated after the qualifying storm (the biggest 0.75 in+ hail in the last 24 months): the roof is already done
    const r = h.roof || {};
    if (r.source === 'permit' && rd) {
      const q = (h.hits || []).filter(x => x.inches >= 0.75).sort((a, b) => b.inches - a.inches)[0];
      if (q) { const sd = toDate(q.iso); const sameMonth = String(r.date || '').length === 7 && String(r.date).slice(0, 7) === q.iso.slice(0, 7);
        if (rd > sd || sameMonth) return `Roof permit ${nice(r.date || r.year)} came after the ${nice(q.iso)} storm`; }
    }
    return null;
  }

  const LABELS = { roofAge: 'Roof age', hail: 'Hail', wind: 'Wind', purchase: 'Recent purchase', neighbors: 'Neighbors re-roofed', jobValue: 'Job value', material: 'Roof material', owner: 'Owner-occupied' };

  function score(h, opts) {
    opts = opts || {};
    const C = merge(CONFIG, opts.config || {}), now = opts.now ? new Date(opts.now) : new Date(), rd = roofDate(h);
    const age = roofAge(h, C, now), hl = hail(h, C, now, rd);
    const parts = { roofAge: age, hail: hl, wind: wind(h, C, now, rd, age.years, age.estimated),
      purchase: purchase(h, C, now), neighbors: neighbors(h, C), jobValue: jobValue(h, C), material: slot('material', h, C), owner: slot('owner', h, C) };
    for (const k of Object.keys(parts)) { parts[k].label = LABELS[k]; parts[k].pts = Math.round(parts[k].pts * 10) / 10; }
    const drop = hardFilter(h, rd, hl);
    const maxAll = Object.keys(parts).reduce((s, k) => s + (C.weights[k] || 0), 0) || 100;
    const got = Object.keys(parts).reduce((s, k) => s + (C.weights[k] ? parts[k].pts : 0), 0);
    const total = Math.round(Math.min(100, got * 100 / maxAll));
    // confidence: High = roof age from a permit, hail measured at the address, data under 30 days old
    const fresh = h.dataAsOf ? (now - toDate(h.dataAsOf)) / DAY <= C.confidence.freshDays : false;
    // Medium = any one of the three estimated; Low = roof age AND hail both estimated
    const est = [age.estimated && 'roof age', hl.estimated && 'hail', !fresh && 'data over ' + C.confidence.freshDays + ' days old'].filter(Boolean);
    const confidence = age.estimated && hl.estimated ? 'Low' : est.length ? 'Medium' : 'High';
    return { gi: h.gi, drop, total, parts, confidence, confWhy: est.length ? 'Estimated: ' + est.join(', ') + '.' : 'Roof age from a permit, hail measured at the address, data under ' + C.confidence.freshDays + ' days old.' };
  }

  function rank(homes, opts) {
    const out = [], dropped = {};
    for (const h of homes) { const s = score(h, opts); if (s.drop) { const k = s.drop.replace(/ \(.*$/, '').replace(/^Roof permit.*/, 'Roof permit after the storm'); dropped[k] = (dropped[k] || 0) + 1; } else out.push(s); }
    out.sort((a, b) => b.total - a.total || b.parts.hail.pts - a.parts.hail.pts);
    return { ranked: out.slice(0, (opts && opts.limit) || 50), scored: out.length, dropped };
  }

  // numbers only, no evidence text: the hard "re-roofed after the storm" check and an upper bound on the total with wind at
  // full points. For ranking 271k homes fast (lib/opp-data.js); the tests check it never comes in under score().
  // roof = { source, year, date }; hits = [[isoMs, inches]...]; cfgFull = merged config (from merged(config))
  // known: { sale, material, homestead } = false when that data is not loaded at all (then those parts score 0 for everyone)
  function quick(roof, hits, nbrCount, squares, pitch, nowMs, C, known) {
    known = known || {};
    const W = C.weights, src = roof.source;
    let rd = null, agePts = 0, ageYrs = null;
    if (src === 'permit') { rd = toDate(roof.date || roof.year).getTime(); ageYrs = Math.floor(Math.max(0, (nowMs - rd) / (DAY * 365.25))); agePts = Math.min(W.roofAge, bandIncl(ageYrs, C.roofAge.bands)); }
    else if (src === 'built' && roof.year) { rd = Date.UTC(roof.year, 0, 1); agePts = Math.min(W.roofAge, bandIncl(new Date(nowMs).getUTCFullYear() - roof.year, C.roofAge.bands), C.roofAge.builtCap); }
    let hailPts = 0, q = null;
    for (const [t, inch, ym] of hits) {
      if (inch >= 0.75 && (!q || inch > q[1])) q = [t, inch, ym];
      if (rd != null && t <= rd) continue;
      const age = (nowMs - t) / (DAY * 30.4375), rec = age <= C.hail.fullMonths ? 1 : age <= C.hail.halfMonths ? 0.5 : 0;
      const p = band(inch, C.hail.bands) * rec; if (p > hailPts) hailPts = p;
    }
    if (src === 'permit' && q && (rd > q[0] || (String(roof.date || '').length === 7 && String(roof.date).slice(0, 7) === q[2]))) return { drop: true, ub: 0 };
    const nb = Math.min(W.neighbors, bandIncl(nbrCount || 0, C.neighbors.bands));
    const J = C.jobValue, sz = squares ? Math.max(0, Math.min(1, squares / J.baselineSquares - 0.5)) * J.sizePts : 0, pp = pitch ? bandIncl(pitch, J.pitchBands) : 0;
    const job = Math.min(W.jobValue, (sz + pp) * W.jobValue / (J.sizePts + J.pitchPts));
    const maxAll = Object.keys(LABELS).reduce((a, k) => a + (W[k] || 0), 0) || 100;
    const raw = agePts + Math.min(W.hail, hailPts) + W.wind + (known.sale === false ? 0 : W.purchase) + nb + job + (known.material === false ? 0 : W.material) + (known.homestead === false ? 0 : W.owner);
    return { drop: false, ub: raw * 100 / maxAll };
  }
  const merged = cfg => merge(CONFIG, cfg || {});

  return { CONFIG, score, rank, quick, merged, LABELS, _t: { band, bandIncl, toDate, months } };
});
