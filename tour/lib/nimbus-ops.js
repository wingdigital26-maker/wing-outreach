/* nimbus-ops.js: Nimbus v3, "he runs it for them" (Jack 10-29: the client logs in, talks to Nimbus, and Nimbus actually changes
   the software and what is running). More tools in NimbusTools.T, over the roofer's DATA and RUNNING JOBS:
     move_stage        one home (on screen or by address) to a pipeline stage, or Not now
     bulk_move         every home matching a stage and/or street/city words to another stage ("park everyone in Frisco")
     add_note          a note on a home's history
     pause_followups   stop the follow-up cadence for one home, a city, or everyone, for N days or until resumed
     resume_followups  the reverse
     jobs              what is running right now: cloud sending on/off, follow-ups due today, paused homes, route, briefing
     automation        flip the cloud sending switch (the owner still confirms the dialog; signed out = says it is not connected)
     display           make the app bigger or smaller for this roofer (text size), kept per roofer
   Same rules as nimbus-tools.js: every write has Undo, nothing sends, no names or phones in say/data.
   Pausing: p.paused = { at, until|null } on the pipeline record; lib/rc-queue.js stoppedWhy reads it ('paused').
   NimbusBrain.think is wrapped so the built-in brain hears these too; the Claude brain gets them from NimbusTools.schemas().
   Plain script, shell only, after nimbus-data.js and nimbus-brain.js. window.NimbusOps. */
