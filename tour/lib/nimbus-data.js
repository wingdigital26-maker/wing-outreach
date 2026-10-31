/* nimbus-data.js: more Nimbus tools over ALL of the roofer's data, registered into lib/nimbus-tools.js (NimbusTools.T):
   calendar, inbox, find homes in the pipeline, past customers, results, SEO, storms, client memory ("who's the lady on
   Merribrook that wanted a Thursday inspection?") and the settings layer (lib/nimbus-settings.js) with requests to Wing.
   Every tool returns { ok, say, data, card }: say is spoken, card is what the Talk screen (lib/nimbus-talk.js) shows.
   Privacy: names, phones and emails never go into say or data (so never to a model). A card may offer "Show contact",
   which calls RC_VAULT.reveal: the server checks the roofer's company and logs the view.
   Plain script, shell only, after nimbus-tools.js and nimbus-settings.js. */
(function () {
  'use strict';
  if (!window.NimbusTools || !window.RC || window.NimbusData) return;
  const RC = window.RC, Tools = window.NimbusTools, T = Tools.T, DAY = 864e5;
  const WD = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const short = a => String(a || '').split(',')[0].trim();
  const when = iso => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const spoken = iso => new Date(iso).toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' }).replace(':00', '');
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const addrOf = id => { const r = RC.recall(id) || {}, d = Tools.dailyList().find(x => x.id === id); return short((d && d.address) || r.addr || '') || 'a home on file'; };
  const day0 = () => new Date().setHours(0, 0, 0, 0);
  const weekOf = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() - ((d.getDay() + 6) % 7) * DAY; };
  const homeRow = (id, s) => ({ t: addrOf(id), s, go: { screen: 'home', params: { view: 'home', id } }, id });
  const obj = (props, req) => ({ type: 'object', properties: props || {}, required: req || [], additionalProperties: false });

  // ---------- calendar (the one store: RC.pipeline()[id].booked, c5-home/cal.js) ----------
  T.calendar = {
    description: 'The inspection calendar: what is booked today, tomorrow, this week or next week, in time order.',
    input_schema: obj({ range: { type: 'string', enum: ['today', 'tomorrow', 'this_week', 'next_week', 'upcoming'] } }),
    async run(a) {
      const r = a.range || 'upcoming', t0 = day0(), w0 = weekOf(Date.now());
      const [s, e] = r === 'today' ? [t0, t0 + DAY] : r === 'tomorrow' ? [t0 + DAY, t0 + 2 * DAY] : r === 'this_week' ? [w0, w0 + 7 * DAY] : r === 'next_week' ? [w0 + 7 * DAY, w0 + 14 * DAY] : [Date.now(), Date.now() + 60 * DAY];
      const l = Tools.bookings().filter(b => { const t = Date.parse(b.at); return t >= s && t < e; });
      const label = { today: 'today', tomorrow: 'tomorrow', this_week: 'this week', next_week: 'next week', upcoming: 'coming up' }[r];
      return { ok: true, say: l.length ? plural(l.length, 'inspection') + ' ' + label + '. ' + l.slice(0, 3).map(b => b.street.replace(/^\d+\s+/, '') + ' ' + spoken(b.at)).join(', ') + '.' : 'Nothing booked ' + label + '.',
        data: l.map(b => ({ street: b.street, at: b.at })), card: { kind: 'list', title: 'Inspections ' + label, rows: l.map(b => homeRow(b.id, when(b.at))), empty: 'Nothing booked' } };
    }
  };
  // ---------- inbox: replies waiting, follow-ups due ----------
  T.inbox = {
    description: 'The inbox: homeowners who replied and are waiting, and follow-ups due today or overdue.',
    input_schema: obj({ show: { type: 'string', enum: ['replied', 'due'] } }),
    async run(a) {
      if (a.show === 'due') {
        const d = window.Nimbus && Nimbus.actions && Nimbus.actions.due ? Nimbus.actions.due() : null;
        if (!d) return { ok: true, say: 'Open Today once and I can count follow-ups.' };
        return { ok: true, say: d.due + ' follow-ups due today and ' + d.late + ' overdue.', data: d, card: { kind: 'stat', big: String(d.due + d.late), title: 'Follow-ups due', sub: d.late + ' overdue' } };
      }
      const l = window.Nimbus && Nimbus.actions && Nimbus.actions.replied ? Nimbus.actions.replied() : [];
      return { ok: true, say: l.length ? plural(l.length, 'homeowner') + ' replied: ' + l.slice(0, 3).map(x => x.addr).join(', ') + '.' : 'No replies waiting.',
        data: l.map(x => ({ street: x.addr, at: x.at })), card: { kind: 'list', title: 'Replies waiting', rows: l.map(x => homeRow(x.id, 'Replied ' + when(x.at))), empty: 'No replies' } };
    }
  };
  // ---------- the pipeline: find homes by stage or street ----------
  T.find_homes = {
    description: 'Find homes in the roofer\'s pipeline by stage (new, contacted, inspection, proposal, won, not now) and/or street or city words.',
    input_schema: obj({ stage: { type: 'string' }, words: { type: 'string' } }),
    async run(a) {
      const p = RC.pipeline(), st = String(a.stage || '').toLowerCase(), w = String(a.words || '').toLowerCase().split(/\s+/).filter(x => x.length > 2);
      const want = st ? RC.STAGES.find(s => s[0] === st || s[1].toLowerCase().indexOf(st) >= 0) : null;
      const l = Object.keys(p).filter(id => {
        if (/not now|parked|archiv/.test(st)) { if (!p[id].archived) return false; } else if (want && (RC.stageKey(p[id].stage) !== want[0] || p[id].archived)) return false;
        const ad = (addrOf(id) + ' ' + ((RC.recall(id) || {}).city || '')).toLowerCase();
        return w.every(x => ad.indexOf(x) >= 0);
      });
      const label = want ? want[1] : /not now/.test(st) ? 'Not now' : 'in your pipeline';
      return { ok: true, say: l.length ? plural(l.length, 'home') + (want ? ' at ' + want[1] : '') + (w.length ? ' on ' + a.words : '') + '.' : 'No homes match that.',
        data: l.slice(0, 20).map(id => ({ id, street: addrOf(id), stage: RC.stageName(p[id].stage) })), card: { kind: 'list', title: 'Homes ' + (want ? 'at ' + want[1] : label), rows: l.slice(0, 30).map(id => homeRow(id, RC.stageName(p[id].stage))), empty: 'No homes' } };
    }
  };
  // ---------- past customers (names stay on the card, never in what is said or sent) ----------
  // ---------- the morning questions: who to call today, what is next, how many were hit (the Daily 50 queue) ----------
  T.call_today = {
    description: 'Today\'s call list from the Daily 50 queue: the top open homes by Opportunity Score with address, score and the main reason; also how many homes on the list were hit by hail.',
    input_schema: obj({ count: { type: 'number' }, ask: { type: 'string', enum: ['call', 'next', 'hit'] } }),
    async run(a) {
      const list = await Tools.waitFor(() => Tools.dailyList().length && Tools.dailyList(), 9000) || [];
      if (!list.length) return { ok: true, say: 'Today\'s list is still loading. Ask me again in a moment.' };
      const open = list.filter(x => x.status === 'open');
      if (a.ask === 'hit') {
        const hit = list.filter(x => x.hail != null && x.hail > 0).length;
        return { ok: true, say: hit + ' of the ' + list.length + ' homes on today\'s list were hit by hail. ' + plural(open.length, 'home') + ' still to reach.', data: { hit, total: list.length, open: open.length } };
      }
      const dw = Tools.win('daily'), OC = dw && dw.OPPC;
      const sc = async d => { let s = null; if (OC && d.gi != null) { try { s = await Promise.race([OC.get(d.gi), new Promise(r => setTimeout(() => r(null), 8000))]); } catch (e) { } }
        const r0 = s && OC.reasons(s, 1)[0], pw = s && plainWhy(s, d), wl = pw && pw.length ? pw : null;
        return { d, score: s ? s.total : null, wl, why: wl ? wl.slice(0, 3).join(', ') : (r0 ? r0.label.toLowerCase() + ', ' + clean0(String(r0.line).split(/\. /)[0]) : clean0((d.why || [])[0] || '')) }; };
      const n = Math.max(1, Math.min(10, +a.count || (a.ask === 'next' ? 1 : 5)));
      const rows = (await Promise.all(open.map(sc))).sort((x, y) => (y.score == null ? -1 : y.score) - (x.score == null ? -1 : x.score)).slice(0, n);
      // neighbors share a storm: skip a reason the home just above already gave, so each line says something new
      for (let i = 1; i < rows.length; i++) { const pv = rows[i - 1].wl, cu = rows[i].wl; if (!pv || !cu) continue;
        const fresh = cu.filter(t => pv.indexOf(t) < 0); rows[i].why = (fresh.length ? fresh : cu).slice(0, 3).join(', '); }
      if (!rows.length) return { ok: true, say: 'All ' + list.length + ' homes on today\'s list are done. Nice work.' };
      const line = r => short(r.d.address) + (r.score != null ? ', Score ' + r.score + '/100' : '') + (r.why ? ', ' + r.why.replace(/\.$/, '') : '');
      const say = a.ask === 'next' ? 'Next up is ' + line(rows[0]) + '.' : 'Call these first: ' + rows.map((r, i) => (i + 1) + '. ' + line(r)).join('. ') + '. ' + plural(open.length, 'home') + ' left on today\'s list.';
      return { ok: true, say, data: rows.map(r => ({ id: r.d.id, street: short(r.d.address), score: r.score, why: r.why })),
        card: { kind: 'list', title: 'Call today', rows: rows.map(r => homeRow(r.d.id, r.score != null ? 'Score ' + r.score + '/100' : '')) } };
    }
  };
  // the call list in plain words, strongest first: "1 inch hail Mar 25, roof about 37 years, 2 neighbors re-roofed"
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = iso => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso || ''); if (!m) return '';
    return MON[+m[2] - 1] + ' ' + (+m[1] !== new Date().getFullYear() ? m[1] : +m[3]); };   // Apr 27 this year, May 2025 before (no comma inside the list)
  function plainWhy(s, d) {
    const P = s.parts || {}, bits = [];
    const add = (pts, t) => { if (pts > 0 && t) bits.push([pts, t]); };
    const h = P.hail, hs = h && h.storm;
    if (hs && hs.inches) { const i = Math.round(hs.inches * 4) / 4; add(h.pts, (i === 1 ? '1 inch' : (+i.toFixed(2)) + ' inch') + ' hail ' + day(hs.iso)); }
    const a = P.roofAge; if (a && a.years) add(a.pts, 'roof about ' + Math.round(a.years) + ' years');
    const nb = P.neighbours || P.neighbors, nn = d.neighbours;
    if (nn > 0) add((nb && nb.pts) || 1, nn === 1 ? '1 neighbor re-roofed' : nn + ' neighbors re-roofed');
    const wd = P.wind, g = wd && wd.gust; if (g && g.mph && !(hs && hs.inches)) add(wd.pts, g.mph + ' mph wind ' + day(g.iso));   // hail already says the storm hit
    return bits.sort((x, y) => y[0] - x[0]).slice(0, 4).map(b => b[1]);
  }
  const clean0 = s => String(s).replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  T.past_customers = {
    description: 'The roofer\'s past customers: how many, who has not been asked for a review or referral, and their streets.',
    input_schema: obj({ words: { type: 'string' } }),
    async run(a) {
      const l = (RC.__get('pastCust', []) || []).filter(c => !a.words || (c.addr + ' ' + c.city + ' ' + (c.jobType || '')).toLowerCase().indexOf(String(a.words).toLowerCase()) >= 0);
      const notAsked = l.filter(c => !(c.flows && c.flows.review && c.flows.review.s)).length;
      return { ok: true, say: plural(l.length, 'past customer') + '. ' + (notAsked ? notAsked + ' not asked for a review yet.' : 'Everyone has been asked for a review.'),
        data: { count: l.length, not_asked_review: notAsked, streets: l.slice(0, 10).map(c => c.addr) },
        card: { kind: 'list', title: 'Past customers', rows: l.slice(0, 30).map(c => ({ t: c.name || c.addr, s: c.addr + (c.jobDate ? ', ' + c.jobDate : ''), go: { screen: 'home', params: { view: 'customers' } } })), empty: 'No past customers yet' } };
    }
  };
  // ---------- results (lib/rc-results.js, counts only) ----------
  function loadResults() {
    if (window.RCR) return Promise.resolve(window.RCR);
    return new Promise(res => { const s = document.createElement('script'); s.src = 'lib/rc-results.js'; s.onload = () => res(window.RCR || null); s.onerror = () => res(null); document.head.appendChild(s); });
  }
  T.results = {
    description: 'Results: leads, homes reached, replies, inspections, proposals, jobs won and revenue for this month or this year (counts only).',
    input_schema: obj({ period: { type: 'string', enum: ['this_month', 'this_year', 'last_30_days'] } }),
    async run(a) {
      const R = await loadResults(); if (!R) return { ok: false, say: 'Results did not load.' };
      const now = new Date(), from = a.period === 'this_year' ? new Date(now.getFullYear(), 0, 1).getTime() : a.period === 'last_30_days' ? Date.now() - 30 * DAY : new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const out = R.compute(from, Date.now()), tot = (out && out.totals) || { leads: 0, reached: 0, replies: 0, inspections: 0, won: 0, revenue: 0 };
      const label = a.period === 'this_year' ? 'this year' : a.period === 'last_30_days' ? 'in the last 30 days' : 'this month';
      return { ok: true, say: label[0].toUpperCase() + label.slice(1) + ': ' + tot.reached + ' homes reached, ' + tot.replies + ' replies, ' + tot.inspections + ' inspections, ' + tot.won + ' jobs won' + (tot.revenue ? ', $' + RC.fmt(tot.revenue) + ' signed' : '') + '.',
        data: tot, card: { kind: 'stats', title: 'Results ' + label, stats: [['Reached', tot.reached], ['Replies', tot.replies], ['Inspections', tot.inspections], ['Won', tot.won]] } };
    }
  };
  // ---------- SEO (lib/seo-jackson.json: what Wing published) ----------
  T.seo = {
    description: 'The roofer\'s website work Wing publishes: how many blog posts and service pages, what went up this month, what is next.',
    input_schema: obj({}),
    async run() {
      const d = await fetch('lib/seo-jackson.json').then(r => r.ok ? r.json() : null).catch(() => null);
      if (!d) return { ok: false, say: 'The SEO list did not load.' };
      const c = d.counts || {}, nx = (d.next || [])[0];
      return { ok: true, say: 'Wing has published ' + (c.total || 0) + ' pages for you, ' + (c.blog || 0) + ' blog posts and ' + (c.service || 0) + ' service pages, ' + (c.this_month || 0) + ' this month.' + (nx ? ' Next up: ' + nx.title + '.' : ''),
        data: c, card: { kind: 'list', title: 'Website pages', rows: (d.items || []).slice(0, 8).map(i => ({ t: i.title, s: i.type + ', ' + i.date, href: i.url })) } };
    }
  };
  // ---------- storms ----------
  T.storms = {
    description: 'Storms on file: the biggest storms in a period (this month, this year, last year, all), with homes hit and hail size.',
    input_schema: obj({ period: { type: 'string', enum: ['this_month', 'this_year', 'last_year', 'all'] } }),
    async run(a) {
      await RC.factsReady; const c = RC.catalog; if (!c) return { ok: false, say: 'The storm list has not loaded.' };
      const y = new Date().getFullYear(), ym = new Date().toISOString().slice(0, 7);
      const l = c.storms.filter(s => a.period === 'this_month' ? s.date.slice(0, 7) === ym : a.period === 'this_year' ? s.date.slice(0, 4) === String(y) : a.period === 'last_year' ? s.date.slice(0, 4) === String(y - 1) : true)
        .filter(s => s.homes_1in > 0).sort((p, q) => q.homes_1in - p.homes_1in);
      const d = s => new Date(s.date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
      return { ok: true, say: l.length ? plural(l.length, 'storm') + ' with inch hail on homes. Biggest: ' + d(l[0]) + ', ' + RC.fmt(l[0].homes_1in) + ' homes.' : 'No storms with inch hail on homes in that time.',
        data: l.slice(0, 10).map(s => ({ date: s.date, homes_1in: s.homes_1in, max_in: s.max_in })), card: { kind: 'list', title: 'Storms', rows: l.slice(0, 12).map(s => ({ t: d(s), s: RC.fmt(s.homes_1in) + ' homes, up to ' + s.max_in + ' in', go: { screen: 'storm', params: { iso: s.date } } })), empty: 'No storms' } };
    }
  };

  // ---------- client memory: every home, call, text, note and booking on file ----------
  const STOP = new Set(['the', 'that', 'who', 'whos', 'was', 'lady', 'guy', 'man', 'woman', 'house', 'home', 'one', 'on', 'at', 'with', 'wanted', 'want', 'an', 'a', 'is', 'it', 'and', 'for', 'about', 'her', 'his', 'them', 'they', 'did', 'we', 'i', 'me', 'my', 'remember', 'inspection', 'what', 'whats', 'name', 'street']);
  function recall(q) {
    const t = String(q || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' '), words = t.split(/\s+/).filter(w => w.length > 2 && !STOP.has(w) && WD.indexOf(w) < 0);
    const wd = WD.findIndex(w => t.indexOf(w) >= 0), wantBook = /inspect|book|appoint/.test(t), wantReply = /repl|text(ed)? back|answered|wrote/.test(t), wantWon = /won|signed|job/.test(t);
    const p = RC.pipeline(), out = [];
    Object.keys(p).forEach(id => {
      const e = p[id] || {}, ad = (addrOf(id) + ' ' + ((RC.recall(id) || {}).city || '')).toLowerCase();
      const notes = (e.history || []).map(h => (h.what || '') + ' ' + (h.body || '')).join(' ').toLowerCase();
      let score = 0;
      words.forEach(w => { if (ad.indexOf(w) >= 0) score += 3; else if (notes.indexOf(w) >= 0) score += 1; });
      if (wd >= 0 && e.booked && new Date(e.booked).getDay() === wd) score += 3;
      if (wantBook && e.booked) score += 1;
      if (wantReply && RC.replied(id)) score += 1;
      if (wantWon && RC.stageKey(e.stage) === 'won') score += 1;
      if (score > 0) out.push({ id, score });
    });
    return out.sort((a, b) => b.score - a.score).slice(0, 3).map(x => {
      const e = p[x.id], h = (e.history || []).slice(0, 6);
      return { id: x.id, street: addrOf(x.id), stage: RC.stageName(e.stage), booked: e.booked || null, replied: RC.replied(x.id), archived: !!e.archived,
        history: h.map(i => ({ at: i.at, what: String(i.what || '').replace(/\(\d{3}\)\s*\d{3}-\d{4}|\b\d{3}[-. ]\d{3}[-. ]\d{4}\b/g, '[phone]'), dir: i.dir || 'out' })) };
    });
  }
  T.recall_homeowner = {
    description: 'Client memory: find a homeowner the roofer has dealt with from what he remembers ("the lady on Merribrook that wanted a Thursday inspection", "who replied about the leak on Hickory"). Returns the home, stage, booking and recent history. Names and phones are shown on screen only, never in your words.',
    input_schema: obj({ query: { type: 'string' } }, ['query']),
    async run(a) {
      const m = recall(a.query);
      if (!m.length) return { ok: true, say: 'I do not have anyone on file that matches. Try the street name.' };
      const b = m[0];
      const last = b.history.find(h => !/^Inspection booked/.test(h.what));
      const say = 'That is ' + b.street + '. ' + (b.booked ? 'Inspection ' + spoken(b.booked) : b.stage) + (b.replied ? ', and they replied' : '') + '. ' + (last ? 'Before that: ' + last.what.replace(/\.$/, '') + '. ' : '') + 'Tap Show name and phone on screen for the contact.';
      return { ok: true, say, data: m, card: { kind: 'memory', title: b.street, home: b, more: m.slice(1).map(x => homeRow(x.id, x.stage)) } };
    }
  };

  // ---------- the settings layer and requests to Wing ----------
  T.change_setting = {
    description: 'Change one of the roofer\'s settings. setting: routeSize (value: number of homes 10-100), cities (value: city names, or "all"), textWindow (value: {open, close} hours 0-24, must stay inside 9 am to 8 pm), stageNames (value: {from, to}), tone (value: casual or standard, for text drafts), briefing (value: on or off), customFields (value: {label} to add a field to every home record, {label, remove: true} to remove). Ask "want to keep it?" after.',
    input_schema: { type: 'object', properties: { setting: { type: 'string', enum: ['routeSize', 'cities', 'textWindow', 'stageNames', 'tone', 'briefing', 'customFields'] }, value: {} }, required: ['setting', 'value'] },
    async run(a) { return NimbusSettings.change(a.setting, a.value); }
  };
  T.set_field = {
    description: 'Set one of the roofer\'s own fields (added with change_setting customFields) on the home on screen, like insurance company = State Farm.',
    input_schema: obj({ field: { type: 'string' }, value: { type: 'string' } }, ['field', 'value']),
    async run(a) { return NimbusSettings.setField(Tools.currentHome(), a.field, a.value); }
  };
  T.request_change = {
    description: 'Anything the roofer wants the software to do that the settings cannot (a new screen, a report, an integration, a different layout): send it to Wing as a request. Use the roofer\'s own words.',
    input_schema: obj({ text: { type: 'string' } }, ['text']),
    async run(a) { return NimbusSettings.request(a.text, Tools.screen()); }
  };
  T.my_settings = {
    description: 'What the roofer has changed so far (route size, cities, texting hours, stage names, tone, fields) and his requests to Wing.',
    input_schema: obj({}),
    async run() {
      const d = NimbusSettings.describe(), r = NimbusSettings.requests();
      return { ok: true, say: (d.length ? 'You have changed: ' + d.join('; ') + '.' : 'Everything is on the standard settings.') + (r.length ? ' ' + plural(r.length, 'request') + ' sent to Wing.' : ''),
        data: { settings: d, requests: r.map(x => x.text) }, card: { kind: 'list', title: 'Your settings', rows: d.map(x => ({ t: x })).concat(r.map(x => ({ t: 'Request: ' + x.text, s: x.status }))), empty: 'Standard settings' } };
    }
  };
  window.NimbusData = { recall };
})();
