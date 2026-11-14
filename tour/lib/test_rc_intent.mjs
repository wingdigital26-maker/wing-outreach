// node --test tour/lib/test_rc_intent.mjs : the three v2 intent rules (wind, moved in / bought, owner-occupied)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const R = createRequire(import.meta.url)('./rc-intent.js');
const M = (y, m) => y * 12 + m - 1;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('wind: under 50 mph scores nothing', () => { near(R.windFrac(0, 25, false), 0); near(R.windFrac(49, 25, false), 0); });
test('wind: bands 50-59 low, 60-69 mid, 70+ high at a 10-20 yr roof', () => {
  near(R.windFrac(50, 15, false), 4 / 15); near(R.windFrac(59, 15, false), 4 / 15);
  near(R.windFrac(60, 15, false), 8 / 15); near(R.windFrac(69, 15, false), 8 / 15);
  near(R.windFrac(70, 15, false), 12 / 15); near(R.windFrac(95, 15, false), 12 / 15);
});
test('wind: x0.5 under 10 yrs, x1.25 at 20+, capped at full', () => {
  near(R.windFrac(62, 5, false), 4 / 15); near(R.windFrac(62, 22, false), 10 / 15); near(R.windFrac(75, 30, false), 1);
});
test('wind: never x1.25 when the roof age is an estimate; unknown age = x1', () => {
  near(R.windFrac(62, 30, true), 8 / 15); near(R.windFrac(62, null, false), 8 / 15); near(R.windFrac(62, 5, true), 4 / 15);
});
test('moved in: the points table', () => {
  const now = M(2026, 11);
  near(R.moveFrac(M(2026, 9), now, 0, 1995), 1); near(R.moveFrac(M(2026, 8), now, 0, 1995), 1);
  near(R.moveFrac(M(2026, 6), now, 0, 1995), 0.8); near(R.moveFrac(M(2026, 1), now, 0, 1995), 0.6);
  near(R.moveFrac(M(2025, 3), now, 0, 1995), 0.3); near(R.moveFrac(M(2024, 10), now, 0, 1995), 0);
});
test('moved in: no date or a future date is 0, never a penalty', () => {
  near(R.moveFrac(0, M(2026, 11), 0, 1995), 0); near(R.moveFrac(M(2027, 1), M(2026, 11), 0, 1995), 0);
});
test('moved in: 0 when a re-roof permit came within 6 months after the move', () => {
  const now = M(2026, 11);
  near(R.moveFrac(M(2026, 3), now, M(2026, 7), 1995), 0); near(R.moveFrac(M(2026, 3), now, M(2026, 9), 1995), 0); near(R.moveFrac(M(2026, 3), now, M(2026, 10), 1995), 0.6);
  near(R.moveFrac(M(2026, 3), now, M(2020, 1), 1995), 0.6);
});
test('moved in: a new build (date within 12 months of year built) is 0', () => {
  near(R.moveFrac(M(2026, 5), M(2026, 11), 0, 2025), 0); near(R.moveFrac(M(2026, 5), M(2026, 11), 0, 2022), 0.8);
});
test('owner-occupied: owner +1, investor -1, unknown 0', () => { near(R.occFrac(1), 1); near(R.occFrac(2), -1); near(R.occFrac(0), 0); });
test('labels: short, honest, no em dashes', () => {
  const l = [R.windLabel({ mph: 62, src: 'KDFW DFW Airport', miles: 6.2, day: '2026-04-12' }), R.windLabel({ mph: 58, src: 'NWS report, 2 NNW Westworth', miles: 1.4 }),
    R.moveLabel(M(2026, 3), R.KIND.HOMESTEAD), R.moveLabel(M(2026, 1), R.KIND.HOMESTEAD_JAN1), R.moveLabel(M(2025, 8), R.KIND.DEED), R.occLabel(1), R.occLabel(2)];
  assert.deepEqual(l, ['gust 62 mph at DFW (6 mi) Apr 12', 'gust 58 mph at NWS report (1 mi)', 'moved in ~Mar 2026 (homestead filed)',
    'moved in by Jan 2026 (homestead filed)', 'bought ~Aug 2025', 'lives there', 'likely investor owned']);
  l.forEach(s => assert.ok(!/—|–/.test(s)));
  assert.equal(R.windLabel({ mph: 45 }), ''); assert.equal(R.moveLabel(0, 1), ''); assert.equal(R.occLabel(0), '');
});
