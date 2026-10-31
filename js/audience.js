/* Storm audience: who may be contacted after a storm, and message drafts. Drafts only: nothing here sends anything.
   Texts: only homeowners who gave consent (homeowner_leads.consent_checked). Past customers are EMAIL ONLY
   (47 CFR 64.1200(a)(2): automated texts to past customers need prior express written consent). */
(function () {
  "use strict";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const noDash = s => String(s || "").replace(/[—–]/g, "-");

  const DEMO_OPTED = [
    ["Sample Homeowner A", "1104 Sample Oak Dr", 1.75, 1, 1], ["Example Homeowner B", "1141 Example Maple Ct", 1.5, 1, 1],
    ["Demo Homeowner C", "1178 Demo Cedar Ln", 2.0, 1, 0], ["Fictional Homeowner D", "1215 Fictional Elm St", 1.25, 0, 1],
    ["Sample Homeowner E", "1252 Sample Pine Way", 1.75, 1, 1], ["Example Homeowner F", "1289 Example Birch Rd", 1.0, 1, 0]
  ];
  const DEMO_PAST = [
    ["Sample Past Customer G", "1326 Demo Willow Ave", 1.5, "past.g@example.invalid"], ["Example Past Customer H", "1363 Sample Oak Dr", 1.75, ""],
    ["Demo Past Customer I", "1400 Example Maple Ct", 1.25, "past.i@example.invalid"], ["Fictional Past Customer J", "1437 Demo Cedar Ln", 1.0, ""]
  ];

  function demo() {
    return {
      optedIn: DEMO_OPTED.map((d, i) => ({ kind: "opted", name: d[0], address: d[1], hail: d[2], region: "demo", idx: i, canText: !!d[3], canEmail: !!d[4], phone: d[3] ? "(405) 555-01" + (10 + i) : "", email: d[4] ? "sample" + i + "@example.invalid" : "" })),
      pastCustomers: DEMO_PAST.map((d, i) => ({ kind: "past", name: d[0], address: d[1], hail: d[2], region: "demo", idx: 100 + i, canText: false, canEmail: !!d[3], phone: "", email: d[3] }))
    };
  }

  async function forStorm(stormDate) {
    if (window.RC_DEMO) return demo();
    const out = { optedIn: [], pastCustomers: [] };
    const X = window.RC_DAILY_SRC; if (!X || !stormDate) return out;
    const D = X.data(), st = D && D.byDate && D.byDate[stormDate]; if (!st) return out;
    try { await X.ensureStormLoaded(stormDate); } catch (e) { return out; }
    const ids = st.regions.map(r => r.id), hailOf = (rid, idx) => { const rg = X.reg(rid), h = rg && rg.hailCache && rg.hailCache[stormDate]; return h && idx != null && h[idx] > 0 ? h[idx] / 100 : 0; };
    const rows = (window.RCInbox && window.RCInbox.rows && window.RCInbox.rows()) || [];
    rows.forEach(r => {
      if (!r || !r.consent_checked || r.status === "do_not_contact" || ids.indexOf(r.region) < 0) return;
      const hail = hailOf(r.region, r.home_idx); if (!(hail > 0)) return;
      out.optedIn.push({ kind: "opted", name: r.name || "Homeowner", address: r.address || "", hail, region: r.region, idx: r.home_idx, phone: r.phone || "", email: r.email || "", canText: !!r.phone, canEmail: !!r.email });
    });
    if (window.RC_PLAN && window.RC_PLAN.loadCustomers && window.RC_PLAN.active && window.RC_PLAN.active()) {
      const cu = await window.RC_PLAN.loadCustomers(ids).catch(() => null);
      (cu || []).forEach(c => {
        const hail = hailOf(c.rid, c.idx); if (!(hail > 0)) return;
        // company_customers has no phone/email columns yet: address-only, so no draft until an email exists
        out.pastCustomers.push({ kind: "past", name: c.name || "Customer", address: c.addr || "", hail, region: c.rid, idx: c.idx, phone: "", email: c.email || "", canText: false, canEmail: !!c.email });
      });
    }
    return out;
  }

  function company() {
    const a = window.RC_AUTH, c = a && a.company && a.company();
    return (c && (c.brand_name || c.name)) || (window.BRAND && window.BRAND.company) || (window.RC_DEMO ? "Sample Roofing Co (demo)" : "our roofing team");
  }
  function stamp() { try { return window.RC_COMPLY && window.RC_COMPLY.stamp ? String(window.RC_COMPLY.stamp() || "") : ""; } catch (e) { return ""; } }
  function dateLabel(d) { try { return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); } catch (e) { return d; } }

  function body(p, date, co, st) {
    const first = String(p.name || "").split(" ")[0] || "there";
    const lines = [`Hi ${first},`, "",
      `A hailstorm moved through your area on ${dateLabel(date)}. NOAA radar estimates about ${Number(p.hail).toFixed(2)} inch hail near ${p.address || "your address"}.`,
      `${co} is offering a free roof inspection so you know what, if anything, the storm did. No obligation.`, "",
      `${co}${st ? ", " + st : ""}`, ""];
    lines.push(p.kind === "opted" ? "To stop hearing from us, reply STOP to a text or reply \"unsubscribe\" to this email." : "If you do not want more emails from us, reply \"unsubscribe\" and we will stop right away.");
    return noDash(lines.join("\n"));
  }

  function draftsHtml(list, date) {
    const co = company(), st = stamp(), all = (list || []);
    const ok = all.filter(p => p.canEmail || (p.kind === "opted" && p.canText)), none = all.filter(p => !(p.canEmail || (p.kind === "opted" && p.canText)));
    const card = p => {
      const ch = p.kind === "opted" ? [p.canText ? "Text" : "", p.canEmail ? "Email" : ""].filter(Boolean).join(" + ") : "Email only";
      return `<div class="kn-card"><b>${esc(p.name)}</b><div class="muted">${esc(p.address)} &middot; ${esc(ch)}${p.kind === "past" ? " &middot; past customer" : ""}</div>
        <textarea class="kn-in" rows="9" readonly aria-label="Draft for ${esc(p.name)}">${esc(body(p, date, co, st))}</textarea>
        <button class="btn block" type="button" disabled aria-disabled="true">Sending is off</button></div>`;
    };
    return `<div class="kn-note" style="margin-bottom:8px">Drafts to review. Nothing is sent from this screen. Texts go only to homeowners who agreed to them; past customers get email only.</div>`
      + (ok.map(card).join("") || `<div class="kn-card muted">No one with a contact on file for this storm.</div>`)
      + (none.length ? `<div class="kn-card"><b>No contact on file (${none.length})</b><div class="muted">${none.map(p => esc(p.name) + ", " + esc(p.address)).join("<br>")}</div></div>` : "");
  }

  window.RCAudience = { forStorm, draftsHtml };
})();
