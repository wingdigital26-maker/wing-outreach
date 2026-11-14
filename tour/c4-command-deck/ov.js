/* ov.js: Today at a glance (app rules, 11-02). One dark hero (the most important number: homes left today), a side panel
   (the next three homes), then four mini dashboards. Reads only what deck.html already holds: HOMES, LEFT, TOTAL, THREADS,
   R.storm, stageCounts(), msgCounts(), go(). Nothing is sent, nothing is invented. Which four cards show is PROVISIONAL
   until Jack picks (APP-RULES section 7): swap entries in CARDS below, the renderer takes any four.
   Entrances run once; after that values tween in place every 2 s (keyed nodes, never rebuilt). */
(function(){
  const $ = s => document.querySelector(s);
  const ov = $('#ov'); if (!ov) return;
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  const fmt = n => (window.RC && RC.fmt) ? RC.fmt(n) : String(n);
  const esc = s => (window.RC && RC.esc) ? RC.esc(s) : String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const ICON = {
    list:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>',
    inbox:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v12H8l-4 4z"/></svg>',
    storm:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16a4 4 0 0 1-.8-7.9A5.5 5.5 0 0 1 17 8a3.5 3.5 0 0 1 1 7"/><path d="m13 11-2 4h3l-2 4"/></svg>',
    cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    hail:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/></svg>',
    roof:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12.5 12 5l9 7.5"/><path d="M6.5 11v8h11v-8"/></svg>',
    near:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M3 20a5 5 0 0 1 10 0M11 20a5 5 0 0 1 10 0"/></svg>'
  };
  const TONES = ['blue','navy','sky','black'];
  const safeStage = () => { try { return stageCounts(); } catch (e) { return {}; } };
  const safeMsg = () => { try { return msgCounts(); } catch (e) { return { sent:0, sch:0, togo:0 }; } };
  const stormN = () => { const h = (typeof R !== 'undefined' && R.storm && R.storm.homes) ? String(R.storm.homes).replace(/,/g,'') : '0'; return Number(h) || 0; };
  const storm075 = () => (window.RC && RC.facts && RC.facts.storm && RC.facts.storm.homes075) || 0;
  const pct = (a, b) => b > 0 ? Math.max(0, Math.min(100, Math.round(a / b * 100))) : 0;

  /* ---- the four cards (PROVISIONAL set; each returns {title, sub, pct, big, detail, l, r, fl, fr, go}) ---- */
  const CARDS = [
    { key:'list', icon:'list', title:"Today's list", go:()=>{ try { setTab('next'); } catch (e) {} },
      read(){ const m = safeMsg(), n = HOMES.length; return { sub: n ? n + ' homes picked for today' : 'No list yet', pct: pct(m.sent, n), big: fmt(LEFT) + ' left', detail: n ? m.sent + ' sent, ' + m.sch + ' set for later' : 'The list lands when the storm data loads',
        l: m.sent + ' of ' + n + ' sent', r: pct(m.sent, n) + '%', fl: n ? 'Home ' + (Math.min(cur + 1, n)) + ' of ' + n : 'No homes', fr: (typeof R !== 'undefined' && R.storm && R.storm.date) ? 'Newest storm ' + R.storm.date : 'Storm pending' }; } },   // 11-11: it is the newest storm, not this home's (a home hit Apr 27, or never, read "Storm Jun 2")
    { key:'inbox', icon:'inbox', title:'Inbox', noring:true, go:()=>{ try { setTab('inbox'); } catch (e) {} },
      read(){ const m = safeMsg(), n = HOMES.length, t = THREADS || 0; return { sub: t ? t + (t === 1 ? ' home wrote back' : ' homes wrote back') : 'Nothing waiting', pct: pct(t, Math.max(m.sent, 1)), big: t ? fmt(t) + ' waiting' : 'Clear', detail: t ? 'Replies to read and answer' : 'Replies to your texts and emails land here',
        l: t + ' of ' + m.sent + ' sent replied', r: pct(t, Math.max(m.sent, 1)) + '%', fl: m.sent ? m.sent + ' sent today' : 'None sent yet', fr: n ? n + ' on the list' : 'No list' }; } },
    { key:'storm', icon:'storm', title:'Newest storm', noring:true, go:()=>{ try { RC.go('storm', { iso: R.storm.iso }); } catch (e) {} },
      read(){ const n = stormN(), a = storm075(), st = (typeof R !== 'undefined' && R.storm) || {}; return { sub: st.date ? st.date + (st.county ? ', ' + st.county : '') : 'Loading', pct: a ? pct(n, a) : 0, big: n ? fmt(n) : 'No storm', detail: n ? 'Homes with 1 inch hail or larger' : 'The newest storm shows here',
        l: a ? fmt(n) + ' of ' + fmt(a) + ' at 0.75 in+' : 'Radar hail', r: a ? pct(n, a) + '%' : '', fl: st.max ? 'Max ' + st.max + ' in' : 'Max unknown', fr: UPD ? 'Updated ' + UPD : 'Open on Storms' }; } },
    { key:'booked', icon:'cal', title:'Inspections booked', noring:true, go:()=>{ try { document.getElementById('openPipe').click(); } catch (e) {} },
      read(){ const c = safeStage(), n = HOMES.length, b = c.inspection || 0, won = c.won || 0; return { sub: b ? b + (b === 1 ? ' from today\'s list' : ' from today\'s list') : 'None yet today', pct: pct(b, n), big: b ? fmt(b) + ' booked' : 'None yet', detail: b ? 'Homes that said yes to a look' : 'A booked inspection shows here',
        l: b + ' of ' + n + ' homes', r: pct(b, n) + '%', fl: won ? won + ' won' : '0 won', fr: 'Open the pipeline' }; } }
  ];

  /* ---- ring: r=32, circumference 201 ---- */
  const ring = () => '<svg class="ov-ring" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="32" fill="none" stroke="#e8eaee" stroke-width="6"/><circle class="ov-arc" cx="36" cy="36" r="32" fill="none" stroke="#1d5cf0" stroke-width="6" stroke-linecap="round" stroke-dasharray="201" stroke-dashoffset="201" transform="rotate(-90 36 36)"/></svg>';

  function cardHTML(c, i){
    return `<button type="button" class="ov-card${c.noring ? ' noring' : ''}" data-key="${c.key}" style="--i:${i}"><div class="ov-h"><span class="ov-tile ${TONES[i % 4]}">${ICON[c.icon]}</span><div class="ov-ht"><b>${esc(c.title)}</b><small data-f="sub"></small></div></div>` +
      `<div class="ov-k"><span class="ov-rw">${ring()}<i data-f="pct"></i></span><div class="ov-kt"><b data-f="big"></b><small data-f="detail"></small></div></div>` +
      `<div class="ov-p"><div class="ov-pl"><span data-f="l"></span><span data-f="r"></span></div><div class="ov-bar"><i data-f="bar"></i></div></div>` +
      `<div class="ov-f"><span data-f="fl"></span><span data-f="fr"></span></div></button>`;
  }
  function heroHTML(){
    return `<div class="ov-top"><div class="ov-av"><span class="blue">${ICON.hail}</span><span class="sky">${ICON.roof}</span><span class="navy">${ICON.near}</span></div><div class="ov-tt"><b>Next up</b><small data-f="ctx"></small></div>` +
      `<div class="ov-st"><div><small>Left today</small><b data-f="left"></b></div><div><small>Replies waiting</small><b data-f="inb"></b></div></div></div>` +
      `<div class="ov-bot"><small data-f="hlbl">Home 1 of 50</small><b class="ov-big ov-addr" data-f="addr"></b><span class="ov-q" data-f="q"></span>` +
      `<div class="ov-act"><button type="button" class="ov-go" data-f="go">Open this home</button><span class="ov-why" data-f="why"></span></div>` +
      `<div class="ov-split"><i class="s1" data-f="s1"></i><i class="s2" data-f="s2"></i><i class="s3" data-f="s3"></i></div>` +
      `<div class="ov-leg"><span><i class="s1"></i>Sent <b data-f="n1"></b></span><span><i class="s2"></i>Set for later <b data-f="n2"></b></span><span><i class="s3"></i>Left <b data-f="n3"></b></span></div></div>`;
  }
  function panelHTML(){ return `<div class="ov-ph"><b>Up next</b><small data-f="pn"></small></div><div class="ov-rows" data-f="rows"></div><button type="button" class="ov-more" data-f="more">Open the list</button>`; }

  /* ---- paint (first time draws nodes; after that only text, widths and offsets change) ---- */
  let built = false, lastRows = '', shown = {};
  const set = (root, f, v) => { const el = root.querySelector('[data-f="' + f + '"]'); if (el && el.textContent !== v) el.textContent = v; };
  function tweenNum(el, to, suffix){ const from = Number(el.dataset.v || 0); if (RM.matches || from === to) { el.textContent = fmt(to) + (suffix || ''); el.dataset.v = to; return; }
    const t0 = performance.now(); el.dataset.v = to; const step = t => { const k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(Math.round(from + (to - from) * e)) + (suffix || ''); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }
  // when the storm feed was last written (Jack 11-02: say when it was updated, never a live badge); re-read every 5 min
  let UPD = '';
  const agoText = ms => { const m = Math.round(ms / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  let feedAt = 0;
  function readFeed(){ fetch((window.rooferDataRoot ? rooferDataRoot() : RC.dataRoot) + 'latest-storm.json', { method: 'HEAD', cache: 'no-store' }).then(r => { const lm = r.headers.get('Last-Modified'); if (lm) feedAt = new Date(lm).getTime(); }).catch(() => {}); }
  setInterval(() => { if (feedAt) UPD = agoText(Date.now() - feedAt); }, 1000); readFeed(); setInterval(readFeed, 5 * 60 * 1000);
  function paint(){
    if (typeof HOMES === 'undefined' || !Array.isArray(HOMES)) return;
    const m = safeMsg(), n = HOMES.length, st = (typeof R !== 'undefined' && R.storm) || {};
    if (!built){
      built = true;
      $('#ovHero').innerHTML = heroHTML(); $('#ovPanel').innerHTML = panelHTML();
      $('#ovCards').innerHTML = CARDS.map(cardHTML).join('');
      $('#ovCards').querySelectorAll('.ov-card').forEach((b, i) => { b.addEventListener('click', () => CARDS[i].go()); });
      $('#ovHero').addEventListener('click', () => { try { const b = $('#ovHero [data-f="go"]'); if (b && b.onclick) b.onclick(new Event('click')); } catch (e) {} });
      ov.hidden = false; requestAnimationFrame(() => ov.classList.add('in'));
    }
    const hero = $('#ovHero');
    const nx = HOMES.map((h, i) => ({ h, i })).find(x => { try { return !isDone(x.h); } catch (e) { return false; } }) || (HOMES[cur] ? { h: HOMES[cur], i: cur } : null);
    const hh = nx && nx.h;
    // 11-11: the newest storm is named here only when this home's own hail is from it (a home hit in Mar 2025 read "after the Jun 2 storm")
    set(hero, 'ctx', n ? 'The home most likely to say yes right now' + (st.date && hh && hh.storm && hh.storm === st.iso ? ', hit by the ' + st.date + ' storm.' : '.') : 'The list lands when the storm data loads.');
    tweenNum(hero.querySelector('[data-f="left"]'), LEFT || 0); tweenNum(hero.querySelector('[data-f="inb"]'), THREADS || 0);
    set(hero, 'hlbl', hh ? 'Next up, home ' + (nx.i + 1) + ' of ' + n : 'No homes yet');
    set(hero, 'addr', hh ? String(hh.addr || 'Home') : 'Nothing to do');
    // 11-11: the same words as the card below. Roof first (the strongest reason), a roof age only where the card states one
    // ("likely" from the year built in a city with a full permit list, else unknown), then plain hail size with when it fell.
    const NOWY = new Date().getFullYear();
    const hsIso = hh && /^\d{4}-\d{2}-\d{2}$/.test(String(hh.storm || '')) ? hh.storm : '', hsD = hsIso ? new Date(hsIso + 'T12:00:00Z') : null;
    const hsWhen = !hsD ? '' : hsIso.slice(0, 4) === String(NOWY) ? ' on ' + hsD.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : ' in ' + hsD.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    const hailTxt = hh && Number(hh.hail) > 0 ? (window.RCPLAIN ? RCPLAIN.hail(hh.hail) : Number(hh.hail).toFixed(2) + ' in') + ' hail' + hsWhen : 'no hail on file';
    const fullList = !!(hh && window.RC && (RC.ROOF_COVERAGE || {})[String(hh.city || '').trim().toLowerCase()]);
    const roofTxt = hh ? (hh.permit ? 'roof ' + (NOWY - +String(hh.permit).slice(0, 4)) + ' yrs, permit on file' : (hh.year && fullList ? 'roof likely ~' + (NOWY - hh.year) + ' yrs' : 'roof age unknown')) : '';
    set(hero, 'q', hh ? [hh.city || '', roofTxt, hailTxt].filter(Boolean).join(', ') : (n ? 'Every home on the list is done for today' : 'No homes on the list yet'));
    set(hero, 'why', n ? m.sent + ' of ' + n + ' sent, ' + m.sch + ' set for later' : '');
    const goBtn = hero.querySelector('[data-f="go"]'); if (goBtn && !goBtn.onclick) goBtn.onclick = e => { e.stopPropagation(); try { if (nx) go(nx.i, true); document.getElementById('deck').scrollIntoView({ behavior: RM.matches ? 'auto' : 'smooth', block: 'start' }); } catch (err) {} };
    const left = Math.max(0, n - m.sent - m.sch), tot = Math.max(1, n);
    hero.querySelector('[data-f="s1"]').style.width = (m.sent / tot * 100) + '%'; hero.querySelector('[data-f="s2"]').style.width = (m.sch / tot * 100) + '%'; hero.querySelector('[data-f="s3"]').style.width = (left / tot * 100) + '%';
    set(hero, 'n1', m.sent + ' (' + pct(m.sent, n) + '%)'); set(hero, 'n2', m.sch + ' (' + pct(m.sch, n) + '%)'); set(hero, 'n3', left + ' (' + pct(left, n) + '%)');
    /* the panel: the next three homes not yet done */
    const panel = $('#ovPanel'); const next = HOMES.map((h, i) => ({ h, i })).filter(x => { try { return !isDone(x.h); } catch (e) { return true; } }).slice(0, 3);
    set(panel, 'pn', n ? LEFT + ' left today' : '');
    const rows = next.map(x => `<button type="button" class="ov-r" data-i="${x.i}"><span class="ov-no">${x.i + 1}</span><span class="ov-ra"><b>${esc(x.h.addr || x.h.address || x.h.a || 'Home')}</b><small>${esc(x.h.city || '')}${Number(x.h.hail) > 0 ? (x.h.city ? ', ' : '') + (window.RCPLAIN ? RCPLAIN.hail(x.h.hail) : Number(x.h.hail).toFixed(2) + ' in') + ' hail' : ''}</small></span></button>`).join('') || '<div class="ov-empty">Every home on the list is done for today.</div>';
    if (rows !== lastRows){ lastRows = rows; const host = panel.querySelector('[data-f="rows"]'); host.innerHTML = rows; host.querySelectorAll('.ov-r').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); try { go(+b.dataset.i, true); document.getElementById('deck').scrollIntoView({ behavior: RM.matches ? 'auto' : 'smooth', block: 'start' }); } catch (err) {} })); }
    const more = panel.querySelector('[data-f="more"]'); if (more && !more.onclick) more.onclick = () => { try { setTab('next'); document.getElementById('lpanel').scrollIntoView({ behavior: RM.matches ? 'auto' : 'smooth', block: 'start' }); } catch (e) {} };
    /* the cards */
    $('#ovCards').querySelectorAll('.ov-card').forEach((el, i) => { const d = CARDS[i].read();
      set(el, 'sub', d.sub); set(el, 'big', d.big); set(el, 'detail', d.detail); set(el, 'l', d.l); set(el, 'r', d.r); set(el, 'fl', d.fl); set(el, 'fr', d.fr);
      const p = el.querySelector('[data-f="pct"]'); tweenNum(p, d.pct, '%');
      el.querySelector('.ov-arc').style.strokeDashoffset = String(201 - 201 * d.pct / 100);
      el.querySelector('[data-f="bar"]').style.width = d.pct + '%'; });
    const sub = document.getElementById('pgSub'); if (sub) sub.textContent = n ? n + ' homes on the list' + (st.date ? ', newest storm ' + st.date : '') : 'Loading the list';
  }
  /* first paint once the queue is built (HOMES filled), then every 2 s in place */
  const tick = () => { try { paint(); } catch (e) {} };
  if (window.RC && RC.queueReady) RC.queueReady.then(() => setTimeout(tick, 50)); else setTimeout(tick, 800);
  setInterval(tick, 2000);
  window.OV = { CARDS, paint };
})();
