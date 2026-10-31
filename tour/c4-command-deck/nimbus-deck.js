/* nimbus-deck.js: Nimbus sells for you, front and center on Today (Wing Outreach, Jack 10-29).
   - PROPOSES: reads the home on the card (deck.html's HOMES / cur, the same list Up next shows) and says the one next sale
     action in plain words: "Text the Merribrook Ln owner about the 1 inch hail? Draft ready."
   - ONE TAP: Approve opens that draft in the app's own Text / Email dialog (deck.html textDlg / emailDlg, the words the
     record keeps); Edit opens it with the words selected; Skip moves to the next open home. Keys: A approve, E edit, S skip.
   - CHAT / VOICE: type or hold the mic (the browser's own speech recognition, free). He answers from the data on screen:
     next, why, how many left, text <address>, email <address>, skip, storms, pipeline, map, homes. When the shell's full
     brain (lib/nimbus-brain.js) is loaded he hands the turn to it instead.
   - DRAFTS ONLY: nothing here sends. A text or email opens as a draft and a person taps Send in Messages or Mail.
   Plain script, loaded last on deck.html after the inline app. Reuses lib/wing-mascot.js for the orb when present. */
(function () {
  'use strict';
  if (window.NimbusDeck) return;
  const RC = window.RC, DK = window.DK, I = (DK && DK.I) || {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PHONE = matchMedia('(max-width:640px)').matches;
  const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const SEND = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
  const PEN = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"/></svg>';
  const RECOG = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  // ---------- the app's own state, read live (bare globals of deck.html's inline script; every read is guarded) ----------
  const g = f => { try { return f(); } catch (e) { return undefined; } };
  const homes = () => g(() => HOMES) || [];
  const curIdx = () => g(() => cur) | 0;
  const done = h => !!g(() => isDone(h));
  function nextHome() {
    const H = homes(); if (!H.length) return null;
    const i = curIdx(), h = H[i];
    if (h && !done(h)) return { h, i };
    const n = g(() => nextOpen(i)); if (n >= 0 && H[n]) return { h: H[n], i: n };
    return null;
  }
  const draft = (h, ch) => g(() => draftFor(h, ch)) || {};
  const hailWord = h => { const v = parseFloat(h.hail); if (!isFinite(v) || v <= 0) return ''; return (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2).replace(/0+$/, '')) + ' inch hail'; };
  const whyText = () => { const w = document.querySelector('.card[data-d="0"] .why'); return w ? w.textContent.replace(/^Why today:\s*/, '').trim() : ''; };
  const stormDate = () => g(() => { const iso = R.storm.iso; return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); }) || '';
  const left = () => g(() => LEFT), total = () => g(() => TOTAL);
  const findHome = q => { const n = String(q || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); if (!n) return -1;
    const H = homes(); let k = H.findIndex(h => (h.addr || '').toLowerCase().indexOf(n) >= 0 || (h.short || '').toLowerCase().indexOf(n) >= 0);
    if (k < 0) { const num = n.match(/^\d+$/); if (num) k = H.findIndex(h => h.n === +num[0]); }
    if (k < 0) { const w = n.split(' ').filter(x => x.length > 2); if (w.length) k = H.findIndex(h => w.every(x => (h.addr || '').toLowerCase().indexOf(x) >= 0)); }
    return k; };

  // ---------- the proposal: one sentence, one draft line, three buttons ----------
  function proposal() {
    const nh = nextHome();
    if (!homes().length) return { ask: 'Loading today\'s homes.', draft: '', can: false };
    if (!nh) return { ask: 'Every home on today\'s list is reached or skipped. Nice work.', draft: '', can: false, allDone: true };
    const h = nh.h, t = draft(h, 'text'), ch = t.useChannel === 'email' ? 'email' : 'text', r = ch === 'email' ? draft(h, 'email') : t;
    const who = h.short || h.addr, hail = hailWord(h), why = whyText();
    const about = hail ? ' about the ' + hail : why ? ' about the storm' : '';
    const verb = ch === 'email' ? 'Email' : 'Text';
    const flat = s => String(s || '').replace(/\s+/g, ' ').trim();
    if (ch === 'text' && !h.phone) return { h, i: nh.i, ch, ask: 'No phone yet for <b>' + esc(who) + '</b>. Email the owner' + esc(about) + ' instead?', draft: flat(draft(h, 'email').body), can: true, alt: 'email' };
    if (!r.body) return { h, i: nh.i, ch, ask: verb + ' the <b>' + esc(who) + '</b> owner?', draft: r.blocked || 'No draft is open for this home right now.', can: false };
    const dayN = r.dayN && r.dayN > 1 ? ' (day ' + r.dayN + ' follow-up)' : '';
    return { h, i: nh.i, ch, ask: verb + ' the <b>' + esc(who) + '</b> owner' + esc(about) + '?' + dayN + ' Draft ready.', draft: flat(r.body), can: true };
  }
  function approve(edit) {
    const p = proposal(); if (!p.h || !p.can) { if (p.allDone) say('Nothing left to send today. Tomorrow\'s list builds overnight.'); return; }
    if (p.i !== curIdx()) g(() => go(p.i, true));
    const ch = p.alt || p.ch;
    g(() => ch === 'email' ? emailDlg(p.h) : textDlg(p.h));
    if (edit) setTimeout(() => { const ta = document.querySelector('#dlg textarea'); if (ta) { ta.focus(); ta.select(); } }, 120);
  }
  function skip() {
    const p = proposal(); if (!p.h) return;
    const n = g(() => nextOpen(p.i)); if (n >= 0 && n !== p.i) { g(() => go(n, true)); say('Skipped ' + p.h.short + ' for now. Next up: ' + (homes()[n] || {}).short + '.'); }
    else say('That is the last open home today.');
  }

  // ---------- the bar ----------
  let bar, askEl, draftEl, goBtn, editBtn, skipBtn, input, micBtn, thread, orbEl, mascot = null, spoken = false;
  function build() {
    const head = document.querySelector('.app > .head'), main = document.querySelector('.app > .main'); if (!head || !main) return;
    bar = document.createElement('section'); bar.className = 'nbd'; bar.id = 'nimbusBar'; bar.setAttribute('aria-label', 'Nimbus, your assistant');
    bar.innerHTML = '<div class="nbd-row">' +
      '<button type="button" class="nbd-orb" id="nbdOrb" aria-label="Talk to Nimbus"><span class="nbd-fallback"></span></button>' +
      '<div class="nbd-say"><div class="nbd-eyebrow">Nimbus suggests<i>Wing Outreach</i></div><div class="nbd-ask" id="nbdAsk" aria-live="polite"></div><div class="nbd-draft" id="nbdDraft"></div></div>' +
      '<div class="nbd-acts"><button type="button" class="nbd-go" id="nbdGo"><span class="ic">' + (I.check || '') + '</span>Approve<kbd>A</kbd></button>' +
      '<button type="button" id="nbdEdit"><span class="ic">' + PEN + '</span>Edit<kbd>E</kbd></button>' +
      '<button type="button" id="nbdSkip"><span class="ic">' + (I.skip || '') + '</span>Skip<kbd>S</kbd></button></div>' +
      '<form class="nbd-chat" id="nbdChat" autocomplete="off"><input id="nbdIn" type="text" placeholder="' + (PHONE ? 'Ask Nimbus' : 'Ask Nimbus, or tell him what to do') + '" aria-label="Ask Nimbus">' +
      '<button type="button" class="nbd-mic" id="nbdMic" aria-label="Talk to Nimbus" aria-pressed="false"' + (RECOG ? '' : ' hidden') + '>' + MIC + '</button>' +
      '<button type="submit" class="nbd-send" aria-label="Send to Nimbus">' + SEND + '</button></form></div>' +
      '<div class="nbd-thread" id="nbdThread" aria-live="polite"><button type="button" class="nbd-x" id="nbdX" aria-label="Close the chat">' + (I.close || 'x') + '</button><div id="nbdMsgs"></div></div>';
    head.after(bar);
    askEl = bar.querySelector('#nbdAsk'); draftEl = bar.querySelector('#nbdDraft'); goBtn = bar.querySelector('#nbdGo'); editBtn = bar.querySelector('#nbdEdit'); skipBtn = bar.querySelector('#nbdSkip');
    input = bar.querySelector('#nbdIn'); micBtn = bar.querySelector('#nbdMic'); thread = bar.querySelector('#nbdMsgs'); bar.querySelector('#nbdX').onclick = () => bar.classList.remove('open'); orbEl = bar.querySelector('#nbdOrb');
    if (window.WingMascot && WingMascot.mount) { try { orbEl.innerHTML = ''; mascot = WingMascot.mount(orbEl, { size: 56 }); } catch (e) { orbEl.innerHTML = '<span class="nbd-fallback"></span>'; mascot = null; } }
    goBtn.onclick = () => approve(false); editBtn.onclick = () => approve(true); skipBtn.onclick = skip;
    orbEl.onclick = () => { if (PHONE) { bar.classList.toggle('chat'); if (bar.classList.contains('chat')) input.focus(); return; } if (RECOG) listen(); else input.focus(); };
    bar.querySelector('#nbdChat').onsubmit = e => { e.preventDefault(); const t = input.value.trim(); if (!t) return; input.value = ''; spoken = false; turn(t); };
    if (RECOG) micBtn.onclick = listen;
    document.addEventListener('keydown', e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return; const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); const dlg = document.getElementById('dlg');
      if (typing || (dlg && dlg.open)) return;
      if (e.key === 'Escape') { bar.classList.remove('open'); return; }
      const k = e.key.toLowerCase(); if (k === 'a') { e.preventDefault(); approve(false); } else if (k === 'e') { e.preventDefault(); approve(true); } else if (k === 's') { e.preventDefault(); skip(); } else if (k === '/') { e.preventDefault(); input.focus(); }
    });
    paint();
  }
  function paint() {
    if (!bar) return; const p = proposal();
    askEl.innerHTML = p.ask; draftEl.textContent = p.draft || ''; draftEl.hidden = !p.draft;
    goBtn.disabled = !p.can; editBtn.disabled = !p.can; skipBtn.disabled = !p.h;
    goBtn.lastChild.previousSibling.textContent = p.alt === 'email' ? 'Email instead' : 'Approve';
    bar.classList.toggle('done', !!p.allDone);
  }
  let paintT = 0; const repaint = () => { clearTimeout(paintT); paintT = setTimeout(paint, 120); };

  // ---------- chat: his answers come from what is on screen ----------
  function add(who, html) { const m = document.createElement('div'); m.className = 'nbd-m ' + (who === 'you' ? 'you' : 'him'); m.innerHTML = '<b>' + (who === 'you' ? 'You' : 'Nimbus') + '</b><span>' + html + '</span>'; thread.appendChild(m); bar.classList.add('open'); thread.parentNode.scrollTop = thread.parentNode.scrollHeight; return m; }
  function say(text, html) { add('him', html || esc(text)); if (spoken && window.speechSynthesis) { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 1.03; speechSynthesis.speak(u); } catch (e) { } } if (mascot && mascot.setState) { try { mascot.setState('talk'); setTimeout(() => mascot.setState('idle'), 1800); } catch (e) { } } }
  const shellHref = hash => '../product.html' + hash;
  const link = (label, hash) => '<a href="' + esc(shellHref(hash)) + '">' + esc(label) + '</a>';
  function turn(text) {
    add('you', esc(text));
    const t = text.toLowerCase().trim();
    if (window.NimbusBrain && NimbusBrain.think && window.NimbusTools) { return NimbusBrain.think(text, null).then(r => { say(r && r.say || 'Done.'); }).catch(() => local(t, text)); }
    local(t, text);
  }
  function local(t, raw) {
    const p = proposal(), who = p.h ? p.h.short : '';
    const addrOf = s => s.replace(/^(text|email|message|draft|open|show|go to|skip)\s+(the\s+)?/, '').replace(/\s+(owner|home|house|please)$/, '').trim();
    // the morning questions go to the shell's Nimbus (lib/nimbus-data.js call_today): top homes by score, with the reason
    const PT = window.parent !== window && window.parent.NimbusTools;
    if (PT && PT.T.call_today && (/\b(who|which|what) (homes |houses |people |ones )?(do|should|can) i (call|text|reach|contact)\b|\bcall (list|today|first)\b/.test(t) || /\bhow many\b.*\b(hit|hailed)\b/.test(t) || /^(so |ok )?what'?s next\b|^what now\b/.test(t)))
      return PT.run('call_today', { ask: /\bhow many\b/.test(t) ? 'hit' : /next|now/.test(t) && !/call/.test(t) ? 'next' : 'call' }).then(r => say(r && r.say || 'Done.'));
    if (/^(hi|hello|hey|yo)\b/.test(t)) return say('Hi. I watch the storms and the homes, and I draft the next message for you. Say "next", "why", or "text 1208 Lassen".');
    if (/\b(next|what now|what should i do|who.*next|up next)\b/.test(t)) return say(p.ask.replace(/<[^>]+>/g, '') + (p.can ? ' Tap Approve or say "approve".' : ''), p.ask + (p.can ? ' <button type="button" data-nbd="approve">Open the draft</button>' : ''));
    if (/\b(approve|yes|do it|send it|go ahead|open the draft|draft it)\b/.test(t)) { approve(false); return say(p.can ? 'Opening the ' + p.ch + ' draft for ' + who + '. You tap Send; I never send on my own.' : 'There is no draft to open right now.'); }
    if (/\b(edit|change the words|rewrite)\b/.test(t)) { approve(true); return say('Draft open with the words selected. Change what you like, then Send.'); }
    if (/^skip\b|\bskip (this|it|him|her)\b/.test(t)) { skip(); return; }
    if (/\bwhy\b/.test(t)) { const w = whyText(); return say(w ? who + ' is on the list because: ' + w : 'Open a home and I will tell you why it is on the list.'); }
    if (/\b(how many|left|remaining|progress)\b/.test(t)) { const l = left(), n = total(); return say(isFinite(l) && isFinite(n) ? l + ' of ' + n + ' homes still to reach today.' : 'The list is still loading.'); }
    if (/\b(storm|hail|weather)\b/.test(t) && !/\btext|email\b/.test(t)) return say('Newest storm on file: ' + stormDate() + '. The Storms map shows every home it hit.', 'Newest storm on file: ' + esc(stormDate()) + '. ' + link('Open Storms', '#/storm') + '.');
    if (/\bpipeline\b/.test(t)) return say('Opening the pipeline.', link('Open the pipeline', '#/crm/pipeline') + '.');
    if (/\b(inbox|replies|replied)\b/.test(t)) { g(() => setTab('inbox', true)); return say('Inbox is open on the left.'); }
    if (/\bmap\b/.test(t)) { if (!PHONE) g(() => setBig(true)); else g(() => openSheet('route')); return say('Here is the map of today\'s homes.'); }
    if (/\b(homes|crm|records|customers)\b/.test(t)) return say('Opening the homes.', link('Open the homes', '#/crm') + '.');
    const m = t.match(/^(text|email|message|draft|open|show|go to)\b(.*)/);
    if (m) {
      const k = findHome(addrOf(t)); if (k < 0) return say('I do not see that address on today\'s list. Say the street name as it appears in Up next, or its number.');
      const h = homes()[k]; g(() => go(k, true));
      if (/^(text|message|draft)/.test(t)) { if (!h.phone) return say('No phone on file for ' + h.short + '. I can email the owner instead: say "email ' + h.short + '".'); g(() => textDlg(h)); return say('Text draft for ' + h.short + ' is open. Tap Send when it reads right.'); }
      if (/^email/.test(t)) { g(() => emailDlg(h)); return say('Email draft for ' + h.short + ' is open. Open in Mail sends it from your account.'); }
      return say(h.short + ' is on the card now. Say "text" or "email" to draft the message.');
    }
    const k = findHome(t); if (k >= 0) { g(() => go(k, true)); return say(homes()[k].short + ' is on the card. Say "text" or "email" to draft the message.'); }
    say('I can draft the next text or email, pick a home by its address, explain why it is on the list, count what is left, and open the map, pipeline, homes or storms. Try "text ' + (who || 'an address') + '".');
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-nbd]'); if (!b) return; if (b.dataset.nbd === 'approve') approve(false); });

  // ---------- voice in: the browser's own recognition, free. Tap to listen, it stops when you stop. ----------
  let rec = null, listening = false;
  function listen() {
    if (!RECOG) return input.focus();
    if (listening) { try { rec.stop(); } catch (e) { } return; }
    rec = new RECOG(); rec.lang = 'en-US'; rec.interimResults = true; rec.maxAlternatives = 1;
    const on = v => { listening = v; micBtn.classList.toggle('on', v); micBtn.setAttribute('aria-pressed', v ? 'true' : 'false'); orbEl.classList.toggle('talk', v); if (mascot && mascot.setState) { try { mascot.setState(v ? 'listen' : 'idle'); } catch (e) { } } };
    let final = '';
    rec.onresult = ev => { let s = ''; for (let i = ev.resultIndex; i < ev.results.length; i++) { s += ev.results[i][0].transcript; if (ev.results[i].isFinal) final += ev.results[i][0].transcript; } input.value = (final || s).trim(); };
    rec.onend = () => { on(false); const t = (final || input.value).trim(); if (t) { input.value = ''; spoken = true; turn(t); } };
    rec.onerror = () => { on(false); if (!final) say('I could not hear that. Type it instead.'); };
    try { rec.start(); on(true); input.placeholder = 'Listening'; } catch (e) { on(false); input.focus(); }
  }

  // ---------- keep in step with the card (go(), refreshAll(), a sent draft) ----------
  function watch() {
    const deck = document.getElementById('deck'); if (!deck) return;
    new MutationObserver(repaint).observe(deck, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-d', 'class'] });
    const dlg = document.getElementById('dlg'); if (dlg) dlg.addEventListener('close', repaint);
    window.addEventListener('rc:refresh', repaint);
  }
  function start() { build(); watch(); let n = 0; const tick = setInterval(() => { paint(); if (homes().length || ++n > 40) clearInterval(tick); }, 500); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.NimbusDeck = { proposal, approve, skip, say: text => say(text), repaint };
})();
