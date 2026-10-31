/* rc-vault.js: homeowner contact info goes to the secure store (Supabase homeowner_contacts, migration 011) and nowhere
   else in the cloud (10-26). Loaded by lib/rc-cloud.js in the TOP window only, never in the public preview build.
   Runs ONLY when cloud sync is on: signed in (localStorage "rc.session") and not ?cloud=0. With cloud=0 or signed out it
   does nothing at all, so nothing leaves the laptop.
   What it sends, through two RPCs that check the user belongs to the roofer and write an audit line:
     rc_contact_upsert   when a home gets a phone, email or consent on this device: the homeowner left it on the Proof
                         Page, a reply, a manual add on the record, or a past customer from the CSV import
     rc_contact_opt_out  when a home is opted out (STOP), 20 s after the tap so the screen's Undo can still take it back.
                         In the cloud it is one-way: it lands on every do-not-contact list (company_dnc, crm_suppression,
                         the thread is paused) and only the operator can reverse it.
   The local snapshot (rc.vault.snap.<company>) keeps only a short hash per home, never the values. */
(function () {
  'use strict';
  if (window.RC_VAULT || !window.RC || !RC.__get) return;
  const URL_ = 'https://wbtrsujvprbdojmxlkpe.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndidHJzdWp2cHJiZG9qbXhsa3BlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNjc0MzcsImV4cCI6MjEwNjY0MzQzN30.rzSf_wXbb9W0uajLg_5Ur04VyobSwgz3pLXgFSyG_5I';
  const GRACE = 20000;
  const off = () => { try { return sessionStorage.getItem('rc.cloud.off') === '1'; } catch (e) { return false; } };
  const sess = () => { try { const v = JSON.parse(localStorage.getItem('rc.session') || 'null'); return v && v.access_token && (!v.expires_at || v.expires_at > Date.now() / 1000 + 20) ? v : null; } catch (e) { return null; } };
  const on = () => !off() && !!sess() && !!(window.RC_CLOUD && RC_CLOUD.companyId);
  function hash(s) { let a = 0x811c9dc5, b = 0x01000193; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619) >>> 0; b = Math.imul(b ^ c, 2246822519) >>> 0; } return a.toString(36) + b.toString(36); }
  function rpc(fn, body) {
    const s = sess(); if (!s) return Promise.reject(new Error('signed out'));
    return fetch(URL_ + '/rest/v1/rpc/' + fn, { method: 'POST', cache: 'no-store', body: JSON.stringify(body),
      headers: { apikey: KEY, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' } })
      .then(r => r.text().then(t => { if (!r.ok) throw new Error(fn + ' HTTP ' + r.status + ' ' + t.slice(0, 160)); return t ? JSON.parse(t) : null; }));
  }
  const company = () => RC_CLOUD.companyId;
  const SK = () => 'rc.vault.snap.' + company();
  const snap = () => { try { return JSON.parse(localStorage.getItem(SK()) || 'null') || { c: {}, o: {} }; } catch (e) { return { c: {}, o: {} }; } };
  const saveSnap = s => { try { localStorage.setItem(SK(), JSON.stringify(s)); } catch (e) { } };

  // which capture put this contact on the record
  function srcOf(h) {
    const by = String(h.phoneBy || '') + ' ' + String(h.optinHow || '');
    if (/proof page/i.test(by)) return 'proof_page';
    if (/reply|replied/i.test(by)) return 'homeowner_reply';
    if (/trace|tracerfy/i.test(by)) return 'skip_trace';
    if (/website|check page/i.test(by)) return 'website_form';
    return 'manual';
  }
  // Proof Page consent record for this home (lib/rc-proof.js keeps the exact words and the wording version)
  function proofConsent(h) {
    try { const d = JSON.parse(localStorage.getItem('rc.t.proof') || '{}'), r = h.gi != null && d[h.gi]; return r && r.consent && r.consent.text ? r.consent : null; } catch (e) { return null; }
  }
  // one upsert body per home that has contact info
  function bodies() {
    const out = [], homes = RC.__get('homes', {});
    Object.keys(homes).forEach(id => {
      const h = homes[id] || {}, pc = proofConsent(h);
      // the Daily 50 deck marks its homes sample: true (made-up demo phones); only what a person or the homeowner
      // entered goes up (phoneBy set, or a Proof Page record)
      const real = !h.sample || !!h.phoneBy || !!pc;
      if (!real) return;
      const phones = [h.phone].concat(h.phones || []).filter(Boolean).map(String), emails = [h.email].concat(h.emails || []).filter(Boolean).map(String);
      if (!phones.length && !emails.length && !h.ownerName && !pc) return;
      out.push({ id, body: { p_company: company(), p_home_key: String(id).slice(0, 80), p_source: srcOf(h), p_owner_name: h.ownerName || null,
        p_phones: phones, p_emails: emails, p_address: h.addr || null,
        p_consent_status: pc ? 'express_written' : null, p_consent_at: pc ? pc.at : null, p_consent_version: pc ? pc.version : null,
        p_consent_text: pc ? pc.words : null, p_consent_via: pc ? 'Proof Page' : null, p_is_test: false } });
    });
    // past customers (CRM > Past customers): real people the roofer imported; their own row per customer
    const pcs = RC.__get('pastCust', null);
    (Array.isArray(pcs) ? pcs : []).forEach(c => {
      if (!c || c.sample || !(c.phone || c.email)) return;
      out.push({ id: 'pc:' + c.id, body: { p_company: company(), p_home_key: ('pc:' + c.id).slice(0, 80), p_source: 'past_customer', p_owner_name: c.name || null,
        p_phones: c.phone ? [String(c.phone)] : [], p_emails: c.email ? [String(c.email)] : [], p_address: c.addr || null, p_is_test: false } });
    });
    return out;
  }

  let busy = false, again = false, last = { ok: null, at: null, err: null, sent: 0 };
  function sync() {
    if (!on()) return Promise.resolve();
    if (busy) { again = true; return Promise.resolve(); }
    busy = true; again = false;
    const s = snap(), work = [];
    bodies().forEach(x => { const sig = hash(JSON.stringify(x.body)); if (s.c[x.id] !== sig) work.push([x, sig]); });
    // opt-outs older than the Undo grace, not yet sent
    const oo = RC.__get('optout', {}), now = Date.now(), outs = Object.keys(oo).filter(id => !s.o[id] && now - Date.parse(oo[id].at || 0) > GRACE);
    let chain = Promise.resolve(), sent = 0;
    work.slice(0, 50).forEach(([x, sig]) => { chain = chain.then(() => rpc('rc_contact_upsert', x.body)).then(() => { s.c[x.id] = sig; sent++; }); });
    outs.forEach(id => { chain = chain.then(() => rpc('rc_contact_opt_out', { p_company: company(), p_home_key: String(id).slice(0, 80), p_how: String(oo[id].how || 'STOP').slice(0, 40) }))
      .then(() => { s.o[id] = 1; sent++; }); });
    return chain.then(() => { last = { ok: true, at: new Date().toISOString(), err: null, sent }; })
      .catch(e => { last = { ok: false, at: new Date().toISOString(), err: String(e && e.message || e), sent }; console.warn('[rc-vault]', last.err); })
      .then(() => { saveSnap(s); busy = false; if (again || work.length > 50) setTimeout(sync, 1000); });
  }
  let t = null;
  RC.on(d => { if (!d || !['homes', 'optout', 'pastCust', 'proof'].includes(d.key)) return; clearTimeout(t); t = setTimeout(sync, 2000); });
  // opt-outs wait out the Undo grace, so look again a little after it
  setInterval(() => { if (document.visibilityState !== 'hidden') sync(); }, 30000);
  setTimeout(sync, 4000);
  window.RC_VAULT = { status: () => Object.assign({ on: on() }, last), syncNow: sync,
    // the full contact for one home, for the record screen: every call is written to contact_audit on the server
    reveal: homeKey => on() ? rpc('rc_contact_reveal', { p_company: company(), p_home_key: String(homeKey) }).then(r => (r && r[0]) || null) : Promise.resolve(null) };
})();
