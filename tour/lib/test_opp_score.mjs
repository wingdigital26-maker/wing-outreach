// Tests for lib/opp-score.js, one block per rule in Jack's spec (10-29). Run: node tour/lib/test_opp_score.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const O = require('./opp-score.js');
const NOW = '2026-10-29T12:00:00Z';
let n = 0, bad = 0;
const eq = (a, b, what) => { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('FAIL', what, '\n  got ', a, '\n  want', b); } };
const S = (h, cfg) => O.score(Object.assign({ dataAsOf: '2026-10-20' }, h), { now: NOW, config: cfg });
const pts = (h, k) => S(h).parts[k].pts;

// ---- roof age (30) from a permit date ----
for (const [date, want] of [['2023-01-01', 0], ['2019-06-01', 6], ['2013-01-01', 13], ['2008-01-01', 23], ['2003-01-01', 28], ['1995-01-01', 30]])
  eq(pts({ roof: { source: 'permit', date } }, 'roofAge'), want, 'roof age permit ' + date);
// no permit: year built, capped at 13, estimated
eq(pts({ roof: { source: 'built', year: 1990 } }, 'roofAge'), 13, 'year built capped at 13');
eq(pts({ roof: { source: 'built', year: 2019 } }, 'roofAge'), 6, 'year built young');
eq(S({ roof: { source: 'built', year: 1990 } }).parts.roofAge.estimated, true, 'year built is estimated');
// unknown is never old
eq(pts({ roof: { source: 'none' } }, 'roofAge'), 0, 'unknown roof age = 0');
eq(pts({}, 'roofAge'), 0, 'no roof record = 0');

// ---- hail (25): size x recency, only after the last roof ----
for (const [inches, want] of [[0.5, 0], [0.8, 4], [1.2, 10], [1.75, 17], [2.2, 22], [2.75, 25]])
  eq(pts({ hits: [{ iso: '2026-06-02', inches }] }, 'hail'), want, 'hail size ' + inches);
eq(pts({ hits: [{ iso: '2025-03-25', inches: 1.75 }] }, 'hail'), 8.5, 'hail 12-24 months = half');
eq(pts({ hits: [{ iso: '2024-05-22', inches: 2.75 }] }, 'hail'), 0, 'hail over 24 months = 0');
eq(pts({ roof: { source: 'permit', date: '2026-07-10' }, hits: [{ iso: '2026-06-02', inches: 2 }] }, 'hail'), 0, 'hail before the new roof does not count');
eq(pts({ hits: [{ iso: '2026-06-02', inches: 1.1 }, { iso: '2025-05-18', inches: 2.6 }] }, 'hail'), 12.5, 'best storm wins (2.6 in, half) over 1.1 in fresh');

// ---- wind (15): gust band x roof-age multiplier, cap 15 ----
const W = mph => [{ iso: '2026-08-26', mph, src: 'KDFW DFW Airport', miles: 3 }];
for (const [mph, want] of [[45, 0], [55, 4], [65, 8], [75, 12]]) eq(pts({ wind: W(mph), roof: { source: 'permit', date: '2012-01-01' } }, 'wind'), want, 'wind ' + mph);
eq(pts({ wind: W(75), roof: { source: 'permit', date: '2020-01-01' } }, 'wind'), 6, 'wind young roof x0.5');
eq(pts({ wind: W(75), roof: { source: 'permit', date: '2000-01-01' } }, 'wind'), 15, 'wind old roof x1.25 capped at 15');
eq(pts({ wind: W(65), roof: { source: 'none' } }, 'wind'), 8, 'wind, unknown roof age x1');

eq(pts({ wind: W(75), roof: { source: 'built', year: 1990 } }, 'wind'), 12, 'estimated old roof: no x1.25 boost');

// ---- recent purchase (10) ----
for (const [date, want] of [['2026-09-01', 10], ['2026-05-15', 8], ['2026-01-10', 6], ['2025-01-10', 3], ['2022-01-10', 0]])
  eq(pts({ sale: { date } }, 'purchase'), want, 'purchase ' + date);
eq(pts({ sale: { date: '2026-09-01' }, saleRoofPermitMonths: 2 }, 'purchase'), 0, 'roof permit within 6 months of the sale = 0');
eq(pts({}, 'purchase'), 0, 'no sale on file = 0');

// ---- neighbors (10) ----
for (const [count, want] of [[0, 0], [1, 4], [3, 7], [6, 10]]) eq(pts({ nbr: { count, days: 90, meters: 100 } }, 'neighbors'), want, 'neighbors ' + count);

