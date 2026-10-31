/* Branded proposal PDF for one house. jsPDF is lazy-loaded from cdnjs on first click.
   window.RoofPdf.build(opts) -> Promise<Blob>. No owner names are ever passed in or printed. */
(function () {
  const JSPDF = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
  let loading = null;
  function loadJsPdf() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (!loading) loading = new Promise((res, rej) => {
      const s = document.createElement("script"); s.src = JSPDF; s.integrity = "sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk"; s.crossOrigin = "anonymous"; s.async = true;
      s.onload = () => (window.jspdf && window.jspdf.jsPDF) ? res(window.jspdf.jsPDF) : rej(new Error("jsPDF missing"));
      s.onerror = () => { loading = null; rej(new Error("Could not load the PDF library (offline?)")); };
      document.head.appendChild(s);
    });
    return loading;
  }
  const money = v => "$" + Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const int = v => Number(v).toLocaleString("en-US");
  const hex = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); const n = m ? parseInt(m[1], 16) : 0xB4532F; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const clean = s => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u2013\u2014]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\u00b7/g, "|").replace(/[^\x20-\x7e]/g, "");
  const fmtDate = d => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  // Copy computed paint/text styles into a clone so the serialized SVG renders without app.css.
  function inlineSvg(sv) {
    const clone = sv.cloneNode(true);
    const src = [sv, ...sv.querySelectorAll("*")], dst = [clone, ...clone.querySelectorAll("*")];
    const props = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity", "display", "font-family", "font-size", "font-weight", "text-anchor", "dominant-baseline", "vector-effect", "visibility"];
    src.forEach((el, i) => { const cs = getComputedStyle(el); let st = ""; props.forEach(p => { const v = cs.getPropertyValue(p); if (v) st += p + ":" + v + ";"; }); dst[i].setAttribute("style", st); });
    // crop to the roof (drawing plus visible labels) so a small house is not lost in the wide stage
    try {
      const sr = sv.getBoundingClientRect(), vb = sv.viewBox.baseVal, k = vb.width / sr.width;
      let l = 1e9, t = 1e9, r = -1e9, b = -1e9;
      [sv.querySelector("#rdWorld"), ...sv.querySelectorAll(".rd-lab")].forEach(e => { if (!e || getComputedStyle(e).display === "none") return; const q = e.getBoundingClientRect(); if (!q.width) return; l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); });
      if (r > l) { const pad = 24, x0 = (l - sr.left) * k - pad, y0 = (t - sr.top) * k - pad, w = (r - l) * k + 2 * pad, h = (b - t) * k + 2 * pad; clone.setAttribute("viewBox", [x0, y0, w, h].map(n => n.toFixed(1)).join(" ")); clone.setAttribute("width", w.toFixed(0)); clone.setAttribute("height", h.toFixed(0)); clone._crop = { w, h }; clone.querySelectorAll(".rd-north,.rd-north-n,#rdBar").forEach(e => e.remove()); }
    } catch (_) {}
    clone.removeAttribute("class"); 
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    return { svg: new XMLSerializer().serializeToString(clone), w: clone._crop ? clone._crop.w : sv.viewBox.baseVal.width, h: clone._crop ? clone._crop.h : sv.viewBox.baseVal.height };
  }
  function svgToPng(str, w, h, scale) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(new Blob([str], { type: "image/svg+xml;charset=utf-8" }));
      img.onload = () => {
        const c = document.createElement("canvas"); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
        const g = c.getContext("2d"); g.fillStyle = "#FBF8F2"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", .92));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("snapshot failed")); };
      img.src = url;
    });
  }
  function pngOnLight(dataUrl, bg) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0); res({ url: c.toDataURL("image/jpeg", .92), w: c.width, h: c.height }); };
      img.onerror = () => rej(new Error("snapshot failed")); img.src = dataUrl;
    });
  }

  async function build(o) {
    // 59 O.S. 1151.17(C): registration number "on every business sign, card, correspondence, and contract used to solicit"; 1151.30(A) notice "with its initial estimate".
    const CP = window.RC_COMPLY; if (!CP || !CP.cib()) throw new Error("Add your Oklahoma registration number in Setup first, then try again.");
    const JsPDF = await loadJsPdf();
    const B = o.brand || {}, R = o.roof || {}, C = o.calc || { items: [], sub: 0, total: 0 };
    let img = null;
    try {
      if (o.shot && o.shot.kind === "png") img = await pngOnLight(o.shot.data, "#F3EEE4");
      else if (o.shot && o.shot.kind === "svg") { const d = await svgToPng(o.shot.data, o.shot.w, o.shot.h, 2); img = { url: d, w: o.shot.w * 2, h: o.shot.h * 2 }; }
    } catch (_) { img = null; }

    const doc = new JsPDF({ unit: "pt", format: "letter" });
    const W = 612, H = 792, M = 42, accent = hex(B.accent), INK = [30, 28, 25], MUTED = [107, 101, 91], LINE = [231, 226, 216];
    let y = M;
    const text = (t, x, yy, size, bold, color, align) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(...(color || INK)); doc.text(clean(t), x, yy, align ? { align } : undefined); };
    const rule = yy => { doc.setDrawColor(...LINE); doc.setLineWidth(.7); doc.line(M, yy, W - M, yy); };
    const need = h => { if (y + h > H - 50) { doc.addPage(); y = M; } };
    const wrap = (t, x, w, size, color, lh) => { doc.setFont("helvetica", "normal"); doc.setFontSize(size); doc.setTextColor(...(color || MUTED)); const ls = doc.splitTextToSize(clean(t), w); ls.forEach(l => { need(lh); doc.text(l, x, y); y += lh; }); };

    // header
    doc.setFillColor(...accent); doc.roundedRect(M, y, 34, 34, 8, 8, "F");
    text(B.initials || "", M + 17, y + 22, 13, true, [255, 255, 255], "center");
    text(B.company || "Your Roofing Company", M + 44, y + 15, 14, true);
    text([B.city, B.phone].filter(Boolean).join("  |  "), M + 44, y + 29, 9, false, MUTED);
    text("Roof Replacement Proposal", W - M, y + 15, 14, true, INK, "right");
    text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), W - M, y + 29, 9, false, MUTED, "right");
    text(CP.stamp(), M + 44, y + 41, 8.5, true, INK);
    y += 58; rule(y); y += 20;
    text("PROPERTY", M, y, 8, true, MUTED); y += 15;
    text(R.addr || R.street || "", M, y, 15, true); y += 14;
    text(R.city || "", M, y, 10, false, MUTED);
    if (C.estimate) text("ESTIMATE", W - M, y - 14, 9, true, accent, "right");
    y += 18;

    // snapshot + measurements
    const colW = 262, gap = 24, boxH = img ? Math.max(120, Math.min(216, Math.round((colW - 8) * img.h / img.w) + 8)) : 120;
    if (img) {
      doc.setFillColor(251, 248, 242); doc.setDrawColor(...LINE); doc.roundedRect(M, y, colW, boxH, 6, 6, "FD");
      const sc = Math.min((colW - 8) / img.w, (boxH - 8) / img.h), iw = img.w * sc, ih = img.h * sc;
      doc.addImage(img.url, img.png ? "PNG" : "JPEG", M + (colW - iw) / 2, y + (boxH - ih) / 2, iw, ih);
      text(o.shot.label + " as shown on screen", M, y + boxH + 11, 7.5, false, MUTED);
    } else { text("No roof image available.", M, y + 20, 9, false, MUTED); }
    const x2 = M + colW + gap, w2 = W - M - x2; let ty = y;
    text("ROOF MEASUREMENT", x2, ty + 8, 8, true, MUTED); ty += 18;
    const t = o.totals;
    const rows = [["Footprint", int(R.footprint_sqft || 0) + " sq ft"], ["Roof area", int(o.roofSqft || 0) + " sq ft"],
      ["Pitch", o.pitch + "/12 " + (o.pitchMeasured ? "(measured)" : "(assumed)")], ["Squares to roof", String(o.squares)],
      ["Waste allowance", o.waste + "%"], ["Eaves / perimeter", int(t ? t.eaveFt : (R.perimeter_ft || 0)) + " ft"]];
    if (t) rows.push(["Ridges", t.ridgeFt + " ft"], ["Hips", t.hipFt + " ft"], ["Valleys", t.valleyFt + " ft"], ["Rakes", t.rakeFt + " ft"]);
    rows.forEach(r => { text(r[0], x2, ty + 8, 9.5, false, MUTED); text(r[1], W - M, ty + 8, 9.5, true, INK, "right"); ty += 17; doc.setDrawColor(...LINE); doc.line(x2, ty - 3, W - M, ty - 3); });
    y = Math.max(y + boxH + 28, ty + 14);

    // hail
    need(60); text("HAIL HISTORY AT THIS HOUSE", M, y, 8, true, MUTED); y += 14;
    const hail = o.hail || [];
    if (!hail.length) wrap("No radar-estimated hail of 0.75 in or larger on file for this exact address (NOAA MRMS MESH, 1 km grid).", M, W - 2 * M, 9.5, INK, 13);
    else {
      const shown = hail.slice(0, 10);
      shown.forEach(h => { need(15); text(fmtDate(h.date), M, y, 9.5, false, INK); { const lb = h.label && h.label !== h.date && h.label !== fmtDate(h.date) ? h.label : ""; text(lb, M + 90, y, 9, false, MUTED); } text(h.inches.toFixed(2) + " in", W - M, y, 9.5, true, INK, "right"); y += 14; });
      if (hail.length > shown.length) { text("and " + (hail.length - shown.length) + " more smaller storms on file", M, y, 8.5, false, MUTED); y += 13; }
    }
    y += 4; wrap("Source: NOAA MRMS radar-estimated maximum hail size (MESH), about 1 km resolution. Radar estimates are not a ground measurement.", M, W - 2 * M, 8, MUTED, 11); y += 10;

    // line items
    need(80); rule(y); y += 18; text("LINE ITEMS", M, y, 8, true, MUTED); y += 14;
    C.items.forEach(it => {
      need(34); text(it[0], M, y, 9.5, false, INK); text(money(Math.round(it[2])), W - M, y, 9.5, false, INK, "right"); y += 11;
      text(it[1] || "", M, y, 8, false, MUTED); y += 10; doc.setDrawColor(...LINE); doc.line(M, y, W - M, y); y += 14;
    });
    if (C.markupPct) { need(16); text("Markup " + C.markupPct + "%", M, y, 9.5, false, INK); text(money(Math.round(C.markupAmt)), W - M, y, 9.5, false, INK, "right"); y += 15; }
    if (C.taxPct) { need(16); text("Sales tax " + C.taxPct + "%", M, y, 9.5, false, INK); text(money(Math.round(C.taxAmt)), W - M, y, 9.5, false, INK, "right"); y += 15; }
    need(40); doc.setDrawColor(...INK); doc.setLineWidth(1.2); doc.line(M, y - 2, W - M, y - 2); y += 16;
    text("Total" + (o.matLabel ? " - " + o.matLabel : ""), M, y, 11, true); text(money(Math.round(C.total / 10) * 10), W - M, y, 15, true, INK, "right");
    if (C.estimate) { y += 12; text("Estimate: starting prices are from public sources, several outside Oklahoma, not this company's own price list.", M, y, 8, false, accent); }
    y += 24;

    // footnotes
    need(110); text("NOTES", M, y, 8, true, MUTED); y += 13;
    const notes = [
      (R.source === "drawn" ? (R.drawnVia === "parcel" ? "Outline matched by parcel boundary and confirmed by the roofer" : "Outline drawn by you") + " on the satellite photo" : "Footprint from the county building-footprint layer (Microsoft Building Footprints, OpenStreetMap fallback) for this address") + "; roof area = footprint x pitch factor " + (o.factor ? o.factor.toFixed(3) : "") + " x 5% eave allowance.",
      o.pitchMeasured ? "Pitch of " + o.pitch + "/12 comes from a measured source." : "Pitch of " + o.pitch + "/12 is assumed, not measured. Confirm on site; area and price change with pitch.",
      "Roof shape (ridges, hips, valleys) is modeled from the outline, not a measured facet layout. Verify on site before ordering.",
      "Prices are estimates. Unforeseen decking repair, chimney, skylight and steep or multi-story charges are not included and are confirmed on tear-off."
    ];
    notes.forEach(n => { wrap("- " + n, M, W - 2 * M, 8.5, MUTED, 11.5); y += 2; });
    y += 8; need(70); text("INSURANCE DEDUCTIBLE NOTICE", M, y, 8, true, MUTED); y += 13; wrap(CP.notice(), M, W - 2 * M, 9, INK, 12); y += 6;
    y += 8; need(46);
    doc.setDrawColor(...INK); doc.setLineWidth(.7); doc.line(M, y + 24, M + 250, y + 24); doc.line(M + 290, y + 24, M + 400, y + 24);
    text("Homeowner signature", M, y + 35, 8, false, MUTED); text("Date", M + 290, y + 35, 8, false, MUTED);
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); text((B.company || "") + " | " + CP.stamp() + " | Proposal for " + (R.addr || R.street || "") + " | Page " + i + " of " + n, W / 2, H - 24, 7.5, false, MUTED, "center"); }
    return doc.output("blob");
  }
  window.RoofPdf = { build, inlineSvg, loadJsPdf };
})();
