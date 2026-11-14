// Shared brand helpers for the concept frames.
// Wing mark path = the analytic master from creative-tools/wing-logo-3d (same path as the sculpture poster).
window.WING_MARK = (fill) => `<svg viewBox="0 0 63 66" xmlns="http://www.w3.org/2000/svg"><path fill="${fill||'currentColor'}" d="M 0 3 Q 0 0 3 0 L 27 0 Q 30.5 0 30.5 3.5 L 30.5 28.5 Q 30.5 33.5 35.5 33.5 L 60 33.5 Q 63 33.5 63 36.5 L 63 63 Q 63 66 60 66 L 36 66 Q 32.5 66 32.5 62.5 L 32.5 37.5 Q 32.5 32.5 27.5 32.5 L 3 32.5 Q 0 32.5 0 29.5 Z"/></svg>`;
// tour/ root, from this file's own URL, so roofer logo files resolve from any page depth
const BRAND_BASE = (function(){ const s = document.currentScript && document.currentScript.src; return s ? s.replace(/lib\/brand\.js.*$/, '') : ''; })();
/* The roofer registry: ONE entry per roofer, and the one place a new roofer is defined (docs/ROOFER-CONFIG.md).
   This build is Jackson Roofing's own app (Plano, TX): Jackson is the only roofer.
   ?roofer=<key> picks a key (rc-state keeps it). A key that is not listed here is NOT swapped for another roofer:
   the app says so and shows no brand and no data (see "an unknown roofer" below). No key at all = DEFAULT_ROOFER.
   Where the roofer's data lives: dataRoot (the data folder under tour/), bucket (the private Supabase Storage bucket the
   hosted build reads that folder from; scripts/build_deploy_jackson.py stamps both into lib/auth-gate.js), seo (the
   list of pages Wing published for the roofer).
   Fields every screen reads: name, area (header line), region (opening hero line), owner (first name), state,
   areaCode (sample phones), licence (licence number; null = no licence line at all), city/zip (home city),
   cities (preferred city order for the header line), accent/soft/ink (white on accent >= 4.5:1), logo (HTML),
   wide + markBg (a wordmark logo on its own plate), center (the map's home camera).
   storm: blank strings mean "use the storm of the data on screen" (rc-state facts). */
