/* Fills an onboarding page from roofers.js. Load roofers.js first, this file at the end of <body>.
   - {{field}} anywhere in the body becomes that roofer field (WING fields as {{wing.field}}).
   - <header data-hd> gets the Wing mark + roofer logo, <nav data-nav> the page links, <footer data-ft> the footer.
   - ?print=1 opens every <details> (the PDF build uses it). Nothing here sends or fetches anything. */
(function () {
  var q = new URLSearchParams(location.search);
  var key = q.get('roofer') || 'template';
  var R = window.ONBOARD_ROOFERS[key] ? window.ONBOARD_ROOFERS[key] : window.ONBOARD_ROOFERS.template;
  if (!window.ONBOARD_ROOFERS[key]) key = 'template';
  window.ROOFER = R; window.ROOFER_KEY = key;

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var get = function (path) {
    if (path.indexOf('wing.') === 0) return window.WING[path.slice(5)];
    if (path === 'ownerOr') return R.owner || 'the owner';
    if (path === 'startLine') return R.start ? 'Day 0 is ' + R.start + '.' : '';
    return R[path];
  };

  var root = document.documentElement.style;
  root.setProperty('--r-accent', R.accent); root.setProperty('--r-soft', R.soft);
  root.setProperty('--r-ink', R.ink); root.setProperty('--r-plate', R.plate);

  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  var n; while ((n = walker.nextNode())) {
    if (n.nodeValue.indexOf('{{') > -1) n.nodeValue = n.nodeValue.replace(/\{\{([\w.]+)\}\}/g, function (m, p) { var v = get(p); return v == null ? m : v; });
  }
  document.querySelectorAll('[placeholder*="{{"],[value*="{{"]').forEach(function (el) {
    ['placeholder', 'value'].forEach(function (a) { var v = el.getAttribute(a); if (v) el.setAttribute(a, v.replace(/\{\{([\w.]+)\}\}/g, function (m, p) { var x = get(p); return x == null ? m : x; })); });
  });
  document.title = document.title.replace('{{name}}', R.name);

  var suffix = key === 'template' ? '' : '?roofer=' + encodeURIComponent(key);
  var hd = document.querySelector('[data-hd]');
  if (hd) {
    var logo = R.logo ? '<span class="logo"><img src="' + esc(R.logo) + '" alt="' + esc(R.name) + '"></span>' : '<span class="logo ph">Your logo</span>';
    hd.className = 'hd';
    hd.innerHTML = '<a class="wing" href="index.html' + suffix + '" style="color:inherit;text-decoration:none"><img src="assets/wing-mark.png" alt="">Wing Digital</a>' +
      '<div class="co"><span class="lbl">Roof Command for<br><b style="color:var(--ink)">' + esc(R.name) + '</b></span>' + logo + '</div>';
  }
  var pages = [['index.html', 'Start here'], ['welcome.html', 'Welcome'], ['needs.html', 'What we need'], ['timeline.html', '14-day launch'],
    ['kickoff.html', 'Kickoff call'], ['rep-quickstart.html', 'Rep quick-start'], ['faq.html', 'FAQ and rules'], ['intake.html', 'Intake form']];
  var here = location.pathname.split('/').pop() || 'index.html';
  var nav = document.querySelector('[data-nav]');
  if (nav) {
    nav.className = 'nav';
    nav.innerHTML = pages.map(function (p) { return '<a href="' + p[0] + suffix + '"' + (p[0] === here ? ' class="on"' : '') + '>' + p[1] + '</a>'; }).join('');
  }
  document.querySelectorAll('a[data-keep]').forEach(function (a) { a.href = a.getAttribute('href') + suffix; });
  var ft = document.querySelector('[data-ft]');
  if (ft) { ft.className = 'ft'; ft.innerHTML = '<span>Wing Digital · Roof Command onboarding · prepared for ' + esc(R.name) + '</span><span>Private: for ' + esc(R.short) + ' and Wing only</span>'; }

  if (q.get('print') === '1') document.querySelectorAll('details').forEach(function (d) { d.open = true; });
  window.addEventListener('beforeprint', function () { document.querySelectorAll('details').forEach(function (d) { d.open = true; }); });
})();
