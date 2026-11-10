'use strict';
/* =====================================================================
   3D Preview: the traced building on satellite ground, panels on
   elevated structures, live sun & shadows by season / month / hour.
   Also renders still images for the PDF (cover + shadow analysis).
   three.js is loaded only when 3D is first used.
   ===================================================================== */
const V3D = (() => {
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js';
  const ORBIT_URL = 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js';
  const FLOOR_H = 3.2;
  const SEASONS = [['Summer', 4], ['Rain', 7], ['Winter', 11]];
  const seasonOf = (m) => (m >= 2 && m <= 5 ? 0 : m >= 6 && m <= 8 ? 1 : 2);
  let loading = null;

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error('Could not load the 3D engine. Check the internet connection.'));
      document.head.appendChild(s);
    });
  }
  function ensureThree() {
    if (window.THREE && THREE.OrbitControls) return Promise.resolve();
    if (!loading) loading = (window.THREE ? Promise.resolve() : loadScript(THREE_URL)).then(() => loadScript(ORBIT_URL));
    return loading;
  }

  // Structure heights (m above the roof) for each mounting type
  function structureOf(p) {
    const s = p.design.structure || {};
    if (p.design.mount === 'elevated') return { front: n0(s.front) || 1.2, back: n0(s.back) || 1.8, legs: true };
    if (p.design.mount === 'flush') return { front: 0.3, back: 0.6, legs: true };
    return { front: 0.08, back: 0.2, legs: false };
  }

  async function groundCanvas(lat0, lon0, radius, size) {
    const cosl = Math.cos(lat0 * DEG);
    const z = Math.max(12, Math.min(19, Math.floor(Math.log2((156543.03 * cosl * size) / (2 * radius)))));
    const mpp = (156543.03 * cosl) / 2 ** z;
    const [cx, cy] = merc(lat0, lon0, z);
    const ox = cx - size / 2, oy = cy - size / 2;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#5b6650'; ctx.fillRect(0, 0, size, size);
    const jobs = [];
    for (let tx = Math.floor(ox / 256); tx <= Math.floor((ox + size) / 256); tx++)
      for (let ty = Math.floor(oy / 256); ty <= Math.floor((oy + size) / 256); ty++)
        jobs.push(loadImg(ESRI_TILES.replace('{z}', z).replace('{y}', ty).replace('{x}', tx)).then((im) => { if (im) ctx.drawImage(im, tx * 256 - ox, ty * 256 - oy); }));
    await Promise.all(jobs);
    return { canvas: cv, meters: size * mpp };
  }

  let cellTex = null;
  function panelTexture() {
    if (cellTex) return cellTex;
    const c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#d0d5dc'; g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#0d1424'; g.fillRect(3, 3, 122, 250);
    g.strokeStyle = '#2a3a5c'; g.lineWidth = 1;
    for (let i = 1; i < 6; i++) { const x = 3 + (122 / 6) * i; g.beginPath(); g.moveTo(x, 3); g.lineTo(x, 253); g.stroke(); }
    for (let i = 1; i < 12; i++) { const y = 3 + (250 / 12) * i; g.beginPath(); g.moveTo(3, y); g.lineTo(125, y); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(3, 3, 122, 60);
    cellTex = new THREE.CanvasTexture(c);
    cellTex.anisotropy = 8;
    return cellTex;
  }

  // Inset polygon (for the parapet); null if it collapses
  function inset(pts, d) {
    const n = pts.length;
    let area = 0;
    for (let i = 0; i < n; i++) area += pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1];
    const sgn = area > 0 ? 1 : -1;
    const lines = pts.map((a, i) => {
      const b = pts[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      return [[a[0] + (-dy / l) * sgn * d, a[1] + (dx / l) * sgn * d], [dx, dy]];
    });
    const out = [];
    for (let i = 0; i < n; i++) {
      const [p1, d1] = lines[(i + n - 1) % n], [p2, d2] = lines[i];
      const den = d1[0] * d2[1] - d1[1] * d2[0];
      if (Math.abs(den) < 1e-9) { out.push(p2); continue; }
      const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den;
      out.push([p1[0] + d1[0] * t, p1[1] + d1[1] * t]);
    }
    return out;
  }

  async function buildScene(p, hq) {
    const r = compute(p);
    const roofs = p.site.roofs.map((roof, i) => ({ roof, lay: r.layouts[i] })).filter((x) => x.roof.points.length >= 3);
    if (!roofs.length) throw new Error('Draw the roof on the map first.');
    const all = roofs.flatMap((x) => x.roof.points);
    const [lat0, lon0] = roofCentroid(all);
    const kx = 111320 * Math.cos(lat0 * DEG), ky = 111320;
    const L = ([la, lo]) => [(lo - lon0) * kx, (la - lat0) * ky];
    const V = (e, n, h) => new THREE.Vector3(e, h, -n);
    const extent = Math.max(8, ...all.map((q) => Math.hypot(...L(q))));
    const H = Math.max(1, n0(p.design.floors) || 1) * FLOOR_H;
    const st = structureOf(p);
    const parapet = Math.max(0, n0(p.design.parapet));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07111f);
    const g = await groundCanvas(lat0, lon0, Math.max(70, extent * 3.2), hq ? 2048 : 1024);
    const tex = new THREE.CanvasTexture(g.canvas);
    tex.anisotropy = 8;
    tex.encoding = THREE.sRGBEncoding;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(g.meters, g.meters).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    ground.receiveShadow = true;
    scene.add(ground);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xbfb9ae, roughness: 0.92 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xb3ac9f, roughness: 0.96 });
    const parMat = new THREE.MeshStandardMaterial({ color: 0xcac4b8, roughness: 0.9 });
    const panelMat = new THREE.MeshStandardMaterial({ map: panelTexture(), roughness: 0.28, metalness: 0.35 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xb9c0c9, roughness: 0.45, metalness: 0.7 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.5, metalness: 0.6 });
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.55 });
    const blockMat = new THREE.MeshStandardMaterial({ color: 0xbdb7ac, roughness: 0.9 });
    const legGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 8);
    const panelsGroup = new THREE.Group();
    const add = (m) => { m.castShadow = m.receiveShadow = true; scene.add(m); return m; };

    roofs.forEach(({ roof }) => {
      const pts = roof.points.map(L);
      const shape = new THREE.Shape(pts.map((q) => new THREE.Vector2(...q)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: H, bevelEnabled: false }).rotateX(-Math.PI / 2);
      add(new THREE.Mesh(geo, [roofMat, wallMat]));
      scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: 0x8e877b })));
      if (parapet > 0) {
        const ring = new THREE.Shape(pts.map((q) => new THREE.Vector2(...q)));
        const hole = inset(pts, 0.2);
        if (hole) ring.holes.push(new THREE.Path(hole.map((q) => new THREE.Vector2(...q))));
        const par = add(new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: parapet, bevelEnabled: false }).rotateX(-Math.PI / 2), parMat));
        par.position.y = H;
      }
    });
    (p.site.obstacles || []).filter((o) => o.points.length >= 3).forEach((o) => {
      const pts = o.points.map(L), h = Math.max(0.2, n0(o.height));
      const oc = L(roofCentroid(o.points));
      const onRoof = roofs.some(({ roof }) => inPoly(oc, roof.points.map(L)));
      const base = onRoof ? H : 0;
      if (/tank/i.test(o.name || '')) {
        // black water tank on a small stand
        const area = polyArea(pts), rad = Math.max(0.4, Math.sqrt(area / Math.PI) * 0.9);
        const [ce, cn] = L(roofCentroid(o.points));
        const stand = add(new THREE.Mesh(new THREE.BoxGeometry(rad * 1.8, Math.max(0.1, h - rad * 1.6), rad * 1.8), blockMat));
        stand.position.copy(V(ce, cn, base + Math.max(0.1, h - rad * 1.6) / 2));
        const tank = add(new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, Math.min(h, rad * 1.6), 28), tankMat));
        tank.position.copy(V(ce, cn, base + h - Math.min(h, rad * 1.6) / 2));
      } else {
        const m = add(new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape(pts.map((q) => new THREE.Vector2(...q))), { depth: onRoof ? h : H + h, bevelEnabled: false }).rotateX(-Math.PI / 2), [roofMat, blockMat]));
        m.position.y = base;
      }
    });

    // Panels on structures: low edge to the south at "front" height, high edge to the north at "back" height
    roofs.forEach(({ lay }) => (lay?.rects || []).forEach((c) => {
      const q = c.map(L);
      const u = [q[1][0] - q[0][0], q[1][1] - q[0][1]], v = [q[3][0] - q[0][0], q[3][1] - q[0][1]];
      let s = Math.abs(v[1]) >= Math.abs(u[1]) ? v : u;
      const a = s === v ? u : v;
      if (s[1] < 0) s = [-s[0], -s[1]];
      const sl = Math.hypot(...s), al = Math.hypot(...a);
      const sh = [s[0] / sl, s[1] / sl], ah = [a[0] / al, a[1] / al];
      const ce = (q[0][0] + q[2][0]) / 2, cn = (q[0][1] + q[2][1]) / 2;
      const rise = Math.max(0, st.back - st.front), t = Math.atan2(Math.min(rise, sl * 0.6), sl);
      const zA = V(sh[0], sh[1], 0).normalize();
      let x = V(ah[0], ah[1], 0).normalize();
      let y = new THREE.Vector3().crossVectors(zA, x);
      if (y.y < 0) { x.negate(); y = new THREE.Vector3().crossVectors(zA, x); }
      const grp = new THREE.Group();
      grp.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, zA));
      const midH = st.front + (sl / 2) * Math.sin(t);
      grp.position.copy(V(ce, cn, H + midH));
      const panel = new THREE.Mesh(new THREE.BoxGeometry(al * 0.98, 0.045, sl * 0.98), [frameMat, frameMat, panelMat, frameMat, frameMat, frameMat]);
      panel.rotation.x = -t;
      panel.castShadow = panel.receiveShadow = true;
      grp.add(panel);
      if (st.legs) {
        const zc = (sl / 2) * Math.cos(t) * 0.92;
        [[-1, st.front], [1, st.front + sl * Math.sin(t) * 0.92]].forEach(([sideZ, len]) => [-1, 1].forEach((sideX) => {
          const leg = new THREE.Mesh(legGeo, legMat);
          leg.scale.y = len;
          leg.position.set(sideX * al * 0.44, -midH + len / 2, sideZ * zc);
          leg.castShadow = true;
          grp.add(leg);
        }));
      }
      panelsGroup.add(grp);
    }));
    scene.add(panelsGroup);

    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x6b6150, 0.55));
    const light = new THREE.DirectionalLight(0xfff6e5, 1.2);
    light.castShadow = true;
    const sb = extent + 30;
    Object.assign(light.shadow.camera, { left: -sb, right: sb, top: sb, bottom: -sb, near: 1, far: sb * 8 });
    light.shadow.mapSize.set(hq ? 4096 : 2048, hq ? 4096 : 2048);
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.03;
    scene.add(light, light.target);
    light.target.position.set(0, H, 0);
    return { scene, light, lat0, lon0, extent, H, sb, panelsGroup, panels: panelsGroup.children.length };
  }

  function placeSun(ctx, month, hour) {
    const s = sunAt(ctx.lat0, ctx.lon0, month, hour);
    const d = ctx.sb * 3;
    if (s.el > 0.01) {
      const up = Math.sin(s.el);
      ctx.light.intensity = 0.35 + 0.95 * Math.min(1, up * 1.5);
      ctx.light.position.set(Math.cos(s.el) * Math.sin(s.az) * d, ctx.H + up * d, -Math.cos(s.el) * Math.cos(s.az) * d);
    } else ctx.light.intensity = 0;
    return s;
  }
  function setCamera(camera, ctx, view) {
    // step back further on tall (phone) screens so the whole building fits
    const d = Math.max(26, ctx.extent * 2.7) * Math.max(1, 1.15 / Math.min(1.15, camera.aspect || 1));
    if (view === 'top') camera.position.set(d * 0.08, ctx.H + d * 1.25, d * 0.42);
    else camera.position.set(d * 0.6, ctx.H + d * 0.7, d * 0.85);
    camera.lookAt(0, ctx.H * 0.85, 0);
  }
  function makeRenderer(w, h, keep, hq) {
    const rr = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!keep });
    rr.setPixelRatio(keep ? 1 : Math.min(hq ? 2.5 : 1.5, window.devicePixelRatio || 1));
    rr.setSize(w, h, false);
    rr.shadowMap.enabled = true;
    rr.shadowMap.type = THREE.PCFSoftShadowMap;
    rr.outputEncoding = THREE.sRGBEncoding;
    rr.toneMapping = THREE.ACESFilmicToneMapping;
    rr.toneMappingExposure = 0.82;
    return rr;
  }
  const ICON = {
    share: '<path d="M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7l-6.7 3.4a3 3 0 1 0 0 3.2L15 17a3 3 0 1 0 3-1z"/>',
    image: '<path d="M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 14H5l4-5 3 4 2-3 5 4zM8.5 10a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>',
    eye: '<path d="M12 6c4.5 0 8 4 9 6-1 2-4.5 6-9 6s-8-4-9-6c1-2 4.5-6 9-6zm0 2.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5zM3 3l18 18-1.4 1.4L1.6 4.4z"/>',
    grid: '<path d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z"/>',
    chart: '<path d="M4 20h16v-2H4zm2-4h3V9H6zm5 0h3V4h-3zm5 0h3v-5h-3z"/>',
    play: '<path d="M8 5v14l11-7z"/>',
    pause: '<path d="M7 5h4v14H7zm6 0h4v14h-4z"/>',
  };
  const icon = (k) => `<svg viewBox="0 0 24 24">${ICON[k]}</svg>`;

  /* ---------- Interactive 3D Preview ---------- */
  let live = null;
  async function open(p) {
    close();
    const C = db.settings.company;
    const st0 = p.view3d || {};
    const state = { month: st0.month ?? new Date().getMonth(), hour: st0.hour ?? 12, hq: false, panels: true, info: false, timer: null };
    const el = document.createElement('div');
    el.className = 'v3d';
    el.innerHTML = `
      <div class="v3d-top"><button class="v3d-back" id="v3dClose" aria-label="Back">‹</button><b>3D Preview</b><span class="spacer"></span>
        <button class="btn sm accent" id="v3dSave" title="Use this view in the PDF">Use in PDF</button></div>
      <div class="v3d-stage" id="v3dStage"><div class="v3d-loading"><span class="spin"></span> Building 3D model…</div></div>
      <div class="v3d-brand"><b>${esc(C.name)}</b><span>${esc(C.phone || '')}</span></div>
      <div class="v3d-side">
        <button data-a="share" title="Share image">${icon('share')}</button>
        <button data-a="hq" class="txt" title="High quality">HQ</button>
        <button data-a="image" title="Download image">${icon('image')}</button>
        <button data-a="panels" title="Show / hide panels">${icon('eye')}</button>
        <button data-a="top" title="Top view">${icon('grid')}</button>
        <button data-a="info" title="Sunlight details">${icon('chart')}</button>
      </div>
      <div class="v3d-compass" id="v3dCompass"></div>
      <div class="v3d-info" id="v3dInfo" hidden></div>
      <div class="v3d-bottom">
        <div class="v3d-seasons">${SEASONS.map(([n], i) => `<button data-season="${i}">${n}</button>`).join('')}
          <select id="v3dMonth" aria-label="Month">${MONTHS.map((m, i) => `<option value="${i}">${m}</option>`).join('')}</select></div>
        <div class="v3d-time">
          <div class="v3d-clock"><span>◷</span> <b id="v3dTime"></b></div>
          <div class="v3d-slide"><button id="v3dPlay" aria-label="Play">${icon('play')}</button><span class="sun">☀</span><span class="lbl">6AM</span>
            <input type="range" id="v3dHour" min="6" max="19" step="0.25" aria-label="Time of day" /><span class="lbl">7PM</span></div>
        </div>
      </div>`;
    document.body.appendChild(el);
    document.body.style.overflow = 'hidden';
    $('#v3dClose', el).onclick = close;
    try {
      await ensureThree();
      let ctx = await buildScene(p, false);
      const stage = $('#v3dStage', el);
      stage.innerHTML = '';
      let renderer = makeRenderer(stage.clientWidth, stage.clientHeight, true, false);
      stage.appendChild(renderer.domElement);
      const camera = new THREE.PerspectiveCamera(42, stage.clientWidth / stage.clientHeight, 0.5, 6000);
      let controls = new THREE.OrbitControls(camera, renderer.domElement);
      const setupControls = () => {
        controls.target.set(0, ctx.H * 0.85, 0);
        controls.maxPolarAngle = Math.PI / 2 - 0.04;
        controls.minDistance = 6; controls.maxDistance = 700;
        controls.enableDamping = true;
      };
      setupControls();
      if (st0.cam) { camera.position.fromArray(st0.cam); controls.target.fromArray(st0.target); } else setCamera(camera, ctx, 'iso');
      controls.update();
      const compassEl = $('#v3dCompass', el);
      const upd = () => {
        const s = placeSun(ctx, state.month, state.hour);
        $('#v3dTime', el).textContent = fmtHour(state.hour).toUpperCase();
        $('#v3dHour', el).value = state.hour;
        $('#v3dMonth', el).value = state.month;
        $$('[data-season]', el).forEach((b) => b.classList.toggle('on', +b.dataset.season === seasonOf(state.month)));
        const sunlit = (() => { try { const F = shadeFrame(p); const polys = shadowPolys(p, F, s); return polys ? 1 - shadedShare(roofSamples(p, F).pts, polys) : 0; } catch (e) { return null; } })();
        $('#v3dInfo', el).innerHTML = `<b>21 ${MONTHS[state.month]}, ${fmtHour(state.hour)}</b><br>${s.el > 0 ? `Sun ${Math.round(s.el / DEG)}° high from the ${compassDir(s.az)}` : 'Sun below the horizon'}${sunlit != null ? `<br>Terrace in sunlight: <b>${Math.round(sunlit * 100)}%</b>` : ''}<br>${ctx.panels} panels on ${n0(p.design.floors) || 1}-floor building`;
        state.sun = s;
      };
      const drawCompass = () => {
        const dir = new THREE.Vector3().subVectors(controls.target, camera.position);
        const heading = Math.atan2(dir.x, -dir.z); // 0 = looking north
        const s = state.sun || { az: 0, el: -1 };
        const sa = s.az - heading;
        compassEl.innerHTML = `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" fill="#0b1626" stroke="#334155" stroke-width="2"/>
          <g transform="rotate(${(-heading / DEG).toFixed(1)} 32 32)"><path d="M32 8 L36 32 L32 30 L28 32Z" fill="#ef4444"/><path d="M32 56 L36 32 L32 34 L28 32Z" fill="#e2e8f0"/>
          <text x="32" y="7" font-size="7" fill="#ef4444" text-anchor="middle" font-weight="700">N</text><text x="58" y="34.5" font-size="6" fill="#cbd5e1" text-anchor="middle">E</text><text x="6" y="34.5" font-size="6" fill="#cbd5e1" text-anchor="middle">W</text><text x="32" y="62" font-size="6" fill="#cbd5e1" text-anchor="middle">S</text></g>
          ${s.el > 0 ? `<circle cx="${32 + 24 * Math.sin(sa)}" cy="${32 - 24 * Math.cos(sa)}" r="4.5" fill="#f59e0b"/>` : ''}<circle cx="32" cy="32" r="2.5" fill="#fff"/></svg>`;
      };
      upd();
      $$('[data-season]', el).forEach((b) => (b.onclick = () => { state.month = SEASONS[+b.dataset.season][1]; upd(); }));
      $('#v3dMonth', el).onchange = (e) => { state.month = +e.target.value; upd(); };
      const stopPlay3 = () => { if (state.timer) { clearInterval(state.timer); state.timer = null; } $('#v3dPlay', el).innerHTML = icon('play'); };
      $('#v3dHour', el).oninput = (e) => { stopPlay3(); state.hour = +e.target.value; upd(); };
      $('#v3dPlay', el).onclick = () => {
        if (state.timer) { stopPlay3(); return; }
        $('#v3dPlay', el).innerHTML = icon('pause');
        state.timer = setInterval(() => { state.hour = state.hour >= 19 ? 6 : Math.round((state.hour + 0.1) * 100) / 100; upd(); }, 80);
      };
      const snap = () => { renderer.render(ctx.scene, camera); return renderer.domElement.toDataURL('image/jpeg', 0.92); };
      const fileName = () => `${(p.customer.name || '3d').replace(/[^\w-]+/g, '_')}_3D.jpg`;
      $$('[data-a]', el).forEach((b) => (b.onclick = async () => {
        const a = b.dataset.a;
        if (a === 'image') { const blob = await (await fetch(snap())).blob(); download(blob, fileName()); }
        if (a === 'share') { const blob = await (await fetch(snap())).blob(); const how = await shareOrDownload(blob, fileName(), '3D design', `3D design of your solar plant by ${C.name}`); if (how === 'downloaded') toast('Image downloaded'); }
        if (a === 'panels') { state.panels = !state.panels; ctx.panelsGroup.visible = state.panels; b.classList.toggle('off', !state.panels); }
        if (a === 'top') { setCamera(camera, ctx, b.classList.toggle('on') ? 'top' : 'iso'); controls.target.set(0, ctx.H * 0.85, 0); controls.update(); }
        if (a === 'info') { state.info = !state.info; $('#v3dInfo', el).hidden = !state.info; b.classList.toggle('on', state.info); }
        if (a === 'hq') {
          state.hq = !state.hq; b.classList.toggle('on', state.hq);
          const camPos = camera.position.clone(), tgt = controls.target.clone();
          stage.innerHTML = '<div class="v3d-loading"><span class="spin"></span> Building…</div>';
          renderer.dispose(); controls.dispose();
          ctx = await buildScene(p, state.hq);
          stage.innerHTML = '';
          renderer = makeRenderer(stage.clientWidth, stage.clientHeight, true, state.hq);
          stage.appendChild(renderer.domElement);
          controls = new THREE.OrbitControls(camera, renderer.domElement);
          setupControls(); camera.position.copy(camPos); controls.target.copy(tgt); controls.update();
          ctx.panelsGroup.visible = state.panels;
          upd();
        }
      }));
      $('#v3dSave', el).onclick = () => {
        p.view3d = { month: state.month, hour: state.hour, cam: camera.position.toArray(), target: controls.target.toArray() };
        persist(p);
        toast('Saved. The PDF will use this 3D view.');
      };
      const onResize = () => { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
      window.addEventListener('resize', onResize);
      let raf = 0;
      const loop = () => { raf = requestAnimationFrame(loop); controls.update(); renderer.render(ctx.scene, camera); drawCompass(); };
      loop();
      live = { el, dispose: () => { stopPlay3(); cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); controls.dispose(); renderer.dispose(); } };
    } catch (e) {
      console.error(e);
      $('#v3dStage', el).innerHTML = `<div class="v3d-loading">${esc(e.message)}</div>`;
      live = { el, dispose: () => {} };
    }
  }
  function close() {
    if (live) { live.dispose(); live.el.remove(); live = null; }
    $$('.v3d').forEach((x) => x.remove());
    document.body.style.overflow = '';
  }

  /* ---------- Still images for the PDF ---------- */
  // shots: [{ month, hour, view: 'iso' | 'top' | 'saved' }]
  async function snapshots(p, shots, w = 1400, h = 900) {
    await ensureThree();
    const ctx = await buildScene(p, true);
    const renderer = makeRenderer(w, h, true, true);
    const camera = new THREE.PerspectiveCamera(42, w / h, 0.5, 6000);
    const out = shots.map((s) => {
      if (s.view === 'saved' && p.view3d?.cam) { camera.position.fromArray(p.view3d.cam); camera.lookAt(new THREE.Vector3().fromArray(p.view3d.target)); }
      else setCamera(camera, ctx, s.view === 'top' ? 'top' : 'iso');
      placeSun(ctx, s.month, s.hour);
      renderer.render(ctx.scene, camera);
      return renderer.domElement.toDataURL('image/jpeg', 0.88);
    });
    renderer.dispose();
    return out;
  }

  return { open, close, snapshots, ensureThree };
})();
