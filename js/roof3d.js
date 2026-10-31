/* Roof 3D: interactive 3D roof for the Roof Measure screen. Lazy: three.js (r160, jsdelivr ES module) is
   only imported the first time a 3D view is mounted. Geometry comes from the SAME RoofPlan data as the
   2D drawing and the Measurements panel (facets, ridges, hips, valleys, eaves), so no number is ever
   separate. Height rule (hip-roof straight-skeleton geometry): every facet's eave edge is its first ring
   edge, and a vertex's height above the eave line is (pitch/12) x its perpendicular distance from that
   line, so eaves sit at wall height and ridges/hips rise to their skeleton height; changing pitch
   re-heights the model live. Walls are the footprint extruded 9 ft per story (stories assumed 1).
   Exposed: window.Roof3D = { supported, mount, suspend, current }. Coordinates in = display-rotated local
   feet (x east, y north); world = (x, up, -y). */
(function () {
  const CDN = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
  let T = null, loading = null, inst = null;
  const reduce = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  let _sup = null;
  function supported() { // probed once: every probe used to leave a throwaway WebGL context behind (the leak)
    if (_sup != null) return _sup;
    try {
      const c = document.createElement("canvas"), g = c.getContext("webgl2") || c.getContext("webgl");
      _sup = !!(window.WebGLRenderingContext && g);
      if (g) { const x = g.getExtension("WEBGL_lose_context"); if (x) x.loseContext(); }
    } catch (_) { _sup = false; }
    return _sup;
  }
  function loadThree() { return T ? Promise.resolve(T) : (loading = loading || import(CDN).then(m => (T = m))); }
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const FOV = 38, WALL1 = 9;
  const COL = { accent: "#E0662F", accentInk: "#8E3E21", ridge: "#4a3f34", hip: "#5a4636", valley: "#2a6ca8", eave: "#B4532F", rake: "#8E3E21", wall: "#EAE3D6", ground: "#EEE8DC", dim: "#D8D1C3" };

  function suspend() { if (inst) { inst.dispose(); inst = null; } }
  async function mount(host, data, hooks) {
    if (inst && inst.key === data.key && inst.host === host) { inst.setData(data); return inst; }
    suspend();
    host.classList.add("r3-loading");
    let THREE;
    try { THREE = await loadThree(); } catch (e) { host.classList.remove("r3-loading"); loading = null; if (hooks && hooks.onFail) hooks.onFail(e); return null; }
    host.classList.remove("r3-loading");
    if (!host.isConnected) return null;
    if (inst) suspend();
    inst = create(THREE, host, data, hooks || {});
    return inst;
  }

  function create(THREE, host, data, hooks) {
    const V3 = THREE.Vector3, UP = new V3(0, 1, 0);
    const ac = new AbortController(), sig = { signal: ac.signal };
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const cv = renderer.domElement; cv.className = "r3-canvas"; cv.setAttribute("role", "img");
    cv.setAttribute("aria-label", "Interactive 3D roof. Drag to orbit, scroll or pinch to zoom, click a roof part to see its measurement.");
    host.innerHTML = ""; host.appendChild(cv);
    const ui = document.createElement("div"); ui.className = "r3-ui";
    ui.innerHTML = `<div class="r3-lab" hidden></div><div class="r3-compass" aria-hidden="true"><svg viewBox="-16 -16 32 32"><g class="r3-needle"><polygon points="0,-12 -4.5,3 0,0.5 4.5,3"/></g></svg><span>N</span></div>
      <div class="r3-tools"><button type="button" data-a="reset">Reset view</button><button type="button" data-a="top">Top view</button></div>
      <div class="r3-cap"></div>`;
    host.appendChild(ui);
    const lab = ui.querySelector(".r3-lab"), needle = ui.querySelector(".r3-needle"), cap = ui.querySelector(".r3-cap");

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 3000);
    scene.add(new THREE.HemisphereLight(0xfff6ea, 0xcfc6b6, 0.62));
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.4);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 5; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.15;
    scene.add(sun, sun.target);
    const cylG = new THREE.CylinderGeometry(1, 1, 1, 10), hitG = new THREE.CylinderGeometry(1, 1, 1, 6);
    const hitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

    const S = { data, key: data.key, host, hooks, W: 0, H: 0, dirty: true, raf: 0, sel: null, meta: null, hover: null, dim: 0, pulse: 0,
      cam: { theta: 0.5, phi: 0.95, r: 100, target: new V3() }, home: null, tween: null, interacted: false, size: 40, wallH: 9, pieces: [], facets: [], group: null };
    const gAll = new THREE.Group(); scene.add(gAll); S.gAll = gAll;
    const dimG = new THREE.Group(); dimG.renderOrder = 50; scene.add(dimG);
    const dimMat = new THREE.MeshBasicMaterial({ color: "#2a1d13", depthTest: false, transparent: true });
    const P = (x, y, h) => new V3(x, h, -y);

    function clearGroup(g) {
      g.traverse(o => { if (o.geometry && o.geometry !== cylG && o.geometry !== hitG) o.geometry.dispose(); if (o.material && o.material !== hitMat && o.material !== dimMat) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); } });
      while (g.children.length) g.remove(g.children[0]);
    }
    function seg(mesh, p, q, r) {
      const d = q.clone().sub(p), L = d.length() || 1e-6;
      mesh.position.copy(p).addScaledVector(d, .5); mesh.quaternion.setFromUnitVectors(UP, d.normalize()); mesh.scale.set(r, L, r);
    }

    function build() {
      clearGroup(gAll);
      S.pieces = []; S.facets = []; S.blockers = [];
      const { plan, pts, pitch, stories } = S.data;
      const m = pitch / 12, wallH = WALL1 * (stories || 1); S.wallH = wallH;
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, bw = Math.max(maxX - minX, 4), bh = Math.max(maxY - minY, 4);
      S.size = Math.hypot(bw, bh); S.center = [cx, cy]; S.bw = bw; S.bh = bh;
      const hv = new Map(); const key = (x, y) => Math.round(x * 20) + "," + Math.round(y * 20);
      // walls
      const wp = [], n = pts.length;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        const A = P(a[0] - cx, a[1] - cy, 0), B = P(b[0] - cx, b[1] - cy, 0), A2 = P(a[0] - cx, a[1] - cy, wallH), B2 = P(b[0] - cx, b[1] - cy, wallH);
        [A, B, B2, A, B2, A2].forEach(v => wp.push(v.x, v.y, v.z));
      }
      const wg = new THREE.BufferGeometry(); wg.setAttribute("position", new THREE.Float32BufferAttribute(wp, 3)); wg.computeVertexNormals();
      const walls = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: COL.wall, roughness: .95, side: THREE.DoubleSide }));
      walls.castShadow = walls.receiveShadow = true; gAll.add(walls); S.blockers.push(walls);
      // gable-end walls: under every rake, from wall top up to the rake line (two triangles per rake)
      if (plan && plan.rakes && plan.rakes.length) {
        const gp = [];
        plan.rakes.forEach(rk => {
          const A = P(rk.a[0] - cx, rk.a[1] - cy, wallH), B = P(rk.b[0] - cx, rk.b[1] - cy, wallH);
          const A2 = P(rk.a[0] - cx, rk.a[1] - cy, wallH + m * rk.ua), B2 = P(rk.b[0] - cx, rk.b[1] - cy, wallH + m * rk.ub);
          [A, B, B2, A, B2, A2].forEach(v => gp.push(v.x, v.y, v.z));
        });
        const gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.Float32BufferAttribute(gp, 3)); gg.computeVertexNormals();
        const gm = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: COL.wall, roughness: .95, side: THREE.DoubleSide }));
        gm.castShadow = gm.receiveShadow = true; gAll.add(gm); S.blockers.push(gm);
      }
      // floor cap under the roof so the walls never show the sky through a gap
      // facets
      let maxZ = wallH;
      (plan ? plan.facets : []).forEach((f, i) => {
        const r = f.ring, e0 = r[0], e1 = r[1], ex = e1[0] - e0[0], ey = e1[1] - e0[1], el = Math.hypot(ex, ey) || 1;
        const h = r.map(p => m * Math.abs(((p[0] - e0[0]) * -ey + (p[1] - e0[1]) * ex) / el));
        r.forEach((p, j) => { const k = key(p[0], p[1]); hv.set(k, Math.max(hv.get(k) || 0, h[j])); maxZ = Math.max(maxZ, wallH + h[j]); });
        const pos = [];
        for (let j = 1; j < r.length - 1; j++) [0, j, j + 1].forEach(q => { const v = P(r[q][0] - cx, r[q][1] - cy, wallH + h[q]); pos.push(v.x, v.y, v.z); });
        const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
        const base = new THREE.Color().setStyle(`hsl(27, 27%, ${(54 + 9 * Math.cos(f.angleDeg * Math.PI / 180 - 315 * Math.PI / 180)).toFixed(0)}%)`);
        const mat = new THREE.MeshStandardMaterial({ color: base.clone(), roughness: .88, metalness: 0, side: THREE.DoubleSide, flatShading: true, emissive: new THREE.Color(COL.accent), emissiveIntensity: 0 });
        const mesh = new THREE.Mesh(g, mat); mesh.castShadow = mesh.receiveShadow = true; gAll.add(mesh);
        const c = r.reduce((a, p) => [a[0] + p[0] / r.length, a[1] + p[1] / r.length], [0, 0]);
        const ch = h.reduce((a, b) => a + b, 0) / h.length;
        const cen = P(c[0] - cx, c[1] - cy, wallH + ch);
        // outward normal (up and away from the eave side) for framing
        const nrm = new V3(); { const a = P(r[0][0], r[0][1], 0), b = P(r[1][0], r[1][1], 0); const d = b.sub(a).normalize(); nrm.set(0, 1, 0).cross(d); const mid = P(c[0], c[1], 0).sub(P((e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2, 0)); if (nrm.dot(mid) > 0) nrm.negate(); }
        const rad = Math.max(...r.map(p => Math.hypot(p[0] - c[0], p[1] - c[1])));
        const obj = { k: "facet", i, mesh, base, mat, center: cen, normal: nrm, radius: rad, f };
        mesh.userData.piece = obj; S.facets.push(obj); S.pieces.push(obj);
      });
      const hAt = (p) => {
        let h = hv.get(key(p[0], p[1]));
        if (h == null) { let bd = 0.6; h = 0; hv.forEach((v, k) => { const [a, b] = k.split(","); const d = Math.hypot(a / 20 - p[0], b / 20 - p[1]); if (d < bd) { bd = d; h = v; } }); }
        return h;
      };
      const line = (k, i, s, col, r, flat) => {
        const za = flat ? 0 : hAt(s.a), zb = flat ? 0 : hAt(s.b);
        const a = P(s.a[0] - cx, s.a[1] - cy, wallH + za), b = P(s.b[0] - cx, s.b[1] - cy, wallH + zb);
        const mat = new THREE.MeshStandardMaterial({ color: col, roughness: .6, emissive: new THREE.Color(COL.accent), emissiveIntensity: 0 });
        const vis = new THREE.Mesh(cylG, mat); vis.castShadow = false; seg(vis, a, b, r); gAll.add(vis);
        const hit = new THREE.Mesh(hitG, hitMat); hit.visible = false; seg(hit, a, b, 1); gAll.add(hit);
        const obj = { k, i, a, b, vis, hit, mat, baseR: r, base: new THREE.Color(col), s, len: s.lenFt, center: a.clone().add(b).multiplyScalar(.5) };
        hit.userData.piece = obj; vis.userData.piece = obj; S.pieces.push(obj); return obj;
      };
      if (plan) {
        plan.eaves.forEach((s, i) => line("eave", i, s, COL.eave, .32, true));
        plan.hips.forEach((s, i) => line("hip", i, s, COL.hip, .34));
        plan.valleys.forEach((s, i) => line("valley", i, s, COL.valley, .36));
        (plan.rakes || []).forEach((s, i) => line("rake", i, s, COL.rake, .34));
        plan.ridges.forEach((s, i) => line("ridge", i, s, COL.ridge, .42));
      }
      S.maxZ = maxZ;
      // ground + soft light framing
      const gd = new THREE.Mesh(new THREE.CircleGeometry(S.size * .95, 72), new THREE.MeshStandardMaterial({ color: COL.ground, roughness: 1, transparent: true, alphaMap: fadeTex(), depthWrite: false }));
      gd.rotation.x = -Math.PI / 2; gd.position.y = -.05; gd.receiveShadow = true; gAll.add(gd);
      // footprint line on the ground (the real outline)
      sun.position.set(-S.size * .8, S.size * 1.3, S.size * .9); sun.target.position.set(0, 0, 0);
      const sc = sun.shadow.camera, ext = S.size * .85; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = S.size * 4; sc.updateProjectionMatrix();
      const aspect = S.W && S.H ? S.W / S.H : 1, tv = Math.tan(FOV * Math.PI / 360), th = tv * Math.min(1, aspect);
      const halfDiag = Math.hypot(S.bw, S.bh) / 2;
      S.home = { theta: 0.5, phi: .98, r: Math.max(halfDiag * (aspect < .8 ? 1.32 : 1.02) / th, 30), target: new V3(0, maxZ * .42, 0) };
      cap.textContent = `Pitch ${pitch}/12 ${S.data.pitchNote || "assumed"}. Walls ${wallH} ft (${stories || 1} story assumed).`;
      S.dirty = true;
    }

    // ---- camera ----
    function applyCam() {
      const { theta, phi, r, target } = S.cam;
      camera.position.set(target.x + r * Math.sin(phi) * Math.sin(theta), target.y + r * Math.cos(phi), target.z + r * Math.sin(phi) * Math.cos(theta));
      camera.lookAt(target);
    }
    function clampCam() {
      S.cam.phi = Math.max(.08, Math.min(1.5, S.cam.phi));
      S.cam.r = Math.max(8, Math.min(S.home.r * 2.6, S.cam.r));
    }
    function flyTo(to, dur) {
      const c = S.cam;
      let dth = to.theta - c.theta; dth = Math.atan2(Math.sin(dth), Math.cos(dth)); // shortest way round
      const tw = { t0: performance.now(), dur: reduce() ? 0 : (dur || 800), from: { theta: c.theta, phi: c.phi, r: c.r, target: c.target.clone() }, to: { theta: c.theta + dth, phi: to.phi, r: to.r, target: to.target.clone() } };
      if (tw.dur === 0) { Object.assign(c, { theta: tw.to.theta, phi: tw.to.phi, r: tw.to.r }); c.target.copy(tw.to.target); S.tween = null; clampCam(); S.dirty = true; kick(); return; }
      S.tween = tw; kick();
    }
    function stepTween(now) {
      const tw = S.tween; if (!tw) return false;
      const t = S.freeze != null ? S.freeze : Math.min(1, (now - tw.t0) / tw.dur), e = ease(t), c = S.cam;
      c.theta = tw.from.theta + (tw.to.theta - tw.from.theta) * e; c.phi = tw.from.phi + (tw.to.phi - tw.from.phi) * e;
      c.r = tw.from.r * Math.pow(tw.to.r / tw.from.r, e); c.target.lerpVectors(tw.from.target, tw.to.target, e);
      if (t >= 1) S.tween = null;
      return true;
    }
    // soft radial alpha so the ground fades into the stage background instead of ending in a hard edge
    let _fade = null;
    function fadeTex() {
      if (_fade) return _fade;
      const c = document.createElement("canvas"); c.width = c.height = 128;
      const x = c.getContext("2d"), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, "#fff"); g.addColorStop(.45, "#fff"); g.addColorStop(1, "#000");
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
      _fade = new THREE.CanvasTexture(c); return _fade;
    }
    function framing(piece) {
      const f = framing0(piece), h = S.home;
      // keep the whole roof in view: stay near the home distance, drift only part way toward the selected piece
      f.r = Math.max(f.r > h.r ? h.r : f.r, h.r * .9);
      f.target = h.target.clone().lerp(piece.center, .3);
      return f;
    }
    function framing0(piece) {
      const th = Math.tan(FOV * Math.PI / 360) * Math.min(1, (S.W || 1) / (S.H || 1));
      const cur = S.cam.theta;
      if (piece.k === "facet") {
        const n = piece.normal, az = Math.atan2(n.x, n.z);
        return { theta: az, phi: .78, r: Math.max(piece.radius * .95 / th + 4, 26), target: piece.center.clone() };
      }
      const d = piece.b.clone().sub(piece.a); d.y = 0; d.normalize();
      let nx = d.z, nz = -d.x; // horizontal perpendicular
      const ctr = new V3(0, 0, 0);
      let sign = 1;
      if (piece.k === "eave") { sign = (new V3(nx, 0, nz).dot(piece.center.clone().setY(0).sub(ctr)) < 0) ? -1 : 1; } // outward
      else { const cdir = new V3(Math.sin(cur), 0, Math.cos(cur)); sign = new V3(nx, 0, nz).dot(cdir) < 0 ? -1 : 1; }
      const az = Math.atan2(nx * sign, nz * sign);
      const L = piece.len;
      return { theta: az, phi: piece.k === "eave" ? 1.12 : .86, r: Math.max((L / 2 + 6) / (th * .8), 32), target: piece.center.clone() };
    }

    // ---- selection ----
    function setSel(sel, meta, opts) {
      const prev = S.sel;
      S.sel = sel && S.pieces.find(p => p.k === sel.k && p.i === sel.i) ? { k: sel.k, i: sel.i } : null;
      S.meta = S.sel ? meta || null : null;
      S.group = S.meta && S.meta.group ? S.sel.k : null;
      const piece = S.sel && S.pieces.find(p => p.k === S.sel.k && p.i === S.sel.i);
      buildDim(piece);
      if (piece && !(opts && opts.noFly)) flyTo(framing(piece), 850);
      else if (!piece && prev && !(opts && opts.noFly)) flyTo(S.home, 800);
      S.dirty = true; kick();
    }
    function buildDim(piece) {
      clearGroup(dimG); S.dimInfo = null; lab.hidden = true;
      if (!piece) return;
      if (piece.k === "facet") { S.dimInfo = { anchor: piece.center.clone().add(new V3(0, 1.5, 0)) }; }
      else {
        const d = piece.b.clone().sub(piece.a).normalize(), hz = new V3(d.z, 0, -d.x).normalize();
        let sign = 1;
        if (piece.k === "eave") sign = hz.dot(piece.center.clone().setY(0)) < 0 ? -1 : 1;
        else { const cdir = new V3(Math.sin(S.cam.theta), 0, Math.cos(S.cam.theta)); sign = hz.dot(cdir) < 0 ? -1 : 1; }
        const off = hz.multiplyScalar(sign * (piece.k === "eave" ? 4.2 : 3.6)).add(new V3(0, piece.k === "eave" ? 0.8 : 5.5, 0));
        const a2 = piece.a.clone().add(off), b2 = piece.b.clone().add(off);
        const parts = [[a2, b2], [piece.a, a2.clone().addScaledVector(off.clone().normalize(), 0.7)], [piece.b, b2.clone().addScaledVector(off.clone().normalize(), 0.7)]];
        const tk = new V3(0, 1, 0).cross(d).normalize().multiplyScalar(1.1).add(new V3(0, 1.1, 0));
        parts.push([a2.clone().sub(tk), a2.clone().add(tk)], [b2.clone().sub(tk), b2.clone().add(tk)]);
        parts.forEach((p, i) => { const m = new THREE.Mesh(cylG, dimMat); m.renderOrder = 60; m.userData.ratio = i === 0 ? 1.3 : .85; seg(m, p[0], p[1], .15); m.userData.p = p; dimG.add(m); });
        S.dimInfo = { anchor: a2.clone().add(b2).multiplyScalar(.5).add(new V3(0, .6, 0)) };
      }
      lab.textContent = hooks.label ? hooks.label(S.sel, S.meta) : "";
    }

    // ---- per-frame appearance ----
    const tmp = new THREE.Color(), dimC = new THREE.Color(COL.dim), acc = new THREE.Color(COL.accent), accSoft = new THREE.Color("#F0A27A");
    function appearance(dt) {
      const has = !!S.sel;
      S.dim += ((has ? 1 : 0) - S.dim) * Math.min(1, dt * 7);
      if (Math.abs((has ? 1 : 0) - S.dim) < .003) S.dim = has ? 1 : 0;
      const pulse = .5 + .5 * Math.sin(performance.now() / 260);
      const hov = S.hover;
      for (const p of S.pieces) {
        const isSel = has && S.sel.k === p.k && S.sel.i === p.i, inGrp = has && S.group === p.k && !isSel;
        const isHov = hov && hov.k === p.k && hov.i === p.i;
        tmp.copy(p.base);
        if (p.k === "facet") {
          if (has && !isSel && !inGrp) tmp.lerp(dimC, .5 * S.dim);
          if (inGrp) tmp.lerp(accSoft, .38 * S.dim);
          if (isSel) tmp.lerp(accSoft, .35);
          if (isHov && !isSel) tmp.offsetHSL(0, 0, .05);
          p.mat.color.copy(tmp); p.mat.emissiveIntensity = isSel ? .22 + .12 * pulse : inGrp ? .06 * S.dim : 0;
        } else {
          let sc = 1;
          if (has && !isSel && !inGrp) tmp.lerp(dimC, .55 * S.dim);
          if (inGrp) { tmp.lerp(acc, .55); sc = 1.5; }
          if (isSel) { tmp.copy(acc); sc = 2.4; }
          if (isHov && !isSel) { tmp.lerp(acc, .5); sc = Math.max(sc, 1.7); }
          p.mat.color.copy(tmp); p.mat.emissiveIntensity = isSel ? .45 + .3 * pulse : inGrp ? .2 : 0;
          const r = p.baseR * sc * (1 + (S.cam.r / S.home.r - 1) * .25);
          seg(p.vis, p.a, p.b, Math.max(r, .12));
          seg(p.hit, p.a, p.b, Math.max(.9, S.cam.r * .011));
        }
      }
      // dimension geometry keeps a constant on-screen thickness
      dimG.children.forEach(m => { const q = m.userData.p; seg(m, q[0], q[1], S.cam.r * .0014 * (m.userData.ratio || 1)); });
    }

    // ---- loop ----
    let last = performance.now(), frames = 0;
    function kick() { if (!S.raf && !S.dead) S.raf = requestAnimationFrame(loop); }
    function loop(now) {
      S.raf = 0; if (S.dead) return;
      const dt = Math.min(.1, (now - last) / 1000); last = now;
      const moving = stepTween(now);
      if (S.W && S.H && host.offsetParent !== null) {
        appearance(dt); applyCam();
        const t0 = performance.now(); renderer.render(scene, camera); S.lastMs = performance.now() - t0; frames++;
        overlay();
      } else resize();
      S.dirty = false;
      if (moving || S.sel || S.dim !== 0 || S.tween) kick();
    }
    const q = new V3();
    function toScreen(v) { q.copy(v).project(camera); return [(q.x * .5 + .5) * S.W, (-q.y * .5 + .5) * S.H, q.z]; }
    function overlay() {
      // compass: world -Z is north
      const o = toScreen(new V3(0, 0, 0)), n = toScreen(new V3(0, 0, -10));
      needle.setAttribute("transform", `rotate(${(Math.atan2(n[0] - o[0], -(n[1] - o[1])) * 180 / Math.PI).toFixed(1)})`);
      if (S.dimInfo) {
        const s = toScreen(S.dimInfo.anchor);
        const w = lab.offsetWidth || 120, hh = lab.offsetHeight || 28;
        const x = Math.max(w / 2 + 6, Math.min(S.W - w / 2 - 6, s[0])), y = Math.max(hh + 6, Math.min(S.H - 70, s[1]));
        lab.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -100%)`; lab.hidden = false;
      } else lab.hidden = true;
    }
    function resize() {
      const w = Math.round(host.clientWidth), h = Math.round(host.clientHeight);
      if (w < 40 || h < 40 || (w === S.W && h === S.H)) return;
      S.W = w; S.H = h; renderer.setSize(w, h, false); cv.style.width = w + "px"; cv.style.height = h + "px"; camera.aspect = w / h; camera.updateProjectionMatrix();
      const had = !!S.home; if (S.data) { const keepSel = S.sel, kmeta = S.meta; build(); if (!S.interacted && !S.sel) { Object.assign(S.cam, { theta: S.home.theta, phi: S.home.phi, r: S.home.r }); S.cam.target.copy(S.home.target); } if (keepSel) setSel(keepSel, kmeta, { noFly: true }); }
      S.dirty = true; kick();
    }
    const ro = new ResizeObserver(() => resize()); ro.observe(host);

    // ---- pointer: orbit, pinch, tap-to-pick ----
    const ptr = new Map(); let tapStart = null, pinch0 = 0, moved = false;
    const ray = new THREE.Raycaster();
    function pickAt(cx, cy) {
      const r = cv.getBoundingClientRect();
      ray.setFromCamera({ x: ((cx - r.left) / r.width) * 2 - 1, y: -((cy - r.top) / r.height) * 2 + 1 }, camera);
      const objs = [...S.facets.map(f => f.mesh), ...S.pieces.filter(p => p.hit).map(p => p.hit), ...S.blockers];
      const hits = ray.intersectObjects(objs, false);
      if (!hits.length) return null;
      const d0 = hits[0].distance; let best = hits[0].object.userData.piece || null;
      if (best && best.k === "facet") for (const h of hits) { const pc = h.object.userData.piece; if (pc && pc.k !== "facet" && h.distance < d0 + 2.2) { best = pc; break; } if (h.distance > d0 + 2.2) break; }
      return best ? { k: best.k, i: best.i } : null;
    }
    cv.style.touchAction = "none";
    cv.addEventListener("pointerdown", e => {
      cv.setPointerCapture(e.pointerId); ptr.set(e.pointerId, [e.clientX, e.clientY]); S.interacted = true;
      if (ptr.size === 1) { tapStart = { x: e.clientX, y: e.clientY, t: performance.now() }; moved = false; S.tween = null; } else { moved = true; pinch0 = dist2(); }
    }, sig);
    function dist2() { const a = [...ptr.values()]; return a.length > 1 ? Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]) : 0; }
    cv.addEventListener("pointermove", e => {
      if (!ptr.has(e.pointerId)) { if (e.pointerType === "mouse") { const h = pickAt(e.clientX, e.clientY); if ((h && h.k + h.i) !== (S.hover && S.hover.k + S.hover.i)) { S.hover = h; cv.style.cursor = h ? "pointer" : "grab"; S.dirty = true; kick(); } } return; }
      const old = ptr.get(e.pointerId); ptr.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptr.size === 1) {
        const dx = e.clientX - old[0], dy = e.clientY - old[1];
        if (!moved && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) > 6) moved = true;
        if (moved) { S.cam.theta -= dx * .0075; S.cam.phi -= dy * .0075; clampCam(); S.dirty = true; kick(); }
      } else {
        const d = dist2(); if (pinch0 > 0 && d > 0) { S.cam.r /= d / pinch0; clampCam(); } pinch0 = d; S.dirty = true; kick();
      }
    }, sig);
    const up = e => {
      const had = ptr.has(e.pointerId); ptr.delete(e.pointerId);
      if (had && ptr.size === 0 && tapStart && !moved && e.type === "pointerup") { const h = pickAt(e.clientX, e.clientY); S.hooks.onPick && S.hooks.onPick(h); }
      if (ptr.size < 2) pinch0 = 0;
    };
    cv.addEventListener("pointerup", up, sig); cv.addEventListener("pointercancel", up, sig);
    cv.addEventListener("pointerleave", () => { if (S.hover) { S.hover = null; S.dirty = true; kick(); } }, sig);
    cv.addEventListener("wheel", e => { e.preventDefault(); S.interacted = true; S.tween = null; const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; S.cam.r *= Math.exp(dy * (e.ctrlKey ? .01 : .0014)); clampCam(); S.dirty = true; kick(); }, { passive: false, signal: ac.signal });
    ui.querySelector(".r3-tools").addEventListener("click", e => {
      const a = e.target.closest("button")?.dataset.a; if (!a) return;
      if (a === "reset") { S.hooks.onPick && S.hooks.onPick(null, true); flyTo(S.home, 800); }
      if (a === "top") { S.hooks.onPick && S.hooks.onPick(null, true); flyTo({ theta: S.cam.theta, phi: .08, r: S.home.r * .9, target: new V3(0, S.wallH, 0) }, 800); }
    }, sig);

    // ---- API ----
    const api = {
      key: data.key, host, S, THREE, scene, renderer,
      select(sel, meta, opts) { setSel(sel, meta, opts); },
      setData(d) { S.data = d; S.key = d.key; api.key = d.key; const keep = S.sel, km = S.meta; build(); if (keep) setSel(keep, km, { noFly: true }); S.dirty = true; kick(); },
      zoom(f) { S.interacted = true; flyTo({ ...S.cam, theta: S.cam.theta, phi: S.cam.phi, r: Math.max(8, Math.min(S.home.r * 2.6, S.cam.r / f)), target: S.cam.target }, 220); },
      reset() { flyTo(S.home, 800); },
      freezeAt(p) { S.freeze = p; if (p == null) { kick(); return; } S.tween && (S.tween.dur = S.tween.dur || 800); loop(performance.now()); }, // screenshot/test hook: scrub the camera tween
      renderNow() { loop(performance.now()); },
      snapshot() { renderer.render(scene, camera); return cv.toDataURL("image/png"); }, // same task as the draw, so the buffer is still valid (no preserveDrawingBuffer needed)
      bench(n) { const gl = renderer.getContext(); const t0 = performance.now(); for (let i = 0; i < n; i++) { S.cam.theta += .01; appearance(.016); applyCam(); renderer.render(scene, camera); } gl.finish(); return (performance.now() - t0) / n; },
      stats() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geoms: renderer.info.memory.geometries, textures: renderer.info.memory.textures, lastMs: S.lastMs, frames, pieces: S.pieces.length }; },
      dispose() {
        S.dead = true; if (S.raf) cancelAnimationFrame(S.raf); ac.abort(); ro.disconnect();
        clearGroup(gAll); clearGroup(dimG); cylG.dispose(); hitG.dispose(); hitMat.dispose(); dimMat.dispose();
        renderer.dispose(); try { renderer.forceContextLoss(); } catch (_) {}
        if (cv.parentNode) cv.parentNode.removeChild(cv); if (ui.parentNode) ui.parentNode.removeChild(ui);
      }
    };
    build(); resize(); if (S.W) { applyCam(); }
    // intro: swoop in from a wider, higher view
    if (S.home) {
      Object.assign(S.cam, { theta: S.home.theta - 1.1, phi: .5, r: S.home.r * 1.55 }); S.cam.target.copy(S.home.target);
      flyTo(S.home, 1300);
    }
    kick();
    return api;
  }
  window.Roof3D = { supported, mount, suspend, get current() { return inst; } };
})();