window.ROOFERS = {
  // Jackson Roofing, Wing Digital client, based in Plano. Logo = the live site's own file (jacksonroofingco.com logo1.webp, black plate).
  // Colours from the logo cyan #1BC0FF and the rebuilt site's --blue-ink: white on #0D6C99 is 5.8:1, ink on soft 7.4:1.
  // Texas has no state roofing licence, so licence is null and no licence line shows anywhere.
  // Texas calling hours (Tex. Bus. & Com. Code 301.051): 9 am to 8 pm Mon to Sat, noon to 8 pm Sunday.
  // storm stays blank here: the DFW data build (tour/lib/st-data-dfw/) supplies the storm, never this registry.
  // area/region are the fallback; once the catalog lands they are rebuilt from its cities (rooferArea), Plano first.
  jackson: { dataRoot:'lib/st-data-dfw/', bucket:'jackson-dfw', seo:'lib/seo-jackson.json', name:"Jackson Roofing", area:"Plano, Frisco, Allen, McKinney, Richardson and Rockwall", region:"Plano, Frisco, Allen, McKinney, Richardson and Rockwall, TX", owner:"Chris", state:"TX", callWindow:{monSat:[9,20],sun:[12,20]}, tz:"America/Chicago", areaCode:"972", licence:null, city:"Plano", zip:"",
    cities:["Plano","Frisco","Allen","McKinney","Richardson","Rockwall"],
    // hq: where outreach starts on the Today map. Street address not on file yet, so central Plano, flagged approx.
    hq:{name:"Jackson Roofing, Plano", loc:[-96.75,33.02], approx:true},
    storm:{d:"",n:"",max:""}, shift:[0,0], center:[-96.75,33.02], accent:"#0D6C99", soft:"#E3F6FE", ink:"#07547A", accentHi:"#1388BF",
    wide:true, markBg:"#000000",
    logo:`<img src="${BRAND_BASE}img/roofers/jackson/logo.webp" alt="Jackson Roofing" width="500" height="218" draggable="false">` }
};
// THE default roofer: the one this deployment opens when no roofer key is given at all. The only place that names it.
// A roofer key is lower case letters, digits and dashes only (2 to 32), and must match a ROOFERS entry exactly.
window.DEFAULT_ROOFER = 'jackson';
// ---------- an unknown roofer ----------
// Anything asked for that is not exactly a key of ROOFERS (a mistyped or oddly cased ?roofer=, a roofer whose entry has
// not been added, a stale key kept on the device) must never show another roofer's brand or data. The app then runs as
// ROOFER_NONE, a reserved blank stand-in (no name, no owner, no cities, a data folder that does not exist, so every
// screen's own "did not load" state shows), with one console error and one plain notice on the top page.
// An EMPTY ?roofer= counts as no key at all (the default roofer).
// The verdict is found in this order:
//   1. a frame takes the verdict of the page above it (the shell decides once, every screen follows);
//   2. this page's own ?roofer= (read here, because rc-state drops anything that is not a well formed key);
//   3. the key rc-state holds (asked for, or kept on this device); with no rc-state on the page, this page's own listed ?roofer=.
// The kept key is dropped at the end, so the next open without ?roofer= goes back to the default roofer.
const ROOFER_NONE = 'roofer-not-set-up';
const rooferListed = k => typeof k === 'string' && k !== ROOFER_NONE && Object.prototype.hasOwnProperty.call(ROOFERS, k);
let ROOFER_ASKED = (window.RC && RC.rooferKey && RC.rooferKey()) || DEFAULT_ROOFER;
// a page with no rc-state (SEO or Page plan opened on its own) has nobody to read ?roofer= for it: a listed key is honoured here
if (!window.RC) { try { const q = new URLSearchParams(location.search).get('roofer'); if (rooferListed(q)) ROOFER_ASKED = q; } catch (e) { } }
let ROOFER_SAID = null;   // what was asked for, when it is not a roofer
try { if (window.parent !== window && window.parent.rooferMissing && window.parent.rooferMissing()) ROOFER_SAID = String(window.parent.rooferAsked() || ROOFER_NONE); } catch (e) { }
if (ROOFER_SAID === null) { let q = null; try { q = new URLSearchParams(location.search).get('roofer'); } catch (e) { }
  if (q !== null && q !== '' && !rooferListed(q)) ROOFER_SAID = q; }
