/* Find homes screen (c10-find). All logic lives in lib/rc-scores.js (window.RCS, the same functions Nimbus calls);
   this file is only the screen: filters, results list + map, saved searches. Nothing sends.
   Loop 26 (Jack): Best blocks and Rep lists are gone from Find homes; plain words instead of evidence labels. */
(function () {
  'use strict';
  const RC = window.RC, RCS = window.RCS, esc = RC.esc, fmt = RC.fmt, $ = s => document.querySelector(s);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dshort = iso => iso ? MON[+iso.slice(5, 7) - 1] + ' ' + (+iso.slice(8, 10)) + ', ' + iso.slice(0, 4) : '';
  const CONFW = { high: 'permit on file', medium: 'probably right', low: 'a rough guess', unknown: 'from the house age' };
  const LS = 'rc.find.filters';
  let F = {}, last = null, map = null, drawing = null, view = 'search', shown = 100;
  try { F = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { F = {}; }
  delete F.assigned;   // the rep filter left with Rep lists (loop 26); an old saved value would hide homes with no chip showing it
  const toast = t => { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 3200); };
  const go = gi => RC.go ? RC.go('home', { id: 'm' + gi }) : null;

  // ---------- filters ----------
  function chips(key, opts, multi) {
    const cur = F[key];
    return `<div class="chips" data-k="${key}" data-multi="${multi ? 1 : 0}">${opts.map(([v, l]) => {
      const on = multi ? (cur || []).map(String).includes(String(v)) : String(cur == null ? '' : cur) === String(v);
      return `<button type="button" data-v="${esc(v)}" aria-pressed="${on}">${esc(l)}</button>`; }).join('')}</div>`;
  }
  function renderFilters() {
    const M = RCS.meta(), cities = M ? M.cities.filter(Boolean).sort() : [], storms = M ? M.storms.slice().reverse() : [];
    const one = F.stormFrom && F.stormFrom === F.stormTo ? F.stormFrom : '', range = F.stormFrom && !one;
    $('#filters').removeAttribute('aria-busy'); $('#filters').innerHTML = `
      <div class="fg"><h3>City</h3><div class="cityw">${chips('cities', cities.map(c => [c, c]), true)}</div>
        <div class="row2" style="margin-top:8px"><input type="text" id="zipIn" placeholder="ZIP codes" value="${esc((F.zips || []).join(', '))}" aria-label="ZIP codes"><button type="button" class="btn" id="drawBtn">${F.area ? 'Clear area' : 'Draw an area'}</button></div></div>
      <div class="fg"><h3>Storm</h3><select data-storm aria-label="Storm date"><option value="">Any storm</option>${range ? `<option value="range" selected>${dshort(F.stormFrom)} to ${F.stormTo ? dshort(F.stormTo) : 'now'}</option>` : ''}${storms.map(d => `<option value="${d}"${one === d ? ' selected' : ''}>${dshort(d)}</option>`).join('')}</select>
        <h3 style="margin-top:10px">Hail size</h3>${chips('hailMin', [['', 'Any'], [1, '1 in+'], [1.5, '1.5 in+'], [2, '2 in+']])}</div>
      <div class="fg"><h3>Roof age</h3>${chips('roofAgeMin', [['', 'Any'], [10, '10+ yrs'], [15, '15+ yrs'], [20, '20+ yrs']])}
        <h3 style="margin-top:10px">How we know it</h3>${chips('conf', [['high', 'Permit on file'], ['medium', 'Probably right'], ['low', 'Rough guess'], ['unknown', 'House age only']], true)}</div>
      <div class="fg"><h3>Score</h3>${chips('scoreMin', [['', 'Any'], [30, '30+'], [40, '40+'], [50, '50+']])}</div>
      <div class="fg"><h3>Can we reach out</h3>${chips('eligible', [['', 'Everyone'], ['only', 'OK to contact'], ['not', 'Asked not to']])}</div>
      <details class="fg more-f"${F.sqMin || F.types || F.crm ? ' open' : ''}><summary>More filters</summary>
        <h3>Roof size</h3>${chips('sqMin', [['', 'Any'], [20, '20+ sq'], [30, '30+ sq'], [40, '40+ sq']])}
        <h3 style="margin-top:10px">Property</h3>${chips('types', RCS.TYPES.map((t, i) => [i, t]), true)}
        <h3 style="margin-top:10px">In your CRM</h3>${chips('crm', [['none', 'Not contacted'], ['contacted', 'Contacted'], ['replied', 'Replied'], ['deal', 'In a deal'], ['won', 'Won']], true)}</details>
      <div class="fg"><button type="button" class="btn" id="clearF">Clear all filters</button></div>`;
    const so = $('#sortSel'); if (so) so.value = F.sort || '';
  }
  $('#filters').addEventListener('click', e => {
    const b = e.target.closest('.chips[data-k] button'); if (b) {
      const g = b.parentNode, k = g.dataset.k, v = b.dataset.v, num = /^-?[\d.]+$/.test(v) && k !== 'zips' ? +v : v;
      if (g.dataset.multi === '1') { const a = (F[k] || []).map(String); F[k] = a.includes(String(v)) ? (F[k] || []).filter(x => String(x) !== String(v)) : (F[k] || []).concat([num]); if (!F[k].length) delete F[k]; }
      else if (v === '') delete F[k]; else F[k] = num;
      delete F._name; return changed();
    }
    if (e.target.id === 'clearF') { F = {}; return changed(); }
    if (e.target.id === 'drawBtn') { if (F.area) { delete F.area; drawClear(); return changed(); } startDraw(); }
  });
  $('#filters').addEventListener('change', e => {
    if (e.target.matches('[data-storm]')) { const v = e.target.value; if (v === 'range') return; if (v) { F.stormFrom = v; F.stormTo = v; } else { delete F.stormFrom; delete F.stormTo; } delete F._name; return changed(); }
    const s = e.target.closest('[data-sel]'); if (s) { s.value ? F[s.dataset.sel] = s.value : delete F[s.dataset.sel]; delete F._name; changed(); }
    if (e.target.id === 'zipIn') { const z = e.target.value.match(/\d{5}/g); z ? F.zips = z : delete F.zips; changed(); } });
  function changed() { try { localStorage.setItem(LS, JSON.stringify(F)); } catch (e) { } renderFilters(); shown = 100; run(); }
  $('#sortSel').addEventListener('change', e => { e.target.value ? F.sort = e.target.value : delete F.sort; delete F._name; changed(); });
  $('#fTog').addEventListener('click', () => { const f = $('#filters'), o = f.classList.toggle('open'); $('#fTog').setAttribute('aria-expanded', o); $('#fTog').textContent = o ? 'Hide filters' : 'Filters'; });

  // ---------- results ----------
  let runN = 0;
  // Loop 26 (Jack: "it doesn't change when the filters change"): the Opportunity Score path used to rank only a 3,000-home
  // pool picked by the older rc-scores number, so "Score 50+" counted inside that pool (155 of 417k) and "Best score" showed
  // the same Rockwall homes whatever the filters said. Now every home that matches the filters is ranked: a numbers-only
  // upper bound (OPP.quick, the same one lib/opp-data.js uses) skips the homes that cannot qualify, and every home that
  // can is scored exactly, so the count, the list and the map all come from the full match set.
  let OD = null;
  function ubOf(D, gi, nowMs, CF, ST, YM) {
    const ev = D.C.ev[gi] & 7, y = D.C.roofYear[gi], p = D.permit.get(gi);
    const roof = p && p[1] !== 2 ? { source: 'permit', date: p[2] || String(p[0]) } : ev === 1 && y ? { source: 'permit', date: String(y) } : (ev === 2 || ev === 3) && y ? { source: 'built', year: y } : { source: 'none' };
    const hits = []; if (D.hitStart[gi] >= 0) for (let i = D.hitStart[gi]; i < D.hitEnd[gi]; i++) { const st = D.H.st[i]; hits.push([ST[st], D.H.v[i] / 100, YM[st]]); }
    const q = OPP.quick(roof, hits, D.C.nbr[gi], D.C.sq[gi], D.C.pitch[gi], nowMs, CF, { sale: false, material: false, homestead: false });
    return q.drop ? -1 : q.ub;
  }
  function tally(homes) { const c = { conf: { high: 0, medium: 0, low: 0, unknown: 0 }, eligible: 0, ineligible: 0 };
    homes.forEach(h => { if (c.conf[h.conf] != null) c.conf[h.conf]++; h.eligible ? c.eligible++ : c.ineligible++; }); return c; }
  const KEEP = 2000, MAPN = 30000;   // the map draws every match up to 30k (an even sample past that), not only the list rows
    // rows kept for the list + the map (the count is always the full match count)
  async function oppRank(r) {
    const D = OD || (OD = await OPPD.load()), CF = OPP.merged(), nowMs = Date.now();
    const ST = D.M.storms.map(d => Date.parse(d + 'T00:00:00Z')), YM = D.M.storms.map(d => d.slice(0, 7));
    const min = F.scoreMin, best = !F.sort;
    let homes = r.homes;
    homes.forEach(h => { h._ub = ubOf(D, h.gi, nowMs, CF, ST, YM); });
    const exact = async L => { const S = await Promise.all(L.map(h => OPPC.get(h.gi))); L.forEach((h, i) => { h.score = S[i] ? (S[i].drop ? 0 : S[i].total) : 0; h._x = 1; }); };
    if (min != null) {
      homes = homes.filter(h => h._ub + 1 >= min);
      for (let i = 0; i < homes.length; i += 4000) await exact(homes.slice(i, i + 4000));
      homes = homes.filter(h => h.score >= min);
      if (best) homes.sort((a, b) => b.score - a.score || a.gi - b.gi);
      const c = tally(homes);
      return Object.assign({}, r, { total: homes.length, counts: Object.assign({}, r.counts, c), homes: homes.slice(0, KEEP), pts: homes.slice(0, MAPN) });
    }
    if (!best) { const top = homes.slice(0, KEEP); await exact(top); return Object.assign({}, r, { homes: top, pts: homes.slice(0, MAPN) }); }
    // best score first: score in upper-bound order until the KEEP-th exact score beats every bound left
    const ord = homes.slice().sort((a, b) => b._ub - a._ub), got = [];
    for (let i = 0; i < ord.length; i += 1000) {
      const chunk = ord.slice(i, i + 1000); await exact(chunk); got.push(...chunk);
      got.sort((a, b) => b.score - a.score || a.gi - b.gi); if (got.length > KEEP) got.length = KEEP;
      const next = ord[i + 1000]; if (got.length >= KEEP && (!next || next._ub + 1 <= got[KEEP - 1].score)) break;
    }
    return Object.assign({}, r, { homes: got, pts: homes.length > MAPN ? got.concat(homes.filter((h, i) => i % Math.ceil(homes.length / MAPN) === 0)) : homes });
  }
  function run() {
    const n = ++runN, q = Object.assign({}, F); delete q._name; delete q.scoreMin;
    const opp = window.OPPC && window.OPPD && window.OPP;
    q.limit = opp ? 1e7 : KEEP; if (!opp && F.scoreMin != null) q.scoreMin = F.scoreMin;
    $('#count').textContent = 'Searching…'; $('#list').setAttribute('aria-busy', 'true');
    RCS.search(q).then(r => (opp ? oppRank(r) : r)).then(r => { if (n !== runN) return; $('#list').removeAttribute('aria-busy'); last = r; renderList(); drawMap(); })
      .catch(e => { if (n === runN) $('#count').textContent = e.message; });
  }
  function line(h) {
    // one calm line: hail size and date, then roof age and how we know it (Loop 26: plain words, no evidence labels)
    const bits = [];
    if (h.rangeDate) bits.push(`${h.rangeHail.toFixed(2)} in hail ${dshort(h.rangeDate)}`); else if (h.hail >= 0.75) bits.push(`${h.hail.toFixed(2)} in hail ${dshort(h.hailDate)}`); else bits.push('No hail on file');
    const ub = /^Roof age unknown, built (\d{4})/.exec(h.roof || ''), a = h.roofAge;
    if (ub && new Date().getFullYear() - +ub[1] <= 100) bits.push(`Roof age unknown, house ~${new Date().getFullYear() - +ub[1]} yrs old`);
    else if (a == null || a > 100) bits.push('Roof age unknown');   // a year built before 1925 on file is a records error, not a roof age
    else bits.push(`Roof ${a} yrs, ${CONFW[h.conf] || 'from the house age'}`);
    if (h.squares) bits.push(`about ${h.squares} squares`);
    return bits.join(' · ');
  }
  function renderList() {
    const r = last; if (!r) return;
    const c = r.counts;
    $('#count').textContent = `${fmt(r.total)} home${r.total === 1 ? '' : 's'} match${r.total === 1 ? 'es' : ''}`;
    $('#countSub').textContent = r.total ? `${F._name ? F._name + '. ' : ''}${fmt(c.eligible)} OK to contact${c.ineligible ? ', ' + fmt(c.ineligible) + ' asked not to be' : ''}.` : '';
    if (!r.total) { $('#list').innerHTML = '<p class="empty">No homes match. Take off a filter or two.</p>'; return; }
    const rows = r.homes.slice(0, shown);
    $('#list').innerHTML = rows.map(h => `<div class="h${h.eligible ? '' : ' ineligible'}" data-gi="${h.gi}" role="button" tabindex="0">
        ${h._x ? `<div class="sc${h.score >= 50 && h.eligible ? ' hi' : ''}" data-v2="${h.score}" title="Opportunity Score ${h.score} of 100"><small>Score</small>${h.score}<small>/100</small></div>` : `<div class="sc" title="Opportunity score, 0 to 100">${h.score}<small>score</small></div>`}
        <div class="ad"><b data-addr="${h.gi}">${esc(h.city)}${h.zip ? ' ' + esc(h.zip) : ''}</b>
          <p>${esc(line(h))}</p>${h.eligible ? '' : `<span class="no">Asked not to be contacted: ${esc(h.why)}</span>`}</div></div>`).join('')
      + (r.homes.length > shown ? `<div class="more"><button type="button" class="btn" id="moreBtn">Show more</button></div>` : r.total > r.homes.length ? `<p class="more">Showing the top ${fmt(r.homes.length)}. Add a filter to narrow it down.</p>` : '');
    RCS.describe(rows.map(h => h.gi)).then(D => D.forEach(d => { const el = document.querySelector(`[data-addr="${d.gi}"]`); if (el && d.addr) el.innerHTML = esc(d.addr) + `<span style="font-weight:400;color:var(--slate)">, ${esc(d.city || '')}</span>`; }));
    const M = RCS.meta();
    $('#foot').textContent = `Scores built ${M.built.replace('T', ' ')}. Permits through ${M.sources.permits_through}, radar hail through ${M.sources.radar_through}. Tap a home to see why it scored what it did.`;
  }
  $('#list').addEventListener('click', e => {
    if (e.target.id === 'moreBtn') { shown += 100; return renderList(); }
    const h = e.target.closest('.h'); if (!h) return; const gi = +h.dataset.gi;
    go(gi);
  });
  $('#list').addEventListener('keydown', e => { const h = e.target.closest('.h'); if (h && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(+h.dataset.gi); } });

  // ---------- map (results + drawn area) ----------
  function ensureMap(el, cb) {
    const done = () => { const d = document.getElementById(el); if (d) { d.classList.remove('ld'); d.removeAttribute('aria-busy'); } };   // the skeleton steps out
    if (!window.maplibregl) { done(); return null; }
    const m = new maplibregl.Map({ container: el, style: 'https://tiles.openfreemap.org/styles/positron', center: [-96.72, 33.1], zoom: 9.3, attributionControl: false });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.on('load', () => { done(); if (cb) cb(m); }); m.on('error', e => { if (!m.loaded()) setTimeout(() => { if (!m.loaded()) done(); }, 8000); });
    return m;
  }
  function fc(homes) { return { type: 'FeatureCollection', features: homes.filter(h => h.lon != null).map(h => ({ type: 'Feature', properties: { gi: h.gi, s: h.score, ok: h.eligible ? 1 : 0 }, geometry: { type: 'Point', coordinates: [h.lon, h.lat] } })) }; }
  function drawMap() {
    if (!last || $('#map').classList.contains('off')) return;
    if (!map) { map = ensureMap('map', m => {
      m.addSource('res', { type: 'geojson', data: fc([]) });
      m.addLayer({ id: 'res', type: 'circle', source: 'res', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 2.5, 15, 7],
        'circle-color': ['case', ['==', ['get', 'ok'], 0], '#9AA1AF', ['interpolate', ['linear'], ['get', 's'], 20, '#9DB4F2', 50, '#1F47C9', 75, '#0B1E66']], 'circle-stroke-width': 1, 'circle-stroke-color': '#fff' } });
      m.addSource('area', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'area-f', type: 'fill', source: 'area', paint: { 'fill-color': '#1F47C9', 'fill-opacity': 0.08 } });
      m.addLayer({ id: 'area-l', type: 'line', source: 'area', paint: { 'line-color': '#1F47C9', 'line-width': 2, 'line-dasharray': [2, 1] } });
      m.on('click', 'res', ev => { if (!drawing && ev.features[0]) go(ev.features[0].properties.gi); });
      m.on('mouseenter', 'res', () => m.getCanvas().style.cursor = 'pointer'); m.on('mouseleave', 'res', () => m.getCanvas().style.cursor = '');
      m.on('click', ev => { if (!drawing) return; drawing.push([ev.lngLat.lng, ev.lngLat.lat]); areaShow(drawing); note(`${drawing.length} point${drawing.length > 1 ? 's' : ''}. Tap Done when the area is closed.`, true); });
      if (F.area && F.area.poly) areaShow(F.area.poly);
      drawMap();
    }); return; }
    if (!map.getSource('res')) return;
    const all = last.pts || last.homes; map.getSource('res').setData(fc(all));
    const pts = all.filter(h => h.lon != null); if (pts.length && !drawing) {
      const b = pts.reduce((a, h) => [Math.min(a[0], h.lon), Math.min(a[1], h.lat), Math.max(a[2], h.lon), Math.max(a[3], h.lat)], [180, 90, -180, -90]);
      map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 30, maxZoom: 15, duration: 0 }); }
  }
  function areaShow(P) { if (!map || !map.getSource('area')) return; map.getSource('area').setData({ type: 'FeatureCollection', features: P.length > 2 ? [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [P.concat([P[0]])] } }] : P.length ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: P } }] : [] }); }
  function drawClear() { drawing = null; areaShow([]); note('', false); }
  function note(t, done) { const n = $('#mapNote'); n.hidden = !t; n.innerHTML = esc(t) + (done ? ' <button type="button" class="btn" id="drawDone" style="height:28px;margin-left:6px">Done</button> <button type="button" class="btn" id="drawCancel" style="height:28px">Cancel</button>' : ''); }
  function startDraw() { if ($('#map').classList.contains('off')) toggleMap(); drawing = []; note('Tap the map to outline an area.', true); }
  $('#mapNote').addEventListener('click', e => {
    if (e.target.id === 'drawDone') { if (drawing && drawing.length > 2) { F.area = { poly: drawing }; drawing = null; note('', false); changed(); } else toast('Tap at least 3 points on the map.'); }
    if (e.target.id === 'drawCancel') { drawClear(); if (F.area) areaShow(F.area.poly); }
  });
  function toggleMap() { const m = $('#map'), off = m.classList.toggle('off'); $('#mapTog').textContent = off ? 'Show map' : 'Hide map'; $('#mapTog').setAttribute('aria-pressed', !off); if (!off) { drawMap(); map && map.resize(); } }
  $('#mapTog').addEventListener('click', toggleMap);
  if (matchMedia('(max-width:860px)').matches) { $('#map').classList.add('off'); $('#mapTog').textContent = 'Show map'; }

  // ---------- dialogs ----------
  function dlg(title, body, foot) { $('#dlgT').textContent = title; $('#dlgB').innerHTML = body; $('#dlgF').innerHTML = foot; $('#dlg').showModal(); }
  $('#dlg').addEventListener('click', e => { if (e.target.dataset.x === 'close' || e.target === $('#dlg')) $('#dlg').close(); });
  $('#saveBtn').addEventListener('click', () => {
    dlg('Save this search', `<label>Name<input type="text" id="sName" value="${esc(F._name || suggestName())}" maxlength="60"></label>
      <label class="sw"><input type="checkbox" id="sQ" checked> Make it a daily list (best homes not contacted in 14 days)</label>
      <label class="sw"><input type="checkbox" id="sA"> Tell me when new homes match</label>`, '<button class="btn" data-x="close">Cancel</button><button class="btn p" id="sGo">Save</button>');
    $('#sGo').onclick = () => { const q = Object.assign({}, F); delete q._name; const s = RCS.saveSegment({ name: $('#sName').value, filters: q, queue: $('#sQ').checked, alert: $('#sA').checked });
      if (s.alert && last) RCS.saveSegment({ id: s.id, seen: last.homes.map(h => h.gi) });
      $('#dlg').close(); toast(`Saved "${s.name}". It is in Saved searches.`); };
  });
  function suggestName() { const b = []; if (F.roofAgeMin) b.push(F.roofAgeMin + '+ year roofs'); if (F.hailMin) b.push('after ' + F.hailMin + ' in hail'); if (F.cities) b.push('in ' + F.cities.join(', ')); return b.join(' ') || 'My search'; }

  // ---------- saved searches ----------
  function renderSaved() {
    const S = RCS.segments(), el = $('#vSaved');
    if (!S.length) { el.innerHTML = '<p class="empty">No saved searches yet. Set the filters on Search, then tap Save this search. A saved search becomes a daily list, and it can tell you when new homes match.</p>'; return; }
    el.innerHTML = S.map(s => `<div class="card" data-sg="${s.id}"><div><h4>${esc(s.name)}</h4><p data-cnt="${s.id}">Counting…</p></div>
      <div class="acts"><label class="sw"><input type="checkbox" data-alert ${s.alert ? 'checked' : ''}> Alert</label><button class="btn" data-q>Today's list</button><button class="btn" data-open>Open</button><button class="btn" data-del aria-label="Delete">Delete</button></div></div>`).join('');
    S.forEach(s => RCS.search(Object.assign({}, s.filters, { limit: 1 })).then(r => {
      const el2 = document.querySelector(`[data-cnt="${s.id}"]`); if (el2) el2.textContent = `${fmt(r.total)} homes match, ${fmt(r.counts.eligible)} OK to contact. ${s.queue ? 'Daily list on.' : ''} Saved ${dshort(s.created.slice(0, 10))}.`; }));
  }
  $('#vSaved').addEventListener('click', e => {
    const c = e.target.closest('[data-sg]'); if (!c) return; const id = c.dataset.sg, s = RCS.segments().find(x => x.id === id); if (!s) return;
    if (e.target.matches('[data-alert]')) { RCS.saveSegment({ id, alert: e.target.checked }); toast(e.target.checked ? 'You will hear about new homes in this search.' : 'Alert off.'); return; }
    if (e.target.matches('[data-del]')) { RCS.deleteSegment(id); renderSaved(); toast('Deleted.'); return; }
    if (e.target.matches('[data-open]')) { F = Object.assign({ _name: s.name }, s.filters); show('search'); changed(); return; }
    if (e.target.matches('[data-q]')) RCS.segmentQueue(id, 25).then(q => RCS.describe(q.homes.map(h => h.gi)).then(D => {
      dlg(`Today's list: ${s.name}`, q.homes.length ? `<p style="margin:0;color:var(--slate);font-size:13px">The ${q.homes.length} best homes OK to contact and not touched in 14 days.</p>` + q.homes.map((h, i) => `<button type="button" class="btn" style="justify-content:flex-start;text-align:left;height:auto;padding:8px 10px;display:flex;gap:10px" data-home="${h.gi}"><b>${h.score}</b><span>${esc((D[i] && D[i].addr) || h.city)}<br><small style="color:var(--slate)">${esc(line(h))}</small></span></button>`).join('') : '<p>No homes to work today in this search.</p>',
        '<button class="btn" data-x="close">Close</button>');
      $('#dlgB').onclick = ev => { const b = ev.target.closest('[data-home]'); if (b) { $('#dlg').close(); go(+b.dataset.home); } };
    }));
  });

  // ---------- views ----------
  function show(v) {
    view = v; document.querySelectorAll('.seg button').forEach(b => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    $('#vSearch').hidden = v !== 'search'; $('#vSaved').hidden = v !== 'saved'; 
    if (v === 'saved') renderSaved();
    if (v === 'search' && map) map.resize();
    try { history.replaceState(null, '', location.pathname + location.search.replace(/([?&])view=[^&]*&?/, '$1').replace(/[?&]$/, '') + (v === 'search' ? '' : (location.search ? '&' : '?') + 'view=' + v)); } catch (e) { }
  }
  document.querySelector('.seg').addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (b) show(b.dataset.v); });
  // the first-open search names its storm by date, like the header chip ('Hit by the Jun 2, 2026 storm'), never 'the last storm'
  function stormName(iso) { return 'Hit by the ' + dshort(iso) + ' storm, roof 15+ years'; }
  RCS.ready().then(() => {
    if (F._name === 'Hit in the last storm, roof 15+ years' && F.stormFrom) { F.stormTo = F.stormTo || F.stormFrom; F._name = stormName(F.stormFrom); try { localStorage.setItem(LS, JSON.stringify(F)); } catch (e) { } }
    const M = RCS.meta();
    // first open: a useful start instead of every home on file (hit in the newest storm that has matches, roof 15+ years, the
    // roofer's own cities). Loop 26: the newest storm on file (Jul 6, 385 homes) had none of those, so Find opened on "0 homes".
    let first = Promise.resolve();
    try { if (!localStorage.getItem('rc.find.started') && !Object.keys(F).length) { localStorage.setItem('rc.find.started', '1');
      const mine = ((window.activeRoofer && activeRoofer().cities) || []).filter(c => M.cities.includes(c)), base = { roofAgeMin: 15 };
      if (mine.length) base.cities = mine;
      const order = (M.storms || []).slice().sort().reverse().slice(0, 12);
      first = order.reduce((p, d) => p.then(hit => hit || RCS.search(Object.assign({ stormFrom: d, stormTo: d, limit: 1 }, base)).then(r => r.total >= 25 ? d : null)), Promise.resolve(null))
        .then(d => { if (d) { F = Object.assign({ stormFrom: d, stormTo: d, _name: stormName(d) }, base); try { localStorage.setItem(LS, JSON.stringify(F)); } catch (e) { } } });
    } } catch (e) { }
    first.then(() => {
    renderFilters(); run();
    const v = new URLSearchParams(location.search).get('view'); if (v === 'saved') show(v);
    });
  }).catch(e => { $('#count').textContent = e.message; });
  RC.on(d => { if (d && ['assign', 'segments', 'settings', 'optout', 'suppress', 'pipe'].includes(d.key) && d.remote) { if (view === 'search') run(); } });
  window.FIND = { show, run, get filters() { return F; } };
})();
