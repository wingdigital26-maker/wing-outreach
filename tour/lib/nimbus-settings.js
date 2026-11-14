/* nimbus-settings.js: "change the software by talking" (Jack 10-26). A safe settings layer the roofer edits by voice or tap.
   Not code: every setting is a validated value the app already knows how to read (RC.setting in lib/rc-state.js):
     routeSize     10 to 100 homes on Today's route                       (lib/rc-queue.js rebuilds today's list)
     cities        only these cities on Today's route, [] = all           (lib/rc-queue.js)
     textWindow    texting hours, never wider than the Texas window       (lib/rc-state.js textWindow / inTextWindow)
     stageNames    the pipeline stage names                               (lib/rc-state.js STAGES)
     tone          'casual' | 'standard' for the text drafts              (lib/rc-copy.js; the STOP line never changes)
     briefing      the morning briefing pill on or off                    (lib/nimbus-assistant.js)
     customFields  the roofer's own fields on every home record           (drawn here into the record; values in rc.t.fields)
   Each change returns { ok, label, say, undo }: Nimbus says it, asks "Want to keep it?" and Undo puts the old value back.
   Stored per roofer in rc.t.settings[<roofer>] (lib/rc-cloud.js syncs it per company when signed in).
   Anything outside this layer is a request to Wing: rc.t.wingRequests (synced) + scripts/nimbus/requests.jsonl via the local
   server, so Jack sees it. Plain script, shell only. window.NimbusSettings. */