// ---- job value (10): size vs baseline + pitch ----
eq(pts({ squares: 45, pitch: 10 }, 'jobValue'), 10, 'big steep roof = 10');
eq(pts({ squares: 15, pitch: 4 }, 'jobValue'), 0, 'half-baseline flat roof = 0');
eq(pts({ squares: 30, pitch: 6 }, 'jobValue'), 4.5, 'baseline roof, 6/12');
eq(pts({ squares: 30, pitch: 6 }, 'jobValue') < O.score({ squares: 30, pitch: 6 }, { now: NOW, config: { jobValue: { baselineSquares: 20 } } }).parts.jobValue.pts, true, 'baseline is configurable');

// ---- total, slots, hard filters ----
const big = { roof: { source: 'permit', date: '1999-01-01' }, hits: [{ iso: '2026-06-02', inches: 2.8 }], wind: W(80), sale: { date: '2026-09-01' }, nbr: { count: 5 }, squares: 50, pitch: 10 };
eq(S(big).total, 100, 'every category maxed = 100');
eq(S({}).total, 0, 'nothing on file = 0');
eq(S(Object.assign({}, big, { material: 'three-tab' }), { weights: { material: 10 } }).total, 100, 'material slot weighted still totals 100');
eq(S(Object.assign({}, big, { homestead: 0 }), { weights: { owner: 10 } }).total, 91, 'owner slot weighted: not owner-occupied loses its share');
eq(S({ dnc: true, dncWhy: 'Do not call list' }).drop, 'Do not contact (Do not call list)', 'DNC dropped');
eq(S({ inPipeline: true }).drop, 'Already in the pipeline', 'pipeline dropped');
eq(!!S({ roof: { source: 'permit', date: '2026-08-01' }, hits: [{ iso: '2026-06-02', inches: 1.5 }] }).drop, true, 'permit after the storm dropped');
eq(S({ roof: { source: 'permit', date: '2026-06' }, hits: [{ iso: '2026-06-02', inches: 1.5 }] }).drop != null, true, 'same-month permit treated as after');
eq(S({ roof: { source: 'permit', date: '2015-01-01' }, hits: [{ iso: '2026-06-02', inches: 1.5 }] }).drop, null, 'old permit kept');

// ---- confidence ----
eq(S({ roof: { source: 'permit', date: '2010-01-01' }, hits: [{ iso: '2026-06-02', inches: 1 }] }).confidence, 'High', 'permit + measured hail + fresh = High');
eq(S({ roof: { source: 'built', year: 2000 } }).confidence, 'Medium', 'year-built roof = Medium');
eq(O.score({ roof: { source: 'permit', date: '2010-01-01' }, dataAsOf: '2026-08-01' }, { now: NOW }).confidence, 'Medium', 'stale data = Medium');

// ---- rank ----
const r = O.rank([big, { inPipeline: true }, { squares: 30 }, { dnc: true }], { now: NOW });
eq([r.scored, r.ranked[0].total, r.dropped['Already in the pipeline'], r.dropped['Do not contact']], [2, 100, 1, 1], 'rank drops filtered homes and sorts');

// ---- quick(): never under the real score, same drop decision ----
{
  const C = O.merged(), now = Date.parse(NOW), fx = [big, {}, { roof: { source: 'built', year: 1990 }, hits: [{ iso: '2026-04-27', inches: 2.3 }], nbr: { count: 2 }, squares: 40, pitch: 8 },
    { roof: { source: 'permit', date: '2014-03-02' }, hits: [{ iso: '2025-05-18', inches: 1.6 }], squares: 25, pitch: 5 },
    { roof: { source: 'permit', date: '2026-08-01' }, hits: [{ iso: '2026-06-02', inches: 1.5 }] }, { roof: { source: 'permit', date: '2026-06' }, hits: [{ iso: '2026-06-02', inches: 1.5 }] }];
  for (const h of fx) {
    const s = S(h), q = O.quick(h.roof || { source: 'none' }, (h.hits || []).map(x => [Date.parse(x.iso + 'T00:00:00Z'), x.inches, x.iso.slice(0, 7)]), (h.nbr || {}).count, h.squares, h.pitch, now, C);
    eq(q.drop, !!s.drop, 'quick drop matches score ' + JSON.stringify(h.roof || {}));
    if (!s.drop) eq(q.ub + 0.5 >= s.total, true, 'quick bound >= score ' + s.total + ' vs ' + q.ub.toFixed(1));
  }
}

console.log(`${n - bad}/${n} passed`);
process.exit(bad ? 1 : 0);
