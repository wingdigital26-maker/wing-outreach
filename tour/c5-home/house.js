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
  const loadMap = () => mapP || (mapP = new Promise((ok, no) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '../vendor/maplibre-gl@4.7.1/maplibre-gl.css'; document.head.appendChild(l);
    const s = document.createElement('script'); s.src = '../vendor/maplibre-gl@4.7.1/maplibre-gl.js'; s.onload = () => ok(window.maplibregl); s.onerror = no; document.head.appendChild(s);
  }));
  const plainInitials = n => String(n || '').replace(/&.*$/, '').split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + '.').slice(0, 3).join(' ');
  const yrs = y => { const n = new Date().getFullYear() - y; return n + (n === 1 ? ' year' : ' years') + ' old'; };
  const day = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const ago = iso => { const m = Math.round((Date.now() - Date.parse(iso + 'T12:00:00Z')) / 2629800000); return m < 1 ? 'this month' : m < 24 ? m + ' months ago' : Math.floor(m / 12) + ' years ago'; };
  const press = a => { const b = $('.rh .acts [data-act="' + a + '"]'); if (b) b.click(); };

  function fact(label, value, src) {
    return `<div class="hf"><dt>${esc(label)}</dt><dd>${value}</dd>${src ? `<small>${esc(src)}</small>` : ''}</div>`;
  }

  function render() {
    const H = window.HOME; if (!H || !H.rec) return;
    const r = H.rec, gi = r.gi != null ? +r.gi : +String(H.id).slice(1), id = H.id;
    if (shownId !== id) { showAll = false; }
    const cad = r.county ? String(r.county).replace(/,.*$/, '').replace(/ County$/, '') + ' County appraisal roll' : 'County appraisal roll';
    const rr = r.reroof;
    // a re-roof shows only when a permit is on file; otherwise Unknown (Jack: never an old value standing in)
    const reroofV = rr && !rr.none && rr.text ? esc(rr.text) : 'Unknown';
    const reroofS = rr && !rr.none ? rr.src : rr && rr.since ? 'No permit on file since ' + rr.since + (rr.src ? ' (' + rr.src + ')' : '') : 'No permit records for this city';
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
          <section class="hcard">
            <h2>Owner</h2>
            <p class="own" id="hOwn">Loading</p>
            <p class="own-s" id="hOwnS"></p>
          </section>
          <section class="hcard">
            <h2>Where this lead is</h2>
            <div class="stg" role="group" aria-label="Stage">${RC.STAGES.map(s => `<button type="button" data-st="${esc(s[0])}" aria-pressed="${s[0] === stage}">${esc(s[1])}</button>`).join('')}</div>
            ${hist.length ? `<ol class="hist">${hist.slice(0, 6).map(h => `<li><b>${esc(h.what || '')}</b><span>${h.at ? esc(new Date(h.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) : ''}</span></li>`).join('')}</ol>` : '<p class="none">Nothing done with this house yet.</p>'}
          </section>
        </aside>
      </div>
      <dl class="hfacts">
        ${fact('Built', r.year ? `${r.year} <em>${yrs(r.year)}</em>` : 'Unknown', cad)}
        ${fact('Living area', r.sqft ? (+r.sqft).toLocaleString('en-US') + ' sq ft' : 'Unknown', cad)}
        ${fact('Last re-roof', reroofV, reroofS)}
        <div class="hf" id="hHome"><dt>Owner lives here</dt><dd>Checking</dd><small>Homestead exemption, ${esc(cad)}</small></div>
        <div class="hf" id="hCty"><dt>County</dt><dd>${esc(String(r.county || 'Unknown').replace(/, TX$/, ''))}</dd><small></small></div>
        ${fact('Neighborhood', r.subdivision ? esc(r.subdivision) : 'Unknown', cad)}
      </dl>
      <section class="hstorm" id="hStorm"><h2>Hail at this house</h2><p class="none">Loading the radar record</p></section>`;

    root.querySelectorAll('[data-h]').forEach(b => b.onclick = () => press(b.dataset.h));
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
      const hh = $('#hHome dd', root); if (hh) hh.textContent = lives == null ? 'Unknown' : lives ? 'Yes' : 'No';
    });

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
    shownId = id; sig = id + '|' + stage + '|' + hist.length + '|' + booked;
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
  setInterval(() => { const H = window.HOME; if (!H || document.body.dataset.view !== 'home') return;
    const s = H.id + '|' + RC.stage(H.id, 'new') + '|' + (RC.history(H.id) || []).length + '|' + RC.booking(H.id);
    if (s !== sig) { sig = s; render(); } }, 1200);
  Promise.resolve(window.HOME_READY).then(render);
})();
