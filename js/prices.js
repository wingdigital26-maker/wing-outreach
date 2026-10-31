/* Per-roofer unit prices for the proposal. Defaults come from the verified OKC roof pricing playbook
   (deep-research/okc-roof-pricing, rounds 1 and 2). Every value is editable; edits are saved in localStorage
   (try/catch, works if blocked). Public API: window.RoofPrices. */
(function () {
  const E = "estimate, set your own";
  const D = {
    tearoff:   { label: "Tear-off and haul away", value: 62, unit: "$/sq", confidence: "low", source: "Insurance-format sample anchors: tear out laminated $61.51/sq (Symbility sample, NJ) and 3-tab removal $64.18/sq (Xactimate INSB8X_NOV23 list). Not Oklahoma.", note: E },
    install:   { label: "Install (labor, est.)", value: 310, unit: "$/sq", confidence: "low", source: "City of Tulsa municipal repair-scale bid; may include materials; not a replacement labor rate. Bid tabs TAC-1015B/C, 2023: $296-$325/sq, mid of that range.", note: E },
    shingle:   { label: "Architectural shingle material", value: 118, unit: "$/sq", confidence: "low", source: "GAF Timberline HDZ retail snippets 2026, about $112-$124/sq (3 bundles per sq). One retail source only.", note: E },
    premium1:  { label: "Class 4 impact premium", value: 95, unit: "$/sq", confidence: "low", source: "AskDoss (Mar 2026) Oklahoma installed ranges imply about a 22% Class 4 premium over architectural; 22% of material plus labor is about $95/sq.", note: E },
    premium2:  { label: "Standing seam metal premium", value: 520, unit: "$/sq", confidence: "none", source: "No source, set your own. Only used if you pick Standing seam.", note: "" },
    underlay:  { label: "Synthetic underlayment", value: 9, unit: "$/sq", confidence: "low", source: "Distributor roll $91.06 per 1,000 sf and cost guide $7-$10.70/sq, mid. Material only.", note: E },
    iceWater:  { label: "Ice and water shield, installed", value: 1.64, unit: "$/sf", confidence: "low", source: "Insurance-format sample, about $164/sq installed (Symbility sample, NJ). Retail material alone is $0.46-$0.84/sf. Strip width assumed 3 ft per valley.", note: E },
    dripEdge:  { label: "Drip edge", value: 3.0, unit: "$/LF", confidence: "low", source: "Insurance-format sample anchors: drip edge installed $2.73-$3.24/LF (Symbility sample, NJ).", note: E },
    starter:   { label: "Starter strip", value: 0.48, unit: "$/LF", confidence: "med", source: "GAF Pro-Start and OC Starter Strip Plus retail snippets, $0.46-$0.50/LF, material only.", note: E },
    ridgeMat:  { label: "Ridge and hip cap, material", value: 2.44, unit: "$/LF", confidence: "med", source: "GAF Seal-A-Ridge, 25 LF per bundle (GAF spec), about $2.44/LF retail ($2.93 for the impact-resistant version).", note: "" },
    ridgeLab:  { label: "Ridge and hip cap, install labor", value: 4.4, unit: "$/LF", confidence: "low", source: "Derived: insurance-format sample ridge cap installed $6.84/LF (NJ) minus $2.44 material.", note: E },
    vent:      { label: "Pipe boot / vent flashing, each", value: 46.96, unit: "$/each", confidence: "low", source: "Insurance-format sample, plumbing vent flashing $46.96 each (Symbility sample, NJ).", note: E },
    ventQty:   { label: "Vents and pipe boots on this roof", value: 5, unit: "count", confidence: "none", source: "Not measured. Count is an assumption until someone looks at the roof.", note: E },
    dumpster:  { label: "Dumpster, 20 yd", value: 475, unit: "$/each", confidence: "med", source: "OKC rate page (bintheredumpthat.com), 20 yd, 10 days, 4 tons included, 2025-26. Norman transfer station adds $92/ton above that.", note: "" },
    permitOKC: { label: "Permit (OKC rate; also shown for cities with no fee on file)", value: 94.5, unit: "$/job", confidence: "high", source: "okc.gov re-roofing guidance and the Aug 1 2025 ordinance: re-roof permit required, $94.50, usually same day.", note: "" },
    permitNorman: { label: "Permit, Norman", value: 0, unit: "$/job", confidence: "med", source: "City of Norman storm FAQ (2023): roof covering repairs need no permit. Confirm with Development Services 405-366-5339.", note: "" }
  };
  const ORDER = Object.keys(D);
  const A = window.RC_AUTH, CO = A && A.company && A.company();
  const KEY = "roofcmd.prices.v1" + (CO ? ":" + CO.company_id : "");   // signed in: per-company local copy, DB is the source of truth
  const S = { vals: {}, markup: 0, tax: 0, saved: false, dirty: false };
  try { const j = JSON.parse(localStorage.getItem(KEY) || "null"); if (j && typeof j === "object") { S.vals = j.vals || {}; S.markup = +j.markup || 0; S.tax = +j.tax || 0; S.saved = !!j.saved; } } catch (_) {}

  const fromDb = c => { const p = c && c.prices; if (p && typeof p === "object" && p.vals) { S.vals = p.vals || {}; S.markup = +p.markup || 0; S.tax = +p.tax || 0; S.saved = true; S.dirty = false; try { localStorage.setItem(KEY, JSON.stringify({ vals: S.vals, markup: S.markup, tax: S.tax, saved: true })); } catch (_) {} } };
  if (CO) fromDb(CO);
  if (A && A.on) A.on(c => { if (c && CO && c.company_id === CO.company_id && !S.dirty) fromDb(c); });
  const val = k => (S.vals[k] != null && isFinite(S.vals[k])) ? S.vals[k] : D[k].value;
  const baseVal = val;
  const p2 = n => "$" + (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: (Math.round(n * 100) % 100) ? 2 : 0, maximumFractionDigits: 2 });

  // o: squares, order, waste, valleyFt, eaveFt, ridgeFt, mat (0/1/2), matLabel, city
  function build(o) {
    const used = new Set();
    const val = k => { used.add(k); return baseVal(k); };
    const items = [];
    const add = (label, qty, amt) => items.push([label, qty, amt]);
    const matUnit = val("shingle") + (o.mat === 1 ? val("premium1") : o.mat === 2 ? val("premium2") : 0);
    add("Tear-off and haul away", `${o.squares} sq x ${p2(val("tearoff"))}`, o.squares * val("tearoff"));
    add(o.matLabel + ", material", `${o.order.toFixed(1)} sq with ${o.waste}% waste x ${p2(matUnit)}`, o.order * matUnit);
    add("Install (labor, est.)",`${o.squares} sq x ${p2(val("install"))}`, o.squares * val("install"));
    if (o.valleyFt > 0) add("Ice and water shield at valleys", `${o.valleyFt * 3} sf (${o.valleyFt} ft x 3 ft) x ${p2(val("iceWater"))}`, o.valleyFt * 3 * val("iceWater"));
    add("Synthetic underlayment", `${o.squares} sq x ${p2(val("underlay"))}`, o.squares * val("underlay"));
    add("Drip edge", `${o.eaveFt} ft x ${p2(val("dripEdge"))}`, o.eaveFt * val("dripEdge"));
    add("Starter strip", `${o.eaveFt} ft x ${p2(val("starter"))}`, o.eaveFt * val("starter"));
    add("Ridge cap and hip cap", `${o.ridgeFt} ft x ${p2(val("ridgeMat") + val("ridgeLab"))}`, o.ridgeFt * (val("ridgeMat") + val("ridgeLab")));
    add("Pipe boots, vents, flashing", `${val("ventQty")} each x ${p2(val("vent"))}`, val("ventQty") * val("vent"));
    add("Dumpster, 20 yd", `1 x ${p2(val("dumpster"))}`, val("dumpster"));
    const norman = /norman/i.test(o.city || "");
    const permit = norman ? val("permitNorman") : val("permitOKC");
    const okc = /oklahoma city|^okc$/i.test((o.city || "").trim());
    add(norman ? "Permit (Norman)" : okc ? "Permit (Oklahoma City)" : "Permit (city fee not on file; OKC rate shown)",
      permit ? `1 x ${p2(permit)}` : "Norman: no permit for roof repairs per city FAQ (2023); confirm for full replacement", permit);
    const sub = items.reduce((a, x) => a + x[2], 0);
    const markupAmt = sub * S.markup / 100, taxAmt = (sub + markupAmt) * S.tax / 100;
    const keys = [...used], mine = keys.filter(k => S.vals[k] != null).length;
    const estimate = mine < keys.length || S.dirty;
    const estLabel = S.dirty && mine === keys.length ? "Unsaved changes" : mine ? `Estimate: ${mine} of ${keys.length} prices are yours${S.dirty ? " (unsaved changes)" : ""}` : "Estimate";
    const warn = o.mat === 2 && S.vals.premium2 == null ? "Standing seam premium has no source. Set your own price in Prices." : "";
    return { items, sub, markupPct: S.markup, markupAmt, taxPct: S.tax, taxAmt, total: sub + markupAmt + taxAmt, estimate, estLabel, warn, yours: mine, of: keys.length };
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify({ vals: S.vals, markup: S.markup, tax: S.tax, saved: S.saved })); } catch (_) {} if (CO) A.savePrices({ vals: S.vals, markup: S.markup, tax: S.tax }); }
  function reset() { S.vals = {}; S.markup = 0; S.tax = 0; S.saved = false; S.dirty = false; try { localStorage.removeItem(KEY); } catch (_) {} if (CO) A.savePrices({ vals: {}, markup: 0, tax: 0 }); }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Renders the panel into `host`; onChange fires on every edit (live recalculation).
  function panel(host, onChange) {
    const row = k => { const d = D[k], custom = S.vals[k] != null && S.vals[k] !== d.value; return `<div class="pp-row" data-k="${k}">
      <label class="pp-l" for="pp_${k}">${esc(d.label)}</label>
      <span class="pp-in"><input id="pp_${k}" type="number" min="0" step="any" inputmode="decimal" value="${val(k)}"><small>${esc(d.unit)}</small></span>
      <div class="pp-src"><b class="pp-conf pp-c-${d.confidence}">${d.confidence === "none" ? "no source" : d.confidence + " confidence"}</b>${custom ? ` <b class="pp-mine">yours</b>` : ""} ${esc(d.source)}${d.note ? ` <i>(${esc(d.note)})</i>` : ""}</div></div>`; };
    host.hidden = false;
    host.innerHTML = `<div class="pp-panel">
      <div class="pp-h"><b>Your prices</b><button class="btn sm" type="button" data-a="close">Done</button></div>
      <p class="pp-intro">Starting prices are estimates from public sources, several from outside Oklahoma. Set your own supplier and crew cost. Edits recalculate the proposal live; Save keeps them on this device.</p>
      <div class="pp-grid2">
        <div class="pp-row"><label class="pp-l" for="pp_markup">Markup / margin</label><span class="pp-in"><input id="pp_markup" type="number" min="0" step="any" inputmode="decimal" value="${S.markup}"><small>%</small></span><div class="pp-src">Added on top of the line items. Default 0, no sourced figure.</div></div>
        <div class="pp-row"><label class="pp-l" for="pp_tax">Sales tax</label><span class="pp-in"><input id="pp_tax" type="number" min="0" step="any" inputmode="decimal" value="${S.tax}"><small>%</small></span><div class="pp-src">Applied after markup. Default 0; set the rate your accountant uses.</div></div>
      </div>
      <div class="pp-list">${ORDER.map(row).join("")}</div>
      <div class="pp-foot"><button class="btn sm" type="button" data-a="reset">Reset to defaults</button><button class="btn sm" type="button" data-a="save">Save my prices</button><span class="pp-msg" aria-live="polite">${S.saved ? "Saved on this device." : "Not saved yet."}</span></div></div>`;
    const msg = () => host.querySelector(".pp-msg");
    host.oninput = e => {
      const t = e.target; if (!t.matches("input")) return;
      const v = parseFloat(t.value), ok = isFinite(v) && v >= 0;
      if (t.id === "pp_markup") S.markup = ok ? v : 0; else if (t.id === "pp_tax") S.tax = ok ? v : 0;
      else { const k = t.closest(".pp-row").dataset.k; if (ok) S.vals[k] = v; else delete S.vals[k]; }
      S.dirty = true; msg().textContent = "Unsaved changes."; onChange && onChange();
    };
    // blank or negative: show the value actually in use (the default) instead of an empty box, with a small note
    host.onchange = e => {
      const t = e.target; if (!t.matches("input")) return;
      const v = parseFloat(t.value); if (isFinite(v) && v >= 0) return;
      const m = t.id === "pp_markup" ? S.markup : t.id === "pp_tax" ? S.tax : val(t.closest(".pp-row").dataset.k);
      t.value = m;
      const row = t.closest(".pp-row"); let n = row.querySelector(".pp-warn");
      if (!n) { n = document.createElement("small"); n.className = "pp-warn"; n.setAttribute("role", "status"); row.appendChild(n); }
      n.textContent = "Enter a number of 0 or more. Using " + m + " instead.";
    };
    host.onclick = e => {
      const a = e.target.closest("button")?.dataset.a; if (!a) return;
      if (a === "close") { host.innerHTML = ""; host.hidden = true; }
      if (a === "save") { S.saved = true; S.dirty = false; persist(); msg().textContent = "Saved on this device."; onChange && onChange(); }
      if (a === "reset") { reset(); panel(host, onChange); onChange && onChange(); }
    };
  }
  window.RoofPrices = { DEFAULTS: D, ORDER, get: val, build, panel, reset, state: S, isSaved: () => S.saved };
})();
