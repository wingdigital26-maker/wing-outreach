// One place to re-skin the demo for a prospect.
// Quick override from the URL, no code change needed:
//   index.html?company=Prairie%20Roofing&initials=PR&owner=Dale&accent=%232F5D50
window.BRAND = {
  company: "Red Dirt Roofing",
  initials: "RD",
  owner: "Cody",
  city: "Norman, OK",
  phone: "(405) 555-0142",        // 555 = fictional
  accent: "#B4532F",              // the one accent colour
  accentSoft: null,               // derived automatically when null
  avgTicket: 14800,               // sample: average replacement ticket, drives sample math
  pricePerSquare: 525             // sample: installed $/square for estimates
};

(function applyAccountsAndDemo() {
  const b = window.BRAND;
  if (window.RC_AUTH && !window.RC_DEMO) window.RC_AUTH.applyBrand(b);   // signed-in company brand (cached copy, refreshed async)
  if (window.RC_DEMO) Object.assign(b, { company: "Prairie Demo Roofing", initials: "PD", owner: "Sam", city: "Norman, OK", phone: "(405) 555-0100", accent: "#2F5D50", logoUrl: null });
})();

(function applyOverrides() {
  const q = new URLSearchParams(location.search);
  const b = window.BRAND;
  ["company", "initials", "owner", "city", "phone", "accent"].forEach(k => { if (q.get(k)) b[k] = q.get(k); });
  if (q.get("company") && !q.get("initials")) {
    b.initials = q.get("company").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  }
})();
