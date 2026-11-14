/* rc-intent.js: the v2 buyer-intent signals of the Opportunity Score, as rules and short labels (window.RCI, and a Node
   module for tour/lib/test_rc_intent.mjs). The Python twin is scripts/scores/intent_rules.py; keep the two in step.
   Points come from the score build (meta/scores/homes.bin, columns pWind / pMove / pOcc); this file re-states the rules so
   the app can explain them and the tests can pin them.

     wind      best gust in the last 24 months at the nearest DFW airport (within 10 mi, not a lone-airport spike) or a
               measured NWS report within 3 mi: <50 mph 0, 50-59 4/15, 60-69 8/15, 70+ 12/15 of the weight;
               x0.5 roof under 10 yrs, x1 10-20, x1.25 20+, never x1.25 when the roof age is an estimate; capped.
     movedIn   months since the move-in (homestead filed) or the purchase (deed): 0-3 1, 4-6 0.8, 7-12 0.6, 13-24 0.3,
               older 0; 0 when a re-roof permit came within 6 months after it, or within 12 months of the year built.
     occupancy 1 likely owner-occupied +1, 2 likely investor -1, 0 unknown 0.
   Labels never use owner names or mailing addresses: only the month and how we know it. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.RCI = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WIND_BANDS = [[50, 0], [60, 4 / 15], [70, 8 / 15], [Infinity, 12 / 15]];
  const WIND_AGE = [[10, 0.5], [20, 1], [Infinity, 1.25]];
  const MOVE_BANDS = [[3, 1], [6, 0.8], [12, 0.6], [24, 0.3]];
  const MONTH0 = 1950 * 12, MOVE_PERMIT_MONTHS = 6, NEW_BUILD_MONTHS = 12;
  const KIND = { NONE: 0, HOMESTEAD: 1, DEED: 2, HOMESTEAD_JAN1: 3 };
  const band = (x, b) => { for (const [lim, v] of b) if (x < lim) return v; return b[b.length - 1][1]; };

  function windFrac(mph, roofAge, estimated) {
    if (!mph || mph < 50) return 0;
    let mult = roofAge == null || roofAge < 0 ? 1 : band(roofAge, WIND_AGE);
    if (estimated && mult > 1) mult = 1;
    return Math.min(1, band(mph, WIND_BANDS) * mult);
  }
  // months are absolute month numbers: year*12 + month-1
  function moveFrac(moveM, nowM, permitM, yearBuilt) {
    if (!moveM || moveM > nowM) return 0;
    if (yearBuilt && moveM - (yearBuilt * 12 + 6) <= NEW_BUILD_MONTHS) return 0;
    if (permitM && permitM - moveM >= 0 && permitM - moveM <= MOVE_PERMIT_MONTHS) return 0;
    const m = nowM - moveM;
    for (const [lim, v] of MOVE_BANDS) if (m <= lim) return v;
    return 0;
  }
  const occFrac = c => c === 1 ? 1 : c === 2 ? -1 : 0;
  const monthNum = iso => { const m = /^(\d{4})-(\d{2})/.exec(String(iso || '')); return m ? +m[1] * 12 + +m[2] - 1 : 0; };
  const monthWord = m => MON[m % 12] + ' ' + Math.floor(m / 12);

  // short labels for "Why it fits" (no em dashes, no names)
  function windLabel(w) {   // {mph, src, miles, day}
    if (!w || !w.mph || w.mph < 50) return '';
    const at = /^NWS/.test(w.src || '') ? 'NWS report' : String(w.src || '').split(' ')[0] === 'KDFW' ? 'DFW' : String(w.src || '').replace(/^K\w{3}\s+/, '');
    const day = w.day ? ' ' + MON[+w.day.slice(5, 7) - 1] + ' ' + +w.day.slice(8, 10) : '';
    return `gust ${Math.round(w.mph)} mph at ${at}${w.miles != null ? ' (' + Math.max(1, Math.round(w.miles)) + ' mi)' : ''}${day}`;
  }
  function moveLabel(moveM, kind) {   // moveM absolute month number
    if (!moveM || !kind) return '';
    if (kind === KIND.DEED) return `bought ~${monthWord(moveM)}`;
    if (kind === KIND.HOMESTEAD_JAN1) return `moved in by Jan ${Math.floor(moveM / 12)} (homestead filed)`;
    return `moved in ~${monthWord(moveM)} (homestead filed)`;
  }
  const occLabel = c => c === 1 ? 'lives there' : c === 2 ? 'likely investor owned' : '';

  return { windFrac, moveFrac, occFrac, windLabel, moveLabel, occLabel, monthNum, monthWord, MONTH0, KIND,
    CONFIG: { WIND_BANDS, WIND_AGE, MOVE_BANDS, MOVE_PERMIT_MONTHS, NEW_BUILD_MONTHS } };
});
