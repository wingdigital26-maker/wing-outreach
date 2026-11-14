/* rc-layout.js: which named parts of a screen show, and in what order (Nimbus edits the app by talking, 11-02).
   Reads only rc.t.settings[<roofer>]: hiddenSections (keys below) and layoutOrder ({ house: [keys], facts: [keys] }).
   Settings hold keys, never selectors or CSS: anything not in this list does nothing. Loaded right after rc-state.js in the
   shell, Today and the CRM. Other frames hear a change through the storage event, so nothing reloads and nobody loses their place.
   Plain script, window.RCLayout. */
(function () {
  'use strict';
  if (window.RCLayout || !window.RC) return;
  const S = (key, screen, label, sel, aliases, extra) => ({ key, screen, label, sel, aliases: aliases || [], extra: extra || '' });
  const side = (k, label, id, aliases) => S('side.' + k, 'sidebar', label, '#nav button[data-screen="' + id + '"]', aliases);
  const crmTab = (k, label, v, aliases) => S('crm.' + k, 'crm', label + ' tab', '#vtabs [data-v="' + v + '"]', aliases);
  const SECTIONS = [
    side('storms', 'Storms', 'storm', ['storms', 'storm map']), side('crm', 'CRM', 'home', ['crm']),
    side('find', 'Find', 'find', ['find', 'find homes']), side('seo', 'SEO', 'seo', ['seo', 'seo agent']), side('pages', 'Page plan', 'pages', ['page plan', 'pages to make']), side('results', 'Results', 'results', ['results', 'reports']),
    crmTab('inbox', 'the Inbox', 'inbox', ['inbox']), crmTab('pipeline', 'the Pipeline', 'pipeline', ['pipeline', 'leads']), crmTab('calendar', 'the Calendar', 'calendar', ['calendar']), crmTab('customers', 'the Past customers', 'customers', ['customers', 'past customers']),
    S('over.hero', 'overview', 'the next home banner', '#ovHero', ['next home', 'next up', 'banner', 'hero']),
    S('over.next', 'overview', 'the Up next panel', '#ovPanel', ['up next', 'up next panel']),
    S('over.cards', 'overview', 'the four summary cards', '#ovCards', ['summary', 'summary cards', 'cards', 'dashboards', 'mini dashboards']),
    S('over.radar', 'overview', 'the radar line', '#tipHd', ['radar line', 'radar checked line', 'hail radar line']),
    S('over.map', 'overview', 'the map', '#mapHost', ['map', 'route map', 'messages map'], '.main{grid-template-columns:minmax(0,auto) minmax(0,1fr)!important}'),
    S('leads.counts', 'leads', 'the stage counts', '#pcount', ['stage counts', 'counts', 'stage boxes', 'stage tiles']),
    S('leads.hail', 'leads', 'the hail on the cards', '.pc .phail', ['hail', 'hail on the cards']),
    S('house.photo', 'house', 'the satellite photo', '.house .hmap', ['photo', 'satellite photo', 'picture', 'map'], '.house .hgrid{grid-template-columns:minmax(0,1fr)!important}.house .hside{flex-direction:row;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}'),
    S('house.owner', 'house', 'the Owner box', '.house [data-sec="owner"]', ['owner', 'owner box', 'owner card']),
    S('house.stage', 'house', 'the stage box', '.house [data-sec="stage"]', ['stage box', 'where this lead is', 'stage buttons', 'history']),
    S('house.facts', 'house', 'the house facts', '.house .hfacts', ['facts', 'house facts', 'facts on file']),
    S('house.hail', 'house', 'the hail history', '.house #hStorm', ['hail', 'hail history', 'hail section', 'storm history']),
    S('fact.built', 'house', 'Built', '.house [data-f="built"]', ['built', 'year built']),
    S('fact.area', 'house', 'Living area', '.house [data-f="area"]', ['living area', 'square feet', 'sq ft']),
    S('fact.reroof', 'house', 'Last new roof', '.house [data-f="reroof"]', ['last new roof', 'last re roof', 'last reroof', 'permit']),
    S('fact.lives', 'house', 'Owner lives here', '.house [data-f="lives"]', ['owner lives here', 'lives here']),
    S('fact.county', 'house', 'County', '.house [data-f="county"]', ['county']),
    S('fact.hood', 'house', 'Neighborhood', '.house [data-f="hood"]', ['neighborhood', 'subdivision'])
  ];
  // what can move: only inside these two stacks on the house page
  const ORDERS = {
    house: { label: 'the house page', items: { 'house.photo': '.house .hgrid', 'house.facts': '.house .hfacts', 'house.hail': '.house #hStorm' }, css: 'body.house-on[data-view="home"] .house{display:flex;flex-direction:column}.house>.hh{order:-1}' },
    facts: { label: 'the house facts', items: { 'fact.built': '[data-f="built"]', 'fact.area': '[data-f="area"]', 'fact.reroof': '[data-f="reroof"]', 'fact.lives': '[data-f="lives"]', 'fact.county': '[data-f="county"]', 'fact.hood': '[data-f="hood"]' }, css: '' }
  };
  const SCREEN_WORDS = { sidebar: /\b(sidebar|side bar|menu|left side|nav)\b/, crm: /\b(crm tabs?|tabs?)\b/, overview: /\b(overview|today|home screen)\b/, leads: /\b(leads|lead list|pipeline|board)\b/, house: /\b(house page|home page|house record|record|this house|house screen)\b/ };
  const clean = t => String(t || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\b(the|my|a|an|please|for me|section|panel|box|from|on|in|off|of|all|again|sidebar|side bar|menu|left side|overview|today|leads|lead list|house page|home page|house record|record|screen|page)\b/g, m => /^(leads|today|overview)$/.test(m) ? m : ' ').replace(/\s+/g, ' ').trim();
  // the screen on show now, in these words
  function hereNow() {
    const s = document.body && document.body.dataset.screen;
    if (s === 'daily') return 'overview';
    if (s === 'home') { const f = document.querySelector('#f iframe[data-screen="home"]'); let v = ''; try { v = f.contentWindow.crmView(); } catch (e) { } return v === 'pipeline' ? 'leads' : v === 'home' ? 'house' : ''; }
    return '';
  }
  // a phrase -> one section. Said screen first ("hide hail on Leads"), then the screen on show, then the list order.
  function find(phrase, here) {
    const raw = String(phrase || '').toLowerCase();
    let said = Object.keys(SCREEN_WORDS).find(k => SCREEN_WORDS[k].test(raw));
    let c = clean(said ? raw.replace(SCREEN_WORDS[said], ' ') : raw);
    if (!c) { c = clean(raw); said = null; }   // "hide leads": the word is the thing, not the place
    const hits = SECTIONS.filter(s => s.aliases.indexOf(c) >= 0 || clean(s.label) === c);
    if (!hits.length) return null;
    here = here === undefined ? hereNow() : here;
    return hits.find(s => s.screen === said) || (said ? null : hits.find(s => s.screen === here) || hits[0]);
  }
  const whereWord = s => ({ sidebar: 'in the sidebar', crm: 'in the CRM', overview: 'on Today', leads: 'on the Pipeline', house: 'on the house page' })[s.screen];
  const bySel = k => SECTIONS.find(s => s.key === k);
  function css(m) {
    let out = '';
    (m.hiddenSections || []).forEach(k => { const s = bySel(k); if (s) out += s.sel + '{display:none!important}' + s.extra; });
    const o = m.layoutOrder || {};
    Object.keys(ORDERS).forEach(g => { const list = o[g]; if (!Array.isArray(list) || !list.length) return; const G = ORDERS[g]; out += G.css;
      list.forEach((k, i) => { if (G.items[k]) out += G.items[k] + '{order:' + i + '}'; }); });
    const n = RC.stagesFrom(m).length + 1;
    if (n !== 7) out += '@media (min-width:1100px){.pcount{grid-template-columns:repeat(' + n + ',minmax(0,1fr))}}';
    return out;
  }
  function apply() {
    let el = document.getElementById('rcLayout');
    if (!el) { el = document.createElement('style'); el.id = 'rcLayout'; (document.head || document.documentElement).appendChild(el); }
    const m = (RC.__get('settings', {}) || {})[RC.rooferKey()] || {}, t = css(m);
    if (el.textContent !== t) { el.textContent = t; try { dispatchEvent(new Event('resize')); } catch (e) { } }
    // a sidebar heading with nothing left under it goes too
    document.querySelectorAll('#nav .grp').forEach(g => { let n = g.nextElementSibling, any = false; while (n && !n.classList.contains('grp')) { const h = (m.hiddenSections || []).some(k => { const s = bySel(k); return s && s.screen === 'sidebar' && n.matches(s.sel); }); if (!h) any = true; n = n.nextElementSibling; } g.style.display = any ? '' : 'none'; });
  }
  apply();
  if (RC.on) RC.on(d => { if (!d || d.key === 'settings') apply(); });
  window.RCLayout = { SECTIONS, ORDERS, find, apply, whereWord, here: hereNow, get: k => bySel(k) };
})();
