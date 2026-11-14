/* rc-fetch-memo.js (11-02, load time): one download per data file per page. Several modules fetch the same big files on
   their own (homes.bin, meta/<region>/homes_meta.bin and homes_ext.bin, scores/homes.bin, catalog.json): the HAR of one
   Today load showed homes_meta.bin (0.9 MB) three times and catalog.json seven times, because requests in flight at the
   same moment are not shared by the HTTP cache. GET requests under a roofer's data folder (lib/st-data-<market>/) are memoised here for the life of the
   page and every caller gets a clone of the one response. Nothing else about fetch changes. Load it right after
   rc-frame-pause.js, before any data module. */
(function () {
  'use strict';
  if (window.__rcFetchMemo) return; window.__rcFetchMemo = true;
  var real = window.fetch.bind(window), memo = new Map();
  var key = function (input, init) {
    if (init && init.method && init.method !== 'GET') return null;
    var u = typeof input === 'string' ? input : input && input.url; if (!u) return null;
    if (input && typeof input !== 'string' && input.method && input.method !== 'GET') return null;
    return /st-data-[a-z0-9-]+\/.+\.(bin|json|gz)(\?|$)/.test(u) ? new URL(u, location.href).href : null;
  };
  window.fetch = function (input, init) {
    var k = key(input, init); if (!k) return real(input, init);
    var hit = memo.get(k);
    if (!hit) { hit = real(input, init).then(function (res) { if (!res.ok) memo.delete(k); return res; }, function (err) { memo.delete(k); throw err; }); memo.set(k, hit); }
    return hit.then(function (res) { return res.clone(); });
  };
})();
