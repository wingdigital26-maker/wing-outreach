/* Roof outline drawing tool (js/draw.js). Draws on top of the satellite stage (a maplibre map): click corners,
   Shift = square corners, drag a corner to adjust, click the first corner (or Close shape) to finish.
   Live edge lengths are geodesic feet from lon/lat. Also shows a dashed "suggested" outline (parcel match)
   with Yes / Draw it. Pure UI: the caller decides what "Use this outline" does.
   RoofDraw.mount(host, map, { pts, suggest, onUse(pts), onYes(ring), onCancel(), onSkip() }) -> { destroy() } */
(function () {
  const NS = "http://www.w3.org/2000/svg", FT = 3.28084;
  const el = (t, a, p) => { const e = document.createElementNS(NS, t); for (const k in a || {}) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
  const fmt = n => Math.round(n).toLocaleString("en-US");
  // geodesic distance in feet (haversine)
  function distFt(a, b) {
    const R = 6371008.8, r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))) * FT;
  }
  function areaSqft(pts) {
    if (pts.length < 3) return 0;
    const lat0 = pts[0][1], my = 110574 * FT, mx = 111320 * Math.cos(lat0 * Math.PI / 180) * FT;
    let s = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += (a[0] * mx) * (b[1] * my) - (b[0] * mx) * (a[1] * my); }
    return Math.abs(s) / 2;
  }
  function perimeterFt(pts) { let s = 0; for (let i = 0; i < pts.length; i++) s += distFt(pts[i], pts[(i + 1) % pts.length]); return s; }
  // snap p (px) so the edge from prev is parallel or perpendicular to the previous edge (prev2 -> prev); else 90 deg grid
  function snap(prev2, prev, p) {
    const base = prev2 ? Math.atan2(prev[1] - prev2[1], prev[0] - prev2[0]) : 0, dx = p[0] - prev[0], dy = p[1] - prev[1];
    const len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    let best = base, bd = 9;
    for (let k = 0; k < 4; k++) { const c = base + k * Math.PI / 2; let d = Math.abs(Math.atan2(Math.sin(ang - c), Math.cos(ang - c))); if (d < bd) { bd = d; best = c; } }
    return [prev[0] + Math.cos(best) * len, prev[1] + Math.sin(best) * len];
  }

  function mount(host, map, o) {
    const S = { pts: (o.pts || []).map(p => p.slice()), closed: !!(o.pts && o.pts.length >= 3), mouse: null, shift: false, suggest: o.suggest || null, drag: -1, dragged: false };
    const isSug = () => !!S.suggest && !S.pts.length && !S.closed;
    const root = document.createElement("div"); root.className = "dr-root";
    const svg = el("svg", { class: "dr-svg", "aria-hidden": "true" }); root.appendChild(svg);
    const bar = document.createElement("div"); bar.className = "dr-bar"; root.appendChild(bar);
    host.appendChild(root);
    const dblz = map.doubleClickZoom.isEnabled();
    map.doubleClickZoom.disable();
    const px = ll => { const q = map.project(ll); return [q.x, q.y]; };
    const ll = p => { const q = map.unproject(p); return [q.lng, q.lat]; };

    function draw() {
      svg.innerHTML = "";
      const W = root.clientWidth, H = root.clientHeight; svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      if (isSug()) {
        const sp = S.suggest.ring.map(px);
        el("polygon", { class: "dr-sug", points: sp.map(p => p.join(",")).join(" ") }, svg);
      }
      const P = S.pts.map(px), n = P.length;
      if (n >= 2) {
        const pts = P.map(p => p.join(",")).join(" ");
        el(S.closed ? "polygon" : "polyline", { class: S.closed ? "dr-poly" : "dr-line", points: pts }, svg);
      }
      let rubber = null;
      if (!S.closed && n && S.mouse) {
        rubber = S.mouse;
        if (S.shift && n >= 1) rubber = snap(n > 1 ? P[n - 2] : null, P[n - 1], S.mouse);
        el("line", { class: "dr-rub", x1: P[n - 1][0], y1: P[n - 1][1], x2: rubber[0], y2: rubber[1] }, svg);
      }
      const lab = (a, b, A, B) => {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 34) return;
        const t = fmt(distFt(A, B)) + " ft", mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, w = t.length * 6.6 + 12;
        el("rect", { class: "dr-lbg", x: mx - w / 2, y: my - 10, width: w, height: 19, rx: 6 }, svg);
        const tx = el("text", { class: "dr-lab", x: mx, y: my + 4, "text-anchor": "middle" }, svg); tx.textContent = t;
      };
      for (let i = 0; i < n - 1 + (S.closed ? 1 : 0); i++) lab(P[i], P[(i + 1) % n], S.pts[i], S.pts[(i + 1) % n]);
      if (rubber) lab(P[n - 1], rubber, S.pts[n - 1], ll(rubber));
      P.forEach((p, i) => {
        const first = i === 0 && !S.closed && n >= 3;
        const c = el("circle", { class: "dr-v" + (first ? " dr-first" : ""), cx: p[0], cy: p[1], r: first ? 9 : 6.5, "data-i": i, tabindex: 0, role: "button", "aria-label": first ? "First corner: click to close the shape" : "Corner " + (i + 1) + ", drag to adjust" }, svg);
        c.addEventListener("pointerdown", e => vDown(e, i));
        c.addEventListener("keydown", e => { const step = e.shiftKey ? 10 : 2, d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]; if (d) { e.preventDefault(); const q = px(S.pts[i]); S.pts[i] = ll([q[0] + d[0], q[1] + d[1]]); draw(); svg.querySelector(`[data-i="${i}"]`)?.focus(); } if (e.key === "Enter" && first) { e.preventDefault(); close(); } });
      });
      renderBar();
    }
    function vDown(e, i) {
      e.preventDefault(); e.stopPropagation();
      if (i === 0 && !S.closed && S.pts.length >= 3) { close(); return; }
      S.drag = i; S.dragged = false;
      try { e.target.setPointerCapture(e.pointerId); } catch (x) { }
      map.dragPan.disable();
      const rect = root.getBoundingClientRect();
      const mv = ev => { S.dragged = true; S.pts[i] = ll([ev.clientX - rect.left, ev.clientY - rect.top]); draw(); };
      const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); S.drag = -1; map.dragPan.enable(); setTimeout(() => { S.dragged = false; }, 0); };
      window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
    }
    // geometry checks: self-crossing and house-size range; message shown inline in the bar
    function segX(a, b, c, d) {
      const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
      return (o(a, b, c) > 0) !== (o(a, b, d) > 0) && (o(c, d, a) > 0) !== (o(c, d, b) > 0);
    }
    function selfCrosses(pts) {
      const n = pts.length;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        if (j === i + 1 || (i === 0 && j === n - 1)) continue;
        if (segX(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
      }
      return false;
    }
    function badShape() {
      if (S.pts.length < 3) return "";
      if (selfCrosses(S.pts)) return "This outline crosses itself";
      const a = Math.round(areaSqft(S.pts));
      if (a < 300) return `Too small to be a house roof (${fmt(a)} sq ft)`;
      if (a > 15000) return `Too large to be a house roof (${fmt(a)} sq ft)`;
      return "";
    }
    function dedupe() { S.pts = S.pts.filter((p, i) => !i || distFt(S.pts[i - 1], p) >= 1.5); if (S.pts.length > 1 && distFt(S.pts[0], S.pts[S.pts.length - 1]) < 1.5) S.pts.pop(); }
    function close() { if (S.pts.length >= 3) { dedupe(); if (S.pts.length < 3) return; S.closed = true; S.mouse = null; S.err = badShape(); draw(); } }
    function undo() { S.err = ""; if (S.closed) S.closed = false; else S.pts.pop(); draw(); }
    function onClick(e) {
      if (S.dragged || S.closed || isSug()) return;
      let p = [e.point.x, e.point.y];
      const n = S.pts.length;
      if (e.originalEvent && e.originalEvent.shiftKey && n >= 1) p = snap(n > 1 ? px(S.pts[n - 2]) : null, px(S.pts[n - 1]), p);
      S.pts.push(ll(p)); draw();
    }
    function onMove(e) { S.mouse = [e.point.x, e.point.y]; S.shift = !!(e.originalEvent && e.originalEvent.shiftKey); if (!S.closed && S.pts.length) draw(); }
    const onKey = e => { if (e.key === "Shift") { S.shift = true; if (S.mouse) draw(); } };
    const onKeyUp = e => { if (e.key === "Shift") { S.shift = false; if (S.mouse) draw(); } };
    map.on("click", onClick); map.on("mousemove", onMove); map.on("move", draw); map.on("resize", draw);
    window.addEventListener("keydown", onKey); window.addEventListener("keyup", onKeyUp);
    map.getCanvas().style.cursor = "crosshair";

    function renderBar() {
      const n = S.pts.length;
      let h;
      if (isSug()) {
        h = `<div class="dr-msg"><b>Matched by parcel boundary.</b> Is this the house?${S.suggest.low ? ` <span class="dr-warn">Low confidence match.</span>` : ""}</div>
          <div class="dr-btns"><button type="button" class="btn sm accent" data-a="yes">Yes</button><button type="button" class="btn sm" data-a="draw">Draw it</button><button type="button" class="btn sm" data-a="skip">Not now</button></div>`;
      } else {
        const info = S.closed ? `${n} corners &middot; ${fmt(areaSqft(S.pts))} sq ft footprint &middot; ${fmt(perimeterFt(S.pts))} ft around` : n ? `${n} corner${n === 1 ? "" : "s"}${n >= 3 ? ". Click the first corner to close." : ""}` : "";
        const hint = S.closed ? "Drag any corner to adjust, then use this outline." : (n ? "" : "Click each corner of the roof, one by one. Hold Shift for square corners.");
        h = `<div class="dr-msg"><b>${o.redraw ? "Redraw this roof" : "Draw this roof"}</b> ${hint}${S.closed && S.err ? ` <span class="dr-warn">${S.err}.</span>` : ""}${info ? `<span class="dr-info">${info}</span>` : ""}</div>
          <div class="dr-btns"><button type="button" class="dr-link" data-a="cancel" style="margin-right:auto;min-height:36px;padding:0 6px">Cancel</button>
          <button type="button" class="btn sm" data-a="undo" ${n ? "" : "disabled"}>${S.closed ? "Reopen" : "Undo"}</button>
          <button type="button" class="btn sm" data-a="clear" ${n ? "" : "disabled"}>Start over</button>
          ${S.closed ? "" : `<button type="button" class="btn sm" data-a="close" ${n >= 3 ? "" : "disabled"}>Close shape</button>`}
          ${S.closed ? `<button type="button" class="btn sm accent" data-a="use">Use this outline</button>` : `<button type="button" class="btn sm" data-a="use" disabled aria-disabled="true" style="opacity:1;background:transparent;color:var(--muted);border-style:dashed;border-color:var(--muted)" title="Close the shape first">Use this outline</button>`}</div>`;
      }
      const sn = document.getElementById("roofSrcNote"); if (sn && !isSug()) { if (S._sn == null) S._sn = sn.textContent; sn.textContent = "Outline drawn by you."; }
      bar.innerHTML = h;
      bar.querySelectorAll("[data-a]").forEach(b => b.onclick = () => act(b.dataset.a));
    }
    function act(a) {
      if (a === "undo") undo();
      else if (a === "close") close();
      else if (a === "clear") { S.pts = []; S.closed = false; draw(); }
      else if (a === "cancel") o.onCancel && o.onCancel();
      else if (a === "use") { dedupe(); S.err = badShape(); if (S.err) { renderBar(); return; } if (S.closed && S.pts.length >= 3) o.onUse && o.onUse(S.pts.map(p => p.slice())); }
      else if (a === "yes") o.onYes && o.onYes(S.suggest.ring.map(p => p.slice()), S.suggest);
      else if (a === "draw") { S.suggest = null; draw(); o.onDraw && o.onDraw(); }
      else if (a === "skip") o.onSkip && o.onSkip();
    }
    // parcel-match review: centre the view on the dashed outline. The stage can still be resizing or re-centring when we
    // mount, so refit on the first idle events and a couple of timers, and stop as soon as the roofer moves the map.
    let userMoved = false, fitN = 0, fitTimers = [];
    const onUser = e => { if (e && e.originalEvent) userMoved = true; };
    function fitSug() {
      if (!S.suggest || !isSug() || userMoved) return;
      try {
        map.resize();
        const r = S.suggest.ring, xs = r.map(p => p[0]), ys = r.map(p => p[1]), w = root.clientWidth || 600, h = root.clientHeight || 400;
        const sx = Math.min(90, Math.round(w * 0.2)), top = Math.min(60, Math.round(h * 0.12)), bot = Math.min(110, Math.round(h * 0.28));
        map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: { top, bottom: bot, left: sx, right: sx }, duration: 0, maxZoom: 20 });
        draw();
      } catch (x) { }
    }
    const onIdleFit = () => { if (++fitN > 4) { map.off("idle", onIdleFit); return; } fitSug(); };
    if (S.suggest && isSug()) {
      map.on("dragstart", onUser); map.on("zoomstart", onUser); map.on("idle", onIdleFit);
      fitSug(); [150, 600, 1500].forEach(t => fitTimers.push(setTimeout(fitSug, t)));
    }
    draw();
    const api = {
      destroy() {
        fitTimers.forEach(clearTimeout); map.off("dragstart", onUser); map.off("zoomstart", onUser); map.off("idle", onIdleFit);
        map.off("click", onClick); map.off("mousemove", onMove); map.off("move", draw); map.off("resize", draw);
        window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKeyUp);
        try { map.getCanvas().style.cursor = ""; map.dragPan.enable(); if (dblz) map.doubleClickZoom.enable(); } catch (x) { }
        const sn = document.getElementById("roofSrcNote"); if (sn && S._sn != null) sn.textContent = S._sn;
        root.remove();
      },
      redraw: draw, state: S
    };
    return api;
  }
  window.RoofDraw = { mount, distFt, areaSqft, perimeterFt };
})();
