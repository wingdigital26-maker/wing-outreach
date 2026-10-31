"""One-off patch (Jack 10-23): the record's 'LiDAR measurements' view (lib/rc-measure.js) in the Roof report tab, renamed,
plus a Measurements chip on the 3D toolbar that opens it."""
R = 'C:/Users/wjack/roof-command-sell/tour/c5-home/'

def patch(rel, pairs):
    p = R + rel; s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert a in s, (rel, a[:70]); s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf-8').write(s)

patch('index.html', [
    ('<script src="../lib/rc-roof.js"></script>', '<script src="../lib/rc-roof.js"></script>\n<script src="../lib/rc-measure.js"></script><!-- LiDAR measurements view (Jack 10-23) -->'),
    ('<button type="button" data-t="report" role="tab" aria-selected="false">Roof report</button>',
     '<button type="button" data-t="report" role="tab" aria-selected="false">LiDAR measurements</button>'),
    ('<button type="button" class="chip" data-m="hail" aria-pressed="false"><span class="ic" data-i="hail"></span>Hail</button>',
     '<button type="button" class="chip" data-m="hail" aria-pressed="false"><span class="ic" data-i="hail"></span>Hail</button>\n'
     '        <button type="button" class="chip" id="bMeasure" title="Top view of the roof lines and lengths"><span class="ic" data-i="ruler"></span>LiDAR measurements</button>'),
])
patch('rec.js', [
    ("""    if (M && M.checking) { if (me !== rawId) return; const W = rec.roof && window.RCROOF ? RCROOF.words(rec.roof) : null;""",
     """    if (M && M.checking && window.RCMEASURE) { if (me !== rawId) return;
      const gi = rec.gi != null ? +rec.gi : mm ? +mm[1] : null, e = gi != null && window.RealRoof && RealRoof.mapCached ? RealRoof.mapCached(gi) : null;
      const h = RCMEASURE.viewHTML({ entry: e, words: rec.roof && window.RCROOF ? RCROOF.words(rec.roof) : null, year: rec.roof && rec.roof.year });
      if (h) { if (reportEl.__h !== h) { reportEl.innerHTML = h; reportEl.__h = h; } return; } }
    if (M && M.checking) { if (me !== rawId) return; const W = rec.roof && window.RCROOF ? RCROOF.words(rec.roof) : null;"""),
    ("  window.setTab = setTab;",
     "  window.setTab = setTab;\n"
     "  // the 3D toolbar's LiDAR measurements chip: the measurements tab, scrolled into view\n"
     "  { const bm = $('#bMeasure'); if (bm) bm.onclick = () => { (window.setTab || setTab)('report'); const t = $('#measPanel'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }; }"),
])
print('patched')
