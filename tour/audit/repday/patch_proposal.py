"""One-off patch (10-22): proposal.js -> price per square, LiDAR squares as an estimate, no outline stand-in drawing."""
p = 'C:/Users/wjack/roof-command-sell/tour/c5-home/proposal.js'; s = open(p, encoding='utf-8').read()
a = """  const mine = () => Object.assign({ price: '', notes: '' }, (G('prop.house', {}) || {})[rawId] || {});
  const save = o => { const all = G('prop.house', {}) || {}; if (o.price === '' && !o.notes) delete all[rawId]; else all[rawId] = o; S('prop.house', all); };
"""
b = """  const mine = () => Object.assign({ price: '', notes: '', sq: '' }, (G('prop.house', {}) || {})[rawId] || {});
  const save = o => { const all = G('prop.house', {}) || {}; if (o.price === '' && !o.notes && o.sq === '') delete all[rawId]; else all[rawId] = o; S('prop.house', all); };
  // the roofer's price per square (10-22): one figure for every proposal on this device
  const rate = () => { const r = G('prop.rate', ''); return r === '' || r == null || !isFinite(+r) || +r <= 0 ? null : +r; };
"""
assert a in s; s = s.replace(a, b)
a = "  let M = null, F = null, D = null, SP = null;"
assert a in s; s = s.replace(a, "  let M = null, F = null, D = null, SP = null, PASSED = false;")
a = "      if (!e || RealRoof.modelFor(e) !== 'outline') return m;"
b = """      if (e && RealRoof.modelFor(e) === 'model') PASSED = true;   // the measured model passed its soundness + LiDAR fit gates
      if (!e || RealRoof.modelFor(e) !== 'outline') return m;"""
