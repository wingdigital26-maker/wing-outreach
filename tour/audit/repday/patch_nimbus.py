"""One-off patch (10-22): Nimbus answers 'biggest storm last year / in 2025 / ever' from the catalog, and the pipeline answer
counts the New hit homes instead of saying the pipeline is empty."""
p = 'C:/Users/wjack/roof-command-sell/tour/lib/nimbus-shell.js'; s = open(p, encoding='utf-8').read()
a = """    if (namesStorm(t, s) || has('last storm', 'latest storm', 'biggest storm', 'most homes', 'hit the most')) {"""
b = """    // a year asked for ("last year", "this year", "in 2025", "ever"): the storm with the most homes at 1 in+ in it (10-22)
    var yr = /\\blast year\\b/.test(t) ? new Date().getFullYear() - 1 : /\\bthis year\\b/.test(t) ? new Date().getFullYear() : (/\\b(20\\d\\d)\\b/.exec(t) || [])[1];
    var ever = has('ever', 'all time', 'on file');
    if ((yr || ever) && has('storm', 'hail') && RC && RC.catalog && RC.catalog.storms) {
      var inY = RC.catalog.storms.filter(function (x) { return x.date && (ever || x.date.slice(0, 4) === String(yr)); });
      if (!inY.length) return { html: 'No storm with 1 in+ hail on a home here in ' + yr + '. ' + link('See every storm on the map', 'storm', {}) + '.', mood: 'calm' };
      var bs = inY.reduce(function (a2, b2) { return (b2.homes_1in || 0) > (a2.homes_1in || 0) ? b2 : a2; });
      return { html: 'Biggest storm ' + (ever ? 'on file' : 'in ' + yr) + ': <b>' + dayLabel(bs.date) + '</b>, <b>' + fmt(bs.homes_1in || 0) + '</b> homes at 1 in or more, largest hail ' + (bs.max_in || 0) + ' in on radar (' + inY.length + ' storm' + (inY.length === 1 ? '' : 's') + (ever ? ' on file' : ' that year') + '). ' + link('See it on the map', 'storm', { iso: bs.date }) + '.', mood: 'alert', go: wantsOpen ? { screen: 'storm', params: { iso: bs.date } } : null };
    }
    if (namesStorm(t, s) || has('last storm', 'latest storm', 'biggest storm', 'most homes', 'hit the most')) {"""
assert a in s; s = s.replace(a, b, 1)
a = """      if (!parts.length) return { html: 'Nothing in the pipeline on this device yet. Texts, emails and bookings from today\\'s list show up here. ' + link('Open today\\'s list', 'daily', {}) + '.', mood: 'calm' };"""
b = """      if (!parts.length) return { html: 'Today\\'s <b>' + queue() + '</b> homes are in New hit; none has moved on yet. A text, email or booking moves a home along. ' + link('Open today\\'s list', 'daily', {}) + '.', mood: 'calm' };"""
assert a in s, 'pipe'; s = s.replace(a, b, 1)
open(p, 'w', encoding='utf-8').write(s); print('patched')
