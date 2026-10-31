/* score.js: the Opportunity Score (lib/opp-score.js v2) on Today, 10-29. Loaded after deck.html's own script and after
   nimbus-deck.js; wraps the deck's globals instead of editing them:
     pickHomes   Up next sorted by score (cadence follow-ups that are due stay first, then the highest score)
     cbHTML      every house card opens with a small score ring + confidence chip; the ring opens the breakdown
     renderQueue every Up next row carries its score on the right
   Nimbus: "why this house?" is answered with a card (ring, top reasons with evidence, Approve / Edit / Skip that call
   NimbusDeck.approve / skip, Full breakdown). The chat form is wrapped with a capture listener; the Nimbus files are not
   edited. The voice path (mic) goes through Nimbus's own handler and still answers in words. */
(function () {
  'use strict';
  if (!window.OPPC || typeof pickHomes !== 'function') return;
  const SC = new Map();   // home id -> score (resolved)
  let ready = false, refreshing = false;
  const giOf = h => h && h.gi != null && isFinite(+h.gi) ? +h.gi : null;

  // ---- 1. score today's homes, then re-sort Up next ----
  function scoreAll(list) {
    const todo = list.filter(h => giOf(h) != null && !SC.has(h.id));
    if (!todo.length) return Promise.resolve();
    return Promise.all(todo.map(h => OPPC.prime(giOf(h)).then(s => { if (s) SC.set(h.id, s); }))).then(() => { });
  }
  const origPick = pickHomes;
  pickHomes = function () {
    const l = origPick();
    if (!ready) return l;
    const due = h => h.pick && h.pick.reason === 'cadence' ? 0 : 1, sc = h => SC.has(h.id) ? SC.get(h.id).total : -1;
    l.sort((a, b) => due(a) - due(b) || sc(b) - sc(a) || a.n - b.n);
    l.forEach((h, i) => { h.n = i + 1; });
    return l;
  };
  function rebuild() {
    if (refreshing) return; refreshing = true;
    try {
      const keepId = (typeof HOMES !== 'undefined' && HOMES[cur]) ? HOMES[cur].id : null;
      buildList(); buildCards();
      const k = keepId ? HOMES.findIndex(h => h.id === keepId) : -1;
      if (typeof go === 'function') go(k >= 0 ? k : 0, false, true);
      if (typeof refreshAll === 'function') refreshAll();
    } catch (e) { } finally { refreshing = false; }
  }
  // wait for the list, score it, re-sort once; new homes added later are scored as they appear
  (function tick(n) {
    const l = typeof HOMES !== 'undefined' ? HOMES : [];
    if (!l.length) { if (n < 120) setTimeout(() => tick(n + 1), 500); return; }
    scoreAll(l).then(() => { ready = true; rebuild(); });
  })(0);

  // ---- 2. the card line ----
  const origCb = cbHTML;
  cbHTML = function (h, i) {
    const html = origCb(h, i), s = SC.get(h.id);
    if (!s) { const gi = giOf(h); if (gi != null) OPPC.prime(gi).then(v => { if (v) { SC.set(h.id, v); refreshCard(i); decorate(); } }); return html; }
    return `<div data-opc-addr="${String(h.addr || '').replace(/"/g, '&quot;')}">${OPPC.cardLine(s, giOf(h))}</div>` + html;
  };

  // ---- 3. the row chips ----
  function decorate() {
    const q = document.getElementById('qlist'); if (!q) return;
    q.querySelectorAll('.qrow[data-id]').forEach(row => {
      const s = SC.get(row.dataset.id); if (!s) return;
      const hz = row.querySelector('.hz'); if (!hz || hz.dataset.opc === String(s.total)) return;
      hz.dataset.opc = String(s.total);
      hz.innerHTML = `<span class="opc-sc ${OPPC.tone(s.total)}" style="flex-direction:column;align-items:flex-end;gap:0;line-height:1.15" title="Opportunity score ${s.total} of 100, ${s.confidence} confidence"><small style="font-size:10px;font-weight:600;opacity:.7">Score</small>${s.total}/100</span>`;
    });
  }
  const origRq = renderQueue;
  renderQueue = function (a) { origRq(a); decorate(); };

  // ---- 4. Nimbus: "why this house?" ----
  const WHY = /\b(why (this|that|the) (house|home|one)|why (is|does) .*(here|first|on the list|ranked)|why (him|her|them)|what('s| is) the score|why (the )?score|score\?)/i;
  function answerWhy() {
    const list = typeof HOMES !== 'undefined' ? HOMES : [], h = list[cur]; if (!h) return false;
    const msgs = document.getElementById('nbdMsgs'), bar = msgs && msgs.closest('.nbd'); if (!msgs) return false;
    const add = (who, html) => { const m = document.createElement('div'); m.className = 'nbd-m ' + who; m.innerHTML = '<b>' + (who === 'you' ? 'You' : 'Nimbus') + '</b><span>' + html + '</span>'; msgs.appendChild(m); (bar || msgs.parentNode.parentNode).classList.add('open'); msgs.parentNode.scrollTop = msgs.parentNode.scrollHeight; };
    const s = SC.get(h.id);
    add('you', 'Why this house?');
    if (!s) { add('him', 'I have no score for ' + (h.short || h.addr) + ' yet: it is not in the scored data on file.'); return true; }
    const ND = window.NimbusDeck || {}, p = ND.proposal ? ND.proposal() : { can: false };
    add('him', OPPC.whyCard(s, h.addr, { approve: !!(p.can && ND.approve), edit: !!(p.can && ND.approve), skip: !!ND.skip }));
    return true;
  }
  document.addEventListener('submit', e => {
    const f = e.target; if (!f || f.id !== 'nbdChat') return;
    const inp = f.querySelector('#nbdIn'), t = inp ? inp.value.trim() : '';
    if (!WHY.test(t)) return;
    e.preventDefault(); e.stopPropagation();
    inp.value = ''; answerWhy();
  }, true);
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-opc-act]'); if (!b) return;
    const card = b.closest('.opc-card'), gi = card ? +card.dataset.opcGi : null, ND = window.NimbusDeck || {};
    const act = b.dataset.opcAct;
    if (act === 'approve' && ND.approve) ND.approve(false);
    else if (act === 'edit' && ND.approve) ND.approve(true);
    else if (act === 'skip' && ND.skip) ND.skip();
    else if (act === 'breakdown') { const s = OPPC.peek(gi); const h = (typeof HOMES !== 'undefined' ? HOMES : []).find(x => giOf(x) === gi); if (s) OPPC.openBreakdown(s, h ? h.addr : ''); }
  });
})();
