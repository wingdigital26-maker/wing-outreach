/* Printable proposal view. Owned by the roof/proposal lane.
   Usage: window.openProposal({ roof, materialLabel, items, total, hailDate, hailIn })
   - roof: DATA.roof (has street, squares, pitch, roof_sqft, perimeter_ft, center, hail{})
   - materialLabel: string, e.g. "Class 4 impact-rated shingles"
   - items: array of [label, qty/desc string, amount]
   - total: number (already rounded, matches the on-screen total)
   - hailDate / hailIn: optional override, defaults to the worst storm on file for this roof
   Builds one full-screen overlay, print-friendly via css/proposal.css + window.print(). */
(function () {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const money = v => "$" + Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const int = v => Number(v).toLocaleString("en-US");
  const todayStr = () => new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  // Slippy-map tile covering the roof center, for a small satellite thumbnail. No API key.
  function tileUrl(lon, lat, z) {
    const n = Math.pow(2, z);
    const x = Math.floor((lon + 180) / 360 * n);
    const latRad = lat * Math.PI / 180;
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return window.RC_IMAGERY.tileUrl(z, x, y);
  }

  function worstHail(roof) {
    const entries = Object.entries(roof.hail || {});
    if (!entries.length) return null;
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0]; // [date, inches]
  }

  function fmtDate(d) {
    return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  const properCase = t => String(t || "").replace(/[A-Za-z]+/g, w => w.length <= 2 && /^[A-Z]{2}$/.test(w) ? w : w[0].toUpperCase() + w.slice(1).toLowerCase());
  /* Oklahoma compliance helper, shared with pdf.js, plan.js and other screens: window.RC_COMPLY.
     59 O.S. 1151.17(C): the registration number must appear "on every business sign, card, correspondence, and contract used to solicit".
     59 O.S. 1151.30(A): a roofer may not "advertise or promise to pay, directly or indirectly, all or part of any applicable insurance deductible";
     written notice is required "with its initial estimate". Draft wording below is for the company's attorney to review.
     Source of truth is company_settings.cib_number / deductible_notice; plan.js caches them in localStorage "rc.cib.<company_id>" (or "rc.cib.local" with no sign-in). */
  const DEFAULT_NOTICE = "Oklahoma law (59 O.S. 1151.30) does not allow a roofing contractor to pay, waive, or rebate any part of your insurance deductible, or to promise to. You are responsible for your deductible.";
  const DEMO_CIB = "000000"; // clearly fictional, demo mode only
  const cibKey = () => { const A = window.RC_AUTH, c = A && A.company && A.company(); return "rc.cib." + (c && c.company_id ? c.company_id : "local"); };
  const readCo = () => { try { return JSON.parse(localStorage.getItem(cibKey()) || "null") || {}; } catch (e) { return {}; } };
  window.RC_COMPLY = {
    DEFAULT_NOTICE: DEFAULT_NOTICE, key: cibKey, read: readCo,
    cib() { if (window.RC_DEMO) return DEMO_CIB; const v = String(readCo().cib || "").trim(); return /^[0-9]{1,12}$/.test(v) ? v : null; },
    notice() { const v = String(readCo().notice || "").trim(); return v || DEFAULT_NOTICE; },
    stamp() { const n = this.cib(); return n ? "OK Roofing Registration #" + n + (window.RC_DEMO ? " (demo number, not real)" : "") : ""; },
    save(patch) { try { localStorage.setItem(cibKey(), JSON.stringify(Object.assign(readCo(), patch))); } catch (e) { } }
  };

  const addrLine = t => typeof window.fmtAddress === "function" ? window.fmtAddress(t) : String(t || "");

  function ensureOverlay() {
    let el = document.getElementById("propOverlay");
    if (el) return el;
    el = document.createElement("div");
    el.id = "propOverlay";
    el.className = "prop-overlay";
    el.innerHTML = `
      <div class="prop-bar no-print">
        <span>Proposal preview</span>
        <div class="grow"></div>
        <button class="btn" id="propClose">Close</button>
        <button class="btn primary" id="propPrint"><span class="lg">Print / Save PDF</span><span class="sm">Save PDF</span></button>
      </div>
      <div class="prop-scroll"><div class="prop-sheet" id="propSheet"></div></div>`;
    document.body.appendChild(el);
    el.querySelector("#propClose").onclick = closeProposal;
    el.querySelector("#propPrint").onclick = () => window.print();
    el.addEventListener("keydown", e => { if (e.key === "Escape") closeProposal(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && document.getElementById("propOverlay")) closeProposal(); });
    return el;
  }

  function closeProposal() {
    const el = document.getElementById("propOverlay");
    if (el) el.remove();
  }

  // No registration number: the proposal does not open. Plain message plus a button straight to the setting.
  function blockedSheet(el, opts) {
    const A = window.RC_AUTH, P = window.RC_PLAN, signed = !!(A && A.enabled && !A.demo && A.session && A.session());
    const sheet = el.querySelector("#propSheet");
    el.querySelector("#propPrint").style.display = "none";
    el.querySelector(".prop-bar span").textContent = "Proposal blocked";
    sheet.innerHTML = `<div class="prop-block" id="propBlock">
      <h2>Add your Oklahoma registration number first</h2>
      <p>Oklahoma law requires your Construction Industries Board roofing registration number on every proposal you give a homeowner. Add it once and every proposal will carry it.</p>
      <div class="prop-block-act"></div><div class="fine" id="propBlockMsg" aria-live="polite"></div></div>`;
    const act = sheet.querySelector(".prop-block-act"), msg = sheet.querySelector("#propBlockMsg");
    if (signed) {
      if (P && P.canEditCompliance && P.canEditCompliance()) {
        const b = document.createElement("button"); b.className = "btn primary"; b.id = "propGoCib"; b.textContent = "Add registration number";
        b.onclick = () => { closeProposal(); P.openCompliance(); }; act.appendChild(b);
      } else msg.textContent = "Ask your account owner to add the registration number in Setup, under Registration and notice.";
    } else {
      act.innerHTML = `<label for="propCibIn">Registration number (digits only)</label><input id="propCibIn" type="text" inputmode="numeric" maxlength="12" autocomplete="off"><button class="btn primary" id="propCibSave" type="button">Save and open proposal</button>`;
      act.querySelector("#propCibSave").onclick = () => {
        const v = act.querySelector("#propCibIn").value.trim();
        if (!/^[0-9]{1,12}$/.test(v)) { msg.textContent = "Use digits only, 1 to 12 of them."; return; }
        window.RC_COMPLY.save({ cib: v }); window.openProposal(opts);
      };
    }
    return el;
  }

  window.closeProposal = closeProposal;

  window.openProposal = function (opts) {
    const B = window.BRAND || { company: "Your Roofing Company", initials: "RC", owner: "Owner", phone: "", accent: "#B4532F" };
    const R = opts.roof || {};
    const items = opts.items || [];
    const total = opts.total || items.reduce((a, x) => a + (x[2] || 0), 0);
    const [hailDate, hailIn] = opts.hailDate && opts.hailIn != null ? [opts.hailDate, opts.hailIn] : (worstHail(R) || ["", null]);
    const thumb = R.center ? tileUrl(R.center[0], R.center[1], 18) : null;

    const el = ensureOverlay();
    el.querySelector("#propPrint").style.display = ""; el.querySelector(".prop-bar span").textContent = "Proposal preview";
    if (!window.RC_COMPLY.cib()) return blockedSheet(el, opts);
    const stamp = window.RC_COMPLY.stamp(), notice = window.RC_COMPLY.notice();
    const sheet = el.querySelector("#propSheet");
    sheet.innerHTML = `
      <div class="prop-head">
        <div class="prop-brand">
          <div class="prop-logo" style="background:${esc(B.accent || "#B4532F")}">${esc(B.initials || "")}</div>
          <div><b>${esc(B.company || "")}</b><span>${esc(B.city || "")}${B.phone ? ` &middot; <span class="nw">${esc(B.phone)}</span>` : ""}</span><span class="prop-reg">${esc(stamp)}</span></div>
        </div>
        <div class="prop-doc-meta">
          <div class="prop-doc-title">Roof Replacement Proposal</div>
          <div>${esc(todayStr())}</div>
        </div>
      </div>

      <div class="prop-row prop-address">
        <div>
          <div class="l">Property</div>
          <div class="v">${esc(addrLine(R.addr || R.street || ""))}</div>
          <div class="cityline">${esc(properCase(R.city || "Norman, OK"))}</div>
        </div>
        <div>
          <div class="l">Prepared by</div>
          <div class="v">${esc(B.owner || "")}, ${esc(B.company || "")}${window.RC_DEMO ? " (Demo)" : ""}</div>
        </div>
      </div>

      <div class="prop-grid">
        <div class="prop-measure">
          <div class="l">Roof measurement <span class="est-chip">Estimate</span></div>
          <div class="prop-stats">
            <div><b>${esc(R.squares ?? "")}</b><span>Squares</span></div>
            <div><b>${esc(R.pitch ?? "")}</b><span>Pitch</span></div>
            <div><b>${int(R.roof_sqft || 0)}</b><span>Roof sq ft</span></div>
          </div>
          <div class="fine">${R.source === "drawn" ? (R.drawnVia === "parcel" ? "Outline matched by parcel boundary and confirmed by the roofer" : "Outline drawn by you") : "From this address's building footprint (Microsoft Building Footprints, OpenStreetMap fallback)"} (${int(R.footprint_sqft || 0)} sq ft, ${int(R.perimeter_ft || 0)} ft perimeter). Plane layout is modeled. Verify on site before ordering.</div>
        </div>
        ${thumb ? `<div class="prop-thumb"><img src="${thumb}" alt="Satellite view of the property" crossorigin="anonymous"><span>${window.RC_IMAGERY.label}</span></div>` : ""}
      </div>

      ${hailIn != null ? `<div class="prop-hail">
        <div class="l">Hail evidence</div>
        <div class="v">${hailIn.toFixed(2)}" radar-estimated hail at this home on ${esc(fmtDate(hailDate))}</div>
        <div class="fine">Source: NOAA MRMS (MESH)</div>
      </div>` : ""}

      <table class="prop-lines">
        <thead><tr><td>Line item</td><td class="n">Amount</td></tr></thead>
        <tbody>
          ${items.map(x => `<tr><td>${esc(x[0])}${x[1] ? `<span class="q">${esc(x[1])}</span>` : ""}</td><td class="n">${money(Math.round(x[2]))}</td></tr>`).join("")}
        </tbody>
        <tfoot><tr><td>Total${opts.materialLabel ? ` &middot; ${esc(opts.materialLabel)}` : ""}</td><td class="n">${money(Math.round(total))}</td></tr></tfoot>
      </table>
      <div class="fine" style="margin-top:4px">${opts.estimate ? "Prices are estimates from public sources, several outside Oklahoma, not this company's own price list. " : ""}This estimate does not include unforeseen decking repair, verified on tear-off.</div>

      <div class="prop-notice">
        <div class="l">Insurance deductible notice</div>
        <p>${esc(notice)}</p>
      </div>

      <div class="prop-terms">
        <div class="l">Terms <span class="est-chip">Sample</span></div>
        <p>Sample terms for this demo: 50% deposit to schedule, balance due on completion. Material and workmanship warranty details would appear here. Not a binding contract.</p>
      </div>

      <div class="prop-sign">
        <div class="sig"><div class="line"></div><span>Homeowner signature</span></div>
        <div class="sig sig-date"><div class="line"></div><span>Date</span></div>
      </div>
      <div class="prop-foot">${esc(B.company || "")} &middot; ${esc(stamp)}</div>`;

    return el;
  };
})();
