/* opp-tips.js (loop 6, 10-30): small tooltips on the Opportunity Score ring and the confidence chip, placed with Floating UI
   (vendor/floating-ui@1.8.0, pinned). Hover or keyboard focus shows them; the tap still opens the full breakdown.
   Text comes only from the score that is already on the page (OPPC.peek + reasons, s.confWhy); nothing is made up.
   Needs lib/opp-cards.js and the two floating-ui UMD files before it. */
(function () {
  'use strict';
  const F = window.FloatingUIDOM;
  if (!F || !window.OPPC || window.__oppTips) return;
  window.__oppTips = true;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tip = document.createElement('div');
  tip.className = 'opt-tip'; tip.setAttribute('role', 'tooltip'); tip.id = 'opt-tip';
  tip.innerHTML = '<div class="opt-b"></div><i class="opt-a"></i>';
  document.body.appendChild(tip);
  const body = tip.firstChild, arrow = tip.lastChild;
  let cur = null, stop = null, hideT = 0;

  function scoreOf(el) {
    const w = el.closest('[data-opc-why]') || (el.closest('.opc-line') || el.parentElement || document).querySelector('[data-opc-why]');
    return w ? OPPC.peek(+w.dataset.opcWhy) : null;
  }
  function html(el) {
    const s = scoreOf(el); if (!s) return '';
    if (el.matches('.opc-conf')) return `<b>${esc(s.confidence)} confidence: why</b><p>${esc(s.confWhy)}</p>`;
    const rs = OPPC.reasons(s, 3).map(r => `<li><span>${esc(r.label)}</span><em>${r.pts} of ${r.max}</em></li>`).join('');
    return `<b>Score ${s.total}/100: what goes into it</b><ul>${rs}</ul><p class="opt-f">Tap for the full breakdown.</p>`;
  }
  function show(el) {
    const h = html(el); if (!h) return;
    clearTimeout(hideT);
    if (el.title) { el.dataset.optTitle = el.title; el.removeAttribute('title'); }   // no second, native tooltip on top
    body.innerHTML = h; cur = el; el.setAttribute('aria-describedby', 'opt-tip');
    tip.classList.add('on');
    if (stop) stop();
    stop = F.autoUpdate(el, tip, () => F.computePosition(el, tip, {
      placement: 'bottom-start', strategy: 'fixed',
      middleware: [F.offset(8), F.flip({ padding: 8 }), F.shift({ padding: 8 }), F.arrow({ element: arrow })]
    }).then(({ x, y, placement, middlewareData }) => {
      Object.assign(tip.style, { left: x + 'px', top: y + 'px' });
      const a = middlewareData.arrow || {}, side = placement.split('-')[0]; tip.dataset.s = side;
      Object.assign(arrow.style, { left: a.x != null ? a.x + 'px' : '', top: side === 'bottom' ? '-5px' : '', bottom: side === 'top' ? '-5px' : '' });
    }));
  }
  function hide() {
    tip.classList.remove('on');
    if (cur) { cur.removeAttribute('aria-describedby'); if (cur.dataset.optTitle) { cur.title = cur.dataset.optTitle; delete cur.dataset.optTitle; } }
    cur = null; if (stop) { stop(); stop = null; }
  }
  const SEL = '[data-opc-why],.opc-conf';
  const target = e => e.target && e.target.closest ? e.target.closest(SEL) : null;
  document.addEventListener('pointerover', e => { if (e.pointerType === 'touch') return; const t = target(e); if (t && t !== cur) show(t); });
  document.addEventListener('pointerout', e => { const t = target(e); if (t && t === cur && !t.contains(e.relatedTarget)) hideT = setTimeout(hide, 80); });
  document.addEventListener('focusin', e => { const t = target(e); if (t) show(t); });
  document.addEventListener('focusout', e => { if (target(e) === cur) hide(); });
  document.addEventListener('click', e => { if (target(e)) hide(); });   // the breakdown dialog opens
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && cur) hide(); });
  addEventListener('scroll', () => { if (cur && !cur.isConnected) hide(); }, true);
})();
