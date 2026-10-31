/* SEO results screen. Reads public.seo_metrics (db/migrations/008_gtm.sql), written nightly by the service role
   (scripts/seo_nightly.py). Members read only their own company through RLS. See docs/SEO-DASHBOARD.md.
   One request per source (gsc, gbp, rank) when the screen opens; nothing on app load. No chart library.
   Metric names this screen understands (keyword is null or '' unless stated; the writer uses '' so the unique key can conflict):
     gsc : clicks, impressions, position (daily site totals); query_clicks, query_impressions, query_position
           (keyword = the search; one 28-day snapshot per weekly metric_date)
     gbp : CALL_CLICKS, WEBSITE_CLICKS, BUSINESS_DIRECTION_REQUESTS (daily); search_keyword_impressions (keyword,
           metric_date = first of month, value = count) and search_keyword_threshold (keyword, value = N, shown "under N")
     rank: position (keyword, daily; 0 means not in the top 100)
   Honest states: no rows = "Not connected yet" with what is needed; table missing (HTTP 404) = same; never a fake zero.
   ?demo=1 renders a fictional sample, labelled "Sample data", through the same code path. */
(function () {
  "use strict";
  var A = function () { return window.RC_AUTH; };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var DAY = 86400000;
  function pd(s) { var p = String(s).slice(0, 10).split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function iso(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function addDays(s, n) { return iso(pd(s) + n * DAY); }
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function monLabel(ym) { var p = ym.split("-"); return MON[+p[1] - 1] + (p[1] === "01" ? " '" + p[0].slice(2) : ""); }
  function fmt(n, d) { return n == null || isNaN(n) ? "" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d == null ? 0 : d, minimumFractionDigits: d || 0 }); }

  var NOT_CONNECTED = {
    gsc: "Not connected yet. Add Wing as a Full user in Google Search Console to see searches here.",
    gbp: "Not connected yet. Google approves profile data access separately; this fills in once approved.",
    rank: "Not tracking keywords yet. Your money keywords get added during setup; positions show here after the first nightly check."
  };

  /* ---------- data ---------- */
  var PAGE = 1000, MAX_PAGES = 15; // PostgREST default cap is 1000 rows per request; page with offset
  function pagedRows(base, token) { // newest first; stops when a page is short. partial = hit the page cap with more to read
    var rows = [], n = 0;
    function next() {
      return A().api(base + "&limit=" + PAGE + "&offset=" + (n * PAGE), "GET", null, token).then(function (r) {
        r = r || []; rows = rows.concat(r); n++;
        if (r.length < PAGE) return { rows: rows, partial: false };
        if (n >= MAX_PAGES) return { rows: rows, partial: true };
        return next();
      });
    }
    return next();
  }
  /* Two streams per source: site-wide daily totals (keyword = '') over the long window, and per-keyword rows
     (query snapshots, monthly profile keywords, rank checks) over a short one. */
  function fetchSource(source, totalsFrom, kwFrom) {
    var co = A() && A().company && A().company();
    var base = "/rest/v1/seo_metrics?select=metric_date,metric,keyword,value&source=eq." + source + (co && co.company_id ? "&company_id=eq." + encodeURIComponent(co.company_id) : "") + "&order=metric_date.desc,metric.asc,keyword.asc";
    return A().token().then(function (t) {
      var jobs = [pagedRows(base + "&keyword=neq.&metric_date=gte." + kwFrom, t)];
      if (totalsFrom) jobs.push(pagedRows(base + "&keyword=eq.&metric_date=gte." + totalsFrom, t));
      return Promise.all(jobs);
    }).then(
      function (r) {
        var rows = r[0].rows.concat(r[1] ? r[1].rows : []), partial = !!(r[1] && r[1].partial);
        return { state: rows.length ? "ok" : "empty", rows: rows, partial: partial };
      },
      function (e) { return e && e.status === 404 ? { state: "empty", rows: [] } : { state: "error", rows: [] }; }
    );
  }
  function loadAll() {
    var today = iso(Date.now());
    return Promise.all([fetchSource("gsc", addDays(today, -430), addDays(today, -40)), fetchSource("gbp", addDays(today, -430), addDays(today, -65)), fetchSource("rank", null, addDays(today, -75))])
      .then(function (r) { return { gsc: r[0], gbp: r[1], rank: r[2] }; });
  }

  /* ---------- fictional sample (same row shape as the table) ---------- */
  function sampleData() {
    var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var end = addDays(iso(Date.now()), -3), start = addDays(end, -400), gsc = [], gbp = [], rank = [], d, i, n = 400;
    for (i = 0; i <= n; i++) {
      d = addDays(start, i); var g = 1 + (i / n) * 0.9, wk = new Date(pd(d)).getUTCDay(), w = wk === 0 || wk === 6 ? 0.7 : 1;
      var imp = Math.round(210 * g * w * (0.85 + rnd() * 0.3)), clk = Math.round(imp * (0.035 + rnd() * 0.012));
      gsc.push({ metric_date: d, metric: "impressions", keyword: null, value: imp }, { metric_date: d, metric: "clicks", keyword: null, value: clk }, { metric_date: d, metric: "position", keyword: null, value: +(21 - 8 * (i / n) + rnd() * 1.5).toFixed(1) });
      gbp.push({ metric_date: d, metric: "CALL_CLICKS", keyword: null, value: Math.round(1.1 * g * w + rnd() * 1.6) }, { metric_date: d, metric: "WEBSITE_CLICKS", keyword: null, value: Math.round(2.2 * g * w + rnd() * 2) }, { metric_date: d, metric: "BUSINESS_DIRECTION_REQUESTS", keyword: null, value: Math.round(0.5 * g * w + rnd() * 1.2) });
    }
    [["roof replacement anytown", 61, 1340, 6.8], ["roof repair near me", 44, 2210, 9.4], ["hail damage roof inspection", 38, 640, 4.1], ["anytown roofing company", 31, 520, 3.2], ["storm damage roof repair", 22, 980, 11.7], ["how much does a new roof cost", 14, 2900, 17.5], ["metal roof installer", 9, 310, 12.9]].forEach(function (q) {
      gsc.push({ metric_date: end, metric: "query_clicks", keyword: q[0], value: q[1] }, { metric_date: end, metric: "query_impressions", keyword: q[0], value: q[2] }, { metric_date: end, metric: "query_position", keyword: q[0], value: q[3] });
    });
    var m0 = end.slice(0, 7) + "-01", mPrev = addDays(m0, -1).slice(0, 7) + "-01";
    [["roof repair", 920], ["roofers near me", 610], ["hail damage roof", 340], ["roof leak repair", 180]].forEach(function (k) { gbp.push({ metric_date: mPrev, metric: "search_keyword_impressions", keyword: k[0], value: k[1] }); });
    [["roof replacement cost", 15], ["metal roofing", 15]].forEach(function (k) { gbp.push({ metric_date: mPrev, metric: "search_keyword_threshold", keyword: k[0], value: k[1] }); });
    [["roof replacement anytown", 8, 4], ["hail damage roof inspection", 12, 7], ["roof repair near me", 19, 14], ["anytown roofing company", 6, 6], ["storm damage roof repair", 24, 31], ["metal roof installer", 0, 0], ["roof leak repair anytown", 5, 9]].forEach(function (k) {
      [[end, k[1]], [addDays(end, -30), k[2]], [addDays(end, -7), Math.round((k[1] + k[2]) / 2 * 0.6 + k[1] * 0.4)]].forEach(function (p) { rank.push({ metric_date: p[0], metric: "position", keyword: k[0], value: p[1] }); });
    });
    return { gsc: { state: "ok", rows: gsc }, gbp: { state: "ok", rows: gbp }, rank: { state: "ok", rows: rank } };
  }

  /* ---------- maths ---------- */
  function daily(rows, metric) { // { "YYYY-MM-DD": value } for site totals
    var o = {}; rows.forEach(function (r) { if (r.metric === metric && !r.keyword) o[String(r.metric_date).slice(0, 10)] = +r.value; }); return o;
  }
  function maxDate(map) { var k = Object.keys(map).sort(); return k.length ? k[k.length - 1] : null; }
  function sumRange(map, from, to) { var s = 0, n = 0, d; for (d = from; d <= to; d = addDays(d, 1)) if (map[d] != null) { s += map[d]; n++; } return { sum: s, days: n }; }
  /* last 28 days vs the 28 before: delta only when both windows have real data (>= 20 days each) */
  function windows(map, floor) {
    var end = maxDate(map); if (!end) return null;
    var cur = sumRange(map, addDays(end, -27), end), prev = sumRange(map, addDays(end, -55), addDays(end, -28));
    var ok = prev.days >= 20 && cur.days >= 20;
    var thin = ok && prev.sum < (floor || 0);
    return { end: end, cur: cur, prev: prev, thin: thin, pct: ok && !thin && prev.sum > 0 ? (cur.sum - prev.sum) / prev.sum * 100 : null };
  }
  function avgPos(clicksMap, imprMap, posMap, from, to) { // impression-weighted when impressions exist
    var s = 0, w = 0, n = 0, d, p, wt; for (d = from; d <= to; d = addDays(d, 1)) { p = posMap[d]; if (p == null) continue; wt = imprMap[d] > 0 ? imprMap[d] : 1; s += p * wt; w += wt; n++; }
    return n ? { v: s / w, days: n } : null;
  }
  function monthly(map, mode, imprMap, fetchPartial) { // [{ym, v}] up to 12 months ending at the latest data month; gaps stay null
    var end = maxDate(map); if (!end) return [];
    var keys = Object.keys(map).sort(), first = keys[0].slice(0, 7), last = end.slice(0, 7), out = [], y = +last.slice(0, 4), m = +last.slice(5), list = [], b = {};
    while (list.length < 12) { var ym = y + "-" + (m < 10 ? "0" : "") + m; list.unshift(ym); if (ym <= first) break; m--; if (m === 0) { m = 12; y--; } }
    keys.forEach(function (k) { var ym = k.slice(0, 7), o = b[ym] || (b[ym] = { s: 0, w: 0 }), wt = mode === "pos" ? (imprMap && imprMap[k] > 0 ? imprMap[k] : 1) : 1; o.s += map[k] * wt; o.w += wt; });
    list.forEach(function (ym) { var o = b[ym]; out.push({ ym: ym, v: o ? (mode === "pos" ? o.s / o.w : o.s) : null, partial: (ym === last && addDays(end, 1).slice(0, 7) === last) || (ym === list[0] && ((ym === first && keys[0].slice(8) > "03") || fetchPartial)) }); });
    return out;
  }

  /* ---------- svg ---------- */
  function spark(map, end, days) {
    var pts = [], d, i = 0, mn = Infinity, mx = -Infinity;
    for (d = addDays(end, -(days - 1)); d <= end; d = addDays(d, 1)) { var v = map[d]; pts.push(v == null ? null : v); if (v != null) { mn = Math.min(mn, v); mx = Math.max(mx, v); } }
    if (pts.filter(function (v) { return v != null; }).length < 7) return "";
    // 7-day smoothing so weekends do not zigzag
    var sm = pts.map(function (v, k) { var s = 0, c = 0, j; for (j = Math.max(0, k - 3); j <= Math.min(pts.length - 1, k + 3); j++) if (pts[j] != null) { s += pts[j]; c++; } return c ? s / c : null; });
    mn = Math.min.apply(null, sm.filter(function (v) { return v != null; })); mx = Math.max.apply(null, sm.filter(function (v) { return v != null; }));
    var rng = mx - mn || 1, coords = [];
    sm.forEach(function (v, k) { if (v != null) coords.push((k / (sm.length - 1) * 120).toFixed(1) + "," + (30 - (v - mn) / rng * 26 - 2).toFixed(1)); });
    return '<svg class="seo-spark" viewBox="0 0 120 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + coords.join(" ") + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>';
  }
  function barChart(series, kind, label) { // series [{ym, v}]; kind bars|line (line = position, inverted)
    var n = series.length, vals = series.filter(function (s) { return s.v != null; }).map(function (s) { return s.v; });
    if (!vals.length) return "";
    var mx = Math.max.apply(null, vals), mn = Math.min.apply(null, vals), svg = "", lbls = "", W = n * 20, H = 70;
    if (kind === "bars") H = 82;
    if (kind === "bars") {
      series.forEach(function (s, i) { if (s.v == null) return; var h = Math.max(1.5, s.v / (mx || 1) * (H - 16)); lbls += '<span class="val' + (n > 6 && i % 2 === 1 && i !== n - 1 ? " alt" : "") + '" style="left:' + ((i * 20 + 10) / W * 100).toFixed(2) + '%;bottom:calc(' + (h / H * 120).toFixed(1) + 'px + 3px)">' + esc(fmt(s.v)) + "</span>"; svg += '<rect x="' + (i * 20 + 3) + '" y="' + (H - h).toFixed(1) + '" width="14" height="' + h.toFixed(1) + '" rx="2"' + (s.partial ? ' class="part"' : "") + "><title>" + esc(monLabel(s.ym) + ": " + fmt(s.v, 0) + (s.partial ? " (month so far)" : "")) + "</title></rect>"; });
    } else {
      var rng = (mx - mn) || 1, pts = [];
      series.forEach(function (s, i) { if (s.v == null) return; var y = 6 + (s.v - mn) / rng * (H - 14); pts.push([i * 20 + 10, y, s]); });
      svg += '<polyline points="' + pts.map(function (p) { return p[0] + "," + p[1].toFixed(1); }).join(" ") + '" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>';
      pts.forEach(function (p) { svg += '<circle cx="' + p[0] + '" cy="' + p[1].toFixed(1) + '" r="2.6"><title>' + esc(monLabel(p[2].ym) + ": position " + fmt(p[2].v, 1)) + "</title></circle>"; });
    }
    return '<div class="seo-chart"><svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(label) + '">' + svg + "</svg>" + lbls + "</div>" +
      '<div class="seo-axis">' + series.map(function (s, i) { var jan = s.ym.slice(5) === "01", alt = n > 6 && i % 2 === 1 && i !== n - 1; return "<span" + (alt ? ' class="alt"' : "") + ">" + MON[+s.ym.slice(5) - 1] + (jan ? '<i class="yr"> ' + s.ym.slice(2, 4) + "</i>" : "") + "</span>"; }).join("") + "</div>";
  }

  /* ---------- section builders ---------- */
  function deltaTxt(pct, higherIsGood, thin) {
    if (pct == null && thin) return '<span class="seo-d">Too early to call a trend</span>';
    if (pct == null) return '<span class="seo-d">Not enough history yet to compare</span>';
    var a = Math.abs(pct), cls = a < 2 ? "" : (pct > 0) === higherIsGood ? " good" : " bad";
    return '<span class="seo-d' + cls + '">' + (a < 2 ? "About flat" : (pct > 0 ? "Up " : "Down ") + fmt(a, a < 10 ? 1 : 0) + "%") + " vs the 28 days before</span>";
  }
  function segs(tracked, p1) { var h = '<div class="seo-segs" aria-hidden="true">', i; for (i = 0; i < tracked.length; i++) h += "<i" + (i < p1 ? ' class="on"' : "") + "></i>"; return h + "</div>"; }
  function spanLabel(w) { return w.cur.days >= 28 ? "Last 28 days" : "Last " + w.cur.days + " days"; }
  function tile(label, value, sub, sparkSvg) {
    return '<div class="card kpi seo-kpi"><div class="label">' + esc(label) + '</div><div class="kpi-value">' + value + "</div><div class=\"delta\">" + sub + "</div>" + (sparkSvg || "") + "</div>";
  }
  function offTile(label, src, err) { if (err) return '<div class="card kpi seo-kpi off"><div class="label">' + esc(label) + '</div><div class="kpi-value seo-na">Could not load</div><div class="delta">Try again in the section below</div></div>'; return '<div class="card kpi seo-kpi off"><div class="label">' + esc(label) + '</div><div class="kpi-value seo-na">Not connected yet</div><div class="delta">' + (src === "rank" ? "Keywords are added during setup" : "See the section below") + "</div></div>"; }
  function errBox(retryId) { return '<div class="seo-empty">Could not load this just now. <button type="button" class="btn sm" data-retry="' + retryId + '">Try again</button></div>'; }
  function empty(src) { return '<div class="seo-empty">' + esc(NOT_CONNECTED[src]) + "</div>"; }
  function section(title, sample, body, extra) {
    return '<section class="card seo-card"><div class="card-h"><h3>' + esc(title) + "</h3>" + (extra ? '<span class="muted">' + extra + "</span>" : "") + '</div><div class="card-b">' + body + "</div></section>";
  }
  function table(head, rows) {
    return '<div class="seo-tw"><table class="seo-t"><thead><tr>' + head.map(function (h, i) { return '<th' + (i ? ' class="n"' : "") + ">" + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.map(function (r) { return "<tr>" + r.map(function (c, i) { return "<td" + (i ? ' class="n"' : "") + ">" + c + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
  }

  function build(D, sample, gscMode) {
    var out = { tiles: [], verdict: "", gsc: "", gbp: "", rank: "" }, verdictPct = null, verdictWhat = "", thinTxt = "", callTxt = "";
    var cl = daily(D.gsc.rows, "clicks"), im = daily(D.gsc.rows, "impressions"), po = daily(D.gsc.rows, "position");
    // ---- Search Console
    if (D.gsc.state === "error") { out.gsc = errBox("gsc"); out.tiles.push(offTile("Search clicks", "gsc", true), offTile("Avg position", "gsc", true)); }
    else if (D.gsc.state === "empty" || !maxDate(cl)) { out.gsc = empty("gsc"); out.tiles.push(offTile("Search clicks", "gsc"), offTile("Avg position", "gsc")); }
    else {
      var w = windows(cl, 100), wi = windows(im), end = w.end, lbl = spanLabel(w);
      out.tiles.push(tile("Search clicks", fmt(w.cur.sum), esc(lbl) + ". " + deltaTxt(w.pct, true, w.thin), spark(cl, end, 56)));
      var pc = avgPos(cl, im, po, addDays(end, -27), end), pp = avgPos(cl, im, po, addDays(end, -55), addDays(end, -28));
      if (pc) {
        var dp = pp && pp.days >= 20 && pc.days >= 20 ? pp.v - pc.v : null; // positive = moved up
        out.tiles.push(tile("Avg position", fmt(pc.v, 1), esc(lbl) + ". " + (dp == null ? '<span class="seo-d">Not enough history yet to compare</span>' : '<span class="seo-d' + (Math.abs(dp) < 0.3 ? "" : dp > 0 ? " good" : " bad") + '">' + (Math.abs(dp) < 0.3 ? "About flat" : (dp > 0 ? "Up " : "Down ") + fmt(Math.abs(dp), 1) + " places") + " vs the 28 days before</span>"), spark(po, end, 56)));
      } else out.tiles.push(offTile("Avg position", "gsc"));
      verdictPct = w.pct; verdictWhat = "Google search clicks"; if (w.thin) thinTxt = fmt(w.cur.sum) + " clicks from Google search in the last 28 days, " + fmt(w.prev.sum) + " in the 28 before.";
      var qs = {}, qd = maxDate((function () { var o = {}; D.gsc.rows.forEach(function (r) { if (r.metric === "query_clicks" && r.keyword) o[String(r.metric_date).slice(0, 10)] = 1; }); return o; })());
      D.gsc.rows.forEach(function (r) { if (r.keyword && String(r.metric_date).slice(0, 10) === qd && /^query_/.test(r.metric)) { (qs[r.keyword] = qs[r.keyword] || {})[r.metric] = +r.value; } });
      var top = Object.keys(qs).map(function (k) { return { k: k, c: qs[k].query_clicks, i: qs[k].query_impressions, p: qs[k].query_position }; }).filter(function (x) { return x.c != null; }).sort(function (a, b) { return b.c - a.c; }).slice(0, 10);
      var mode = gscMode || "clicks", series = mode === "position" ? monthly(po, "pos", im, D.gsc.partial) : monthly(mode === "impressions" ? im : cl, "sum", null, D.gsc.partial);
      var seg = '<div class="seg seo-seg" role="group" aria-label="Chart metric">' + [["clicks", "Clicks"], ["impressions", "Impressions"], ["position", "Avg position"]].map(function (m) { return '<button type="button" data-gscmode="' + m[0] + '"' + (mode === m[0] ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + ">" + m[1] + "</button>"; }).join("") + "</div>";
      var partial = series.some(function (s) { return s.partial; });
      out.gsc = seg + barChart(series, mode === "position" ? "line" : "bars", "Monthly " + mode) +
        '<p class="muted seo-note">' + (mode === "position" ? "Higher on the chart means closer to the top of Google. " : "") + (partial ? "Lighter bar: month not finished" + (D.gsc.partial ? " (older history was not fully loaded)" : "") + ". " : "") + "Data through " + esc(end) + ".</p>" +
        (top.length ? "<h4 class=\"seo-h4\">Top searches that found you</h4>" + table(["Search", "Clicks", "Seen", "Position"], top.map(function (x) { return [esc(x.k), fmt(x.c), x.i != null ? fmt(x.i) : "", x.p != null ? fmt(x.p, 1) : ""]; })) +
          '<p class="muted seo-note">Last 28 days as of ' + esc(qd) + ". Seen means how many times your page appeared in results.</p>" : "");
    }
    // ---- Business Profile
    var cc = daily(D.gbp.rows, "CALL_CLICKS"), wc = daily(D.gbp.rows, "WEBSITE_CLICKS"), dr = daily(D.gbp.rows, "BUSINESS_DIRECTION_REQUESTS");
    if (D.gbp.state === "error") { out.gbp = errBox("gbp"); out.tiles.splice(1, 0, offTile("Profile calls", "gbp", true)); }
    else if (D.gbp.state === "empty" || !maxDate(cc) && !maxDate(wc) && !maxDate(dr)) { out.gbp = empty("gbp"); out.tiles.splice(1, 0, offTile("Profile calls", "gbp")); }
    else {
      var cw = windows(cc, 20);
      if (cw) { out.tiles.splice(1, 0, tile("Profile calls", fmt(cw.cur.sum), esc(spanLabel(cw)) + ". " + deltaTxt(cw.pct, true, cw.thin), spark(cc, cw.end, 56))); callTxt = fmt(cw.cur.sum) + " calls from your Google profile in the last 28 days."; }
      else out.tiles.splice(1, 0, offTile("Profile calls", "gbp"));
      var trio = [["Calls from the profile", cc], ["Website clicks", wc], ["Direction requests", dr]].map(function (m) {
        var ww = windows(m[1], 20); if (!ww) return '<div class="seo-stat"><div class="label">' + m[0] + '</div><div class="seo-na">No data yet</div></div>';
        return '<div class="seo-stat"><div class="label">' + m[0] + '</div><div class="seo-big">' + fmt(ww.cur.sum) + "</div><div class=\"delta\">" + esc(spanLabel(ww)) + "<br>" + deltaTxt(ww.pct, true, ww.thin) + "</div>" + spark(m[1], ww.end, 56) + "</div>";
      }).join("");
      var kw = {}, kd = null;
      D.gbp.rows.forEach(function (r) { if (r.keyword && (r.metric === "search_keyword_impressions" || r.metric === "search_keyword_threshold")) { var d = String(r.metric_date).slice(0, 10); if (!kd || d > kd) kd = d; } });
      D.gbp.rows.forEach(function (r) { if (r.keyword && String(r.metric_date).slice(0, 10) === kd) { if (r.metric === "search_keyword_impressions") kw[r.keyword] = { v: +r.value }; else if (r.metric === "search_keyword_threshold" && !kw[r.keyword]) kw[r.keyword] = { t: +r.value }; } });
      var kl = Object.keys(kw).map(function (k) { return { k: k, v: kw[k].v, t: kw[k].t }; }).sort(function (a, b) { return (b.v != null ? b.v : -1) - (a.v != null ? a.v : -1) || a.k.localeCompare(b.k); }).slice(0, 15);
      out.gbp = '<div class="seo-trio">' + trio + "</div>" + (kl.length ? '<h4 class="seo-h4">What people searched to find your profile</h4>' + table(["Search", "Times shown"], kl.map(function (x) { return [esc(x.k), x.v != null ? fmt(x.v) : "under " + fmt(x.t)]; })) +
        '<p class="muted seo-note">Month of ' + esc(MON[+kd.slice(5, 7) - 1] + " " + kd.slice(0, 4)) + ". Google hides exact counts for rare searches, so those show as \"under\" a number.</p>" : "");
    }
    // ---- Rankings
    var byK = {};
    D.rank.rows.forEach(function (r) { if (r.metric === "position" && r.keyword) (byK[r.keyword] = byK[r.keyword] || {})[String(r.metric_date).slice(0, 10)] = +r.value; });
    var kws = Object.keys(byK);
    if (D.rank.state === "error") { out.rank = errBox("rank"); out.tiles.push(offTile("Page 1 keywords", "rank", true)); }
    else if (D.rank.state === "empty" || !kws.length) { out.rank = empty("rank"); out.tiles.push(offTile("Page 1 keywords", "rank")); }
    else {
      var latest = maxDate((function () { var o = {}; kws.forEach(function (k) { Object.keys(byK[k]).forEach(function (d) { o[d] = 1; }); }); return o; })());
      var tgt = addDays(latest, -30);
      function near(m, t) { var best = null, bd = 99; Object.keys(m).forEach(function (d) { var g = Math.abs((pd(d) - pd(t)) / DAY); if (g <= 4 && g < bd) { bd = g; best = d; } }); return best; }
      var list = kws.map(function (k) { var m = byK[k], cd = m[latest] != null ? latest : null, pdte = near(m, tgt); return { k: k, now: cd ? m[cd] : null, then: pdte ? m[pdte] : null }; });
      list.sort(function (a, b) { var A1 = a.now == null ? 1e9 : a.now === 0 ? 1e6 : a.now, B1 = b.now == null ? 1e9 : b.now === 0 ? 1e6 : b.now; return A1 - B1 || a.k.localeCompare(b.k); });
      var posTxt = function (v) { return v == null ? "No check yet" : v === 0 ? "Over 100" : "#" + fmt(v); };
      var chg = function (x) {
        if (x.now == null) return '<span class="seo-d">Not checked on ' + esc(latest) + "</span>";
        if (x.then == null) return '<span class="seo-d">New, no 30-day comparison yet</span>';
        var n = x.now === 0 ? 101 : x.now, t = x.then === 0 ? 101 : x.then, d = t - n;
        if (!d) return '<span class="seo-d">No change</span>';
        return '<span class="seo-d ' + (d > 0 ? "good" : "bad") + '">' + (d > 0 ? "Up " : "Down ") + Math.abs(d) + (x.now === 0 || x.then === 0 ? " or more" : "") + "</span>";
      };
      var tracked = list.filter(function (x) { return x.now != null; }), p1 = tracked.filter(function (x) { return x.now > 0 && x.now <= 10; }).length;
      var p1then = list.filter(function (x) { return x.then != null && x.then > 0 && x.then <= 10; }).length, hasThen = list.some(function (x) { return x.then != null; });
      out.tiles.push(tile("Page 1 keywords", fmt(p1) + '<span class="seo-of"> of ' + tracked.length + "</span>", hasThen ? '<span class="seo-d' + (p1 === p1then ? "" : p1 > p1then ? " good" : " bad") + '">' + (p1 === p1then ? "Same as 30 days ago" : p1 > p1then ? "Up from " + p1then + " 30 days ago" : "Down from " + p1then + " 30 days ago") + "</span>" : '<span class="seo-d">No 30-day comparison yet</span>', segs(tracked, p1)));
      out.rank = table(["Keyword", "Now", "vs 30 days ago"], list.map(function (x) { return [esc(x.k), "<b>" + posTxt(x.now) + "</b>", chg(x)]; })) +
        '<p class="muted seo-note">Google positions for your money keywords, checked nightly. Page 1 is #1 to #10. Last check ' + esc(latest) + ".</p>";
    }
    // order tiles: clicks, calls, page 1, position
    var by = {}; out.tiles.forEach(function (t) { var m = /label">([^<]*)</.exec(t); by[m[1]] = t; });
    out.tiles = ["Search clicks", "Profile calls", "Page 1 keywords", "Avg position"].map(function (k) { return by[k]; }).filter(Boolean).slice(0, 4);
    // verdict
    var anyErr = D.gsc.state === "error" || D.gbp.state === "error" || D.rank.state === "error";
    if (verdictPct == null) out.verdict = thinTxt || (D.gsc.state === "ok" && maxDate(cl)) ? "Too early to call a trend. " + (thinTxt || "Google search clicks do not have enough history to compare yet.") + (callTxt ? " " + callTxt : "") : anyErr && D.gsc.state !== "ok" && D.gbp.state !== "ok" ? "Could not load your search data just now. Try again in a moment." : D.gsc.state === "ok" || D.gbp.state === "ok" ? "Not enough history yet to say whether search is growing. We need about 8 weeks of data." : "Nothing is connected yet. Connect Search Console to see how many people find you on Google.";
    else if (Math.abs(verdictPct) < 2) out.verdict = "Search is holding steady. " + cap(verdictWhat) + " are about flat against the 28 days before.";
    else out.verdict = (verdictPct > 0 ? "Search is growing. " : "Search is slower right now. ") + cap(verdictWhat) + " are " + (verdictPct > 0 ? "up " : "down ") + fmt(Math.abs(verdictPct), Math.abs(verdictPct) < 10 ? 1 : 0) + "% against the 28 days before.";
    return out;
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ---------- screen ---------- */
  var CSS = ".seo-wrap{max-width:1100px;display:flex;flex-direction:column;gap:16px;padding-bottom:30px}.seo-top{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.seo-verdict{flex:1 1 320px;font-size:17px;font-weight:600;letter-spacing:-.01em;margin:0}" +
    ".seo-sample{background:var(--accent-soft);color:var(--accent-ink);border-radius:999px;padding:2px 9px;font-size:11.5px;font-weight:600;white-space:nowrap}" +
    ".seo-kpis{display:grid;align-items:stretch;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.seo-kpi{display:flex;flex-direction:column}.seo-kpi .delta{flex:1 1 auto}.seo-kpi .kpi-value{font-size:28px}.seo-kpi.off .kpi-value,.seo-na{font-size:14px;font-weight:600;color:var(--muted);letter-spacing:0;padding:6px 0 0}.seo-of{font-size:14px;font-weight:500;color:var(--muted)}" +
    ".seo-prog{height:6px;border-radius:99px;background:var(--line-2);margin-top:auto;flex:none;overflow:hidden}.seo-prog i{display:block;height:100%;background:var(--accent);border-radius:99px}.seo-kpi .label{white-space:nowrap}.seo-spark{width:100%;height:30px;flex:none;color:var(--accent);margin-top:8px}.seo-kpi .delta+.seo-prog{margin-top:14px;height:6px}.seo-segs{display:flex;gap:4px;align-items:center;height:30px;margin-top:8px;flex:none}.seo-segs i{flex:1;height:22px;border-radius:4px;background:var(--line-2)}.seo-segs i.on{background:var(--accent)}.seo-d{color:var(--ink-2)}.seo-d.good{color:#2F6B3F;font-weight:600}.seo-d.bad{color:var(--accent-ink);font-weight:600}" +
    ".seo-card .card-h{flex-wrap:wrap}.seo-seg{max-width:340px;margin-bottom:12px}.seo-chart svg{width:100%;height:120px;display:block;color:var(--accent)}.seo-chart rect{fill:var(--accent)}.seo-chart rect.part{opacity:.4}.seo-chart circle{fill:var(--accent)}.seo-chart{position:relative}.seo-chart .val{position:absolute;transform:translateX(-50%);font-size:11px;font-weight:600;color:var(--ink-2);white-space:nowrap;line-height:1}" +
    ".seo-axis{display:flex;margin-top:4px;font-size:11px;color:var(--muted)}.seo-axis .yr{font-style:normal}.seo-axis span{flex:1;text-align:center;white-space:nowrap;overflow:hidden}.seo-note{margin:10px 0 0}.seo-h4{margin:18px 0 8px;font-size:13px;font-weight:600}" +
    ".seo-tw{overflow-x:auto}.seo-t{width:100%;border-collapse:collapse;font-size:13.5px}.seo-t th{text-align:left;font-size:11.5px;font-weight:600;color:var(--muted);padding:6px 8px;border-bottom:1px solid var(--line)}.seo-t td{padding:8px;border-bottom:1px solid var(--line-2)}.seo-t .n{text-align:right;white-space:nowrap}.seo-t th.n{text-align:right}.seo-t td:first-child{min-width:120px;overflow-wrap:break-word}" +
    ".seo-trio{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.seo-stat{background:var(--surface-2);border:1px solid var(--line-2);border-radius:var(--r-sm);padding:12px 14px}.seo-stat .label{color:var(--muted);font-size:12.5px}.seo-big{font-size:24px;font-weight:650;letter-spacing:-.02em}.seo-stat .delta{font-size:12px;color:var(--ink-2)}" +
    ".seo-empty{padding:16px 14px;background:var(--surface-2);border:1px dashed var(--line);border-radius:var(--r-sm);color:var(--ink-2);font-size:13.5px;line-height:1.45}.seo-empty .btn{margin-left:8px}.seo-load{padding:26px 20px;color:var(--muted)}" +
    "@media (max-width:1100px){.seo-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:640px){.seo-axis span.alt{visibility:hidden}.seo-axis .yr{display:none}.seo-chart .val{font-size:8.5px}.seo-chart .val.alt{visibility:hidden}.seo-t .n{white-space:normal}.seo-t{font-size:13px}.seo-t td,.seo-t th{padding:7px 5px}.seo-trio{grid-template-columns:1fr}.seo-kpis{gap:10px}.seo-kpi{padding:14px}.seo-kpi .kpi-value{font-size:24px}.seo-axis span{font-size:10px}}";
  function injectCss() { if (document.getElementById("seoCss")) return; var s = document.createElement("style"); s.id = "seoCss"; s.textContent = CSS; document.head.appendChild(s); }

  function render(el) {
    injectCss();
    var sample = !!(A() && A().demo) || !!window.RC_DEMO, D = null, mode = "clicks";
    el.innerHTML = '<div class="seo-wrap" id="seoWrap"><div class="card seo-load">Loading SEO results...</div></div>';
    var wrap = el.querySelector("#seoWrap");
    function draw() {
      var o = build(D, sample, mode);
      wrap.innerHTML = (sample ? '<div class="card" style="padding:12px 16px"><b>Sample data.</b> <span class="muted">These are made-up numbers so you can see the layout. Sign in to see your own results.</span></div>' : "") + '<div class="seo-top"><p class="seo-verdict">' + esc(o.verdict) + "</p>" + "</div>" +
        '<div class="seo-kpis">' + o.tiles.join("") + "</div>" +
        section("Google Search", sample, o.gsc, "Searches on Google that led to your website") +
        section("Google Business Profile", sample, o.gbp, "Your Maps and search listing") +
        section("Keyword rankings", sample, o.rank);
    }
    wrap.addEventListener("click", function (e) {
      var m = e.target.closest("[data-gscmode]"); if (m && D) { mode = m.dataset.gscmode; draw(); return; }
      var r = e.target.closest("[data-retry]"); if (r) { load(); }
    });
    function load() {
      if (sample) { D = sampleData(); draw(); return; }
      if (!(A() && A().session && A().session())) { wrap.innerHTML = '<div class="card seo-load">Sign in to see your SEO results.</div>'; return; }
      wrap.innerHTML = '<div class="card seo-load">Loading SEO results...</div>';
      loadAll().then(function (d) { D = d; draw(); }, function () { wrap.innerHTML = '<div class="card seo-load">Could not load SEO results. <button type="button" class="btn sm" data-retry="all">Try again</button></div>'; });
    }
    load();
  }
  window.RCSeo = { render: render, _build: build, _sample: sampleData };
})();
