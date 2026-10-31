"""One-off patch (Jack 10-23): KEY FACTS FIRST on the home record: a compact row under the address with the owner (initials
until messaged), the house age, the last 1 in+ hail at the house (date + size, radar), the last re-roof where a permit
exists, and the roof size (LiDAR est.). Each from its source, nothing guessed; wraps at phone width."""
R = 'C:/Users/wjack/roof-command-sell/tour/c5-home/'

def patch(rel, pairs):
    p = R + rel; s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert a in s, (rel, a[:70]); s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf-8').write(s)

patch('index.html', [(
    '    <h1 id="addr"></h1>\n',
    '    <h1 id="addr"></h1>\n    <div class="kf" id="keyf" aria-label="Key facts"></div><!-- rec.js keyFacts (Jack 10-23: key facts first) -->\n')])

patch('home.css', [(
    "/* Add phone (10-22)",
    "/* key facts first (Jack 10-23): owner, house age, last hail, last re-roof, roof size; one row that wraps on a phone */\n"
    ".kf{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 12px}\n"
    ".kf>div{display:flex;flex-direction:column;min-width:0;padding:8px 12px;border-radius:12px;background:var(--panel);border:1px solid var(--rule)}\n"
    ".kf span{font-size:11.5px;color:var(--slate);line-height:1.2}.kf b{font-size:15px;font-weight:650;line-height:1.3}.kf i{font-style:normal;font-weight:500;font-size:12px;color:var(--slate)}\n"
    "@media (max-width:640px){.kf{gap:6px}.kf>div{padding:7px 10px;flex:1 1 calc(50% - 6px)}.kf b{font-size:14px}}\n"
    "/* Add phone (10-22)")])

patch('rec.js', [(
    "  // the house facts on the lead card (Jack 10-22)",
    "  // ---------- key facts first (Jack 10-23): the row under the address, every figure from its source ----------\n"
    "  let lastHail = { id: null, v: undefined };\n"
    "  function keyFacts() {\n"
    "    const el = $('#keyf'); if (!el) return;\n"
    "    const gi = rec.gi != null ? +rec.gi : mm ? +mm[1] : null, me = rawId;\n"
    "    if (gi != null && window.RCH && lastHail.id !== me) { lastHail = { id: me, v: undefined };\n"
    "      RCH.history(gi).then(h => { if (lastHail.id !== me) return; const hit = (h || []).filter(x => x.inches >= 1).sort((a, b) => a.iso < b.iso ? 1 : -1)[0];\n"
    "        lastHail.v = hit || null; keyFacts(); }).catch(() => { lastHail.v = null; keyFacts(); }); }\n"
    "    const cell = (a, v, s) => `<div><span>${a}</span><b>${v}</b>${s ? `<i>${s}</i>` : ''}</div>`, out = [];\n"
    "    const own = OWNDATA ? (rec.owner || null) : (rec.person || null);\n"
    "    out.push(cell('Owner', own ? esc(own) : 'Not loaded', own ? 'county roll' : ''));\n"
    "    if (rec.year) out.push(cell('House', 'Built ' + rec.year, (new Date().getFullYear() - rec.year) + ' yrs, county record'));\n"
    "    const lh = lastHail.v;\n"
    "    out.push(cell('Last 1 in+ hail', lh === undefined ? 'Checking' : lh ? lh.inches.toFixed(2) + ' in' : 'None on file', lh ? esc(lh.date) + ', radar' : lh === null ? 'storms since Mar 2024' : ''));\n"
    "    const R = rec.reroof; if (R && !R.none) out.push(cell('Last re-roof', esc(R.date), R.done ? 'permit ' + esc(R.permit) : 'permit, work not confirmed'));\n"
    "    else if (R && R.none) out.push(cell('Last re-roof', 'No permit', 'on file since ' + R.since));\n"
    "    const W = window.RCROOF && rec.roof ? RCROOF.words(rec.roof) : null;\n"
    "    if (W && W.sq > 0) out.push(cell('Roof size', '~' + W.sq + ' sq', 'LiDAR est.'));\n"
    "    el.innerHTML = out.join('');\n"
    "  }\n"
    "  // the house facts on the lead card (Jack 10-22)"),
  ("    const fx = $('#facts'); if (fx)", "    keyFacts();\n    const fx = $('#facts'); if (fx)"),
])
print('patched')
