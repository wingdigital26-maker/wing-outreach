/* Roof Command demo. ask.js: Ask screen, intent parsing, dispatcher. Moved verbatim from js/app.js
   (2026-10-02 split), no behaviour change. */
(function () {
  const RC = window.RC;
  const { $, $$, ic, int, esc } = RC;
  const st = RC.st;

  // ===== ask =====
  // Small keyword/regex intent engine. Every answer is computed on the fly from the regions' catalog.json
  // + lazy per-storm hail bins (plus lazy-loaded homes_meta.bin/streets.json/cities.json for street/ZIP/
  // city lookups) and sample.js. No external AI calls, no API keys, never invents a number: unmatched
  // questions say so and point at suggestions.
  const QUESTIONS = [
    "Which storm hit the most homes?",
    "What's the biggest hail on file?",
    "How many homes took hail this year?",
    "How many homes on Cedar Creek Dr took hail?"
  ];
  RC.SCREENS.ask = () => {
    $("#s-ask").innerHTML = `<div class="ask-stage"><div class="card map-card" id="ask-map"><div class="map-slot"></div><div class="ask-veil"></div>${RC.sourceNote(st.DATA.catalog[0])}</div>
      <div class="palette"><div class="box">
        <form class="in" id="askForm">${ic("sparkle")}<input id="askIn" autocomplete="off" placeholder="How much have we signed this month?"><button class="btn sm primary" type="submit">Ask</button></form>
        <div class="sugs" id="sugs">${QUESTIONS.map((q, i) => `<button class="chip" data-q="${i}" type="button">${q}</button>`).join("")}</div>
        <div id="answer"></div></div></div></div>`;
    $("#askForm").onsubmit = e => { e.preventDefault(); ask($("#askIn").value || $("#askIn").placeholder); };
    $$("#sugs .chip").forEach(b => b.onclick = () => { $("#askIn").value = QUESTIONS[b.dataset.q]; ask(QUESTIONS[b.dataset.q]); });
  };
  RC.ENTER.ask = () => { st.lastMapScreen = "ask"; RC.placeMap($("#ask-map .map-slot"), RC.NORMAN, { top: 120, bottom: 20, left: 20, right: 20 }); st.mapReady.then(() => { RC.setStorm(st.explicitStorm || RC.pickDefaultStorm(st.DATA.catalog)); }); setTimeout(() => $("#askIn")?.focus(), 50); };

  function ask(text) {
    const t = text.toLowerCase().trim();
    $("#answer").innerHTML = `<div class="answer"><div class="head"><span class="thinking"><i></i><i></i><i></i></span>Reading storms, homes, jobs, proposals and the calendar</div></div>`;
    RC.setCustomerFilter(null);
    answerQuestion(t).then(r => {
      if (!r) { $("#answer").innerHTML = `<div class="answer"><div class="head">${ic("sparkle")}Answer</div><p>I can answer questions about storm hail (by date, size, ZIP or street) and customers in a storm's path. Try one of the suggestions above.</p></div>`; return; }
      $("#answer").innerHTML = `<div class="answer"><div class="head">${ic("sparkle")}Answer</div><h4>${r.big}</h4><p>${r.text}</p>${r.table || ""}<div class="from">${r.from}</div></div>`;
      r.after && r.after();
    });
  }
  function tbl(rows) { return `<table>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${i === r.length - 1 ? "n" : ""}">${c}</td>`).join("")}</tr>`).join("")}</table>`; }

  // ---------- intent parsing helpers (keyword/regex only, no AI) ----------
  const defaultStorm = () => st.DATA.byDate[st.MS.storm] || st.DATA.catalog[0];
  const MONTHS = { january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12 };
  const MONTH_RE = new RegExp("\\b(" + Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|") + ")\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d\\d))?\\b", "i");
  const MONTH_YEAR_RE = new RegExp("\\b(" + Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|") + ")\\.?\\s+(20\\d\\d)\\b", "i");
  const SLASH_DATE_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/;
  const LAST_MONTH_RE = new RegExp("\\blast\\s+(" + Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|") + ")\\b", "i");
  function monthYearQuery(t) { const m = t.match(MONTH_YEAR_RE); return m ? { mo: MONTHS[m[1].toLowerCase()], yr: +m[2] } : null; }
  const ST_SUFFIX = "st|street|dr|drive|ln|lane|ave|avenue|rd|road|ct|court|way|blvd|boulevard|cir|circle|trl|trail|pl|place|pkwy|parkway|run|loop";
  const STREET_RE = new RegExp("\\b(?:on|in|at)\\s+([a-z0-9][a-z0-9'.\\- ]{1,28}?\\s+(?:" + ST_SUFFIX + "))\\b", "i");
  function findStorm(t) {
    const ss = st.DATA.catalog;
    if (/latest|most recent|newest|last storm/.test(t)) return ss.slice().sort((x, y) => y.date.localeCompare(x.date))[0];
    if (/current storm|this storm|selected storm/.test(t)) return defaultStorm();
    const iso = t.match(/\b(20\d\d-\d\d-\d\d)\b/);
    if (iso && st.DATA.byDate[iso[1]]) return st.DATA.byDate[iso[1]];
    const slash = t.match(SLASH_DATE_RE);
    if (slash) {
      let mo = +slash[1], day = +slash[2], yr = +slash[3];
      if (yr < 100) yr += yr < 50 ? 2000 : 1900;
      const hit = ss.find(s => { const d = new Date(s.date + "T12:00:00"); return d.getMonth() + 1 === mo && d.getDate() === day && d.getFullYear() === yr; });
      if (hit) return hit;
    }
    if (/this year/.test(t)) {
      const yr = RC.S.today.getFullYear();
      const hits = ss.filter(s => new Date(s.date + "T12:00:00").getFullYear() === yr);
      if (hits.length) { const top = hits.slice().sort((a, b) => b.homes_1in - a.homes_1in)[0]; top._multiNote = hits.length > 1; return top; }
      return null;
    }
    const lastMonth = t.match(LAST_MONTH_RE);
    if (lastMonth) {
      const mo = MONTHS[lastMonth[1].toLowerCase()], now = RC.S.today;
      const hits = ss.filter(s => { const d = new Date(s.date + "T12:00:00"); return d.getMonth() + 1 === mo && d <= now; }).sort((a, b) => b.date.localeCompare(a.date));
      if (hits.length) return hits[0];
      return null;
    }
    const my = monthYearQuery(t);
    if (my) {
      const hits = ss.filter(s => { const d = new Date(s.date + "T12:00:00"); return d.getMonth() + 1 === my.mo && d.getFullYear() === my.yr; });
      if (hits.length) { const top = hits.slice().sort((a, b) => b.homes_1in - a.homes_1in)[0]; top._multiNote = hits.length > 1; return top; }
      return null; // explicit month/year asked, nothing on file: honest "no storm" handled in answerQuestion
    }
    const m = t.match(MONTH_RE);
    if (m) {
      const mo = MONTHS[m[1].toLowerCase()], day = +m[2], yr = m[3] ? +m[3] : null;
      const hit = ss.filter(s => { const d = new Date(s.date + "T12:00:00"); return d.getMonth() + 1 === mo && d.getDate() === day && (!yr || d.getFullYear() === yr); });
      if (hit.length) return hit[0];
    }
    return null;
  }
  function parseThreshold(t) { const m = t.match(/(\d+(?:\.\d+)?)\s*(?:in(?:ch(?:es)?)?|")/i); return m ? parseFloat(m[1]) : null; }
  function parseZip(t) { const m = t.match(/\b(\d{5})\b/); return m ? m[1] : null; }
  function parseStreetPhrase(t) { const m = t.match(STREET_RE); return m ? m[1].trim() : null; }
  function parseCityPhrase(t) {
    const names = new Set();
    st.REGIONS.forEach(r => (r.cities || []).forEach(c => names.add(c)));
    const sorted = [...names].sort((a, b) => b.length - a.length);
    for (const name of sorted) {
      const re = new RegExp("\\b" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
      if (re.test(t)) return name;
    }
    return null;
  }
  function findStreetId(region, phrase) {
    if (!phrase || !region.streets) return -1;
    const p = phrase.toLowerCase();
    let best = -1, bestLen = Infinity;
    region.streets.forEach((s, i) => { const sl = s.toLowerCase(); if (sl === p || sl.includes(p) || p.includes(sl)) { if (sl.length < bestLen) { bestLen = sl.length; best = i; } } });
    return best;
  }
  // scans the cached hail/<date>.bin for every home that hit >=0.75in on a storm (only regions/storms
  // already loaded by the caller), optionally filtered by a region-aware predicate
  function homesMatching(sm, pred) {
    const out = [];
    sm.regions.forEach(rr => {
      const region = RC.REG(rr.id);
      const hail = region.hailCache[sm.date];
      if (!hail || !region.metaView) return;
      for (let i = 0; i < region.n; i++) {
        if (hail[i] < 75 || region.type[i] > 4) continue; // residential only
        const m = RC.regionHomeMeta(region, i);
        if (pred && !pred(region, m)) continue;
        const c = RC.decodeLonLat(region, i);
        out.push({ ...m, hail: hail[i] / 100, lon: c[0], lat: c[1] });
      }
    });
    out.sort((a, b) => b.hail - a.hail);
    return out;
  }
  function countOver(sm, inches) {
    const cents = Math.round(inches * 100);
    let c = 0;
    sm.regions.forEach(rr => {
      const region = RC.REG(rr.id), hail = region.hailCache[sm.date];
      if (!hail) return;
      for (let i = 0; i < region.n; i++) if (hail[i] >= cents && region.type[i] <= 4) c++;
    });
    return c;
  }

  // ---------- dispatcher: most specific intent first, every branch computes from real/sample data ----------
  async function answerQuestion(t) {
    await new Promise(res => setTimeout(res, 700)); // keep the "thinking" beat
    const zip = parseZip(t), streetPhrase = parseStreetPhrase(t), cityPhrase = parseCityPhrase(t), thr = parseThreshold(t), storm = findStorm(t);
    if ((zip || streetPhrase || cityPhrase) && /home|house|hit|took|hail|building/.test(t)) return askHomesWhere(storm || defaultStorm(), zip, streetPhrase, cityPhrase);
    if (/customer.*(hail|storm|path)|(hail|storm|path).*customer/.test(t)) return askCustomersInPath(storm || defaultStorm());
    if (thr != null && /home|house|hail/.test(t)) return askHomesOverThreshold(storm || defaultStorm(), thr);
    if (storm && /home|house|hit|hail/.test(t)) return askHomesInStorm(storm);
    if (/hail size|size of hail|biggest hail|largest hail|max(?:imum)? hail|how big/.test(t)) return askBiggestHail();
    if (/biggest|worst|largest|most homes|hit the most/.test(t) && /storm/.test(t)) return askStorms();
    if (/sign|revenue|sold|made|money|pipeline|proposal|open|pending|quote|calendar|schedule|inspection|appointment|rep|sales ?person|quarter/.test(t)) return askConnectJobList();
    // catchall: a bare date / storm name ("sep 24", "the may 8 storm", "10/10/2021") with no other
    // intent keyword still deserves that storm's summary instead of the generic fallback.
    if (storm) return askHomesInStorm(storm);
    // a month/year was named ("april 2021") but findStorm came back empty: say so honestly, never guess.
    const my = monthYearQuery(t);
    if (my) {
      const monthName = Object.keys(MONTHS).find(k => MONTHS[k] === my.mo && k.length > 3) || Object.keys(MONTHS).find(k => MONTHS[k] === my.mo);
      return { big: "No storm on file", text: `I don't have a storm on record for ${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${my.yr}. Try one of the dates in the suggestions above.`, from: "From: NOAA MRMS MESH radar archive (real data), Oct 2020 to present" };
    }
    return null;
  }
  function askHomesInStorm(sm) {
    const multi = sm._multiNote ? `More than one storm hit that month; showing the biggest, ${sm.label}. ` : "";
    return {
      big: `${int(sm.homes_1in)} homes`,
      text: `${multi}took 1 inch or larger radar hail on ${sm.label} (largest that day: ${sm.max_in.toFixed(2)}"). ${int(sm.homes_150)} of those saw 1.5 inches or more.`,
      table: tbl(sm.severity.map(s => [s.label, `${int(s.homes)} homes`])),
      from: "From: NOAA MRMS MESH radar over county tax roll homes (real data)",
      after: () => RC.setStorm(sm.date)
    };
  }
  function askBiggestHail() {
    const ss = st.DATA.catalog.slice().sort((a, b) => b.max_in - a.max_in);
    const top = ss[0];
    return {
      big: `${top.max_in.toFixed(2)}"`,
      text: `is the largest hail stone radar-estimated over the area, during the ${top.label} storm.`,
      table: tbl(ss.slice(0, 4).map(s => [s.label, `max ${s.max_in.toFixed(2)}"`])),
      from: "From: NOAA MRMS MESH radar (real data)",
      after: () => RC.setStorm(top.date)
    };
  }
  async function askHomesOverThreshold(sm, thr) {
    await RC.ensureStormLoaded(sm.date);
    const c = countOver(sm, thr);
    const multi = sm._multiNote ? `More than one storm hit that month; showing the biggest, ${sm.label}. ` : "";
    return {
      big: `${int(c)} homes`,
      text: `${multi}took ${thr.toFixed(2)} inch or larger radar hail on ${sm.label}.`,
      from: "From: NOAA MRMS MESH radar over county tax roll homes (real data)",
      after: () => RC.setStorm(sm.date)
    };
  }
  async function askHomesWhere(sm, zip, streetPhrase, cityPhrase) {
    await RC.ensureStormLoaded(sm.date);
    await Promise.all(sm.regions.map(rr => RC.loadRegionMeta(RC.REG(rr.id))));
    if (streetPhrase && !sm.regions.some(rr => findStreetId(RC.REG(rr.id), streetPhrase) >= 0)) {
      return { big: "No match", text: `I couldn't find a street matching "${esc(streetPhrase)}" on the county tax rolls. Try the exact street name, like "Cedar Creek Dr".`, from: "From: county tax roll street lists (real data)" };
    }
    const list = homesMatching(sm, (region, m) => (!zip || String(m.zip) === zip) && (!cityPhrase || m.city.toLowerCase() === cityPhrase.toLowerCase()) && (!streetPhrase || region.streets[m.streetId]?.toLowerCase() === region.streets[findStreetId(region, streetPhrase)]?.toLowerCase()));
    const where = [cityPhrase, streetPhrase, zip ? `ZIP ${zip}` : null].filter(Boolean).join(", ") || "the area";
    return {
      big: `${int(list.length)} homes`,
      text: `on the county tax rolls in ${where} took 0.75 inch or larger radar hail on ${sm.label}.`,
      table: list.length ? tbl(list.slice(0, 5).map(h => [esc(h.addr), h.year ? "Built " + h.year : "", h.hail.toFixed(2) + '"'])) : "",
      from: "From: NOAA MRMS MESH radar joined to county tax rolls (real data)",
      after: () => { RC.setStorm(sm.date); if (list.length) { const xs = list.map(h => h.lon), ys = list.map(h => h.lat); st.map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: { top: Math.min(400, $("#ask-map").clientHeight * .5), bottom: 30, left: 40, right: 40 }, duration: 900, maxZoom: 15.5 }); } }
    };
  }
  function askCustomersInPath(sm) {
    const list = st.DATA.customers.filter(c => (c.hail[sm.date] || 0) >= 1).sort((a, b) => b.hail[sm.date] - a.hail[sm.date]);
    return {
      big: `${list.length} customers`,
      text: `took 1 inch or larger hail on ${sm.label}. ${list.filter(c => c.roof_year <= 2012).length} of them have roofs installed in 2012 or earlier. They are highlighted on the map.`,
      table: tbl(list.slice(0, 5).map(c => [esc(c.name), esc(c.addr), `Roof ${c.roof_year}`, c.hail[sm.date].toFixed(2) + '"'])),
      from: "From: NOAA MRMS radar hail (real) joined to your customer list (sample)",
      after: () => {
        RC.setStorm(sm.date); RC.setCustomerFilter(list.map(c => c.id));
        if (list.length) { const xs = list.map(c => c.lon), ys = list.map(c => c.lat); st.map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: { top: Math.min(520, $("#ask-map").clientHeight * .6), bottom: 30, left: 40, right: 40 }, duration: 900, maxZoom: 14 }); }
      }
    };
  }
  function askStorms() {
    const ss = st.DATA.catalog.slice().sort((a, b) => b.homes_1in - a.homes_1in);
    return {
      big: ss[0].label,
      text: `hit the most homes since the radar archive began in Oct 2020: ${int(ss[0].homes_1in)} homes at 1 inch or larger.`,
      table: tbl(ss.slice(0, 10).map(s => [s.label, `max ${s.max_in.toFixed(2)}"`, `${int(s.homes_1in)} homes`])),
      from: "From: NOAA MRMS MESH radar over county tax roll homes (real data)"
    };
  }
  function askConnectJobList() {
    return {
      big: "Not connected yet",
      text: "Connect your job list (CSV export from your CRM) to answer this.",
      from: "Storm and home questions are answered from real data today."
    };
  }
})();
