/* guard.js: contact guard for the Daily 50 screen. Plain script: window.RC_GUARD in the browser, module.exports in node.
   canContact(number, attempts, flags, now) -> { ok, reason }
   Mirrors the server trigger in db/migrations/008_gtm.sql (8am-8pm America/Chicago, 3 attempts per number per 24h, flags).
   number   10 digits after normalising (formatting ignored; a leading 1 / +1 on 11 digits is stripped)
   attempts array of { at, phone? } (at = ISO string, ms number or Date). A phone is normalised the same way and must match. An unreadable, epoch-seconds or future `at` for this number COUNTS as a recent attempt (fail closed).
   flags    { dnc_federal, dnc_ok, company_dnc, opted_out } (truthy = blocked)
   suppressed  optional Set/array of 10-digit numbers on the permanent do-not-contact list (or flags.suppressed)
   now      Date or ms (defaults to the real clock). Local time is always read in America/Chicago, never the machine zone. */
(function (root) {
  "use strict";
  var TZ = "America/Chicago", OPEN_H = 8, CLOSE_H = 20, MAX_ATTEMPTS = 3, WINDOW_MS = 24 * 3600 * 1000;
  var FLAG_TEXT = {
    dnc_federal: "On the federal Do Not Call list",
    dnc_ok: "On the Oklahoma No Call list",
    company_dnc: "On your company do-not-contact list",
    opted_out: "Opted out of contact"
  };
  var fmt = null;
  function parts(ms) {
    if (!fmt) fmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "numeric", hourCycle: "h23" });
    var o = {};
    fmt.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    return { h: parseInt(o.hour, 10) % 24, m: parseInt(o.minute, 10) };
  }
  // 10-digit form: digits only, a leading country code 1 (11 digits, or +1) is stripped. Anything else is returned as is (and fails the 10 digit rule).
  function normalize(n) {
    var d = String(n == null ? "" : n).replace(/\D/g, "");
    return d.length === 11 && d.charAt(0) === "1" ? d.slice(1) : d;
  }
  function clock(ms) {
    var p = parts(ms), h12 = p.h % 12 || 12;
    return h12 + ":" + (p.m < 10 ? "0" : "") + p.m + (p.h < 12 ? " am" : " pm");
  }
  // returns a ms timestamp, or NaN when it cannot be read as one. Epoch SECONDS (below 1e11) are NaN on purpose: unreadable fails closed.
  function toMs(v) {
    if (v == null || v === "" || typeof v === "boolean") return NaN;
    var t;
    if (v instanceof Date) t = v.getTime();
    else if (typeof v === "number") t = v;
    else if (/^\d+$/.test(String(v).trim())) t = Number(v);
    else t = Date.parse(v);
    return isFinite(t) && t >= 1e11 ? t : NaN;
  }
  function canContact(number, attempts, flags, now, suppressed) {
    var ms = now == null ? Date.now() : toMs(now);
    if (isNaN(ms)) return { ok: false, reason: "The clock could not be read" };
    var d = normalize(number);
    if (d.length !== 10) return { ok: false, reason: "Not a 10 digit phone number" };
    flags = flags || {};
    if (suppressed) {
      var hit = typeof suppressed.has === "function" ? suppressed.has(d) : (suppressed.indexOf ? suppressed.indexOf(d) >= 0 : false);
      if (hit || flags.suppressed) return { ok: false, reason: "On your permanent do-not-contact list" };
    } else if (flags.suppressed) return { ok: false, reason: "On your permanent do-not-contact list" };
    for (var k in FLAG_TEXT) if (flags[k]) return { ok: false, reason: FLAG_TEXT[k] };
    var p = parts(ms);
    if (p.h < OPEN_H || p.h >= CLOSE_H) return { ok: false, reason: "Calls and texts only 8 am to 8 pm Central. It is " + clock(ms) + " there now" };
    var n = 0;
    (attempts || []).forEach(function (a) {
      var obj = a !== null && typeof a === "object" && !(a instanceof Date);
      if (obj && a.phone != null && a.phone !== "" && normalize(a.phone) !== d) return; // another number
      var at = toMs(obj ? a.at : a);
      // fail closed: unreadable, epoch-seconds or future times count as a recent attempt
      if (isNaN(at) || at > ms || at > ms - WINDOW_MS) n++;
    });
    if (n >= MAX_ATTEMPTS) return { ok: false, reason: "Already tried " + n + " times in the last 24 hours" };
    return { ok: true, reason: "" };
  }
  var api = { canContact: canContact, normalize: normalize, TZ: TZ, FLAGS: Object.keys(FLAG_TEXT) };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.RC_GUARD = api;
})(typeof window !== "undefined" ? window : null);
