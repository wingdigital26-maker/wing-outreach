/* Nimbus reacts (kept trial, 10-11; switch RC_FEATURES.nimbusReacts). The orb never moves: a ring INSIDE his dock
   plays one short state animation on a real event, then rests.
     ping   a soft teal ripple when a homeowner's reply lands (RC.activity inbound, or the send log's GET /inbox when it runs)
     storm  a storm-blue pulse when latest-storm.json names a storm this device has not seen
     glow   a brief warm glow when an inspection is booked (RC.pipeline booked count rises)
   Event-driven only: nothing loops. prefers-reduced-motion: a single 300 ms colour step, no rings.
   Test hook: RC_FEATURES.react('ping'|'storm'|'glow'). */
(function () {
  if (!window.RC_FEATURES || !RC_FEATURES.nimbusReacts) return;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var css = '.nb-react{position:absolute;inset:0;border-radius:50%;pointer-events:none;z-index:0}' +
    '.nb-react i{position:absolute;inset:0;border-radius:50%;opacity:0}' +
    '.nb-react.ping i.r1,.nb-react.ping i.r2{border:1.5px solid rgba(15,163,163,.75);animation:nbPing 1.3s cubic-bezier(.2,.7,.3,1) forwards}' +
    '.nb-react.ping i.r2{animation-delay:.28s}' +
    '@keyframes nbPing{0%{transform:scale(.72);opacity:0}12%{opacity:.75}100%{transform:scale(1.9);opacity:0}}' +
    '.nb-react.storm i.r1{box-shadow:0 0 0 0 rgba(39,87,230,.45),0 0 24px 6px rgba(39,87,230,.25);animation:nbStorm 2.2s ease-out forwards}' +
    '@keyframes nbStorm{0%{transform:scale(.8);opacity:0}15%{opacity:1}45%{transform:scale(1.25);opacity:.25}55%{transform:scale(.9);opacity:.9}100%{transform:scale(1.5);opacity:0}}' +
    '.nb-react.glow i.r1{background:radial-gradient(circle,rgba(255,236,196,.85) 0%,rgba(255,214,140,.35) 45%,rgba(255,214,140,0) 72%);animation:nbGlow 1.5s ease-in-out forwards}' +
    '@keyframes nbGlow{0%{transform:scale(.9);opacity:0}35%{opacity:1;transform:scale(1.35)}100%{transform:scale(1.5);opacity:0}}' +
    '@media (prefers-reduced-motion:reduce){.nb-react i{animation:none!important}.nb-react.ping i.r1{opacity:.5;border:2px solid rgba(15,163,163,.8);transition:opacity .3s}.nb-react.storm i.r1{opacity:.6;box-shadow:0 0 0 4px rgba(39,87,230,.35);transition:opacity .3s}.nb-react.glow i.r1{opacity:.7;transition:opacity .3s}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var ring = null, timer = null;
  function mount() {
    var dock = document.querySelector('.nb-dock'); if (!dock || ring) return !!ring;
    ring = document.createElement('span'); ring.className = 'nb-react'; ring.setAttribute('aria-hidden', 'true');
    ring.innerHTML = '<i class="r1"></i><i class="r2"></i>';
    dock.insertBefore(ring, dock.firstChild);
    return true;
  }
  function react(kind) {
    if (!mount()) return false;
    clearTimeout(timer);
    ring.className = 'nb-react'; void ring.offsetWidth;   // restart the keyframes
    ring.classList.add(kind);
    var ms = reduced ? 700 : kind === 'storm' ? 2300 : kind === 'glow' ? 1600 : 1700;
    timer = setTimeout(function () { ring.className = 'nb-react'; }, ms);
    /* the mascot's own mood for the same beat (lib/wing-mascot.js states), never a move */
    try { var m = window.Nimbus && Nimbus.mascot; if (m) { m.setState(kind === 'storm' ? 'alert' : 'excited'); setTimeout(function () { m.setState('calm'); }, ms); } } catch (e) {}
    return true;
  }
  RC_FEATURES.react = react;

  var RC = window.RC;
  /* ---- replies: inbound records on this device, plus the send log when it is running ---- */
  var inboundN = null, logN = null, logFails = 0, LOG = 'http://127.0.0.1:4911/inbox';
  function countInbound() { try { return RC.activity().filter(function (a) { return a.dir === 'in'; }).length; } catch (e) { return 0; } }
  function logCount(j) {
    if (Array.isArray(j)) return j.length;
    if (j && Array.isArray(j.items)) return j.items.length;
    if (j && Array.isArray(j.replies)) return j.replies.length;
    if (j && Array.isArray(j.messages)) return j.messages.length;
    if (j && typeof j.count === 'number') return j.count;
    return null;
  }
  function pollLog() {
    if (logFails >= 2 || !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
    var ctl = new AbortController(); var t = setTimeout(function () { ctl.abort(); }, 2500);
    fetch(LOG, { signal: ctl.signal, cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      clearTimeout(t); var n = logCount(j); if (n == null) { logFails++; return; }
      logFails = 0; if (logN != null && n > logN) react('ping'); logN = n;
      setTimeout(pollLog, 45000);
    }).catch(function () { clearTimeout(t); logFails++; if (logFails < 2) setTimeout(pollLog, 60000); });
  }
  /* ---- bookings: inspections booked on this device ---- */
  var bookedN = null;
  function countBooked() { try { var p = RC.pipeline(); return Object.keys(p).filter(function (k) { return p[k] && (p[k].booked || p[k].stage === 'inspection'); }).length; } catch (e) { return 0; } }
  function onRC() {
    var i = countInbound(), b = countBooked();
    if (inboundN != null && i > inboundN) react('ping');
    else if (bookedN != null && b > bookedN) react('glow');
    inboundN = i; bookedN = b;
  }
  /* ---- storms: the newest storm (the one the header names) against the last one this device saw (its own key: the Today takeover
     keeps the per-user one, RC_FEATURES.stormSeen, and must not be pre-empted by this pulse) ---- */
  var K = 'rc.nimbus.storm';
  function seen() { try { return localStorage.getItem(K) || ''; } catch (e) { return ''; } }
  function mark(iso) { try { localStorage.setItem(K, iso); } catch (e) {} }
  /* 11-11: the storm named here is the one shared answer (RC.SHOWCASE / RC.facts.storm, the storm the header names), in
     the header's own words ("Jun 2", its home count), never the feed on its own: a stale feed, or a feed date the
     catalog does not hold, named a storm the header did not. */
  function dayLabel(iso) {
    var d = new Date(iso + 'T12:00:00Z'), y = d.getUTCFullYear();
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) + (y !== new Date().getFullYear() ? ', ' + y : '');
  }
  // the same rule as lib/rc-state.js: the feed's storm only when the catalog holds it and holds nothing newer with 1 in+ homes
  function newest(c, feed) {
    if (!c || !c.storms) return null;
    var hit = c.storms.filter(function (x) { return x.homes_1in > 0; }).map(function (x) { return x.date; }).sort(), top = hit.length ? hit[hit.length - 1] : '';
    var fed = feed && feed.iso && c.storms.some(function (x) { return x.date === feed.iso; }) ? feed.iso : '';
    var iso = fed && fed >= top ? fed : top, s = iso && c.storms.filter(function (x) { return x.date === iso; })[0];
    return s && s.homes_1in > 0 ? { iso: iso, d: dayLabel(iso), homes: s.homes_1in } : null;
  }
  function shared() {
    var f = RC.facts && RC.facts.storm, iso = RC.SHOWCASE;
    return f && iso && f.iso === iso && f.homes > 0 ? { iso: iso, d: f.d || dayLabel(iso), homes: f.homes } : null;
  }
  function checkStorm(st) {
    var iso = st && st.iso; if (!iso) return;
    var was = seen();
    if (was && was !== iso) {
      react('storm');
      try { if (window.Nimbus && Nimbus.say) Nimbus.say({ t: 'New storm on file: ' + st.d + ', ' + RC.fmt(st.homes) + ' homes at 1 in+.', k: 'Storms', m: 'alert', go: { screen: 'storm', params: { iso: iso } } }, 8000); } catch (e) {}
    }
    mark(iso);
  }
  /* every 10 minutes: the feed alone (one small file, as before). Only when it names a storm it did not name last time is
     the catalog read again, and the same rule picks the newest from the fresh pair. */
  var feedIso = null;
  function pollStorm() {
    if (!RC || !RC.dataRoot) return;
    var J = function (u) { return fetch(RC.dataRoot + u, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
    J('latest-storm.json').then(function (j) {
      if (!j || !j.iso || j.iso === feedIso) return;
      return J('catalog.json').then(function (c) { if (!c) return; feedIso = j.iso; checkStorm(newest(c, j)); });
    }).catch(function () {});
  }
  function start() {
    if (!RC) return;
    inboundN = countInbound(); bookedN = countBooked();
    RC.on(onRC);
    if (RC.factsReady) RC.factsReady.then(function () { feedIso = (RC.latestStorm && RC.latestStorm.iso) || null; checkStorm(shared()); setInterval(pollStorm, 10 * 60000); });
    setTimeout(pollLog, 4000);
    var tries = 0, m = setInterval(function () { if (mount() || ++tries > 40) clearInterval(m); }, 250);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
