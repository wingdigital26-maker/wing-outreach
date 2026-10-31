/* Operator-only "System" panel: last refresh, latest storm, health. Reads status.json (written by scripts/write_status.py to the
   public app-data bucket: times, counts and PASS/FAIL only, no secrets). The button shows only for a signed-in operator
   (a row in platform_admins, which RLS lets a person read only for themselves). */
(function () {
  var A = window.RC_AUTH, C = window.RC_CONFIG || {};
  if (!A || !C.SUPABASE_URL) return;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function when(iso) { if (!iso) return "never"; var d = new Date(iso); if (isNaN(d)) return esc(iso); var h = (Date.now() - d) / 36e5; return d.toLocaleString() + " (" + (h < 1 ? "under 1 hour" : h < 48 ? Math.round(h) + " hours" : Math.round(h / 24) + " days") + " ago)"; }
  function row(k, v, bad) { return '<div class="row"><span>' + k + '</span><b class="num"' + (bad ? ' style="color:#b3261e"' : "") + ">" + v + "</b></div>"; }
  function open() {
    var ov = document.getElementById("rcSysModal");
    if (!ov) {
      ov = document.createElement("div"); ov.id = "rcSysModal"; ov.className = "auth-wall"; ov.style.background = "rgba(20,18,14,.45)";
      ov.addEventListener("click", function (e) { if (e.target === ov) ov.hidden = true; });
      document.body.appendChild(ov);
    }
    ov.hidden = false;
    ov.innerHTML = '<div class="auth-card" role="dialog" aria-label="System" style="width:min(460px,100%)"><h1>System</h1><p>Operator view. Refresh, storms and health.</p><div id="rcSysBody">Loading...</div><button class="btn" type="button" id="rcSysX">Close</button></div>';
    ov.querySelector("#rcSysX").onclick = function () { ov.hidden = true; };
    fetch("data/status.json?t=" + Date.now()).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (s) {
      var r = s.refresh || {}, h = s.health || {}, html = "";
      html += row("Last refresh", when(r.ran));
      html += row("Refresh errors", r.errors == null ? "unknown" : r.errors, r.errors > 0);
      html += row("Latest storm date", esc(s.latest_storm || "unknown"));
      html += row("Health", h.checked ? (h.ok ? "Passing" : "Failing: " + esc((h.failed || []).join(", "))) : "not checked yet", h.checked && !h.ok);
      html += row("Health checked", when(h.checked));
      html += row("Status written", when(s.updated));
      ov.querySelector("#rcSysBody").innerHTML = html;
    }).catch(function () { ov.querySelector("#rcSysBody").textContent = "No status published yet. It is written by the daily refresh and the 6-hour health check."; });
  }
  function isOperator() {
    if (!A.session || !A.session() || !A.api) return Promise.resolve(false);
    return A.token().then(function (t) { return A.api("/rest/v1/platform_admins?select=user_id&limit=1", "GET", null, t); }).then(function (r) { return !!(r && r.length); }, function () { return false; });
  }
  function mount() {
    var t = document.querySelector(".side-tools");
    if (!t || t.querySelector("#rcSysBtn")) return;
    var b = document.createElement("button"); b.type = "button"; b.id = "rcSysBtn"; b.textContent = "System"; b.onclick = open; t.appendChild(b);
  }
  window.RC_SYSTEM = { open: open, mount: mount };
  document.addEventListener("DOMContentLoaded", function () { isOperator().then(function (ok) { if (ok) mount(); }); });
})();
