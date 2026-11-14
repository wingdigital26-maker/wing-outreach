/* st-panel.js (Jack 11-02): the Storms service-area panel folds to one small box, by hand any time or on its own when a
   storm is picked; the right-hand "Hardest hit in view" card moves inside the panel; the newest storm opens on its own
   when it is new; the latest-storm feed is re-read while the page is open and the panel says when it was last updated.
   Runs after st-map.js and st-hard.js (same classic-script scope: cur, LAST, ST, selectStorm, clearStorm, paintStat). */
(function () {
  'use strict';
  const stat = document.getElementById('stat'), head = stat && stat.querySelector('.head');
  if (!stat || !head) return;
  const KEY = 'rc.stormPanelMin', NEW_DAYS = 14, POLL_MS = 5 * 60 * 1000;
  const FEED = (window.rooferDataRoot ? rooferDataRoot() : RC.dataRoot) + 'latest-storm.json';   // the active roofer's data folder (lib/brand.js dataRoot)
  const ago = ms => { const m = Math.round(ms / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  const days = s => s ? Math.max(0, Math.round((ST.today - s.t) / 864e5)) : 0;

  // ---- the toggle in the head row, and the one-line summary that shows when folded ----
  const tog = document.createElement('button'); tog.type = 'button'; tog.className = 'ptog'; tog.id = 'ptog';
  tog.setAttribute('aria-controls', 'stat'); tog.title = 'Fold the panel';
  tog.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>';
  head.appendChild(tog);
  const mini = document.createElement('div'); mini.className = 'mini'; mini.id = 'pmini'; head.after(mini);
  const upd = document.createElement('div'); upd.className = 'upd'; upd.id = 'pupd'; stat.appendChild(upd);
  let manual = null;   // the roofer's own choice for the calm view, remembered across opens
  try { const v = localStorage.getItem(KEY); if (v === '1' || v === '0') manual = v === '1'; } catch (e) { }
  /* Jack 11-02: the panel starts CLOSED so the map is what people get first; a click opens it. Only an explicit "open"
     choice remembered on this device (manual === false) starts it open. The class goes on now, before the data, so the
     first paint is already the box. */
  const startMin = () => manual !== false;
  document.body.classList.toggle('pmin', startMin());
  function setMin(on, remember) {
    document.body.classList.toggle('pmin', !!on);
    tog.setAttribute('aria-expanded', on ? 'false' : 'true'); tog.title = on ? 'Open the panel' : 'Fold the panel';
    if (remember) { manual = !!on; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { } }
    paintMini();
    requestAnimationFrame(() => { try { if (window.__declutterPills) __declutterPills(); } catch (e) { } });   // pills move clear of the panel's new size
  }
  function paintMini() {
    const s = cur || LAST; if (!s) { mini.textContent = ''; return; }
    mini.innerHTML = cur
      ? `<b>Storm of ${esc(yd(cur))}</b> <span>${cur.max.toFixed(2)} in hail, ${fmt(cur.n)} homes hit</span> <button type="button" class="back" id="pback">All storms</button>`
      : `<b>Your service area</b> <span>${fmt(RC.facts.homes || STH.n)} homes, last storm ${esc(yd(s))}, ${fmt(s.n)} hit</span>`;
    const b = document.getElementById('pback'); if (b) b.addEventListener('click', e => { e.stopPropagation(); clearStorm(); });
  }
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  tog.addEventListener('click', e => { e.stopPropagation(); setMin(!document.body.classList.contains('pmin'), true); });
  mini.addEventListener('click', e => { if (e.target.closest('.back')) return; setMin(false, true); });
  stat.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.body.classList.contains('pmin')) setMin(true, true); });

  // ---- the right card's content lives inside the panel in storm view (nothing is lost: same counts, Plan a route, List the hit homes) ----
  const hh = document.getElementById('hh'), slot = stat.querySelector('div.only-storm');
  if (hh && slot) slot.appendChild(hh);

  // ---- picking a storm folds the panel to the box; leaving restores the roofer's own choice ----
  const _select = window.selectStorm, _clear = window.clearStorm;
  if (typeof _select === 'function') window.selectStorm = function (i, instant, fromUrl) {
    const before = cur; const r = _select.apply(this, arguments);
    const wait = () => { if (cur && cur !== before) { setMin(true, false); paintMini(); } else if (ST.storms[i] && ST.storms[i] !== before) setTimeout(wait, 150); };
    setTimeout(wait, 50); return r;
  };
  if (typeof _clear === 'function') window.clearStorm = function () { const r = _clear.apply(this, arguments); setMin(startMin(), false); paintMini(); return r; };
  const _paintStat = window.paintStat;
  if (typeof _paintStat === 'function') window.paintStat = function () { const r = _paintStat.apply(this, arguments); paintMini(); return r; };

  // ---- newest storm: open it on its own when it is new (within NEW_DAYS), unless the URL already names a storm ----
  ST.ready.then(() => {
    setMin(startMin(), false); paintMini();
    const fromUrl = /#\/storm\/\d{4}-\d{2}-\d{2}/.test(parent && parent.location ? parent.location.hash : location.hash);
    if (!fromUrl && LAST && days(LAST) <= NEW_DAYS && !cur) setTimeout(() => { if (!cur) selectStorm(ST.storms.length - 1, false, true); }, 400);
  });

  // ---- the feed: last updated, and a re-read while the page is open; a newer storm than the one loaded reloads this screen ----
  let feedIso = null, feedAt = null;
  async function readFeed(first) {
    try {
      const r = await fetch(FEED, { cache: 'no-store' }); if (!r.ok) return;
      const j = await r.json(); const lm = r.headers.get('Last-Modified'); feedAt = lm ? new Date(lm).getTime() : Date.now();
      if (first) feedIso = j.iso;
      else if (j.iso && feedIso && j.iso !== feedIso) { location.reload(); return; }   // a new storm landed: this frame re-reads its catalog
      paintUpd();
    } catch (e) { }
  }
  function paintUpd() { if (!feedAt) return; upd.textContent = 'Storm data updated ' + ago(Date.now() - feedAt); }
  readFeed(true); setInterval(() => readFeed(false), POLL_MS); setInterval(paintUpd, 60000);
  window.__stormPanel = { setMin, isMin: () => document.body.classList.contains('pmin') };
})();
