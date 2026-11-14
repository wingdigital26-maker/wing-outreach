/* rc-plain.js (window.RCPLAIN): plain words for the surface of every screen (Jack 10-26: "easy for someone who is terrible
   with technology", a roofer in his 50s on a phone). The surface says "Big roof, about 44 squares", "Steep", "1 inch hail";
   the measured numbers and their sources (LiDAR, radar, 8/12) stay one tap or hover away and on the record's Home facts. */
(function () {
  'use strict';
  if (window.RCPLAIN) return;
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : null; };
  // hail: "1 inch", "1.4 inches", "2 inches" (one decimal at most, never "1.00 in")
  function hail(v) {
    const n = num(v); if (n == null) return '';
    const r = Math.round(n * 10) / 10, s = String(r);
    return s + (r === 1 ? ' inch' : ' inches');
  }
  // roof size: squares rounded, with a size word (25+ squares is a big roof for a house)
  function size(sq) {
    const n = num(sq); if (n == null || n <= 0) return '';
    const r = Math.round(n), w = r >= 25 ? 'Big roof' : r >= 15 ? 'Medium roof' : 'Small roof';
    return w + ', about ' + r + ' squares';
  }
  // slope from a pitch like "8/12", "8/12 + 6/12" or 8: the steepest part decides
  function slope(p) {
    const all = String(p == null ? '' : p).match(/\d+(?:\.\d+)?(?=\s*\/\s*12)|^\s*\d+(?:\.\d+)?\s*$/g); if (!all) return '';
    const m = Math.max(...all.map(parseFloat)); if (!isFinite(m)) return '';
    return m >= 8 ? 'Steep' : m >= 5 ? 'Medium slope' : 'Low slope';
  }
  // a sentence: inch units spelled out, re-roof jargon in plain words
  function words(s) {
    return String(s == null ? '' : s)
      .replace(/(\d+(?:\.\d+)?) in hail/g, (m, n) => hail(n) + ' hail')
      // "0.75 in+" is a cut-off the code filters on, so it is never rounded ("0.8 inch+" named a different cut-off, 11-12)
      .replace(/(\d+(?:\.\d+)?) in\+/g, (m, n) => String(num(n)) + ' inch+')
      // 11-11: the year is when the city's permit list starts, not when a roof went on ("No new roof on record since 2017"
      // read as "the last new roof was 2017"), so it is said as the list's start, short enough for the card's one line on a phone
      .replace(/([Nn])o re-roof permit (?:on file )?since (\d{4})/g, '$1o new roof on city list (starts $2)')
      .replace(/([Nn])o re-roof permit on file/g, '$1o new roof on record')
      .replace(/no re-roof permit since/g, 'no new roof on record since')
      .replace(/re-roofed/g, 'got a new roof').replace(/re-roofs/g, 'new roofs').replace(/re-roof/g, 'new roof')
      .replace(/,? ?pitch est\.? \d+\/12 \(LiDAR estimate\)/g, '');
  }
  /* roof age, short (Jack 10-26 voice notes: "get rid of the years of stuff everywhere"): "Built 1989, no new roof since 2017"
     reads "Roof likely ~37 yrs"; the years and the permit proof stay on the record's Home facts and Why it fits details.
     11-11: an age taken from the year built says "likely" (no permit proves it); only a permit-backed age is stated flat.
     The age always carries its own "likely": a "likely" about something else in the sentence ("Owner likely lives there,
     built 1989, ...") does not stand in for it. Only a sentence that already said "Roof likely" is not given a second one.
     A permit-backed age: "Roof 5 yrs (permit)"; a permit dated to the month keeps the month ("New roof May 2021 (permit)");
     a permit from this year reads "New roof this year (permit)" and one from last year "New roof last year (permit)", never
     "Roof 0 yrs" or "Roof 1 yrs". "This year" is today's calendar year, so a 2026 permit reads "last year" from January 2027.
     A permit dated in the future is bad data and is left as written. A "2017 or earlier" permit never gets an exact age. */
  const NOW = new Date().getFullYear(), NOWM = new Date().getMonth() + 1, yrs = y => Math.max(0, NOW - +y);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const guess = (y, at, all) => 'Roof ' + (/\broof likely\b[^.!?]*$/i.test(String(all).slice(0, at)) ? '' : 'likely ') + '~' + yrs(y) + (yrs(y) === 1 ? ' yr' : ' yrs');
  const permit = (m, y, mo, just) => {
    const n = NOW - +y, mon = mo && MONTHS[+mo - 1];
    if (n < 0 || (n === 0 && mon && +mo > NOWM)) return m;   // dated in the future: not dressed up
    if (mon) return 'New roof ' + mon + ' ' + y + ' (permit)';
    return n === 0 ? 'New roof this year (permit)' : n === 1 ? 'New roof last year (permit)' : 'Roof ' + n + ' yrs (permit)' + (just || '');
  };
  function age(s) {
    return String(s == null ? '' : s)
      // the score line's older wording (a cached lib/rc-scores.js): the age is said once, not "about 37 years old (Roof ~37 yrs)"
      .replace(/\b(Roof likely about \d+ years old) \(built (\d{4}),? no new roof[^()]*(?:\([^()]*\))?\)/g, '$1 (built $2)')
      .replace(/\b[Bb]uilt (\d{4}),? (?:no new roof|no re-roof permit)(?: on (?:record|file|(?:the )?city list))?(?: since \d{4}| \(starts \d{4}\))/g, (m, y, at, all) => guess(y, at, all))
      .replace(/\b[Bb]uilt \d{4},? roof age unknown(?: \([^)]*\))?/g, 'Roof age unknown')
      .replace(/\bRoof age unknown, (?:built \d{4}|year built not on file)/g, 'Roof age unknown')
      .replace(/(^|[.!?]\s+)No new roof on (?:record since \d{4}|(?:the )?city list \(starts \d{4}\))\.\s*/g, '$1')   // a whole sentence of it (the record's Next task): the age is on top
      .replace(/\bOriginal roof, built (\d{4})/g, (m, y, at, all) => guess(y, at, all))
      .replace(/\b(?:New roof|Re-roof permit|Re-roofed) (\d{4})(?!\d| or earlier| \(permit )(?:-(\d{2})(?:-\d{2})?)?(?: \((?:re-roof|new roof) permit\)| on record)?(, just (?:re-roofed|got a new roof))?/g, permit);
  }
  /* surface text: words() plus the measuring jargon ("radar", "LiDAR", "pitch 8/12", "1.31 in") in plain words */
  function line(s) {
    return age(words(s))
      .replace(/\s*\(radar\)/g, '').replace(/,? radar hail\b/g, ' hail').replace(/\bradar hail\b/g, 'hail').replace(/,\s*radar\b/g, '').replace(/ on radar\b/g, '')
      .replace(/\bLiDAR estimate\b/g, 'estimate').replace(/\bLiDAR est\./g, 'est.').replace(/\s*\(LiDAR[^)]*\)/g, '').replace(/,\s*LiDAR\b/g, '')
      .replace(/\b(\d{4}) LiDAR\b/g, '$1 aerial scans').replace(/\bLiDAR\b/g, 'aerial scan')
      .replace(/\b[Pp]itch (?:est\.? )?(\d+\/12(?:\s*\+\s*\d+\/12)*)/g, (m, p) => slope(p).toLowerCase() || m)
      .replace(/\b(\d+\.\d+) in\b(?=\s*$|\s*[,.;:)·]|\s+(?:max|largest|biggest|on|hail|here))/g, (m, n) => hail(n))
      .replace(/\bRe-roof permit\b/g, 'New roof').replace(/\bRe-roofs\b/g, 'New roofs').replace(/\bRe-roofed\b/g, 'New roof');
  }
  /* THE roof line for one home, the way Today says it, from the roof rule's record for that home (RC.roofEvidence plus the
     score build's evidence level: {text, kind, conf, age}). The CRM home's two views both call this, nothing else builds
     the line. A permit that is not high evidence (expired, a loose match, work not confirmed) is not stated flat: it reads
     "Roof likely ~7 yrs (permit not confirmed)". A high-evidence permit reads "Roof 7 yrs (permit)". */
  function roof(ev) {
    if (!ev || !ev.text) return '';
    const sure = String(ev.conf || '').toLowerCase() === 'high', a = ev.age;
    if (ev.kind === 'documented' && !sure && a != null && a >= 0 && !/may be a repair/.test(ev.text))
      return (a < 1 ? 'Roof likely new' : 'Roof likely ~' + a + (a === 1 ? ' yr' : ' yrs')) + ' (permit not confirmed)';
    return line(ev.text);
  }
  /* one pass over a screen's visible text (text nodes only: nothing typed, no drafts that get sent, no dialogs) and again
     whenever the screen redraws. Detail places keep their measured words: Home facts, the measurements tab, [data-plain-skip]. */
  const SKIP = 'script,style,textarea,input,select,option,code,pre,svg,dialog,[contenteditable],[data-plain-skip],#factsPanel,.facts.panel,#report,.ms,.rr,.draft,.dlg,.madlg,.nb-bubble,.wmp';
  function sweep(root) {
    root = root || document.body; if (!root) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => {
      const v = n.nodeValue; if (!v || !/LiDAR|radar|itch|re-roof|Re-roof| in\b| in\+|[Bb]uilt \d|Roof age|New roof \d|roof on record since|roof on (?:the )?city list/.test(v)) return NodeFilter.FILTER_REJECT;
      const p = n.parentElement; return p && !p.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; } });
    const todo = []; let n; while ((n = w.nextNode())) todo.push(n);
    todo.forEach(x => { const v = line(x.nodeValue); if (v !== x.nodeValue) x.nodeValue = v; });
  }
  function watch(root) {
    root = root || document.body; if (!root || !window.MutationObserver) return;
    let t = null; sweep(root);
    new MutationObserver(() => { if (!t) t = setTimeout(() => { t = null; sweep(root); }, 250); }).observe(root, { childList: true, subtree: true, characterData: true });
  }
  window.RCPLAIN = { hail, size, slope, words, age, line, roof, sweep, watch };
})();