(function () {
  'use strict';
  if (window.NimbusSettings || !window.RC) return;
  const RC = window.RC;
  const NIMBUS_LOCAL = 'http://127.0.0.1:4913';   // the laptop's Nimbus server: local dev only (never in the public build)
  const LEGAL = { monSat: [9, 20], sun: [12, 20] };   // Texas: 9 am to 8 pm, Sunday noon to 8 pm (roof-command-clients/TEXAS-RULES.md)
  const all = () => RC.__get('settings', {}) || {};
  let DRAFT = null;   // while a proposal is being planned, changes land here and nothing on the device moves
  const mine = () => Object.assign({}, DRAFT || all()[RC.rooferKey()] || {});
  function put(k, v) {
    if (DRAFT) { if (v == null) delete DRAFT[k]; else DRAFT[k] = v; return; }
    const a = all(), m = Object.assign({}, a[RC.rooferKey()] || {});
    if (v == null) delete m[k]; else m[k] = v;
    a[RC.rooferKey()] = m; RC.__set('settings', a);
  }
  const hr = h => h === 12 ? 'noon' : (h % 12 || 12) + (h < 12 ? ' am' : ' pm');
  const title = s => String(s).toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

  // ---------- the cities the roofer's data covers (for "only show me Allen and McKinney") ----------
  let cityList = null;
  function cities() {
    if (cityList) return Promise.resolve(cityList);
    return RC.factsReady.then(() => Promise.all(((RC.catalog || {}).regions || []).map(r => fetch(RC.dataRoot + 'meta/' + r.id + '/cities.json').then(x => x.ok ? x.json() : null).catch(() => null))))
      .then(ls => { const set = new Set(); ls.forEach(l => (Array.isArray(l) ? l : (l && (l.cities || l.names)) || []).forEach(c => { if (typeof c === 'string' && c.trim()) set.add(c.trim()); })); cityList = [...set].sort(); return cityList; });
  }

  // ---------- after a change: the screens that read it draw again ----------
  // No reload: each frame hears the write through the storage event (RC.on, key 'settings') and redraws in place, so the roofer keeps his place.
  function refresh(keys) {
    if (DRAFT) return;
    if (keys.indexOf('customFields') >= 0) drawFields(true);
  }

  // ---------- changing one setting: validate, keep the old value, apply, say it plainly ----------
  async function change(key, value) {
    const before = mine()[key], did = (label, say, after) => {
      put(key, after); refresh([key]);
      const undo = () => { put(key, before == null ? null : before); refresh([key]); };
      return { ok: true, label, say, undo, data: { setting: key, before: before == null ? null : before, after } };
    };
    if (key === 'routeSize') {
      const n = Math.round(+value);
      if (!(n >= 10 && n <= 100)) return { ok: false, say: 'The route can be 10 to 100 homes.' };
      return did('Route set to ' + n + ' homes', 'Done. Your route is now ' + n + ' homes a day. Want to keep it?', n);
    }
    if (key === 'cities') {
      const want = (Array.isArray(value) ? value : String(value || '').split(/,| and /)).map(s => String(s).trim()).filter(Boolean);
      if (!want.length || want.some(w => /^(all|every|any)( cities)?$/i.test(w))) return did('Route shows every city', 'Done. Your route covers every city again. Want to keep it?', null);
      const known = await cities(), got = [], miss = [];
      want.forEach(w => { const k = known.find(c => c.toLowerCase() === w.toLowerCase()) || known.find(c => c.toLowerCase().indexOf(w.toLowerCase()) === 0); if (k) got.push(k); else miss.push(w); });
      if (!got.length) return { ok: false, say: 'I could not find ' + miss.join(' or ') + ' in your area. Your cities include ' + known.slice(0, 6).join(', ') + '.' };
      return did('Route only in ' + got.join(', '), 'Done. Your route now only shows ' + got.join(' and ') + (miss.length ? '. I could not find ' + miss.join(' or ') : '') + '. Want to keep it?', got.map(c => c.toLowerCase()));
    }
    if (key === 'textWindow') {
      let o = +value.open, c = +value.close;
      if (!(o >= 0 && c > o && c <= 24)) return { ok: false, say: 'Say the hours like 10 to 7.' };
      if (o < LEGAL.monSat[0] || c > LEGAL.monSat[1]) return { ok: false, say: 'Texas allows texts only from 9 in the morning to 8 at night, noon on Sunday. Pick hours inside that.' };
      const w = { monSat: [o, c], sun: [Math.max(o, LEGAL.sun[0]), Math.min(c, LEGAL.sun[1])] };
      return did('Texting hours ' + hr(o) + ' to ' + hr(c), 'Done. Texting hours are now ' + hr(o) + ' to ' + hr(c) + (w.sun[0] !== o ? ', and noon to ' + hr(w.sun[1]) + ' on Sunday' : '') + '. Want to keep it?', w);
    }
    if (key === 'stageNames') {
      const from = String(value.from || '').toLowerCase().trim(), to = String(value.to || '').trim().slice(0, 32);
      const list = RC.stagesFrom(mine()), st = list.find(s => s[1].toLowerCase() === from) || list.find(s => s[1].toLowerCase().indexOf(from) >= 0);
      if (!st) return { ok: false, say: 'Your stages are ' + list.map(s => s[1]).join(', ') + '. Which one should I rename?' };
      if (!to) return { ok: false, say: 'What should I call ' + st[1] + '?' };
      const m = Object.assign({}, mine().stageNames || {}); m[st[0]] = to;
      return did('Renamed ' + st[1] + ' to ' + to, 'Done. ' + st[1] + ' is now called ' + to + '. Want to keep it?', m);
    }
    if (key === 'tone') {
      const t = /casual|friendly|relaxed|loose/i.test(String(value)) ? 'casual' : 'standard';
      return did('Text tone: ' + t, t === 'casual' ? 'Done. Your text drafts sound more casual now. The company name and the STOP line stay. Want to keep it?' : 'Done. Your text drafts are back to the standard wording. Want to keep it?', t);
    }
    if (key === 'briefing') {
      const on = !(value === false || /off|no|stop|disable/i.test(String(value)));
      return did('Morning briefing ' + (on ? 'on' : 'off'), on ? 'Done. The morning briefing is back on. Want to keep it?' : 'Done. No more morning briefing. Want to keep it?', on);
    }
    if (key === 'customFields') {
      const label = title(String(value.label || value || '').replace(/^(a |an )/i, '').trim()).slice(0, 40);
      const list = (mine().customFields || []).slice();
      if (value.remove) { const k = list.findIndex(f => f.label.toLowerCase() === label.toLowerCase()); if (k < 0) return { ok: false, say: 'There is no field called ' + label + '.' }; list.splice(k, 1); return did('Removed the ' + label + ' field', 'Done. I took the ' + label + ' field off the record. Want to keep it?', list); }
      if (!label) return { ok: false, say: 'What should the new field be called?' };
      if (list.some(f => f.label.toLowerCase() === label.toLowerCase())) return { ok: false, say: 'You already have a ' + label + ' field.' };
      if (list.length >= 10) return { ok: false, say: 'You have 10 fields already, the most I keep. Remove one first.' };
      list.push({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30), label });
      return did('Added a ' + label + ' field', 'Done. Every home record now has ' + (/^[aeiou]/i.test(label) ? 'an ' : 'a ') + label + ' field. Tell me the value on a home, like ' + label.toLowerCase() + ' is State Farm. Want to keep it?', list);
    }
    return { ok: false, say: 'That is not a setting I can change. I can send it to Wing as a request.' };
  }

  // ---------- edits that go through propose_change: every one is a checked value, none is code or CSS ----------
  const L = () => window.RCLayout;
  const stageIn = (m, w) => { w = String(w || '').toLowerCase().replace(/\bstage\b/g, '').trim(); const l = RC.stagesFrom(m); return l.find(s => s[0] === w || s[1].toLowerCase() === w) || (w.length > 2 && l.find(s => s[1].toLowerCase().indexOf(w) >= 0)) || null; };
  const say = (ok, s, extra) => Object.assign({ ok, say: s }, extra || {});
  const homesIn = key => { const p = RC.pipeline(); return Object.keys(p).filter(id => p[id] && RC.__stageKey ? ((p[id].stage === key) || RC.stageKey(p[id].stage) === key) : false); };
  const LOCKED = { new: 'New hit is where every home starts', called: 'the app moves homes to Contacted when you text them', inspection: 'the calendar books homes into Inspection booked', won: 'your results count Won' };
  const BAD_WORDS = /\b(damage[ds]?|insurance|deductible|claim|free roof|act now|hurry|last chance|today only|guarantee[ds]?)\b/i;
  const previewFirst = text => { try { const c = window.RC_COPY; const m = Object.assign({}, mine()); const h = { street: '7892 Merribrook Ln', city: 'Allen', rep: (window.ROOFERS && (ROOFERS[RC.rooferKey()] || {}).owner) || '', roofer: ((window.ROOFERS || {})[RC.rooferKey()] || {}).name || 'Your company' };
    if (text.toLowerCase().indexOf(h.roofer.toLowerCase()) < 0 && text.indexOf('{company}') < 0) text = h.roofer + ' here. ' + text;
    return text.replace(/\{(street|first|company|rep|city)\}/g, (x, k) => ({ street: h.street, first: '', company: h.roofer, rep: h.rep, city: h.city })[k]).replace(/\s+/g, ' ').trim() + ' [your home page link and the material question] ' + 'Text STOP and I won\'t text again.'; } catch (e) { return text; } };
  const CHANGES = {
    async section(c) {
      const s = (L().get(c.section)) || L().find(c.section);
      if (!s) return say(false, 'I do not have a part called ' + c.section + ' that I can hide.', { cant: true });
      const m = mine(), l = (m.hiddenSections || []).slice(), has = l.indexOf(s.key) >= 0, show = c.show === true;
      const name = s.label.replace(/^the /, ''), Name = name.charAt(0).toUpperCase() + name.slice(1);
      if (show && !has) return say(false, Name + ' is already showing ' + L().whereWord(s) + '.', { done: true });
      if (!show && has) return say(false, Name + ' is already hidden ' + L().whereWord(s) + '.', { done: true });
      put('hiddenSections', show ? l.filter(k => k !== s.key) : l.concat(s.key));
      return { ok: true, line: (show ? 'Show ' : 'Hide ') + s.label + ' ' + L().whereWord(s) };
    },
    async order(c) {
      const s = L().get(c.item) || L().find(c.item, 'house');
      const g = s && Object.keys(L().ORDERS).find(k => L().ORDERS[k].items[s.key]);
      if (!g) return say(false, 'That part does not move. On the house page I can reorder the photo, the facts, the hail history, and the facts inside their box.', { cant: true });
      const G = L().ORDERS[g], base = Object.keys(G.items), m = mine(), o = Object.assign({}, m.layoutOrder || {});
      let list = (o[g] && o[g].length ? o[g].filter(k => G.items[k]) : []); base.forEach(k => { if (list.indexOf(k) < 0) list.push(k); });
      list = list.filter(k => k !== s.key);
      let at = 0;
      if (c.position === 'last') at = list.length;
      else if (c.position === 'first') at = 0;
      else if (c.position === 'before' || c.position === 'after') {
        const t = L().get(c.other) || L().find(c.other, 'house'), i = t ? list.indexOf(t.key) : -1;
        if (i < 0) return say(false, 'I can only place that next to ' + base.map(k => L().get(k).label).join(', ') + '.', { cant: true });
        at = c.position === 'before' ? i : i + 1;
      } else return say(false, 'Should it go first or last?');
      list.splice(at, 0, s.key); o[g] = list; put('layoutOrder', o);
      const lab = s.label.replace(/^the /, '');
      return { ok: true, line: 'Move ' + lab + (c.position === 'first' ? ' to the top' : c.position === 'last' ? ' to the bottom' : ' ' + c.position + ' ' + L().get(c.other ? (L().get(c.other) || L().find(c.other, 'house')).key : s.key).label) + ' of ' + G.label };
    },
    async reset_layout() {
      const m = mine(); if (!(m.hiddenSections || []).length && !m.layoutOrder) return say(false, 'Your screens are already on the standard layout.', { done: true });
      put('hiddenSections', null); put('layoutOrder', null);
      return { ok: true, line: 'Show everything I hid and put the standard order back' };
    },
    async add_stage(c) {
      const name = title(String(c.name || '').replace(/[<>{}]/g, '').trim()).slice(0, 28), m = mine(), list = RC.stagesFrom(m);
      if (!name) return say(false, 'What should the new stage be called?');
      if (list.some(s => s[1].toLowerCase() === name.toLowerCase())) return say(false, 'You already have a stage called ' + name + '.', { done: true });
      if ((m.customStages || []).length >= 6) return say(false, 'You have 6 of your own stages, the most I keep. Remove one first.');
      let after = c.before ? null : c.after ? stageIn(m, c.after) : null;
      if (c.before) { const b = stageIn(m, c.before); if (!b) return say(false, 'Your stages are ' + list.map(s => s[1]).join(', ') + '. Where should ' + name + ' go?'); const k = list.findIndex(s => s[0] === b[0]); if (k === 0) return say(false, 'New hit stays first. Pick a spot after it.'); after = list[k - 1]; }
      else if (c.after && !after) return say(false, 'Your stages are ' + list.map(s => s[1]).join(', ') + '. Where should ' + name + ' go?');
      if (!after) after = list[list.length - 2] || list[0];
      if (after[0] === 'won') return say(false, 'Won stays the last stage. Pick a spot before it.');
      const key = 'c_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24) + '_' + Date.now().toString(36).slice(-4);
      put('customStages', (m.customStages || []).concat({ key, name, after: after[0] }));
      return { ok: true, line: 'Add a stage called ' + name + ' after ' + after[1] };
    },
    async remove_stage(c, plan) {
      const m = mine(), st = stageIn(m, c.stage), list = RC.stagesFrom(m);
      if (!st) return say(false, 'Your stages are ' + list.map(s => s[1]).join(', ') + '. Which one should I remove?');
      if (LOCKED[st[0]]) return say(false, 'I can\'t remove ' + st[1] + ', because ' + LOCKED[st[0]] + '. You can rename it instead.');
      const n = homesIn(st[0]).length;
      let to = c.move_to ? stageIn(m, c.move_to) : null;
      if (c.move_to && !to) return say(false, 'Your stages are ' + list.map(s => s[1]).join(', ') + '. Where should those homes go?', { need: 'stage_where', stage: st[1] });
      if (to && to[0] === st[0]) return say(false, 'Those homes need a different stage than the one going away.', { need: 'stage_where', stage: st[1] });
      if (n && !to) return say(false, (n === 1 ? '1 home is' : n + ' homes are') + ' in ' + st[1] + '. Which stage should ' + (n === 1 ? 'it' : 'they') + ' move to?', { need: 'stage_where', stage: st[1] });
      if (!to) to = list[Math.max(0, list.findIndex(s => s[0] === st[0]) - 1)];
      const rm = Object.assign({}, m.removedStages || {}); rm[st[0]] = to[0];
      put('removedStages', rm);
      put('customStages', (m.customStages || []).filter(x => x.key !== st[0]).map(x => x.after === st[0] ? Object.assign({}, x, { after: to[0] }) : x));
      if (m.customStages && !mine().customStages.length) put('customStages', null);
      plan.moves.push({ from: st[0], to: to[0], name: to[1] });
      return { ok: true, line: 'Remove the ' + st[1] + ' stage' + (n ? ' and move ' + (n === 1 ? 'its 1 home' : 'its ' + n + ' homes') + ' to ' + to[1] : '') };
    },
    async save_view(c) {
      const name = title(String(c.name || '').replace(/[<>{}]/g, '').replace(/^(my|a|the) /i, '').trim()).slice(0, 30);
      if (!name) return say(false, 'What should I call this list?');
      const m = mine(), vs = m.savedViews || [];
      if (vs.some(v => v.name.toLowerCase() === name.toLowerCase())) return say(false, 'You already have a list called ' + name + '.', { done: true });
      if (vs.length >= 12) return say(false, 'You have 12 saved lists, the most I keep. Delete one first.');
      const raw = c.filter || liveFilter() || {}, flt = {};
      if (raw.city) { const known = await cities(), k = known.find(x => x.toLowerCase() === String(raw.city).toLowerCase()); if (!k) return say(false, 'I could not find ' + raw.city + ' in your area.'); flt.city = k; }
      if (raw.stage) { const s = stageIn(m, raw.stage); if (!s) return say(false, 'Your stages are ' + RC.stagesFrom(m).map(x => x[1]).join(', ') + '.'); flt.stage = s[0]; }
      ['storm', 'sub'].forEach(k => { if (raw[k]) flt[k] = String(raw[k]).slice(0, 60); });
      if (raw.route) flt.route = true; if (raw.knock) flt.knock = true;
      if (['score', 'hail', 'age', 'recent'].indexOf(raw.sort) >= 0 || raw.sort === 'newest') flt.sort = raw.sort;
      if (!Object.keys(flt).some(k => k !== 'sort')) {   // nothing filtered: "my Plano list" names its city
        const known = await cities(), hit = known.find(x => new RegExp('\\b' + x.replace(/[^a-z ]/gi, '') + '\\b', 'i').test(name));
        if (hit) flt.city = hit; else return say(false, 'Nothing is filtered on the Pipeline right now, so there is nothing to save. Say something like, show Plano on Leads, then save it.');
      }
      put('savedViews', vs.concat({ id: 'v' + Date.now().toString(36) + vs.length, name, filter: flt }));
      return { ok: true, line: 'Save a list called ' + name + ' on the Pipeline (' + viewWords(flt, m) + ')' };
    },
    async remove_view(c) {
      const m = mine(), vs = m.savedViews || [], v = viewNamed(c.name, vs);
      if (!v) return say(false, vs.length ? 'Your saved lists are ' + vs.map(x => x.name).join(', ') + '.' : 'You do not have any saved lists yet.');
      put('savedViews', vs.filter(x => x !== v).length ? vs.filter(x => x !== v) : null);
      return { ok: true, line: 'Delete the ' + v.name + ' list' };
    },
    async template(c) {
      if (c.reset) { const m = mine(); if (!(m.templates || {}).firstText) return say(false, 'Your first text is already the standard one.', { done: true }); put('templates', null); return { ok: true, line: 'Put the standard first text back' }; }
      const text = String(c.text || '').replace(/\s+/g, ' ').trim();
      if (!text) return say(false, 'What should the first text say?');
      if (/[<>]/.test(text)) return say(false, 'Plain words only in a text, please.');
      if (text.length > 180) return say(false, 'That is ' + text.length + ' letters. Keep your part under 180, since the link, the question and the STOP line get added.');
      if (/https?:|www\.|\.com\b/i.test(text)) return say(false, 'I add the home\'s own page link for you. Take the link out and say it again.');
      if (/\b(stop|opt out|unsubscribe)\b/i.test(text)) return say(false, 'The STOP line stays exactly as it is, and I add it for you. Leave that part out.');
      if (BAD_WORDS.test(text)) return say(false, 'I can\'t put that in a text. Your messages can\'t promise anything or claim damage or insurance. Try other words.');
      if (/\{(?!street\}|first\}|company\}|rep\}|city\})/.test(text)) return say(false, 'The only fill-ins I know are street, first, company, rep and city.');
      put('templates', Object.assign({}, mine().templates || {}, { firstText: text }));
      return { ok: true, line: 'Change your first text', preview: previewFirst(text) };
    },
    async setting(c) {   // the older settings can join a proposal too
      const r = await change(c.setting, c.value);
      if (!r.ok) return r;
      return { ok: true, line: r.label };
    }
  };
  function liveFilter() { try { const w = window.NimbusTools.win('home'); return w && w.pipeFilters ? w.pipeFilters.get() : null; } catch (e) { return null; } }
  const viewNamed = (name, vs) => { const n = String(name || '').toLowerCase().replace(/^(my|the) /, '').trim(); return vs.find(v => v.name.toLowerCase() === n) || vs.find(v => v.name.toLowerCase() === n + ' list') || vs.find(v => v.name.toLowerCase().replace(/ (list|view)$/, '') === n.replace(/ (list|view)$/, '')) || null; };
  const viewWords = (f, m) => { const out = []; if (f.city) out.push('homes in ' + f.city); if (f.stage) out.push('at ' + (RC.stagesFrom(m).find(s => s[0] === f.stage) || [0, f.stage])[1]); if (f.route) out.push('on today\'s list'); if (f.knock) out.push('knock again'); if (f.sub) out.push(f.sub); if (f.storm) out.push('storm ' + f.storm); return out.join(', ') || 'all homes'; };

  // ---------- a proposal: plan every part on a copy, nothing changes until the roofer says yes. All apply together, one Undo. ----------
  let PENDING = null;
  async function propose(changes) {
    const list = Array.isArray(changes) ? changes : [changes];
    if (!list.length) return { ok: false, say: 'What should I change?' };
    const plan = { moves: [] }, lines = [], fails = []; let need = null, preview = '', cant = false;
    DRAFT = Object.assign({}, all()[RC.rooferKey()] || {});
    try {
      for (const c of list) {
        const fn = CHANGES[c && c.kind];
        const r = fn ? await fn(c, plan) : say(false, 'I can\'t change that one myself.', { cant: true });
        if (r.ok) { lines.push(r.line); if (r.preview) preview = r.preview; }
        else { fails.push(r.say); if (r.need) need = r; if (r.cant) cant = true; }
      }
      const draft = DRAFT;
      if (!lines.length) { PENDING = null; return { ok: false, say: fails.join(' '), need: need && need.need, stage: need && need.stage, cant }; }
      PENDING = { id: 'p' + Date.now().toString(36), lines, draft, moves: plan.moves, preview, skipped: fails };
      return { ok: true, id: PENDING.id, lines, preview, skipped: fails, cant, need: need && need.need, stage: need && need.stage };
    } finally { DRAFT = null; }
  }
  // the yes: write the plan in one go, move any homes off a removed stage, and hand back one Undo for all of it
  function confirm() {
    const P = PENDING; if (!P) return { ok: false, say: 'There is nothing waiting for a yes.' };
    PENDING = null;
    const before = mine(), keys = new Set(Object.keys(before).concat(Object.keys(P.draft))), changed = [...keys].filter(k => JSON.stringify(before[k]) !== JSON.stringify(P.draft[k]));
    const pipe = RC.__get('pipe', {}) || {}, moved = [];
    P.moves.forEach(mv => Object.keys(pipe).forEach(id => { const e = pipe[id]; if (!e || e.stage !== mv.from) return; moved.push({ id, stage: e.stage }); e.stage = mv.to; e.history = e.history || []; e.history.unshift({ at: new Date().toISOString(), what: 'Moved to ' + mv.name + ' (stage removed)', kind: 'stage' }); }));
    if (moved.length) RC.__set('pipe', pipe);
    const a = all(), m = Object.assign({}, a[RC.rooferKey()] || {}); changed.forEach(k => { if (P.draft[k] == null) delete m[k]; else m[k] = P.draft[k]; }); a[RC.rooferKey()] = m; RC.__set('settings', a);
    refresh(changed);
    const label = P.lines.length === 1 ? P.lines[0] : 'Made ' + P.lines.length + ' changes: ' + P.lines.join('; ');
    const undo = () => {
      const nowStages = (mine().customStages || []), goneOwn = nowStages.filter(c => !(before.customStages || []).some(x => x.key === c.key));
      const pp = RC.__get('pipe', {}) || {}; let dirty = false;
      goneOwn.forEach(c => Object.keys(pp).forEach(id => { if (pp[id] && pp[id].stage === c.key) { pp[id].stage = c.after; dirty = true; } }));   // homes put in a stage that goes away with this Undo
      moved.forEach(x => { const e = pp[x.id]; if (e) { e.stage = x.stage; if (e.history && /\(stage removed\)$/.test((e.history[0] || {}).what || '')) e.history.shift(); dirty = true; } });
      if (dirty) RC.__set('pipe', pp);
      const A = all(), M = Object.assign({}, A[RC.rooferKey()] || {}); changed.forEach(k => { if (before[k] == null) delete M[k]; else M[k] = before[k]; }); A[RC.rooferKey()] = M; RC.__set('settings', A);
      refresh(changed);
    };
    return { ok: true, label, say: P.lines.length === 1 ? 'Done. You can Undo it right there.' : (P.lines.length === 2 ? 'Done. Both changes are in.' : 'Done. All ' + P.lines.length + ' changes are in.') + ' One Undo takes them all back.', undo, data: { applied: P.lines } };
  }
  function cancelProposal() { const had = !!PENDING; PENDING = null; return had; }
  const views = () => mine().savedViews || [];

  // ---------- custom field values on a home (rc.t.fields = { homeId: { key: value } }) ----------
  function setField(homeId, label, value) {
    const f = (mine().customFields || []).find(x => x.label.toLowerCase() === String(label || '').toLowerCase().trim() || x.key === label);
    if (!f) return { ok: false, say: 'There is no ' + label + ' field yet. Say add a field for ' + label + ' first.' };
    if (!homeId) return { ok: false, say: 'Open the home first.' };
    const all = RC.__get('fields', {}) || {}, before = (all[homeId] || {})[f.key];
    all[homeId] = Object.assign({}, all[homeId] || {}, { [f.key]: String(value || '').slice(0, 120) }); RC.__set('fields', all);
    drawFields(true);
    return { ok: true, label: f.label + ': ' + value, say: 'Saved. ' + f.label + ' is ' + value + '.', undo: () => { const a = RC.__get('fields', {}) || {}; a[homeId] = Object.assign({}, a[homeId] || {}); if (before == null) delete a[homeId][f.key]; else a[homeId][f.key] = before; RC.__set('fields', a); drawFields(true); } };
  }
  // the record shows the roofer's own fields under its facts (drawn from the shell into the record frame; no edit to c5-home)
  let lastDrawn = '';
  function drawFields(force) {
    const fr = document.querySelector('#f iframe[data-screen="home"]'); let w = null; try { w = fr && fr.contentWindow; } catch (e) { }
    const d = w && w.document; if (!d || !d.body) return;
    const H = w.HOME, id = H && String(H.rawId || H.id), list = mine().customFields || [];
    let box = d.getElementById('nbvFields');
    if (!id || !list.length || !(w.crmView && w.crmView() === 'home')) { if (box) box.remove(); lastDrawn = ''; return; }
    const vals = (RC.__get('fields', {}) || {})[id] || {}, sig = id + JSON.stringify(list) + JSON.stringify(vals);
    if (!force && box && sig === lastDrawn) return;
    lastDrawn = sig;
    const anchor = d.getElementById('knockPanel') || d.querySelector('main') || d.body;
    if (!box) {
      box = d.createElement('section'); box.id = 'nbvFields';
      box.style.cssText = 'margin:12px 0;padding:12px 14px;border:1px solid #D5D9E0;border-radius:8px;background:#fff;font:14px/1.4 Inter,system-ui,sans-serif;color:#0B1020';
      anchor.parentNode.insertBefore(box, anchor.nextSibling);
      box.addEventListener('change', e => { const i = e.target.closest('input[data-k]'); if (!i) return; const a = RC.__get('fields', {}) || {}; a[id] = Object.assign({}, a[id] || {}, { [i.dataset.k]: i.value.slice(0, 120) }); RC.__set('fields', a); });
    }
    box.innerHTML = '<h3 style="margin:0 0 8px;font-size:15px;font-weight:600">Your fields</h3>' + list.map(f =>
      '<label style="display:grid;grid-template-columns:minmax(90px,140px) minmax(0,1fr);gap:8px;align-items:center;margin:6px 0"><span style="color:#465065">' + RC.esc(f.label) + '</span>' +
      '<input data-k="' + RC.esc(f.key) + '" value="' + RC.esc(vals[f.key] || '') + '" style="font:inherit;padding:7px 9px;border:1px solid #C9CFD9;border-radius:6px;min-height:36px;width:100%;min-width:0;box-sizing:border-box"></label>').join('') +
      '<p style="margin:6px 0 0;font-size:12px;color:#465065">Added by you through Nimbus. Say "remove the ' + RC.esc(list[0].label.toLowerCase()) + ' field" to take one off.</p>';
  }
  setInterval(() => drawFields(false), 1500);

  // ---------- requests to Wing: anything the settings cannot do ----------
  function request(text, ctx) {
    const l = RC.__get('wingRequests', []) || [], it = { id: 'r' + Date.now().toString(36), at: new Date().toISOString(), roofer: RC.rooferKey(), text: String(text || '').slice(0, 500), screen: ctx || '', status: 'new' };
    l.push(it); RC.__set('wingRequests', l.slice(-100));
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !(window.RCT_AUTH && RCT_AUTH.public) && !!(window.RC && RC.localSvc && RC.localSvc())) fetch(NIMBUS_LOCAL + '/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(it) }).catch(() => { });
    return { ok: true, label: 'Sent to Wing: ' + it.text.slice(0, 60), say: 'That one needs Wing. I sent it to Jack as a request, and it is on your list in Nimbus settings.', undo: () => RC.__set('wingRequests', (RC.__get('wingRequests', []) || []).filter(x => x.id !== it.id)) };
  }
  const requests = () => (RC.__get('wingRequests', []) || []).filter(r => r.roofer === RC.rooferKey());

  // plain words for the settings panel and for "what have I changed?"
  function describe() {
    const m = mine(), out = [];
    if (m.routeSize) out.push('Route: ' + m.routeSize + ' homes');
    if (m.cities && m.cities.length) out.push('Cities: ' + m.cities.map(title).join(', '));
    if (m.textWindow) out.push('Texting hours: ' + hr(m.textWindow.monSat[0]) + ' to ' + hr(m.textWindow.monSat[1]));
    if (m.stageNames) Object.keys(m.stageNames).forEach(k => out.push('Stage renamed: ' + m.stageNames[k]));
    if (m.tone) out.push('Text tone: ' + m.tone);
    if (m.briefing === false) out.push('Morning briefing: off');
    (m.customFields || []).forEach(f => out.push('Field: ' + f.label));
    (m.hiddenSections || []).forEach(k => { const s = window.RCLayout && RCLayout.get(k); if (s) out.push('Hidden: ' + s.label + ' ' + RCLayout.whereWord(s)); });
    if (m.layoutOrder) out.push('House page order changed');
    (m.customStages || []).forEach(c => out.push('Your stage: ' + c.name));
    Object.keys(m.removedStages || {}).filter(k => !/^c_/.test(k)).forEach(k => out.push('Stage removed: ' + (k === 'handoff' ? 'Sent to owner' : k === 'proposal' ? 'Proposal' : k)));
    (m.savedViews || []).forEach(v => out.push('Saved list: ' + v.name));
    if ((m.templates || {}).firstText) out.push('Your own first text');
    return out;
  }
  window.NimbusSettings = { change, setField, request, requests, describe, cities, get: mine, LEGAL, propose, confirm, cancelProposal, views, viewNamed, viewWords, stageIn, get pending() { return PENDING; } };
})();