assert a in s; s = s.replace(a, b)
i = s.index("  function render() {"); j = s.index("  function paintEntry() {")
s = s[:i] + r"""  function render() {
    const m = M, addr = F && F.addr ? F.addr + (F.place ? ', ' + F.place : '') : (m.address || 'Address not on file');
    $('#dAddr').textContent = addr; document.title = 'Roof proposal, ' + addr;
    $('#dDate').textContent = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const yr = m.year, row = F && F.roof, pitch = row && window.RCROOF ? RCROOF.pitches(row).join(' + ') : m.pitches.map(p => p.pitch).join(' + ');
    $('#roofH').textContent = PASSED ? 'Your roof, from aerial survey data' : 'Your roof size, from aerial survey data';
    // the same words as the record: squares are an estimate from the LiDAR record; a roof drawing, sections and edge lengths
    // only when the measured model passed its checks (never the outline stand-in, Jack 10-22)
    $('#kpis').innerHTML = [
      ['Roof area', '~' + n1(m.areaSqft) + ' sq ft', 'estimate'],
      ['Squares', '~' + n1(m.squares), `estimate from ${yr} LiDAR; 1 square = 100 sq ft`],
      ['Pitch', pitch || 'not on file', `${yr} LiDAR, to the nearest 12th`]
    ].concat(PASSED ? [['Sections', m.facetsN || 'not on file', '']] : []).map(([a, v, s]) => `<div><span>${esc(a)}</span><b>${esc(v)}</b>${s ? `<small>${esc(s)}</small>` : ''}</div>`).join('');
    $('#kpis').style.gridTemplateColumns = PASSED ? '' : 'repeat(3,1fr)';
    if (!PASSED) {
      $('#diag').innerHTML = ''; $('#edges').innerHTML = '';
      $('#secs').innerHTML = `<p class="muted">The roof is measured section by section when it is inspected in person. Squares here are an estimate from aerial survey data (typically within 6 to 8% of a roofer's own count).</p>`;
    } else {
      const svg = D && D.geometry_ft ? RCROOF.diagramSVG(D, 760) : SP ? RealRoof.planSVG(SP, 760) : '';
      $('#diag').innerHTML = svg ? `<figure>${svg}<figcaption>Top-down view, lengths in feet. Each lettered section is one roof plane with its pitch.</figcaption></figure>` : '';
      $('#secs').innerHTML = m.sections.length ? `<h3>Sections</h3><table class="t"><thead><tr><th>Section</th><th>Pitch</th><th>Faces</th><th class="n">Sq ft</th></tr></thead><tbody>${
        m.sections.slice().sort((a, b) => b.sqft - a.sqft).map(s => `<tr><td>${esc(s.id)}</td><td>${esc(s.pitch)}</td><td>${esc(s.faces)}</td><td class="n">${n1(s.sqft)}</td></tr>`).join('')
      }</tbody><tfoot><tr><td colspan="3">Total</td><td class="n">${n1(m.sections.reduce((a, s) => a + s.sqft, 0))}</td></tr></tfoot></table>` : '';
      const E = m.edges, rows = [['Ridges', E.ridge], ['Hips', E.hip], ['Valleys', E.valley], ['Eaves', E.eave], ['Rakes', E.rake]];
      if (m.source === 'detail') { if (E.step) rows.push(['Step flashing', E.step]); rows.push(['Wall flashing', E.wall]); } else rows.push(['Wall flashing', E.flashing]);
      $('#edges').innerHTML = `<h3>Edge lengths</h3><table class="t"><tbody>${rows.map(([a, v]) => `<tr${v > 0 ? '' : ' class="z"'}><td>${a}</td><td class="n">${n1(Math.round(v || 0))} ft</td></tr>`).join('')}</tbody></table>`;
    }
    $('#srcLine').textContent = `Roof size and pitch: estimated from ${yr} LiDAR aerial survey data, not a tape measure, and confirmed when the roof is inspected.`;
    paintEntry();
  }
""" + s[j:]
i = s.index("  function paintEntry() {"); j = s.index("  $('#bPrint')")
s = s[:i] + r"""  // squares to price: the rep's own figure once typed (after the inspection), else the aerial estimate
  function priced() {
    const o = mine(), r = rate(), own = o.sq !== '' && o.sq != null && isFinite(+o.sq) && +o.sq > 0, sq = own ? +o.sq : (M ? M.squares : null);
    if (r && sq) return { total: Math.round(r * sq), how: `${n1(sq)} squares${own ? '' : ' (aerial estimate)'} x ${money(r)} per square` };
    const legacy = o.price === '' || o.price == null || !isFinite(+o.price) ? null : +o.price;   // a total typed before price per square
    return legacy != null ? { total: legacy, how: '' } : null;
  }
  function paintEntry() {
    const o = mine(), p = priced(), t = String(o.notes || '').trim();
    $('#priceBlk').hidden = !p; $('#price').textContent = p ? money(p.total) : ''; $('#priceHow').textContent = p ? p.how : '';
    const ft = $('#fTot'); if (ft) ft.innerHTML = p ? `Total on the proposal: <b>${esc(money(p.total))}</b>` : 'Add your price per square to put a total on the proposal.';
    $('#notesBlk').hidden = !t; $('#notes').textContent = t;
  }
  function wire() {
    const o = mine(), fr = $('#fRate'), fs = $('#fSq'), fn = $('#fNotes');
    fr.value = rate() || ''; fs.value = o.sq !== '' && o.sq != null ? o.sq : (M ? M.squares : ''); fn.value = o.notes || '';
    const put = () => { S('prop.rate', fr.value === '' ? '' : +fr.value);
      const own = fs.value !== '' && M && Math.abs(+fs.value - M.squares) > 0.05 ? +fs.value : '';
      save({ price: mine().price, sq: own, notes: fn.value }); paintEntry(); };
    fr.addEventListener('input', put); fs.addEventListener('input', put); fn.addEventListener('input', put);
  }
""" + s[j:]
s = s.replace("'No roof measurement on file for this home yet, so no proposal can be built from it. Measure it on site.'",
              "'No LiDAR roof size on file for this home, so the proposal needs the roof measured on site first.'")
open(p, 'w', encoding='utf-8').write(s); print('patched')
