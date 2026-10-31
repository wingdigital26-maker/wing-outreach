/* rc-push.js: reply alerts on the roofer's phone (Jack 10-29). Two halves:
   1. Cloud: "Turn on reply alerts" subscribes this phone/browser (Web Push, the engine's VAPID key from /roof-engine/push-key)
      and saves it in public.push_subscriptions (014_push.sql, own rows only). The engine pushes when a homeowner replies
      (supabase/functions/roof-engine/push.ts); sw.js shows it and a tap opens the conversation.
   2. On this device: whenever a reply lands in the pipeline (RC.logReply, from any screen or the cloud sync), this tab
      shows the same alert itself and Nimbus says it, so the alert also works signed out and in the demo.
   Alerts carry the street and the first words only, never a name or a number. Nothing here sends a message.
   Nimbus tools: reply_alerts {on}. Plain script, shell only, after nimbus-ops.js. window.RCPush. */
(function () {
  'use strict';
  if (window.RCPush || !window.RC) return;
  const RC = window.RC;
  const URL_ = 'https://wbtrsujvprbdojmxlkpe.supabase.co', FN = URL_ + '/functions/v1/roof-engine/';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndidHJzdWp2cHJiZG9qbXhsa3BlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwNjc0MzcsImV4cCI6MjEwNjY0MzQzN30.rzSf_wXbb9W0uajLg_5Ur04VyobSwgz3pLXgFSyG_5I';
  const sess = () => { try { const v = JSON.parse(localStorage.getItem('rc.session') || 'null'); return v && v.access_token ? v : null; } catch (e) { return null; } };
  const short = a => String(a || '').split(',')[0].trim();
  const pref = () => RC.setting('replyAlerts', 'off');
  function putSetting(v) { const a = RC.__get('settings', {}) || {}, m = Object.assign({}, a[RC.rooferKey()] || {}); m.replyAlerts = v; a[RC.rooferKey()] = m; RC.__set('settings', a); }
  const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map(c => c.charCodeAt(0))); };

  // ---------- 1. the cloud subscription (signed in, a real phone) ----------
  async function subscribeCloud() {
    const s = sess(); if (!s || !('serviceWorker' in navigator) || !('PushManager' in window)) return { cloud: false, why: s ? 'this browser has no push' : 'signed out' };
    const k = await fetch(FN + 'push-key').then(r => r.json()).catch(() => ({}));
    if (!k.key) return { cloud: false, why: 'not set up yet' };
    const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(k.key) });
    const j = sub.toJSON(), co = await fetch(URL_ + '/rest/v1/companies?select=id,slug', { headers: { apikey: KEY, Authorization: 'Bearer ' + s.access_token } }).then(r => r.json()).catch(() => []);
    const c = (co || []).find(r => r.slug === RC.rooferKey()) || (co || [])[0]; if (!c) return { cloud: false, why: 'no company' };
    const r = await fetch(URL_ + '/rest/v1/push_subscriptions?on_conflict=endpoint', { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{ company_id: c.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, label: /iphone|ipad/i.test(navigator.userAgent) ? 'iPhone' : /android/i.test(navigator.userAgent) ? 'Android phone' : 'This computer' }]) });
    return { cloud: r.ok, why: r.ok ? '' : 'save failed ' + r.status };
  }
  async function unsubscribeCloud() {
    try { const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription(); if (!sub) return;
      const s = sess(); if (s) await fetch(URL_ + '/rest/v1/push_subscriptions?endpoint=eq.' + encodeURIComponent(sub.endpoint), { method: 'DELETE', headers: { apikey: KEY, Authorization: 'Bearer ' + s.access_token } });
      await sub.unsubscribe(); } catch (e) { }
  }

  async function turnOn() {
    if (!('Notification' in window)) return { ok: false, say: 'This browser cannot show alerts. On an iPhone, add Roof Command to the home screen first.' };
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, say: 'Alerts are blocked for this browser. Allow notifications in its settings and ask me again.' };
    putSetting('on'); seen = replyMap();
    const c = await subscribeCloud().catch(e => ({ cloud: false, why: String(e && e.message || e) }));
    return { ok: true, cloud: c.cloud, say: c.cloud ? 'Done. When a homeowner replies, your phone gets an alert, even with the app closed.' : 'Done. When a homeowner replies, you get an alert here while the app is open.' + (c.why === 'signed out' ? ' Sign in to get them with the app closed too.' : '') };
  }
  async function turnOff() { putSetting('off'); await unsubscribeCloud(); return { ok: true, say: 'Reply alerts are off.' }; }

  // ---------- 2. this device: watch the pipeline for new replies ----------
  const replyMap = () => { const p = RC.__get('pipe', {}) || {}, m = {}; Object.keys(p).forEach(id => { if (p[id].replied) m[id] = p[id].replied; }); return m; };
  let seen = replyMap();
  const shown = new Set();   // one alert per reply, however many paths notice it
  function alertFor(id) {
    const p = (RC.__get('pipe', {}) || {})[id] || {}, h = (p.history || []).find(x => x.dir === 'in') || {}, r = RC.recall(id) || {};
    const words = String(h.body || '').replace(/\s+/g, ' ').trim();
    const street = short(r.addr || (window.NimbusTools && NimbusTools.dailyList().find(x => x.id === id) || {}).address) || 'A homeowner';
    return { title: (h.kind === 'email' ? 'Email reply: ' : 'Text reply: ') + street, body: words ? (words.length > 120 ? words.slice(0, 117) + '...' : words) : 'They wrote back.', street };
  }
  function show(id) {
    const a = alertFor(id);
    try {
      const n = new Notification(a.title, { body: a.body, tag: 'reply-' + id, renotify: true });
      n.onclick = () => { window.focus(); if (window.Nimbus && Nimbus.run) Nimbus.run('home', { view: 'home', id }); n.close(); };
    } catch (e) { navigator.serviceWorker && navigator.serviceWorker.getRegistration().then(reg => reg && reg.showNotification(a.title, { body: a.body, tag: 'reply-' + id })); }
    document.dispatchEvent(new CustomEvent('rc-reply-alert', { detail: { id, street: a.street } }));
    if (window.NimbusSpeak) try { NimbusSpeak(a.street + ' just replied.'); } catch (e) { }
  }
  function check() {
    const now = replyMap();
    if (pref() === 'on' && 'Notification' in window && Notification.permission === 'granted')
      Object.keys(now).forEach(id => { const k = id + '@' + now[id]; if ((!seen[id] || now[id] > seen[id]) && !shown.has(k)) { shown.add(k); show(id); } });
    seen = now;
  }
  addEventListener('storage', e => { if (!e.key || /pipe/.test(e.key)) check(); });   // a reply logged in another screen or tab
  setInterval(check, 3000);                                                            // the cloud sync writes the pipeline here too

  // ---------- Nimbus ----------
  if (window.NimbusTools) {
    NimbusTools.T.reply_alerts = {
      description: 'Turn reply alerts on this phone on or off: when a homeowner replies to a text or email, the roofer\'s phone gets a notification (even with the app closed when signed in). Use for "tell me when someone replies", "ping my phone".',
      input_schema: { type: 'object', properties: { on: { type: 'boolean' } }, required: ['on'], additionalProperties: false },
      async run(a) { const r = a.on ? await turnOn() : await turnOff(); return Object.assign({ label: 'Reply alerts ' + (a.on ? 'on' : 'off') }, r); }
    };
    const B = window.NimbusBrain;
    if (B && B.think && !B.__push) {
      const think = B.think;
      B.think = function (text, state) {
        const t = String(text || '').toLowerCase();
        if (!(state && state.pending) && (/\b(reply|replies|replied|writes back|texts back|answers)\b/.test(t) && /\b(alert|notify|notification|ping|buzz|tell me|let me know|push)\b/.test(t) || /\b(reply|push) (alerts?|notifications?)\b/.test(t)))
          return Promise.resolve({ calls: [{ name: 'reply_alerts', args: { on: !/\b(off|stop|no more|dont|disable|quit)\b/.test(t) } }], say: '' });
        return think.apply(B, arguments);
      };
      B.__push = true;
    }
  }
  window.RCPush = { turnOn, turnOff, check, get on() { return pref() === 'on'; }, _show: show };
})();
