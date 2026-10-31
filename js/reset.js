/* Password reset / first-time password screen. Handles the Supabase recovery link (#access_token=...&type=recovery).
   Sets the new password with the recovery token, signs in with it, then opens the app. Plain REST, public anon key only. */
(function () {
  var C = window.RC_CONFIG || {};
  var h = new URLSearchParams((location.hash || "").replace(/^#/, ""));
  var tok = h.get("access_token"), type = h.get("type"), err = h.get("error_description") || h.get("error");
  if (location.hash) history.replaceState(null, "", location.pathname + location.search); // keep the token out of the address bar and history
  var $ = function (id) { return document.getElementById(id); };
  var msg = function (m, bad) { var e = $("rsMsg"); e.textContent = m; e.style.color = bad ? "#B3261E" : ""; };
  function dead(m) {
    $("rsPw").disabled = $("rsPw2").disabled = $("rsGo").disabled = true; $("rsLead").textContent = m;
    $("rsBack").hidden = false; $("rsBack").style.display = "inline-block";
  }
  if (err || !tok || type !== "recovery") {
    dead(err ? "This link has expired or was already used. Ask for a new one from the sign-in screen (Forgot password)." : "Open this page from the link in your reset email.");
    return;
  }
  function call(path, method, body, token) {
    return fetch(C.SUPABASE_URL + path, { method: method, headers: { apikey: C.SUPABASE_ANON_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.msg || j.error_description || j.message || ("HTTP " + r.status)); e.status = r.status; throw e; } return j; }); });
  }
  $("rsForm").onsubmit = function (e) {
    e.preventDefault();
    var pw = $("rsPw").value, pw2 = $("rsPw2").value;
    if (pw.length < 10) return msg("Use at least 10 characters.", true);
    if (pw !== pw2) return msg("The two passwords do not match.", true);
    $("rsGo").disabled = true; msg("Saving...");
    call("/auth/v1/user", "PUT", { password: pw }, tok).then(function (u) {
      return window.RC_AUTH.login(u.email, pw);
    }).then(function () { location.replace("index.html"); }, function (er) {
      $("rsGo").disabled = false;
      msg(er.status === 401 || er.status === 403 ? "This link has expired or was already used. Ask for a new one." : (er.message || "Could not save the password. Try again."), true);
    });
  };
})();
