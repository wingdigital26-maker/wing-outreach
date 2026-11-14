/* house.js: the house page (Jack 11-01: "completely different", no made-up measurements).
   The live satellite photo of the house is the hero; around it only facts the data actually has:
   county roll (address, subdivision, year built, living area, CAD id, owner-occupied), owner initials, re-roof permits
   (none on file = "Unknown", never an older value), radar hail at this address on every storm on file, the photo's own
   capture date, and this home's stage and history on this device. No roof squares, pitch, stories or 3D: those were estimates.
   Text / Email / Book press the record's own buttons (rec.js), so nothing new sends anything. */
(function () {
  'use strict';
  const RC = window.RC, esc = RC.esc, $ = (s, r) => (r || document).querySelector(s);
  const root = document.createElement('section');
  root.className = 'house'; root.id = 'house'; root.setAttribute('aria-label', 'This house');
  document.querySelector('.rh').before(root);
  document.body.classList.add('house-on');

  let map = null, mapP = null, shownId = null, showAll = false;
  const watched = new WeakSet(), settled = new WeakSet();   // each home's county-facts promise: asked once, then answered
  let fitOpen = false;   // Score details fold-out stays open across re-renders
  const loadMap = () => mapP || (mapP = new Promise((ok, no) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '../vendor/maplibre-gl@4.7.1/maplibre-gl.css'; document.head.appendChild(l);
    const s = document.createElement('script'); s.src = '../vendor/maplibre-gl@4.7.1/maplibre-gl.js'; s.onload = () => ok(window.maplibregl); s.onerror = no; document.head.appendChild(s);
  }));
  const plainInitials = n => String(n || '').replace(/&.*$/, '').split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + '.').slice(0, 3).join(' ');
  // the HOUSE's age from the county year built, said as "37 years ago" so it cannot be read as the roof's age (11-11)
  const yrs = y => { const n = new Date().getFullYear() - y; return n < 1 ? 'this year' : n + (n === 1 ? ' year' : ' years') + ' ago'; };
  const day = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const ago = iso => { const m = Math.round((Date.now() - Date.parse(iso + 'T12:00:00Z')) / 2629800000); return m < 1 ? 'this month' : m < 24 ? m + ' months ago' : Math.floor(m / 12) + ' years ago'; };
  const press = a => { const b = $('.rh .acts [data-act="' + a + '"]'); if (b) b.click(); };

  function fact(label, value, src) {
    const fk = { 'Built': 'built', 'Living area': 'area', 'Last re-roof': 'reroof', 'Neighborhood': 'hood' }[label] || '';
    return `<div class="hf"${fk ? ` data-f="${fk}"` : ''}><dt>${esc(label)}</dt><dd>${value}</dd>${src ? `<small>${esc(src)}</small>` : ''}</div>`;
  }

  // the record's next task (rec.js renderNext into #next, hidden with the old page) shows beside the photo; Done and Book
  // press the record's own buttons, so nothing new is written here. The 11-01 port dropped it and left the column empty.
  function mirrorNext() {
    const src = document.getElementById('next'), card = $('#hNextCard', root), box = $('#hNext', root);
    if (!src || !card || !box) return;
    const h4 = src.querySelector('h4'), why = src.querySelector('.why'), due = src.querySelector('.due');
    if (!h4) { card.hidden = true; return; }
    const btns = [...src.querySelectorAll('.row button')];
    box.innerHTML = `<p class="due">${esc(due ? due.textContent.trim() : '')}</p><h3>${h4.innerHTML}</h3>${why ? `<p class="why">${why.innerHTML}</p>` : ''}` +
      (btns.length ? `<div class="row">${btns.map((b, i) => `<button type="button" data-i="${i}">${esc(b.textContent.trim())}</button>`).join('')}</div>` : '');
    box.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const t = src.querySelectorAll('.row button')[+b.dataset.i]; if (t) t.click(); });
    card.hidden = false;
  }
  (function watchNext() { const src = document.getElementById('next'); if (!src) return; new MutationObserver(() => { if (root.isConnected && $('#hNext', root)) mirrorNext(); }).observe(src, { childList: true, subtree: true, characterData: true }); })();

  function render() {
    const H = window.HOME; if (!H || !H.rec) return;
    const r = H.rec, gi = r.gi != null ? +r.gi : +String(H.id).slice(1), id = H.id;
    if (shownId !== id) { showAll = false; }
    const cad = r.county ? String(r.county).replace(/,.*$/, '').replace(/ County$/, '') + ' County appraisal roll' : 'County appraisal roll';
    const rr = r.reroof;
    // a re-roof shows only when a permit is on file; otherwise Unknown (Jack: never an old value standing in)
    // until the county facts have answered (rec.js HOME_READY) these rows say "Checking", never "Unknown" or "No permit
    // records for this city" for a home that has them (11-11). After that: no permit answer in a city with a full permit
    // list means the list did not load; only a city without a list is told "No permit records for this city".
    const hr = window.HOME_READY, wait = !('reroof' in r) && !!hr && !settled.has(hr);
    if (wait && !watched.has(hr)) { watched.add(hr); Promise.resolve(hr).then(() => { settled.add(hr); if (window.HOME_READY === hr && root.isConnected) render(); }); }
    const covered = !!(RC.ROOF_COVERAGE || {})[String(r.city || '').trim().toLowerCase()];
    const reroofV = wait ? 'Checking' : rr && !rr.none && rr.text ? esc(rr.text) : 'Unknown';
    const reroofS = wait ? '' : rr && !rr.none ? rr.src : rr && rr.since ? 'No permit on file since ' + rr.since + (rr.src ? ' (' + rr.src + ')' : '') : covered ? 'The permit record did not load' : r.city ? 'No permit records for this city' : '';
    const unk = wait ? 'Checking' : 'Unknown';
    const stage = RC.stage(id, 'new'), hist = RC.history(id) || [], booked = RC.booking(id);

    root.innerHTML = `
      <header class="hh">
        <div class="hh-t">
          <h1>${esc(r.addr || 'This house')}</h1>
          <p>${esc([r.city, ((r.state || 'TX') + ' ' + (r.zip || '')).trim()].filter(Boolean).join(', '))}${r.subdivision ? ' · ' + esc(r.subdivision) : ''}</p>
        </div>
        <div class="hh-a">
          <button type="button" class="hb p" data-h="text">Text</button>
          <button type="button" class="hb" data-h="email">Email</button>
          <button type="button" class="hb" data-h="book">${booked ? 'Booked ' + esc(RC.when(booked)) : 'Book inspection'}</button>
        </div>
      </header>
      <div class="hgrid">
        <figure class="hmap">
          <div class="hmap-c" id="hmapC" role="img" aria-label="Satellite photo of ${esc(r.addr || 'the house')}"></div>
          <div class="hmap-z"><button type="button" data-z="1" aria-label="Zoom in">+</button><button type="button" data-z="-1" aria-label="Zoom out">−</button><button type="button" data-z="0">Center</button></div>
          <figcaption><span id="hCap">Satellite photo</span><span class="cr">${esc(window.RCIMG ? RCIMG.credit() : '')}</span></figcaption>
        </figure>
        <aside class="hside">
          <section class="hcard" data-sec="owner">
            <h2>Owner</h2>
            <p class="own" id="hOwn">Loading</p>
            <p class="own-s" id="hOwnS"></p>
          </section>
          <section class="hcard hfit" data-sec="fit" id="hFit" hidden>
            <h2>Why it fits</h2>
            <div id="hFitB"></div>
          </section>
          <section class="hcard" data-sec="next" id="hNextCard" hidden>
            <h2>Next task</h2>
            <div id="hNext"></div>
          </section>
          <section class="hcard" data-sec="stage">
            <h2>Where this lead is</h2>
            <div class="stg" role="group" aria-label="Stage">${RC.STAGES.map(s => `<button type="button" data-st="${esc(s[0])}" aria-pressed="${s[0] === stage}">${esc(s[1])}</button>`).join('')}</div>
            ${hist.length ? `<ol class="hist">${hist.slice(0, 6).map(h => `<li><b>${esc(h.what || '')}</b><span>${h.at ? esc(new Date(h.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) : ''}</span></li>`).join('')}</ol>` : '<p class="none">Nothing done with this house yet.</p>'}
          </section>
        </aside>
      </div>
      <dl class="hfacts">
        ${fact('Built', r.year ? `<span style="display:flex;flex-wrap:wrap;align-items:baseline;column-gap:12px">${r.year} <em style="margin-left:0;white-space:nowrap">${yrs(r.year)}</em></span>` : unk, cad)/* "37 years ago" stays whole: on a narrow tile it drops under the year, "ago" is never left alone (11-12) */}
        ${fact('Living area', r.sqft ? (+r.sqft).toLocaleString('en-US') + ' sq ft' : unk, cad)}
        ${fact('Last re-roof', reroofV, reroofS)}
        <div class="hf" data-f="lives" id="hHome"><dt>Owner lives here</dt><dd>Checking</dd><small>Homestead exemption, ${esc(cad)}</small></div>
        <div class="hf" data-f="county" id="hCty"><dt>County</dt><dd>${r.county ? esc(String(r.county).replace(/, TX$/, '')) : unk}</dd><small></small></div>
        ${fact('Neighborhood', r.subdivision ? esc(r.subdivision) : unk, cad)}
      </dl>
      <section class="hstorm" id="hStorm"><h2>Hail at this house</h2><p class="none">Loading the radar record</p></section>`;

    root.querySelectorAll('[data-h]').forEach(b => b.onclick = () => press(b.dataset.h));
    mirrorNext();
    root.querySelectorAll('[data-st]').forEach(b => b.onclick = () => {
      if (b.dataset.st === stage) return;
      RC.setStage(id, b.dataset.st, 'Stage set to ' + RC.stageName(b.dataset.st)); render();
    });
    root.querySelectorAll('[data-z]').forEach(b => b.onclick = () => { if (!map) return; const z = +b.dataset.z;
      if (z) map.easeTo({ zoom: map.getZoom() + z }); else map.easeTo({ center: [r.lon, r.lat], zoom: 19.6 }); });

    // owner: initials only, whatever the data holds
    if (RC.owner) RC.owner(gi).then(o => {
      const el = $('#hOwn', root); if (!el) return;
      el.textContent = o && o.name ? plainInitials(o.name) : 'Not on the county roll';
      // the initials file carries no homestead flag, so there it is unknown, never "No"
      const known = o && !o.initialsOnly, lives = known ? !!o.homestead : r.homestead === true ? true : null;
      $('#hOwnS', root).textContent = o && o.name ? 'Initials only.' + (lives ? ' Lives at this house.' : '') : '';
      const hh = $('#hHome dd', root); if (hh) hh.textContent = lives == null ? unk : lives ? 'Yes' : 'No';
    });

    // Why it fits (11-07, intent signals): the Opportunity Score and its short reasons, from lib/rc-scores.js (RCS.explain).
    // Facts the data has (radar hail, permit-based roof age, airport gusts, county deed / homestead dates, occupancy flags);
    // no roof size estimate. Hidden when the score files are not there.
    if (window.RCS) RCS.explain(gi).then(E => {
      const card = $('#hFit', root), box = $('#hFitB', root); if (!card || !box || !E || (window.HOME && HOME.id) !== id) return;
      const NAMES = { roofAge: 'Roof age', storm: 'Hail', wind: 'Wind', movedIn: 'Moved in', occupancy: 'Who lives there', neighborhood: 'Neighbors', crm: 'Your contact' };
      const p = E.parts || {}, li = [], cap = t => t.charAt(0).toUpperCase() + t.slice(1);
      const big = (E.storms || []).filter(x => x.inches >= 1).sort((a, b) => b.inches - a.inches)[0];
      if (big) li.push(`Hail ${big.inches.toFixed(2)} in, ${big.label}`);
      // the roof line is Today's line: the roof rule's own words (E.roof.text, RC.roofEvidence) through RCPLAIN, so an age
      // from the year built reads "Roof likely ~37 yrs", a high-evidence permit "Roof 5 yrs (permit)", any other permit
      // "Roof likely ~7 yrs (permit not confirmed)", and a city with no permit list "Roof age unknown", as Today's row does
      // (11-12: the line used to be left out there, so Today said "Roof age unknown" and this card said nothing)
      const ra = window.RCPLAIN ? RCPLAIN.roof(E.roof) : '';
      if (ra) li.push(ra);
      ['wind', 'movedIn', 'occupancy'].forEach(k => { if ((p[k] || {}).fit) li.push(cap(p[k].fit)); });
      const nb = /^(\d+) neighbor/.exec((p.neighborhood || {}).plain || ''); if (nb && +nb[1] > 0) li.push(`${nb[1]} neighbor${+nb[1] === 1 ? '' : 's'} re-roofed lately`);
      box.innerHTML = `<p class="fs"><b>${E.score}</b> of 100 <span>Opportunity score</span></p>` + (li.length ? `<ul>${li.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="none">Nothing stands out yet.</p>') +
        (E.eligibility && !E.eligibility.ok ? `<p class="no">Do not contact: ${esc(E.eligibility.reason)}</p>` : '') +
        `<details class="fd"${fitOpen ? ' open' : ''}><summary>Score details</summary><dl>${['roofAge', 'storm', 'wind', 'movedIn', 'occupancy', 'neighborhood', 'crm'].filter(k => p[k] && p[k].max).map(k => {
          const q = p[k], pts = Math.round(q.pts * 10) / 10;
          return `<div><dt>${esc(NAMES[k])}<b>${k === 'occupancy' && pts > 0 ? '+' : ''}${pts} of ${k === 'occupancy' ? '±' : ''}${q.max}</b></dt><dd>${esc(q.plain)}<small>${esc(q.detail)}</small></dd></div>`; }).join('')}</dl>` +
        `<p class="fn">The score also counts roof size, an estimate kept off this page. A ranking, not proof of damage.</p></details>`;
      card.hidden = false;
      const fd = $('#hFit details', root); if (fd) fd.ontoggle = () => { fitOpen = fd.open; };
      // owner lives here: when the owner file has no answer, use the occupancy flag (homestead OR mailing address = this house)
      const occ = RCS.intent ? (RCS.intent(gi) || {}).occ : 0, hh = $('#hHome dd', root);
      if (hh && occ && /Checking|Unknown/.test(hh.textContent)) { hh.textContent = occ === 1 ? 'Likely yes' : 'Likely no (investor)'; const sm = $('#hHome small', root); if (sm) sm.textContent = 'Homestead or owner mailing address, county roll'; }
    }).catch(() => {});

    // the county's own property ID (CAD roll), for looking the house up on the appraisal site
    if (window.STM) STM.meta(gi).then(m => { const c = $('#hCty small', root); if (c && m && m.cadId) c.textContent = 'Property ID ' + m.cadId; });

    // hail: every storm on file at this address (NOAA MRMS radar)
    if (window.RCH) RCH.history(gi).then(list => {
      const box = $('#hStorm', root); if (!box) return;
      const hits = list.filter(h => h.inches > 0), big = hits.filter(h => h.inches >= 1), top = hits.reduce((m, h) => h.inches > (m ? m.inches : 0) ? h : m, null);
      const rows = showAll ? hits : hits.filter(h => h.inches >= 0.5);
      const max = Math.max(1.5, top ? top.inches : 0);
      box.innerHTML = `<h2>Hail at this house</h2>
        <div class="hs-sum">
          <div><b>${hits.length}</b><span>storms with hail here</span></div>
          <div><b>${big.length}</b><span>at 1 inch or bigger</span></div>
          <div><b>${top ? top.inches.toFixed(2) + '"' : 'None'}</b><span>${top ? 'biggest, ' + esc(day(top.iso)) : 'no hail on file'}</span></div>
        </div>
        ${rows.length ? `<table class="hs-t"><thead><tr><th>Date</th><th>Hail size</th><th></th></tr></thead><tbody>${rows.map(h => `
          <tr${h.inches >= 1 ? ' class="big"' : ''}><td>${esc(day(h.iso))}<small>${esc(ago(h.iso))}</small></td><td><b>${h.inches.toFixed(2)}"</b></td>
          <td class="hsbar" style="--w:${Math.round(h.inches / max * 100)}%" aria-hidden="true">&nbsp;</td></tr>`).join('')}</tbody></table>` : '<p class="none">No hail half an inch or bigger on file.</p>'}
        ${hits.length > rows.length || showAll ? `<button type="button" class="hlink" id="hAll">${showAll ? 'Show half an inch and up' : 'Show all ' + hits.length + ' storms'}</button>` : ''}
        <p class="src">Radar hail size at this address (NOAA MRMS). Storms on file since ${esc(list.length ? day(list[list.length - 1].iso) : 'records began')}.</p>`;
      const all = $('#hAll', box); if (all) all.onclick = () => { showAll = !showAll; shownId = id; render(); };
    });

    drawMap(r);
    shownId = id; sig = id + '|' + stage + '|' + hist.length + '|' + booked + '|' + factSig(r);
  }

  function drawMap(r) {
    if (!(isFinite(r.lon) && isFinite(r.lat))) return;
    loadMap().then(ml => {
      const el = $('#hmapC', root); if (!el) return;
      // the same house keeps its map (and the roofer's zoom); a re-render only moves the live canvas into the new figure
      if (map && map.__at === r.lon + ',' + r.lat) { el.replaceWith(map.getContainer()); map.resize(); return; }
      if (map) { map.remove(); map = null; }
      const T = RCIMG.tiles();
      map = new ml.Map({ container: el, center: [r.lon, r.lat], zoom: 19.6, maxZoom: 21, attributionControl: false, dragRotate: false, scrollZoom: false, cooperativeGestures: false, pitchWithRotate: false,
        style: { version: 8, sources: { sat: { type: 'raster', tiles: T.tiles, tileSize: 256, maxzoom: T.maxzoom } }, layers: [{ id: 'sat', type: 'raster', source: 'sat' }] } });
      map.__at = r.lon + ',' + r.lat; map.once('load', () => map.resize()); if (window.ResizeObserver) new ResizeObserver(() => map && map.resize()).observe(el);
      const pin = document.createElement('div'); pin.className = 'hpin'; pin.innerHTML = '<span>This house</span>';
      new ml.Marker({ element: pin, anchor: 'bottom', offset: [0, -34] }).setLngLat([r.lon, r.lat]).addTo(map);
      if (RCIMG.meta) RCIMG.meta(r.lon, r.lat, 0.15).then(m => { const c = $('#hCap', root); if (c && m && m.date) c.textContent = 'Satellite photo taken ' + m.date; }).catch(() => {});
    }).catch(() => { const el = $('#hmapC', root); if (el) el.innerHTML = '<p class="none">The satellite photo did not load.</p>'; });
  }

  // re-draw when another home opens or this one changes (Text / Email / Book write history through rec.js)
  const sw = window.switchHome;
  if (sw) window.switchHome = function () { const out = sw.apply(this, arguments); Promise.resolve(window.HOME_READY).then(() => setTimeout(render, 60)); return out; };
  let sig = '';
  // the county facts (rec.js HOME_READY) can land after the first draw of a home opened in place: they are part of the
  // signature, so the block never stays on "Built Unknown" / "No permit records for this city" for a home that has them (11-11)
  function factSig(r) { const rr = r && r.reroof; return r ? [r.year || '', r.sqft || '', r.county || '', r.subdivision || '', rr ? (rr.none ? 'none' + (rr.since || '') : rr.text || '') : ''].join('~') : ''; }
  setInterval(() => { const H = window.HOME; if (!H || document.body.dataset.view !== 'home') return;
    const s = H.id + '|' + RC.stage(H.id, 'new') + '|' + (RC.history(H.id) || []).length + '|' + RC.booking(H.id) + '|' + factSig(H.rec);
    if (s !== sig) { sig = s; render(); } }, 1200);
  if (RC.on) RC.on(d => { if (d && d.key === 'settings' && document.body.dataset.view === 'home') render(); });   // a stage added or renamed by Nimbus shows at once
  Promise.resolve(window.HOME_READY).then(render);
})();
