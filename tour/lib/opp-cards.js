/* opp-cards.js: the Opportunity Score (lib/opp-score.js, lib/opp-data.js) on the app's own cards (window.OPPC), 10-29.
   One cache per page: OPPC.get(gi) -> Promise<score | null>. Markup: a small ring + confidence chip, a breakdown dialog
   (points per category with the evidence behind each), and the "why this house" card Nimbus answers with.
   DESIGN-RULES.md: quiet, hairline, green only for a high score (70+); nothing invented, a home with no score shows none. */
(function () {
  'use strict';
  if (window.OPPC) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ORDER = ['roofAge', 'hail', 'wind', 'neighbors', 'jobValue', 'purchase', 'material', 'owner'];
  const cache = new Map();
  const HIGH = 70;

  function get(gi) {
    if (gi == null || !isFinite(+gi)) return Promise.resolve(null);
    gi = +gi;
    if (cache.has(gi)) return cache.get(gi);
    const p = (window.OPPD && window.OPP ? OPPD.home(gi).then(h => OPP.score(h)) : Promise.resolve(null)).catch(() => null);
    cache.set(gi, p); return p;
  }
  const peek = gi => { const p = cache.get(+gi); return p && p.__v !== undefined ? p.__v : null; };
  // resolve once and keep the value on the promise, so synchronous renders (rows, cards) can read it
  function prime(gi) { const p = get(gi); if (p.__v === undefined) { p.__v = null; p.then(v => { p.__v = v; }); } return p; }

  const tone = v => v >= HIGH ? 'hi' : v >= 45 ? 'mid' : 'lo';
  function ring(v, size, label) {
    size = size || 40; const r = size / 2 - 3.5, c = 2 * Math.PI * r, f = Math.max(0, Math.min(100, v)) / 100;
    return `<span class="opc-ring ${tone(v)}" style="--s:${size}px" role="img" aria-label="${esc(label || 'Opportunity score ' + v + ' of 100')}"><svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}"/><circle class="v" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg><b>${v}</b></span>`;
  }
  const conf = s => `<span class="opc-conf ${s.confidence}" tabindex="0" title="${esc(s.confWhy)}">${s.confidence} confidence</span>`;

  // the strongest categories first, one evidence line each
  function reasons(s, n) {
    return ORDER.map(k => s.parts[k]).filter(p => p && p.max > 0).sort((a, b) => b.pts - a.pts).slice(0, n || 3)
      .map(p => ({ label: p.label, pts: p.pts, max: p.max, line: p.lines[0] || '', estimated: !!p.estimated }));
  }

  function breakdownHTML(s, addr) {
    const rows = ORDER.map(k => s.parts[k]).filter(Boolean).map(p => {
      const w = p.max ? Math.round(100 * p.pts / p.max) : 0;
      return `<div class="opc-row${p.max ? '' : ' slot'}"><span class="k">${esc(p.label)}</span><span class="bar"><i style="width:${w}%"></i></span><span class="p">${p.max ? p.pts + ' / ' + p.max : 'not loaded'}</span>
        <div class="ev">${p.lines.map(esc).join(' ')}${p.estimated && p.max ? ' <em>Estimated.</em>' : ''}</div></div>`;
    }).join('');
    return `<div class="opc-bd"><div class="opc-bdh">${ring(s.total, 56)}<div><h3>${esc(addr || 'This home')}</h3><p>Opportunity score ${s.total} of 100. ${conf(s)}</p></div><button type="button" class="opc-x" data-opc-close aria-label="Close">&times;</button></div>
      <div class="opc-rows">${rows}</div><p class="opc-foot">${esc(s.confWhy)} Weights and rules: SCORING.md.</p></div>`;
  }
  let dlg = null;
  function openBreakdown(s, addr) {
    if (!dlg) { dlg = document.createElement('dialog'); dlg.className = 'opc-dlg'; document.body.appendChild(dlg); dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-opc-close]')) dlg.close(); }); }
    dlg.innerHTML = breakdownHTML(s, addr);
    try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); }
  }

  // the card line on a house card: ring, label, confidence, "Why" button (data-opc-why opens the breakdown)
  function cardLine(s, gi) {
    return `<div class="opc-line"><button type="button" class="opc-why" data-opc-why="${gi}" title="Why this score">${ring(s.total, 36)}<span><b>Score ${s.total}/100</b><small>${s.total >= HIGH ? 'Strong lead' : s.total >= 45 ? 'Worth a message' : 'Lower priority'}</small></span></button>${conf(s)}</div>`;
  }

  // Nimbus's "why this house" answer: ring, top reasons with evidence, real actions only (approve / edit / skip / breakdown)
  function whyCard(s, addr, actions) {
    const rs = reasons(s, 3).map(r => `<li><b>${esc(r.label)}</b> <span>${r.pts} of ${r.max}</span><p>${esc(r.line)}${r.estimated ? ' <em>Estimated.</em>' : ''}</p></li>`).join('');
    const btn = (k, l, cls) => actions && actions[k] ? `<button type="button" class="opc-b ${cls || ''}" data-opc-act="${k}">${l}</button>` : '';
    return `<div class="opc-card" data-opc-gi="${s.gi}"><div class="opc-ch">${ring(s.total, 44)}<div><b>${esc(addr || 'This home')}</b><small>Score ${s.total} of 100. ${conf(s)}</small></div></div>
      <ol class="opc-rs">${rs}</ol>
      <div class="opc-acts">${btn('approve', 'Approve', 'pri')}${btn('edit', 'Edit')}${btn('skip', 'Skip')}<button type="button" class="opc-b" data-opc-act="breakdown">Full breakdown</button></div></div>`;
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-opc-why]'); if (!b) return;
    const gi = +b.dataset.opcWhy, s = peek(gi); if (!s) return;
    openBreakdown(s, b.dataset.opcAddr || (b.closest('[data-opc-addr]') || {}).dataset && b.closest('[data-opc-addr]').dataset.opcAddr || '');
  });

  window.OPPC = { get, prime, peek, ring, conf, reasons, cardLine, whyCard, breakdownHTML, openBreakdown, HIGH, tone };
})();