(function () {
  'use strict';
  if (!window.NimbusTools || !window.RC || window.NimbusOps) return;
  const RC = window.RC, Tools = window.NimbusTools, T = Tools.T, DAY = 864e5;
  const obj = (props, req) => ({ type: 'object', properties: props || {}, required: req || [], additionalProperties: false });
  const short = a => String(a || '').split(',')[0].trim();
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const addrOf = id => { const r = RC.recall(id) || {}, d = Tools.dailyList().find(x => x.id === id); return short((d && d.address) || r.addr || '') || 'a home on file'; };
  const cityOf = id => { const r = RC.recall(id) || {}, d = Tools.dailyList().find(x => x.id === id); return String((d && d.city) || r.city || ''); };
  const pipe = () => RC.__get('pipe', {}) || {};
  const savePipe = p => RC.__set('pipe', p);
  const snap = (p, ids) => ids.map(id => [id, p[id] ? JSON.parse(JSON.stringify(p[id])) : null]);
  const restore = s => { const p = pipe(); s.forEach(([id, v]) => { if (v) p[id] = v; else delete p[id]; }); savePipe(p); redraw(); };
  function redraw() { ['daily', 'home'].forEach(s => { const w = Tools.win(s); try { if (w && w.RC && w.RC.refresh) w.RC.refresh(); else if (w) w.dispatchEvent(new Event('rc-changed')); } catch (e) { } }); }

  // a stage from plain words: "inspection", "won", "sent to chris", "contacted", "not now"
  function stageOf(words) {
    const w = String(words || '').toLowerCase().trim();
    if (!w) return null;
    if (/not now|park|archiv|dead|lost|not interested/.test(w)) return { key: 'notnow', name: 'Not now' };
    if (/^(new|new hit|fresh)$/.test(w)) return { key: 'new', name: RC.stageName('new') };
    if (/contact|called|reached|texted/.test(w)) return { key: 'called', name: RC.stageName('called') };
    const s = RC.STAGES.slice().sort((a, b) => b[1].length - a[1].length).find(s => w.indexOf(s[1].toLowerCase()) >= 0 || w === s[0] || (w.length > 3 && s[1].toLowerCase().indexOf(w) >= 0));
    return s ? { key: s[0], name: s[1] } : null;
  }
  // a home by address words: the pipeline first, then today's list, then the home on screen
  async function homeFor(q) {
    if (!q) { const id = Tools.currentHome(); return id ? { id, label: addrOf(id) } : null; }
    const w = String(q).toLowerCase().split(/\s+/).filter(x => x.length > 1);
    const hit = id => { const a = (addrOf(id) + ' ' + cityOf(id)).toLowerCase(); return w.every(x => a.indexOf(x) >= 0); };
    let id = Object.keys(pipe()).find(hit) || (Tools.dailyList().find(x => hit(x.id)) || {}).id;
    if (!id && window.STM && STM.search) { const r = await STM.search(q, 3); if (r && r.length) id = 'm' + r[0].i; }
    return id ? { id, label: addrOf(id) } : null;
  }
  // every home matching a stage and/or words (street or city); words 'everyone' / 'all' = no filter
  function matching(stage, words) {
    const p = pipe(), st = stage ? stageOf(stage) : null;
    const w = String(words || '').toLowerCase().replace(/\b(everyone|everybody|all|homes?|houses?|in|on|the|of)\b/g, ' ').split(/\s+/).filter(x => x.length > 2);
    const ids = new Set(Object.keys(p));
    Tools.dailyList().forEach(x => ids.add(x.id));
    return [...ids].filter(id => {
      const r = p[id];
      if (st) { if (st.key === 'notnow') { if (!(r && r.archived)) return false; } else if ((r ? r.stage : 'new') !== st.key || (r && r.archived)) return false; }
      const a = (addrOf(id) + ' ' + cityOf(id)).toLowerCase();
      return w.every(x => a.indexOf(x) >= 0);
    });
  }
  function setStageRaw(p, id, key, what) {
    const r = p[id] = p[id] || { stage: 'new', history: [] };
    if (key === 'notnow') r.archived = new Date().toISOString(); else { r.archived = null; r.stage = key; }
    r.history = r.history || [];
    r.history.unshift({ at: new Date().toISOString(), what, kind: 'stage', by: 'nimbus' });
  }

  T.move_stage = {
    description: 'Move one home to a pipeline stage (new, contacted, inspection, proposal, won, the handoff stage, or not now). Without query it is the home on screen; with query it finds the address. Has Undo.',
    input_schema: obj({ stage: { type: 'string' }, query: { type: 'string', description: 'Optional address words like "1008 Merribrook"' } }, ['stage']),
    async run(a) {
      const st = stageOf(a.stage); if (!st) return { ok: false, say: 'Which stage? ' + RC.STAGES.map(s => s[1]).join(', ') + ', or Not now.' };
      const h = await homeFor(a.query); if (!h) return { ok: false, say: a.query ? 'I could not find ' + a.query + '.' : 'Which home? Say the address, or open one first.' };
      const p = pipe(), s = snap(p, [h.id]), cur = p[h.id];
      if (cur && (st.key === 'notnow' ? cur.archived : (!cur.archived && (cur.stage || 'new') === st.key))) return { ok: true, say: h.label + ' is already ' + st.name + '. Nothing changed.', data: { home: h.label, stage: st.name, unchanged: true } };
      setStageRaw(p, h.id, st.key, 'Moved to ' + st.name + ' by Nimbus'); savePipe(p); redraw();
      return { ok: true, label: 'Moved ' + h.label + ' to ' + st.name, say: h.label + ' is now ' + st.name + '.', data: { home: h.label, stage: st.name }, undo: () => restore(s) };
    }
  };
  T.bulk_move = {
    description: 'Move every home that matches to another stage at once, e.g. everyone at Contacted in Frisco to Not now. from_stage and words (street or city) filter; at least one is needed. Says how many before and has Undo for all of them.',
    input_schema: obj({ to_stage: { type: 'string' }, from_stage: { type: 'string' }, words: { type: 'string' } }, ['to_stage']),
    async run(a) {
      const st = stageOf(a.to_stage); if (!st) return { ok: false, say: 'Which stage should they go to?' };
      if (!a.from_stage && !String(a.words || '').trim()) return { ok: false, say: 'Which homes? Say a stage or a city, so I do not move everything.' };
      const ids = matching(a.from_stage, a.words).filter(id => { const r = pipe()[id]; return st.key === 'notnow' ? !(r && r.archived) : !(r && RC.stageKey(r.stage) === st.key && !r.archived); });
      if (!ids.length) return { ok: false, say: 'No homes match that.' };
      const p = pipe(), s = snap(p, ids);
      ids.forEach(id => setStageRaw(p, id, st.key, 'Moved to ' + st.name + ' by Nimbus (bulk)')); savePipe(p); redraw();
      return { ok: true, label: 'Moved ' + plural(ids.length, 'home') + ' to ' + st.name, say: 'Moved ' + plural(ids.length, 'home') + ' to ' + st.name + '. Say undo to put them back.',
        data: { count: ids.length, stage: st.name }, card: { kind: 'list', title: 'Moved to ' + st.name, rows: ids.slice(0, 30).map(id => ({ t: addrOf(id), s: st.name, go: { screen: 'home', params: { view: 'home', id } }, id })) }, undo: () => restore(s) };
    }
  };
  T.add_note = {
    description: 'Add a note to a home\'s history (the home on screen, or by address). Use the roofer\'s words. Has Undo.',
    input_schema: obj({ text: { type: 'string' }, query: { type: 'string' } }, ['text']),
    async run(a) {
      const h = await homeFor(a.query); if (!h) return { ok: false, say: 'Which home is the note for?' };
      const p = pipe(), s = snap(p, [h.id]), r = p[h.id] = p[h.id] || { stage: 'new', history: [] };
      r.history = r.history || []; r.history.unshift({ at: new Date().toISOString(), what: String(a.text).slice(0, 400), kind: 'note', by: 'nimbus' });
      savePipe(p); redraw();
      return { ok: true, label: 'Note on ' + h.label, say: 'Noted on ' + h.label + '.', undo: () => restore(s) };
    }
  };

  // ---------- running jobs: the follow-up cadence and the cloud sender ----------
  function pausedIds() { const p = pipe(), now = Date.now(); return Object.keys(p).filter(id => { const z = p[id].paused; return z && (!z.until || Date.parse(z.until) > now); }); }
  function targets(a) {
    if (a.query) return null;   // one home, resolved by the caller
    if (/\b(everyone|everybody|all)\b/i.test(a.words || '') || a.all) return matching(null, '');
    return String(a.words || '').trim() ? matching(a.stage, a.words) : [];
  }
  T.pause_followups = {
    description: 'Pause the follow-up cadence (the day 1, 3, 7, 30 texts and emails) for one home (query, or the home on screen), for every home in a city or street (words), or for everyone (words "everyone"). days = how long, empty = until resumed. Has Undo.',
    input_schema: obj({ query: { type: 'string' }, words: { type: 'string' }, days: { type: 'number' } }),
    async run(a) {
      let ids = targets(a), label;
      if (!ids || !ids.length) { if (ids && String(a.words || '').trim()) return { ok: false, say: 'No homes match ' + a.words + '.' }; const h = await homeFor(a.query); if (!h) return { ok: false, say: 'Whose follow-ups? Say an address, a city, or everyone.' }; ids = [h.id]; label = h.label; }
      const until = a.days ? new Date(Date.now() + a.days * DAY).toISOString() : null, p = pipe(), s = snap(p, ids);
      ids.forEach(id => { const r = p[id] = p[id] || { stage: 'new', history: [] }; r.paused = { at: new Date().toISOString(), until }; (r.history = r.history || []).unshift({ at: r.paused.at, what: 'Follow-ups paused by Nimbus' + (a.days ? ' for ' + plural(a.days, 'day') : ''), kind: 'note', by: 'nimbus' }); });
      savePipe(p); redraw();
      const who = label || plural(ids.length, 'home');
      return { ok: true, label: 'Paused follow-ups: ' + who, say: 'Follow-ups paused for ' + who + (a.days ? ' for ' + plural(a.days, 'day') : ' until you say resume') + '.', data: { count: ids.length, days: a.days || null }, undo: () => restore(s) };
    }
  };
  T.resume_followups = {
    description: 'Resume paused follow-ups for one home (query or on screen), a city or street (words), or everyone (words "everyone"). Has Undo.',
    input_schema: obj({ query: { type: 'string' }, words: { type: 'string' } }),
    async run(a) {
      let ids = targets(a), label;
      if (ids && ids.length) ids = ids.filter(id => pausedIds().indexOf(id) >= 0);
      else { const h = await homeFor(a.query); if (!h) return { ok: false, say: 'Whose follow-ups? Say an address, a city, or everyone.' }; ids = pausedIds().indexOf(h.id) >= 0 ? [h.id] : []; label = h.label; }
      if (!ids.length) return { ok: false, say: 'Nothing there is paused.' };
      const p = pipe(), s = snap(p, ids);
      ids.forEach(id => { delete p[id].paused; (p[id].history = p[id].history || []).unshift({ at: new Date().toISOString(), what: 'Follow-ups resumed by Nimbus', kind: 'note', by: 'nimbus' }); });
      savePipe(p); redraw();
      return { ok: true, label: 'Resumed follow-ups: ' + (label || plural(ids.length, 'home')), say: 'Follow-ups are back on for ' + (label || plural(ids.length, 'home')) + '.', undo: () => restore(s) };
    }
  };
  // the cloud sending switch lives in the CRM inbox header (lib/rc-automation.js, owner only, its own confirm dialog)
  function autoButton() { const w = Tools.win('home'); return w && w.document.querySelector('#autoSlot .autosw'); }
  function autoState() { const b = autoButton(); if (!b) return 'unknown'; if (b.getAttribute('role') !== 'switch') return 'not connected'; return b.getAttribute('aria-checked') === 'true' ? 'on' : 'off'; }
  T.jobs = {
    description: 'What is running for the roofer right now: cloud sending (automation) on, off or not connected; follow-ups due today; homes with follow-ups paused; today\'s route size; the morning briefing. Use for "what\'s running", "what\'s on autopilot".',
    input_schema: obj({}),
    async run() {
      const list = Tools.dailyList(), due = list.filter(x => x.reason === 'cadence').length, paused = pausedIds().length;
      const auto = autoState(), brief = RC.setting('briefing', 'on') !== 'off';
      const parts = [auto === 'on' ? 'Sending is on in the cloud.' : auto === 'off' ? 'Sending is off, so nothing goes out on its own.' : 'Cloud sending is not connected yet, so nothing goes out on its own.'];
      if (list.length) parts.push(plural(list.length, 'home') + ' on today\'s route, ' + due + ' of them follow-ups.');
      if (paused) parts.push(plural(paused, 'home') + ' paused.');
      parts.push('Morning briefing ' + (brief ? 'on' : 'off') + ', reply alerts ' + (RC.setting('replyAlerts', 'off') === 'on' ? 'on.' : 'off.'));
      const rows = [{ t: 'Cloud sending', s: auto }, { t: 'Today\'s route', s: plural(list.length, 'home') }, { t: 'Follow-ups due today', s: String(due) }, { t: 'Follow-ups paused', s: String(paused) }, { t: 'Morning briefing', s: brief ? 'on' : 'off' }];
      return { ok: true, say: parts.join(' '), data: { automation: auto, route: list.length, due_today: due, paused, briefing: brief }, card: { kind: 'list', title: 'What is running', rows } };
    }
  };
  T.automation = {
    description: 'Turn cloud sending (automation) on or off. The owner confirms the dialog on screen; Nimbus never confirms it. Signed out or not set up: says so.',
    input_schema: obj({ on: { type: 'boolean' } }, ['on']),
    async run(a) {
      Tools.go('home', { view: 'inbox' });
      const b = await Tools.waitFor(autoButton, 6000);
      if (!b || b.getAttribute('role') !== 'switch') return { ok: false, say: 'Sending is not connected for your company yet. Wing connects it at onboarding.' };
      if (b.disabled) return { ok: false, say: 'Only the company owner can change sending.' };
      if ((b.getAttribute('aria-checked') === 'true') === !!a.on) return { ok: true, say: 'Sending is already ' + (a.on ? 'on' : 'off') + '.' };
      await Tools.point(b, a.on ? 'Turn sending on' : 'Turn sending off');
      b.click();   // turning it on opens the confirm dialog; the person answers it
      await new Promise(r => setTimeout(r, 1200));
      const now = autoState();
      return { ok: now === (a.on ? 'on' : 'off'), say: now === (a.on ? 'on' : 'off') ? 'Sending is ' + now + '.' : 'Okay, I left sending ' + now + '.' };
    }
  };

  // ---------- the app's look for this roofer: text size (a setting, applied to the shell and every screen) ----------
  const SIZES = { small: 0.9, normal: 1, large: 1.15, xl: 1.3 };
  function applyDisplay() {
    const z = SIZES[RC.setting('display', 'normal')] || 1;
    document.documentElement.style.setProperty('--nb-zoom', z);
    document.querySelectorAll('#f iframe').forEach(f => { try { f.contentDocument.documentElement.style.zoom = z === 1 ? '' : z; } catch (e) { } });
  }
  function putSetting(k, v) { const a = RC.__get('settings', {}) || {}, m = Object.assign({}, a[RC.rooferKey()] || {}); if (v == null) delete m[k]; else m[k] = v; a[RC.rooferKey()] = m; RC.__set('settings', a); }
  T.display = {
    description: 'Make the app\'s text and buttons bigger or smaller for this roofer: size small, normal, large or xl. Has Undo.',
    input_schema: obj({ size: { type: 'string', enum: Object.keys(SIZES) } }, ['size']),
    async run(a) {
      const prev = RC.setting('display', null); putSetting('display', a.size === 'normal' ? null : a.size); applyDisplay();
      return { ok: true, label: 'Text size ' + a.size, say: (a.size === 'normal' ? 'Back to the normal size.' : 'Made everything ' + (a.size === 'small' ? 'smaller.' : 'bigger.')) + ' Want to keep it?', ask: 'keep', undo: () => { putSetting('display', prev); applyDisplay(); } };
    }
  };
  setInterval(applyDisplay, 1500); applyDisplay();   // screens load lazily; keep new frames at the roofer's size

  // ---------- the built-in brain hears these too ----------
  function intent(raw) {
    const t = String(raw || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    let m;
    if (/\b(whats|what is|what are) (running|on autopilot|automated|going out)\b|\bwhat jobs\b|\bis (sending|automation) on\b/.test(t)) return [{ name: 'jobs', args: {} }];
    if (/\b(turn|switch) (on|off) (sending|automation|autopilot)\b|\b(sending|automation|autopilot) (on|off)\b/.test(t)) return [{ name: 'automation', args: { on: /\bon\b/.test(t) && !/\boff\b/.test(t) } }];
    if ((m = /\b(bigger|larger|huge|smaller|normal size|regular size)\b/.exec(t)) && /\b(text|words|font|everything|screen|app|buttons|it)\b/.test(t))
      return [{ name: 'display', args: { size: /smaller/.test(m[1]) ? 'small' : /normal|regular/.test(m[1]) ? 'normal' : /huge/.test(t) || /even bigger|much bigger/.test(t) ? 'xl' : 'large' } }];
    if (/\b(pause|stop|hold|freeze)\b.*\bfollow ?ups?\b|\bstop (texting|emailing|messaging)\b/.test(t)) {
      const d = /\bfor (\d+|a|one|two|three) (days?|weeks?)\b/.exec(t), n = d ? ({ a: 1, one: 1, two: 2, three: 3 }[d[1]] || +d[1]) * (/week/.test(d[2]) ? 7 : 1) : null;
      const w = /\b(everyone|everybody|all)\b/.test(t) ? 'everyone' : ((m = /\b(?:in|on|for) ([a-z][a-z ]{2,30}?)(?: for \d+.*| for a.*)?$/.exec(t)) && !/\b(this|the) (house|home)\b/.test(m[1]) ? m[1] : '');
      return [{ name: 'pause_followups', args: Object.assign(w ? { words: w } : {}, n ? { days: n } : {}) }];
    }
    if (/\b(resume|restart|turn back on|start again)\b.*\bfollow ?ups?\b|\bfollow ?ups? back on\b/.test(t)) {
      const w = /\b(everyone|everybody|all)\b/.test(t) ? 'everyone' : ((m = /\b(?:in|on|for) ([a-z][a-z ]{2,30})$/.exec(t)) && !/\b(this|the) (house|home)\b/.test(m[1]) ? m[1] : '');
      return [{ name: 'resume_followups', args: w ? { words: w } : {} }];
    }
    if ((m = /^(?:add a |make a |put a )?note(?: on (?:this|the) (?:house|home))?[: ,]+(.+)$/.exec(t))) return [{ name: 'add_note', args: { text: String(raw).replace(/^.*?note(?: on (?:this|the) (?:house|home))?[: ,]+/i, '').trim() } }];
    if ((m = /\bpark (?:everyone|everybody|all)(?: at ([a-z ]+?))?(?: (?:in|on) ([a-z ]+))?$/.exec(t)))   // park = Not now
      return [{ name: 'bulk_move', args: { from_stage: m[1] || '', words: m[2] || (m[1] ? '' : 'everyone'), to_stage: 'not now' } }];
    if ((m = /\b(?:move|put|mark) (?:everyone|everybody|all(?: the)?(?: homes| houses)?)(?: at ([a-z ]+?))?(?: (?:in|on) ([a-z ]+?))? (?:to|as) ([a-z ]+)$/.exec(t)))
      return [{ name: 'bulk_move', args: { from_stage: m[1] || '', words: m[2] || (m[1] ? '' : 'everyone'), to_stage: m[3] } }];
    if ((m = /\b(?:move|mark|put|set) (?:this (?:house|home|one)|it|(\d{2,6} [a-z ]+?)) (?:to|as|in|at) ([a-z ]+)$/.exec(t))) return [{ name: 'move_stage', args: Object.assign({ stage: m[2] }, m[1] ? { query: m[1] } : {}) }];
    return null;
  }
  function wrapBrain() {
    const B = window.NimbusBrain; if (!B || B.__ops) return !!B;
    const think = B.think;
    B.think = function (text, state) {
      const calls = state && state.pending ? null : intent(text);
      return calls ? Promise.resolve({ calls, say: '' }) : think.apply(B, arguments);
    };
    B.__ops = true; return true;
  }
  if (!wrapBrain()) { const iv = setInterval(() => { if (wrapBrain()) clearInterval(iv); }, 300); }
  window.NimbusOps = { intent, pausedIds, applyDisplay, stageOf };
})();
