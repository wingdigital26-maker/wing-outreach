/* aerial.js: the home record opens on the AERIAL PHOTO with the measured roof edges on it (Jack 10-26: "I don't think the 3D
   model is that accurate"). The 3D model stays one tap away ("3D model"); the choice is remembered on this device
   (localStorage rc-recview). The photo view is the same drawing as the LiDAR measurements tab (lib/rc-measure.js, imagery from
   lib/rc-imagery.js), mirrored here at stage size so the two never disagree. A home with no photo drawing stays on 3D.
   Nimbus's updates never sit on the photo (data-nb-clear, lib/nimbus-shell.js). */
(function () {
  'use strict';
  const stage = document.getElementById('stage'), report = document.getElementById('report'), dock = document.getElementById('dock');
  if (!stage || !report || !dock) return;
  let view = '3d';   // Jack 10-26 round 2: 3D is the default on every load; the photo is one tap away and not remembered (KEY unused)
  const css = document.createElement('style');
  css.textContent = `
#stage .aer{position:absolute;left:16px;right:16px;top:96px;display:none;flex-direction:column;align-items:center;gap:6px;z-index:3}
#stage.aerial{height:clamp(560px,calc(100vh - 150px),900px)}
#stage.aerial .aer{display:flex}
#stage .aer svg{border-radius:10px;box-shadow:0 1px 2px rgba(11,16,32,.08),0 12px 32px -18px rgba(11,16,32,.35);display:block}
#stage .aer .ms-l{font-size:14px;stroke-width:4px}
#stage .aer-ph svg{display:block}
#stage .aer-ph{position:relative}
#stage .aer-ph.ld::before{content:'Loading the photo';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:10px;font-size:13px;font-weight:600;color:var(--muted,#465065);background:linear-gradient(90deg,#EEF0F3 25%,#F6F7F9 50%,#EEF0F3 75%);background-size:200% 100%;animation:aerSk 1.3s linear infinite;z-index:1}   /* a skeleton while the photo loads (10-30), not a blank box */
@keyframes aerSk{from{background-position:200% 0}to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){ #stage .aer-ph.ld::before{animation:none} }
aside.col{padding-bottom:96px}
#stage .aer.noline .ms-ol{display:none}
#stage .aer.olonly .aer-ov,#stage .aer.olonly .aer-card,#stage .aer.olonly .aer-lg{display:none!important}
#stage .aer-tog{font:inherit;font-size:13px;font-weight:600;border:1px solid var(--hair,#D5D9E0);border-radius:6px;background:#fff;color:var(--ink,#0B1020);min-height:32px;padding:0 10px;margin-left:6px;cursor:pointer}
@media (max-width:640px){ #stage .aer-tog{min-height:44px} }
#stage .aer-cap{display:flex;flex-direction:column;gap:2px;font-size:14px;line-height:1.35;color:var(--muted,#465065)}
#stage .aer-cap b{color:var(--ink,#0B1020);font-weight:600}
#stage .aer-cap .img-credit{margin:0;font-size:10.5px}
#stage.aerial #gl,#stage.aerial #labels,#stage.aerial #legend{visibility:hidden}
#stage.aerial .dock .ctl,#stage.aerial #titleP,#stage.aerial #titleH,#stage.aerial #areaTotal{display:none}
#stage .aer-h{display:none;margin:0;font-size:24px;font-weight:600;letter-spacing:-.01em;line-height:1.2}
#stage.aerial .aer-h{display:block}
@media (max-width:640px){ #stage .aer-h{font-size:21px} }
#stage .aseg{display:inline-flex;gap:2px;padding:3px;border-radius:8px;background:var(--panel-2,#F1F3F6);border:1px solid var(--hair,#D5D9E0);margin-right:8px;flex:none}
#stage .title .aseg{pointer-events:auto;margin:0 0 8px;display:flex;width:max-content}
#stage .aseg[hidden]{display:none}
#stage .aseg button{font:inherit;font-size:13px;font-weight:600;border:0;border-radius:6px;min-height:34px;padding:0 12px;background:none;color:var(--muted,#465065);cursor:pointer;white-space:nowrap}
#stage .aseg button[aria-pressed="true"]{background:#fff;color:var(--ink,#0B1020);box-shadow:0 1px 2px rgba(11,16,32,.14),0 0 0 1px var(--hair,#D5D9E0)}
#stage .aer-ov{position:absolute;left:0;top:0;pointer-events:none;overflow:visible}
#stage .aer-ov .pl{pointer-events:auto;cursor:pointer;stroke:#fff;stroke-width:1.5;stroke-linejoin:round}
#stage .aer-ov .pl.on{stroke:#FFD43B;stroke-width:3}
#stage .aer-ov text{font:700 12px Inter,system-ui,sans-serif;fill:#0B1020;text-anchor:middle;dominant-baseline:middle;paint-order:stroke;stroke:#fff;stroke-width:3.5px;pointer-events:none}
#stage .aer-card{position:absolute;z-index:4;pointer-events:none;transform:translate(-50%,calc(-100% - 12px));display:flex;align-items:flex-end;gap:12px;background:#0B1020;color:#fff;border-radius:6px;box-shadow:0 6px 18px rgba(11,16,32,.18);padding:8px 14px;white-space:nowrap;line-height:1.3;font-size:14px}
#stage .aer-card[hidden]{display:none}
#stage .aer-lg{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12.5px;color:var(--muted,#465065)}
#stage .aer-lg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
#stage .chip .sat-ic{display:inline-block;width:20px;height:14px;border-radius:3px;margin-right:6px;vertical-align:-2px;background:#7d8a6a center/cover no-repeat;box-shadow:inset 0 0 0 1px rgba(11,16,32,.2)}
@media (max-width:640px){ #stage .aer-card{font-size:13px;padding:7px 11px} }
@media (max-width:640px){ #stage .aer{left:10px;right:10px} #stage .aseg button{min-height:44px} #stage.aerial{min-height:0} }`;
  document.head.appendChild(css);

  const aer = document.createElement('div'); aer.className = 'aer'; aer.id = 'aer'; aer.setAttribute('data-nb-clear', ''); stage.appendChild(aer);
  report.setAttribute('data-nb-clear', '');
  // 10-26: Nimbus's updates never sit on the record's right column (Next task, Home facts), and the column ends with room
  // for his corner so its last line can always be scrolled clear of him
  document.querySelectorAll('aside.col').forEach(el => el.setAttribute('data-nb-clear', ''));
  const seg = document.createElement('div'); seg.className = 'aseg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Roof view'); seg.hidden = true;
  seg.innerHTML = '<button type="button" data-rv="3d" aria-pressed="false">3D</button><button type="button" data-rv="aerial" aria-pressed="false">Photo</button>';
  // the photo view's own plain heading ("Big roof, about 44 squares. Steep."); the measured numbers stay in its tooltip
  const ah = document.createElement('h2'); ah.className = 'aer-h'; ah.setAttribute('aria-live', 'polite');
  const title = document.getElementById('title'); if (title) title.insertBefore(ah, title.firstChild);
  // loop 4 (10-30): the 3D / Photo switch sits at the top of the roof panel, where the eye lands first, not down in the dock
  if (title) title.insertBefore(seg, title.firstChild); else dock.insertBefore(seg, dock.firstChild);
  function heading() {
    const src = document.getElementById('titleH'), s = src ? src.textContent : '', P = window.RCPLAIN;
    const m = /~?\s*([\d.]+)\s*sq/.exec(s), size = m && P ? P.size(m[1]) : '', w = /\b(steep|medium slope|low slope)\b/i.exec(s), sl = P ? P.slope(s) || (w ? w[1][0].toUpperCase() + w[1].slice(1).toLowerCase() : '') : '';   // the plain-words sweep may already have said 'steep'
    const txt = size ? size + '.' + (sl ? ' ' + sl + '.' : '') : (s || 'The roof from above');
    if (ah.textContent !== txt) ah.textContent = txt;
    ah.title = (s ? s + '. ' : '') + 'Estimates: order a measurement report before you quote.';
  }
  { const src = document.getElementById('titleH'); if (src) new MutationObserver(heading).observe(src, { childList: true, characterData: true, subtree: true }); }

  let has = false, last = '';
  const phone = () => matchMedia('(max-width:640px)').matches;
  /* the photo fills the stage between the title and the dock, at the stage's own shape (wide on a desktop), drawn at its
     real pixel size so the edge labels read at 14px; it is redrawn only when that size really changes */
  let drawn = '';
  function place() {
    if (!has) return;
    stage.style.height = '';
    const s = stage.getBoundingClientRect(), ph = phone(), side = ph ? 10 : 16;
    let top = 56;
    [...stage.children].forEach(el => {
      if (el === aer || el === dock || /^(gl|labels|legend)$/.test(el.id)) return;
      if (!ph && el.id !== 'title') return;
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const r = el.getBoundingClientRect(); if (!r.height || r.top - s.top > 200) return;
      top = Math.max(top, r.bottom - s.top);
    });
    top = Math.round(top + 10);
    let w = Math.floor(s.width - 2 * side);
    if (!(w > 40)) { if ((place.retry = (place.retry || 0) + 1) < 25) setTimeout(place, 300); return; }   // stage not laid out yet (slow render, hidden tab): never draw a negative-size SVG, try again shortly
    place.retry = 0;
    const capEl = aer.querySelector('.aer-cap'); if (capEl) capEl.style.width = w + 'px';
    const capH = (capEl ? capEl.offsetHeight : 40) + 14, dockH = dock.getBoundingClientRect().height + 22;
    let h;
    if (ph) { h = Math.round(w * 0.95); stage.style.height = Math.round(top + h + capH + dockH) + 'px'; }
    else h = Math.floor(Math.max(260, s.height - top - capH - dockH));
    if (!ph) w = Math.min(w, Math.round(h * 1.3));   // the house's own box, not the whole street (Jack 10-26)
    aer.style.top = top + 'px';
    const key = Math.round(w / 24) + 'x' + Math.round(h / 24) + ':' + last;   // (the stage height above is re-set every time)
    if (key === drawn) return; drawn = key;
    const svg = window.RCMEASURE && RCMEASURE.stageSVG ? RCMEASURE.stageSVG(w, h) : '';
    const holder = aer.querySelector('.aer-ph'); if (!holder) return;
    holder.innerHTML = svg || last;   // last = the side panel's square drawing (a fallback)
    const sv = holder.querySelector('svg'); if (sv) { sv.style.width = w + 'px'; sv.style.height = (svg ? h : w) + 'px'; }
    const im = holder.querySelector('image'), url = im && (im.getAttribute('href') || im.getAttribute('xlink:href'));
    if (url) { holder.classList.add('ld'); const pre = new Image(), done = () => holder.classList.remove('ld'); pre.onload = pre.onerror = done; pre.src = url; if (pre.complete) done(); setTimeout(done, 15000); }
    aer.querySelector('.aer-cap').style.width = w + 'px';
    overlay();
  }
  /* ---- Satellite chip + overlays (Jack 10-30: "a satellite image picture instead of the aerial scan measurements ... switch
     the 3D model into the satellite view without messing anything up"). The chip and the top Photo button are one view.
     On the photo the chips draw their own overlays (satMode); the 3D model's mode, camera and explode are never touched,
     so 3D comes back exactly as it was. Planes are fitted to the photo's own outline box (the alignment rc-measure draws). */
  let satMode = 'planes', sel = -1, hov = -1, userLine = false;
  const RP = () => (window.__roofPlan ? window.__roofPlan() : null);
  const bm = () => document.getElementById('bMeasure');
  function setupChip() {
    const b = bm(); if (!b) return;
    if (!b.dataset.sat) { b.dataset.sat = '1'; b.innerHTML = '<span class="sat-ic" aria-hidden="true"></span>Satellite'; b.title = 'Satellite photo of this house'; b.setAttribute('aria-pressed', 'false'); }
    b.hidden = !has;
    const im = report.querySelector('.ms .ms-svg image'), url = im && (im.getAttribute('href') || im.getAttribute('xlink:href'));
    const ic = b.querySelector('.sat-ic'); if (ic && url && ic.dataset.u !== url) { ic.dataset.u = url; ic.style.backgroundImage = `url("${url}")`; }
  }
  function markChips(m, satOn) {
    document.querySelectorAll('#chips .chip').forEach(c => { const on = c.dataset.m ? c.dataset.m === m : (c.id === 'bMeasure' && satOn); c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on)); });
  }
  function fit(svg) {
    const P = RP(); if (!P || !P.planes.length) return null;
    const xs = [], ys = [];
    const pol = svg.querySelector('polygon.ms-ol');
    if (pol) pol.getAttribute('points').trim().split(/\s+/).forEach(t => { const q = t.split(',').map(Number); xs.push(q[0]); ys.push(q[1]); });
    else svg.querySelectorAll('g.ms-ol line').forEach(l => { xs.push(+l.getAttribute('x1'), +l.getAttribute('x2')); ys.push(+l.getAttribute('y1'), +l.getAttribute('y2')); });
    if (xs.length < 3) return null;
    const mx = [], mz = []; P.planes.forEach(pl => pl.pts.forEach(q => { mx.push(q[0]); mz.push(q[1]); }));
    const a = Math.min(...xs), b = Math.max(...xs), c = Math.min(...ys), d = Math.max(...ys), e = Math.min(...mx), f = Math.max(...mx), g = Math.min(...mz), h = Math.max(...mz);
    const sx = (b - a) / ((f - e) || 1), sy = (d - c) / ((h - g) || 1);
    return { P, T: q => [a + (q[0] - e) * sx, c + (q[1] - g) * sy] };
  }
  const esc = t => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  function overlay() {
    const holder = aer.querySelector('.aer-ph'); if (!holder) return;
    let ov = holder.querySelector('.aer-ov'), card = holder.querySelector('.aer-card'), lg = aer.querySelector('.aer-lg');
    const svg = holder.querySelector('svg.ms-svg') || holder.querySelector('svg'); if (!svg) return;
    if (!lg) { lg = document.createElement('div'); lg.className = 'aer-lg'; const cap = aer.querySelector('.aer-cap'); if (cap) cap.appendChild(lg); }
    // Dimensions shows the photo's own measured lengths (the aerial scan numbers); the other views keep the user's outline choice
    aer.classList.toggle('noline', satMode === 'dims' ? false : !userLine);
    const F = fit(svg);
    if (!F) { if (ov) ov.remove(); lg.innerHTML = satMode === 'dims' ? '<span>Lengths in feet from the aerial scans, an estimate.</span>' : ''; return; }
    const vb = svg.viewBox.baseVal, W = (vb && vb.width) || svg.clientWidth, H = (vb && vb.height) || svg.clientHeight;
    if (!ov) { ov = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); ov.setAttribute('class', 'aer-ov'); holder.appendChild(ov);
      ov.addEventListener('click', e => { const t = e.target.closest('.pl'); e.stopPropagation(); sel = t && +t.dataset.i !== sel ? +t.dataset.i : -1; showCard(); });
      ov.addEventListener('pointerover', e => { if (e.pointerType === 'touch') return; const t = e.target.closest('.pl'), n = t ? +t.dataset.i : -1; if (n !== hov) { hov = n; showCard(); } });
      ov.addEventListener('pointerout', e => { if (e.pointerType === 'touch' || (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.aer-ov .pl'))) return; hov = -1; showCard(); }); }
    if (!card) { card = document.createElement('div'); card.className = 'aer-card'; card.hidden = true; card.setAttribute('aria-live', 'polite'); holder.appendChild(card); }
    ov.setAttribute('viewBox', `0 0 ${W} ${H}`); ov.style.width = svg.clientWidth + 'px'; ov.style.height = svg.clientHeight + 'px';
    const P = F.P, T = F.T, pts = pl => pl.pts.map(q => T(q).map(n => n.toFixed(1)).join(',')).join(' ');
    const cen = pl => { const r = pl.pts.map(T); return [r.reduce((s, q) => s + q[0], 0) / r.length, r.reduce((s, q) => s + q[1], 0) / r.length]; };
    const poly = (pl, i, fill, op, extra) => `<polygon class="pl${i === sel ? ' on' : ''}" data-i="${i}" points="${pts(pl)}" fill="${fill}" fill-opacity="${op}"${extra || ''}/>`;
    let body = '';
    if (satMode === 'planes') body = P.planes.map((pl, i) => poly(pl, i, pl.col, i === sel ? .62 : .42)).join('') + P.planes.map(pl => { const c = cen(pl); return pl.area >= 100 ? `<text x="${c[0].toFixed(1)}" y="${c[1].toFixed(1)}">${esc(pl.rise)}/12</text>` : ''; }).join('');
    else if (satMode === 'edges') body = P.planes.map((pl, i) => poly(pl, i, '#fff', i === sel ? .25 : .02, ' stroke-opacity="0"')).join('') + P.planes.map((pl, i) => pl.edges.map(e => { const A = T(e.a), B = T(e.b), on = sel < 0 || i === sel; return `<line x1="${A[0].toFixed(1)}" y1="${A[1].toFixed(1)}" x2="${B[0].toFixed(1)}" y2="${B[1].toFixed(1)}" stroke="${e.col}" stroke-width="${on ? 3 : 1.5}" stroke-linecap="round" opacity="${on ? 1 : .45}" pointer-events="none"/>`; }).join('')).join('') + (sel >= 0 ? P.planes[sel].edges.filter(e => e.ft >= 6).map(e => { const A = T(e.a), B = T(e.b); return `<text x="${((A[0] + B[0]) / 2).toFixed(1)}" y="${((A[1] + B[1]) / 2).toFixed(1)}">${e.ft} ft</text>`; }).join('') : '');
    else if (satMode === 'hail') body = P.planes.map((pl, i) => poly(pl, i, pl.hit === 'heavy' ? '#E5484D' : pl.hit ? '#F5A3A5' : '#fff', pl.hit ? .5 : .04)).join('');
    else body = P.planes.map((pl, i) => poly(pl, i, '#fff', i === sel ? .25 : 0, i === sel ? '' : ' stroke-opacity="0"')).join('');
    ov.innerHTML = body;
    const seen = new Set(), cap = t => t[0].toUpperCase() + t.slice(1);
    lg.innerHTML = satMode === 'planes' ? (P.one ? `<span><i style="background:${P.planes[0].col}"></i>${esc(P.planes[0].rise)}/12, ${P.deg(P.planes[0].rise)}°. ${P.est ? 'One pitch for the whole roof (estimate)' : 'One pitch on every plane'}</span>` : P.bins.filter(b => P.planes.some(pl => pl.col === b.c)).map(b => `<span><i style="background:${b.c}"></i>${esc(b.t)}</span>`).join('') + (P.est ? '<span>Pitches estimated</span>' : ''))
      : satMode === 'edges' ? P.planes.flatMap(pl => pl.edges).filter(e => !seen.has(e.type) && seen.add(e.type)).map(e => `<span><i style="background:${e.col}"></i>${esc(cap(e.type))}</span>`).join('')
      : satMode === 'dims' ? '<span>Lengths in feet from the aerial scans, an estimate. Every plane is in the Measurements table.</span>'
      : `<span><i style="background:#E5484D"></i>Hail at this home${P.hail && P.hail.date ? ', ' + esc(P.hail.date) : ''}${P.hail && P.hail.size ? ', ' + esc(P.hail.size) : ''}</span><span>Radar does not say which slopes were hit; check every plane.</span>`;
    if (!overlay.busy) { overlay.busy = true; place(); overlay.busy = false; }   // the legend line can change the caption height: re-fit the stage so it never runs under the chips
    showCard();
  }
  function showCard() {
    const holder = aer.querySelector('.aer-ph'), card = holder && holder.querySelector('.aer-card'), svg = holder && (holder.querySelector('svg.ms-svg') || holder.querySelector('svg')); if (!card || !svg) return;
    const i = sel >= 0 ? sel : hov, F = i >= 0 ? fit(svg) : null, pl = F && F.P.planes[i];
    holder.querySelectorAll('.aer-ov .pl').forEach(p => p.classList.toggle('on', +p.dataset.i === sel));
    if (!pl) { card.hidden = true; return; }
    const r = pl.pts.map(F.T), vb = svg.viewBox.baseVal, k = svg.clientWidth / ((vb && vb.width) || svg.clientWidth || 1);
    const x = r.reduce((s, q) => s + q[0], 0) / r.length * k, y = Math.min(...r.map(q => q[1])) * k;
    card.innerHTML = `<div><b style="font-size:15px">${esc(pl.name)}</b><br>${esc(pl.rise)}/12${F.P.est ? ' est.' : ''}, ${F.P.deg(pl.rise)}°<br>${F.P.est ? '~' : ''}${pl.area.toLocaleString('en-US')} sq ft, ${pl.sq} sq</div>${F.P.slopeSVG(pl.rise, phone() ? 3 : 4)}`;
    card.hidden = false;
    const cw = card.offsetWidth / 2 + 4, ch = card.offsetHeight + 14;
    card.style.left = Math.max(cw, Math.min(svg.clientWidth - cw, x)) + 'px'; card.style.top = Math.max(ch, y) + 'px';
  }
  // the chips: capture phase, so on the photo they never reach the 3D view (its mode stays as it was) or rec.js's old tab jump
  document.addEventListener('click', e => {
    const c = e.target.closest('#chips .chip'); if (!c) return;
    if (c.id === 'bMeasure') { e.stopPropagation(); e.preventDefault(); setView(view === 'aerial' ? '3d' : 'aerial'); return; }
    if (view !== 'aerial' || !stage.classList.contains('aerial')) return;
    e.stopPropagation(); satMode = c.dataset.m || 'planes'; sel = -1; markChips(satMode, true); overlay();
  }, true);
  function setView(v) {
    const was = view; view = v;
    if (v === 'aerial' && was !== 'aerial') { const P = RP(); satMode = (P && P.mode) || 'planes'; sel = -1; hov = -1; }
    apply(); if (view === '3d') dispatchEvent(new Event('resize'));
  }
  function apply() {
    const on = has && view === 'aerial';
    setupChip();
    if (on) markChips(satMode, true); else { const P = RP(); if (P) markChips(P.mode, false); else { const b = bm(); if (b) { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); } } }
    stage.classList.toggle('aerial', on); seg.hidden = !has;
    seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.rv === (on ? 'aerial' : '3d'))));
    if (on) requestAnimationFrame(place); else stage.style.height = '';
  }
  function sync() {
    const svg = report.querySelector('.ms .ms-svg'), cr = report.querySelector('.ms .img-credit');
    has = !!(svg && svg.querySelector('image'));   // the photo drawing only (a passed model's line diagram has no photo)
    const html = has ? svg.outerHTML : '';
    if (html !== last) { last = html; drawn = '';
      aer.innerHTML = has ? `<div class="aer-ph"></div><div class="aer-cap"><span>The roof from above. <button type="button" class="aer-tog" aria-pressed="false">Show outline</button></span>${cr ? cr.outerHTML : ''}</div>` : '';
      userLine = false; aer.classList.remove('olonly'); aer.classList.add('noline'); }   // Jack 10-26: a clean photo, no lines drawn over the house; the outline is one tap away
    heading(); apply();
  }
  // the outline comes from public building maps and can sit a few feet off the roof: one tap shows the photo alone
  aer.addEventListener('click', e => { const b = e.target.closest('.aer-tog'); if (!b) { if (sel >= 0 && !e.target.closest('.aer-ov .pl')) { sel = -1; showCard(); } return; } userLine = !userLine;   // two states: false = normal view, true = yellow outline only (no pitch shading, labels or legend)
    aer.classList.toggle('olonly', userLine); aer.classList.toggle('noline', !userLine && satMode !== 'dims'); b.textContent = userLine ? 'Hide outline' : 'Show outline'; b.setAttribute('aria-pressed', String(userLine)); });
  seg.onclick = e => { const b = e.target.closest('[data-rv]'); if (!b) return; setView(b.dataset.rv); };
  new MutationObserver(sync).observe(report, { childList: true, subtree: true });
  addEventListener('resize', () => { if (stage.classList.contains('aerial')) place(); });
  sync();
})();