if (ROOFER_SAID === null && !rooferListed(ROOFER_ASKED)) ROOFER_SAID = String(ROOFER_ASKED);
const ROOFER_MISSING = ROOFER_SAID !== null;
// shown as plain text only (textContent, console), never as HTML; cut to 40 characters
const ROOFER_LABEL = ROOFER_MISSING ? (ROOFER_SAID.length > 40 ? ROOFER_SAID.slice(0, 40) + '...' : ROOFER_SAID) : '';
if (ROOFER_MISSING) ROOFER_ASKED = ROOFER_NONE;
window.rooferMissing = () => ROOFER_MISSING;
window.rooferAsked = () => ROOFER_LABEL;
// rc-state is told the key every screen runs on: the default when it held none, the blank stand-in when the roofer is unknown
// (so nothing that reads RC.rooferKey() can reach another roofer's entry, settings or files)
if (window.RC && RC.__fixRoofer && RC.rooferKey && RC.rooferKey() !== ROOFER_ASKED) RC.__fixRoofer(ROOFER_ASKED);
if (ROOFER_MISSING) {
  ROOFERS[ROOFER_NONE] = { unknown:true, dataRoot:'lib/no-such-roofer/', bucket:null, seo:null, name:"Roofer not set up", area:"", region:"", owner:"", state:"",
    areaCode:"", licence:null, city:"", zip:"", cities:[], storm:{d:"",n:"",max:""}, shift:[0,0], center:[-98.5,39.8],
    accent:"#465065", soft:"#EEF0F4", ink:"#0B1020", accentHi:"#465065", wide:false, markBg:"", logo:"" };
  console.error('[Roof Command] No roofer "' + ROOFER_LABEL + '" in lib/brand.js ROOFERS. Nothing is shown for it: no brand, no data. Add its entry to ROOFERS, or open the app without ?roofer=.');
  try { localStorage.removeItem('rc.t.roofer'); } catch (e) { }
  let top = false; try { top = window.top === window; } catch (e) { }
  if (top) { const show = () => { if (document.getElementById('rooferFail')) return; const d = document.createElement('div'); d.id = 'rooferFail'; d.setAttribute('role', 'alert');
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:#F7F8FA;font-family:Inter,system-ui,sans-serif';
    d.innerHTML = '<div style="background:#fff;border-radius:14px;padding:24px 26px;max-width:380px;margin:16px;text-align:center;box-shadow:0 8px 30px rgba(11,16,32,.12);color:#0B1020"><b style="display:block;font-size:18px;font-weight:600;margin-bottom:6px">This roofer is not set up</b><p style="margin:0;font-size:14px;line-height:1.5;color:#465065;overflow-wrap:anywhere">Roof Command has no roofer called <span id="rooferFailKey"></span>, so nothing was loaded. Check the link you were given.</p></div>';
    d.querySelector('#rooferFailKey').textContent = '"' + ROOFER_LABEL + '"';
    (document.body || document.documentElement).appendChild(d); };
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show); }
}
// the active roofer's key (rc-state keeps it; ?roofer= sets it; none given = DEFAULT_ROOFER). Always a key of ROOFERS:
// a real roofer, or the blank stand-in above. Never another roofer's.
window.rooferKey = () => ROOFER_ASKED;
window.activeRoofer = () => ROOFERS[ROOFER_ASKED];
// the active roofer's data folder as an absolute URL (every data reader uses this)
window.rooferDataRoot = () => BRAND_BASE + activeRoofer().dataRoot;
if (window.RC && RC.__dataRoot) RC.__dataRoot(rooferDataRoot(), true);
// the list of pages Wing published for the active roofer, as an absolute URL (null = none on file)
window.rooferSeoUrl = () => activeRoofer().seo ? BRAND_BASE + activeRoofer().seo : null;
// the roofer's cities from the data (catalog regions' by_city): home city first (Plano), then the registry's order,
// then any city the data adds, A to Z. No catalog yet = the registry's list.
window.rooferCities = (cat) => {
  const r = activeRoofer(), pref = r.cities || [];
  const have = cat && cat.regions ? [...new Set(cat.regions.flatMap(g => Object.keys(g.by_city || {})))] : [];
  if (!have.length) return pref.slice();
  const rank = c => c === r.city ? -1 : (pref.indexOf(c) >= 0 ? pref.indexOf(c) : 999);
  return have.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
};
window.cityLine = list => list.length < 2 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
window.rooferArea = cat => cityLine(rooferCities(cat)) || activeRoofer().area;
// once the catalog lands, the header line and the opening line name the data's own cities
if (window.RC && RC.factsReady) RC.factsReady.then(() => { if (!RC.catalog) return; const r = activeRoofer(), a = rooferArea(RC.catalog); if (!a) return;
  r.area = a; r.region = a + ', ' + r.state;
  document.querySelectorAll('[data-r="area"],[data-r="region"]').forEach(n => { n.textContent = r[n.dataset.r]; });
  try { window.dispatchEvent(new Event('rc-area')); } catch (e) { } });
// a wordmark logo sits on its own plate and takes the width it needs; square marks keep the page's tile
(function(){ const st = document.createElement('style'); st.textContent =
  '.rc-wide{width:auto!important;aspect-ratio:auto!important;padding:0 7px!important;display:flex!important;align-items:center;justify-content:center;border-radius:9px!important;box-shadow:none!important}' +
  '.rc-wide img{height:76%;width:auto;display:block}';
  (document.head || document.documentElement).appendChild(st); })();
window.rooferMark = (el, r) => {
  if (!el || !r) return; el.innerHTML = r.logo;
  el.classList.toggle('rc-wide', !!r.wide);
  el.style.background = r.markBg || '';
};
window.applyRoofer = (key, root) => {
  const r = ROOFERS[key] || activeRoofer(); const el = root || document.documentElement;
  el.style.setProperty('--accent', r.accent); el.style.setProperty('--accent-soft', r.soft); el.style.setProperty('--accent-ink', r.ink);
  el.style.setProperty('--roofer', r.accent);
  (root||document).querySelectorAll('[data-r]').forEach(n => { const k=n.dataset.r; if(k==='logo') rooferMark(n, r); else n.textContent = r[k] == null ? '' : r[k]; });
  (root||document).querySelectorAll('[data-wing]').forEach(n => { n.innerHTML = WING_MARK(n.dataset.wing||'currentColor'); });
  return r;
};
