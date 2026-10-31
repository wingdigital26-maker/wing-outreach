/* sc.js: paints the storm-check page (tour/storm-check/). Address search over the roofer's county homes (lib/st-meta.js
   STM.search), the radar hail history at the picked home (lib/rc-hail.js), roof facts (STM.facts), then the inspection
   form. The lead goes through lib/rc-webleads.js (source tracking, outbox, pipeline, consent, optional cloud send).
   ?ballpark=demo shows a clearly marked placeholder price range; the real one is the roofer's call (off by default).
   ?h=<proof token> preloads a home (the same token the Proof Page uses). */
(function () {
  'use strict';
  const $ = s => document.querySelector(s), esc = RC.esc, R = activeRoofer(), Q = new URLSearchParams(location.search);
  const SIZE = [[2.5, 'tennis ball'], [2, 'hen egg'], [1.75, 'golf ball'], [1.5, 'ping pong ball'], [1.25, 'half dollar'], [1, 'quarter'], [0.88, 'nickel'], [0.75, 'penny'], [0.5, 'marble'], [0.25, 'pea']];
  const like = v => { const s = SIZE.find(([a]) => v >= a); return s ? s[1] : ''; };
  const inch = v => String(+v.toFixed(2)) + ' in';
  // a roofer-set range per square (installed, tear-off included). Placeholder only with ?ballpark=demo.
  const BALLPARK = R.ballparkPerSq || (Q.get('ballpark') === 'demo' ? { lo: 450, hi: 650, demo: true } : null);
  let home = null;   // { gi, addr, city, zip, place } once picked

  $('#hint').textContent = 'Start with the house number. ' + (R.area ? R.area + '.' : '');
  $('#consentText').textContent = RCP.consentText();

  // ---------- search ----------
  const q = $('#q'), sugg = $('#sugg');
  let items = [], sel = -1, gen = 0, timer = null;
  function drawSugg() {
    sugg.hidden = !items.length; q.setAttribute('aria-expanded', String(!!items.length));
    sugg.innerHTML = items.map((h, k) => `<li role="option" id="o${k}" aria-selected="${k === sel}" data-k="${k}"><b>${esc(h.addr)}</b><span>${esc(h.place || [h.city, h.zip].filter(Boolean).join(' '))}</span></li>`).join('')
      + (items.length ? '' : '');
  }
  function lookup() {
    const v = q.value.trim(), g = ++gen;
    if (v.length < 3) { items = []; drawSugg(); return; }
    STM.search(v, 6).then(list => {
      if (g !== gen) return;
      items = list || []; sel = items.length ? 0 : -1; drawSugg();
      $('#hint').textContent = items.length ? '' : 'No match yet. Check the spelling, or keep typing. Not in our area? Ask for an inspection below.';
      if (!items.length && v.length > 6) showForm(null);
    });
  }
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(lookup, 140); });
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' && items.length) { sel = (sel + 1) % items.length; drawSugg(); e.preventDefault(); }
    else if (e.key === 'ArrowUp' && items.length) { sel = (sel - 1 + items.length) % items.length; drawSugg(); e.preventDefault(); }
    else if (e.key === 'Escape') { items = []; drawSugg(); }
  });
  $('#search').addEventListener('submit', e => { e.preventDefault(); if (items[sel]) pick(items[sel]); else lookup(); });
  sugg.addEventListener('mousedown', e => { const li = e.target.closest('li'); if (li) { e.preventDefault(); pick(items[+li.dataset.k]); } });

  function pick(h) {
    items = []; drawSugg(); q.value = h.addr + (h.place ? ', ' + h.place : '');
    home = { gi: h.i, addr: h.addr, city: h.city, zip: h.zip, place: h.place };
    paint(h.i);
  }

  // ---------- one home ----------
  function paint(gi) {
    $('#none').hidden = true; $('#doc').hidden = true; $('#loading').hidden = false;
    RC.factsReady.then(() => Promise.all([STM.facts(gi), RCH.history(gi)])).then(([f, h]) => {
      $('#loading').hidden = true;
      if (!f || !f.addr) { $('#none').hidden = false; showForm(null); return; }
      home = Object.assign(home || {}, { gi, addr: f.addr, city: f.city, zip: f.zip, place: f.place || (f.city ? f.city + ', TX' : '') });
      $('#addr').textContent = f.addr + (home.place ? ', ' + home.place : '');
      h = h || [];
      const hits = h.filter(x => x.inches >= 1), top = h.slice().sort((a, b) => b.inches - a.inches)[0];
      const S = hits.length ? hits.slice().sort((a, b) => a.iso < b.iso ? 1 : -1)[0] : top;
      home.hail = S && S.inches > 0 ? { date: S.date, iso: S.iso, inches: S.inches } : null;
      $('#big').innerHTML = S && S.inches > 0
        ? `<p class="k">${hits.length ? 'Most recent 1 inch or bigger hail' : 'Biggest hail on file'}</p><div class="n"><b>${esc(inch(S.inches))}</b><span>on ${esc(S.date)}</span></div>
           ${top !== S && top.inches > S.inches ? `<p class="also"><b>Biggest on file:</b> ${esc(top.date)}, ${esc(inch(top.inches))}</p>` : ''}
           <p>${hits.length > 1 ? `${hits.length} storms since ${esc(h[h.length - 1].date)} put 1 inch or bigger hail on this address, by radar.` : S.inches < 1 ? 'Hail under 1 inch rarely damages shingles.' : 'Radar estimate of the largest hail at this address that day.'}</p>
           ${like(S.inches) ? `<span class="like">About ${esc(like(S.inches))} size</span>` : ''}`
        : `<div class="n"><b>No hail</b><span>on radar here</span></div><p>None of the ${h.length} storms on file put hail on this address by radar. Good news.</p>`;
      $('#bigSrc').textContent = 'NOAA MRMS radar (Maximum Expected Size of Hail, 1 km grid). An estimate: hail on the ground can be bigger or smaller.';

      const rows = [];
      if (f.year) rows.push(['Year built', String(f.year), f.county ? f.county + ' appraisal roll' : 'county appraisal roll']);
      if (f.reroof && !f.reroof.none && f.reroof.date) rows.push(['Last re-roof permit', f.reroof.date, f.reroof.src || 'city permit records']);
      else if (f.reroof && f.reroof.none) rows.push(['Re-roof permits', 'None on file', f.reroof.text]);
      const sq = f.roof && f.roof.sq ? Math.round(f.roof.sq * 10) / 10 : null;
      if (sq) rows.push(['Roof size', 'About ' + sq + ' squares', 'LiDAR estimate from aerial survey data, typically within about 10%. (1 square = 100 sq ft)']);
      $('#roof').innerHTML = rows.length ? rows.map(([a, b, n]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}${n ? `<span class="note">${esc(n)}</span>` : ''}</dd></div>`).join('')
        : '<div><dt>Roof records</dt><dd>Not on file</dd></div>';

      if (BALLPARK && sq) {
        const r = n => '$' + (Math.round(n / 500) * 500).toLocaleString('en-US');
        home.ballpark = r(sq * BALLPARK.lo) + ' to ' + r(sq * BALLPARK.hi);
        $('#price').innerHTML = `<div class="stat"><b>${esc(home.ballpark)}</b><span>for a full replacement</span></div>
          <p>About ${esc(String(sq))} squares at ${esc(R.name)}'s usual range for architectural shingles, tear-off included. The real price comes after a free inspection and a measurement; many roofs only need a repair.</p>
          ${BALLPARK.demo ? '<p class="sc-demo">Demo: placeholder range, not a price from any roofer.</p>' : ''}`;
        $('#priceCard').hidden = false;
      } else $('#priceCard').hidden = true;

      const shown = h.filter(x => x.inches > 0).slice(0, 10);
      $('#histCard').hidden = !shown.length;
      if (shown.length) $('#hist').innerHTML = `<table class="hist"><tbody>${shown.map(x => `<tr><td>${esc(x.date)}</td><td class="n ${x.inches >= 1 ? 'hit' : 'z'}">${esc(inch(x.inches))}${x.inches >= 1 && like(x.inches) ? ', ' + esc(like(x.inches)) : ''}</td></tr>`).join('')}</tbody></table>
        <p class="src"><span class="chip">Source</span>NOAA MRMS radar, ${h.length} storms on file since ${esc(h[h.length - 1].date)}.</p>`;

      $('#mean').innerHTML = [
        '<b>Radar is an estimate.</b> It shows the largest hail likely at this spot, not what landed on your roof.',
        '<b>Nothing here says your roof is damaged.</b> Only an inspection on the roof can tell.',
        '<b>1 inch and up</b> is the hail size roofers and adjusters look at for shingle damage.',
        '<b>Insurance questions</b> are between you and your insurer. A roofer cannot file or negotiate a claim for you in Texas, and we will never offer to pay or waive a deductible.'
      ].map(x => `<li>${x}</li>`).join('');
      $('#srcs').textContent = `Sources: NOAA MRMS radar hail (${h.length} storms on file); ${f.county || 'county'} appraisal roll; city re-roof permit records; USGS 3DEP LiDAR (2018).`;
      $('#doc').hidden = false; showForm(home);
    }).catch(err => { console.warn(err); $('#loading').textContent = 'The storm records did not load. Reload the page.'; });
  }

  // ---------- the form ----------
  const WHEN = ['Weekday morning', 'Weekday afternoon', 'Weekday evening', 'Saturday'];
  let when = '';
  $('#when').innerHTML = WHEN.map(w => `<button type="button" aria-pressed="false">${w}</button>`).join('');
  $('#when').onclick = e => { const b = e.target.closest('button'); if (!b) return; when = b.getAttribute('aria-pressed') === 'true' ? '' : b.textContent;
    $('#when').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.textContent === when))); };
  function showForm(h) {
    $('#book').hidden = false; $('#done').hidden = true; $('#form').hidden = false;
    $('#fAddrWrap').hidden = !!(h && h.gi != null);
    if (!h) { home = null; if (!$('#fAddr').value) $('#fAddr').value = q.value.trim(); }
  }
  $('#form').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#fName').value.trim(), ph = $('#fPhone').value.replace(/\D/g, ''), em = $('#fEmail').value.trim(), agree = $('#fAgree').checked, why = $('#fWhy');
    const addr = home ? home.addr : $('#fAddr').value.trim();
    const phOk = ph.length === 10 || (ph.length === 11 && ph[0] === '1'), emOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em);
    const fail = m => { why.textContent = m; why.hidden = false; };
    if ($('#fCo').value) return;   // a bot filled the honeypot: quietly do nothing
    if (!name) return fail('Add your name so we know who to ask for.');
    if (!addr) return fail('Add the address of the home.');
    if (ph && !phOk) return fail('Type a 10 digit mobile number.');
    if (em && !emOk) return fail('That email does not look complete.');
    if (!phOk && !emOk) return fail('Add a mobile number or an email so we can reach you.');
    if (agree && !phOk) return fail('Add your mobile number for texts, or untick the box.');
    if (!agree && !emOk) return fail('Tick the box so we can text or call you, or add an email instead.');
    why.hidden = true; $('#bSend').disabled = true;
    RCWL.submit({ gi: home ? home.gi : null, addr, city: home && home.city, zip: home && home.zip, name, phone: phOk ? ph : '', email: emOk ? em : '',
      when, note: $('#fNote').value.trim(), agree, hail: home && home.hail, ballpark: home && home.ballpark }).then(lead => {
      $('#form').hidden = true; $('#bSend').disabled = false;
      $('#done').innerHTML = `<b>Thanks${name ? ', ' + esc(name.split(/\s+/)[0]) : ''}. Request sent.</b> ${esc(R.name)} will ${agree ? 'text or call you' : 'email you'} to set a time${when ? ' (' + esc(when.toLowerCase()) + ')' : ''}. ${agree ? 'Reply STOP to any text to stop.' : ''}`
        + (lead.sent !== 'cloud' ? '<br><i class="sc-demo">Demo: saved on this device only (the cloud store is not switched on yet).</i>' : '');
      $('#done').hidden = false; $('#done').focus();
    });
  });

  // a Proof Page token preloads that home (?h=)
  const t = Q.get('h') && RCP.decode(Q.get('h'));
  if (t != null) STM.meta(t).then(m => { if (m) pick({ i: t, addr: m.addr, city: m.city, zip: m.zip, place: m.place }); });
})();
