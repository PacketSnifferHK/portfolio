// The homelab, drawn as a thermal image.
// One gaming PC (the Proxmox host) that opens up as you scroll: the GPU heats up,
// the virtual layers rise out of it, and links go out to the phone, backups and GitHub.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

// ---------- heat ramp (same stops as the CSS --heat-* tokens) ----------
const RAMP = [
  [0.0, new THREE.Color("#1d1546")],
  [0.3, new THREE.Color("#5a2a88")],
  [0.55, new THREE.Color("#c42f7b")],
  [0.8, new THREE.Color("#ff7a1a")],
  [1.0, new THREE.Color("#ffe9a8")],
];
export function heat(t, out = new THREE.Color()) {
  t = Math.min(1, Math.max(0, t));
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP[i][0]) {
      const [t0, c0] = RAMP[i - 1], [t1, c1] = RAMP[i];
      return out.copy(c0).lerp(c1, (t - t0) / (t1 - t0));
    }
  }
  return out.copy(RAMP[RAMP.length - 1][1]);
}

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

// ---------- keyframes: one per chapter of the page ----------
// cam/target: camera; spin: idle rotation; open: side panel off; gpu: GPU heat;
// layers: virtual layers risen; net: outside links; caseFade; dim: page content takes over
const KEYS = [
  { cam: [6.4, 2.3, 8.2], target: [0, 0.1, 0], spin: 1, open: 0, gpu: 0.5, layers: 0, net: 0, caseFade: 0, dim: 0 },
  { cam: [8.4, 1.1, 1.4], target: [-0.4, -0.1, 0.1], spin: 0, open: 1, gpu: 0.97, layers: 0, net: 0, caseFade: 0, dim: 0 },
  { cam: [8.2, 7.2, 8.8], target: [0, 3.1, 0], spin: 0, open: 1, gpu: 0.85, layers: 1, net: 0, caseFade: 0.55, dim: 0 },
  { cam: [11.5, 8.6, 13.8], target: [0.6, 4.6, -0.6], spin: 0, open: 1, gpu: 0.8, layers: 1, net: 1, caseFade: 0.55, dim: 0 },
  { cam: [9.5, 4.5, 12.5], target: [0, 1.6, 0], spin: 1, open: 0.3, gpu: 0.5, layers: 0.6, net: 0, caseFade: 0.2, dim: 1 },
];

function mixKeys(s) {
  const i = Math.min(KEYS.length - 2, Math.max(0, Math.floor(s)));
  const t = ease(clamp01(s - i));
  const a = KEYS[i], b = KEYS[i + 1], o = {};
  for (const k in a) o[k] = Array.isArray(a[k]) ? a[k].map((v, j) => lerp(v, b[k][j], t)) : lerp(a[k], b[k], t);
  return o;
}

// ---------- small builders ----------
function part(geo, h, { fill = 0.16, edge = 1 } = {}) {
  // a component: translucent fill + bright edges, both coloured by heat
  const g = new THREE.Group();
  const fillMat = new THREE.MeshBasicMaterial({ color: heat(h), transparent: true, opacity: fill, depthWrite: false, side: THREE.DoubleSide });
  const edgeMat = new THREE.LineBasicMaterial({ color: heat(h), transparent: true, opacity: edge });
  g.add(new THREE.Mesh(geo, fillMat));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), edgeMat));
  g.userData = { fillMat, edgeMat, baseFill: fill, baseEdge: edge, h };
  return g;
}
function setHeat(p, h, fade = 1) {
  heat(h, p.userData.fillMat.color);
  heat(h, p.userData.edgeMat.color);
  p.userData.fillMat.opacity = p.userData.baseFill * fade;
  p.userData.edgeMat.opacity = p.userData.baseEdge * fade;
}
function fan(radius, h) {
  const g = new THREE.Group();
  const ring = part(new THREE.CylinderGeometry(radius, radius, 0.08, 40, 1, true), h, { fill: 0.05 });
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const blades = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const b = part(new THREE.BoxGeometry(radius * 0.82, 0.12, 0.012), h, { fill: 0.25 });
    b.position.x = radius * 0.42;
    const holder = new THREE.Group();
    holder.rotation.z = (i / 7) * Math.PI * 2;
    b.rotation.x = 0.5;
    holder.add(b);
    blades.add(holder);
  }
  g.add(blades);
  g.userData = { ring, blades };
  return g;
}

export function createScene(canvas, { reducedMotion = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  const small = () => window.innerWidth < 900;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, small() ? 1.5 : 2));
  // three.js clears render targets with the colour already converted to sRGB, and
  // OutputPass converts again, so the page background came out washed-out lavender.
  // Pre-linearise once more so the final pixel is exactly #0d0a1c.
  const bg = new THREE.Color(0x0d0a1c);
  renderer.setClearColor(new THREE.Color().setRGB(...bg.toArray(), THREE.SRGBColorSpace), 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0d0a1c, 16, 34);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);

  const world = new THREE.Group();
  scene.add(world);
  const pc = new THREE.Group();
  world.add(pc);

  // ----- the case (x = width, y = height, z = depth; front faces +z) -----
  const W = 2.2, H = 4.6, D = 4.8;
  const caseShell = part(new THREE.BoxGeometry(W, H, D), 0.3, { fill: 0.07, edge: 0.95 });
  pc.add(caseShell);
  const glass = part(new THREE.PlaneGeometry(D - 0.2, H - 0.2), 0.3, { fill: 0.1, edge: 0.8 });
  glass.rotation.y = Math.PI / 2;
  glass.position.x = W / 2 + 0.01;
  pc.add(glass);

  const parts = {};
  parts.board = part(new THREE.BoxGeometry(0.05, 3.7, 3.9), 0.14, { fill: 0.14 });
  parts.board.position.set(-W / 2 + 0.12, 0.25, 0.1);
  parts.cpu = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const fin = part(new THREE.BoxGeometry(0.72, 0.022, 0.95), 0.5, { fill: 0.2 });
    fin.position.y = i * 0.075;
    parts.cpu.add(fin);
  }
  parts.cpu.position.set(-0.55, 0.95, 0.55);
  parts.ram = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const s = part(new THREE.BoxGeometry(0.42, 1.0, 0.04), 0.32, { fill: 0.25 });
    s.position.z = i * 0.12;
    parts.ram.add(s);
  }
  parts.ram.position.set(-0.68, 1.2, -0.45);
  parts.gpu = new THREE.Group();
  const gpuBody = part(new THREE.BoxGeometry(0.95, 0.32, 3.0), 0.9, { fill: 0.2 });
  parts.gpu.add(gpuBody);
  parts.gpuFans = [fan(0.42, 0.9), fan(0.42, 0.9)];
  parts.gpuFans.forEach((f, i) => {
    f.rotation.x = Math.PI / 2;
    f.position.set(0, -0.2, i === 0 ? 0.7 : -0.7);
    parts.gpu.add(f);
  });
  parts.gpu.position.set(-0.5, -0.35, 0.25);
  parts.ssd = part(new THREE.BoxGeometry(0.03, 0.22, 0.8), 0.45, { fill: 0.3 });
  parts.ssd.position.set(-W / 2 + 0.17, 0.25, 1.35);
  parts.psu = part(new THREE.BoxGeometry(1.9, 0.85, 1.7), 0.3, { fill: 0.14 });
  parts.psu.position.set(0, -H / 2 + 0.5, -D / 2 + 1.0);
  parts.frontFans = [1.25, 0, -1.25].map((y) => {
    const f = fan(0.62, 0.15);
    f.position.set(0, y + 0.3, D / 2 - 0.15);
    pc.add(f);
    return f;
  });
  Object.values(parts).forEach((p) => p.isObject3D && pc.add(p));

  // airflow: particles drift front to back, warming as they cross the GPU
  const AIR = small() ? 140 : 260;
  const airGeo = new THREE.BufferGeometry();
  const airPos = new Float32Array(AIR * 3), airCol = new Float32Array(AIR * 3), airSeed = new Float32Array(AIR);
  for (let i = 0; i < AIR; i++) {
    airPos[i * 3] = (Math.random() - 0.5) * (W - 0.5);
    airPos[i * 3 + 1] = (Math.random() - 0.5) * (H - 0.8) + 0.2;
    airPos[i * 3 + 2] = (Math.random() - 0.5) * D;
    airSeed[i] = 0.6 + Math.random() * 0.8;
  }
  airGeo.setAttribute("position", new THREE.BufferAttribute(airPos, 3));
  airGeo.setAttribute("color", new THREE.BufferAttribute(airCol, 3));
  const airMat = new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  const air = new THREE.Points(airGeo, airMat);
  pc.add(air);

  // ----- virtual layers (Proxmox -> VM + LXC -> containers) -----
  const layers = new THREE.Group();
  world.add(layers);
  const pve = part(new THREE.BoxGeometry(4.6, 0.1, 4.6), 0.3, { fill: 0.12 });
  const vm = part(new THREE.BoxGeometry(2.3, 0.08, 3.8), 0.4, { fill: 0.14 });
  const lxc = part(new THREE.BoxGeometry(1.6, 0.08, 2.0), 0.85, { fill: 0.18 });
  vm.position.set(-1.0, 0, 0);
  lxc.position.set(1.35, 0, 0.6);
  layers.add(pve, vm, lxc);
  const apps = [];
  for (let i = 0; i < 14; i++) {
    const c = part(new THREE.BoxGeometry(0.36, 0.36, 0.36), 0.35 + ((i * 37) % 10) / 22, { fill: 0.22 });
    c.position.set(-1.55 + (i % 3) * 0.55, 0.25, -1.5 + Math.floor(i / 3) * 0.62);
    c.userData.phase = i * 0.7;
    vm.add(c);
    apps.push(c);
  }
  const ollama = part(new THREE.OctahedronGeometry(0.3), 1, { fill: 0.3 });
  ollama.position.set(0, 0.45, 0);
  lxc.add(ollama);

  // GPU -> LXC: the card is shared into the AI container
  const beamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]);
  const beamMat = new THREE.LineDashedMaterial({ color: heat(0.95), dashSize: 0.18, gapSize: 0.12, transparent: true });
  const beam = new THREE.Line(beamGeo, beamMat);
  world.add(beam);

  // ----- outside links: phone (Tailscale), Backblaze B2, GitHub -----
  const net = new THREE.Group();
  world.add(net);
  const nodes = [
    { key: "phone", pos: new THREE.Vector3(4.0, 5.2, 0.6), h: 0.55 },
    { key: "b2", pos: new THREE.Vector3(2.4, 7.4, -3.6), h: 0.7 },
    { key: "github", pos: new THREE.Vector3(-1.2, 8.0, -3.4), h: 0.62 },
  ].map((n) => {
    const m = part(new THREE.IcosahedronGeometry(0.32, 0), n.h, { fill: 0.25 });
    m.position.copy(n.pos);
    net.add(m);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-1, 4.6, 0), n.pos.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, 2.2, 0)), n.pos);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)), new THREE.LineBasicMaterial({ color: heat(n.h), transparent: true }));
    net.add(line);
    const packets = [0, 0.33, 0.66].map((o) => {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: heat(0.98), transparent: true }));
      p.userData.offset = o;
      net.add(p);
      return p;
    });
    return { ...n, mesh: m, curve, line, packets };
  });

  // ----- label anchors (screen positions are read by main.js) -----
  const anchors = {
    cpu: { obj: parts.cpu, at: new THREE.Vector3(0, 1.0, 0) },
    gpu: { obj: parts.gpu, at: new THREE.Vector3(0.4, 0.1, -1.0) },
    ssd: { obj: parts.ssd, at: new THREE.Vector3(0, 0, 0) },
    psu: { obj: parts.psu, at: new THREE.Vector3(0.9, 0.2, 0.6) },
    pve: { obj: pve, at: new THREE.Vector3(2.3, 0, 2.3) },
    vm: { obj: vm, at: new THREE.Vector3(-1.15, 0.5, 1.9) },
    lxc: { obj: lxc, at: new THREE.Vector3(0.8, 0.3, 1.0) },
    phone: { obj: nodes[0].mesh, at: new THREE.Vector3(0, 0.45, 0) },
    b2: { obj: nodes[1].mesh, at: new THREE.Vector3(0, 0.45, 0) },
    github: { obj: nodes[2].mesh, at: new THREE.Vector3(0, 0.45, 0) },
  };

  // ----- post: bloom makes the hot parts glow -----
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.12);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    camera.aspect = w / h;
    // on wide screens push the machine right of the text column
    if (w >= 900) camera.setViewOffset(w, h, -w * 0.22, 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  const tmp = new THREE.Vector3(), tmpC = new THREE.Color();
  let idle = 0, last = performance.now(), state = mixKeys(0);

  function render(s, now = performance.now()) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const k = (state = mixKeys(s));
    const t = now / 1000;

    // camera (pulled back a little on phones so the whole case fits)
    const far = small() ? 1.35 : 1;
    camera.position.set(k.cam[0] * far, k.cam[1] * (small() ? 1.08 : 1), k.cam[2] * far);
    // phones: hero text sits at the bottom, so raise the machine into the top half
    const lift = small() ? lerp(-1.9, 0.6, clamp01(state.open + state.dim)) : 0;
    camera.lookAt(k.target[0], k.target[1] + lift, k.target[2]);

    // slow turntable when idle; settles to face the camera when a chapter needs it
    if (!reducedMotion) idle += dt * 0.28;
    let a = ((idle + Math.PI) % (Math.PI * 2)) - Math.PI;
    pc.rotation.y = a * k.spin;
    layers.rotation.y = pc.rotation.y;
    net.rotation.y = pc.rotation.y;

    // side panel slides out and fades
    glass.position.x = W / 2 + 0.01 + k.open * 2.4;
    glass.position.y = k.open * 0.6;
    setHeat(glass, 0.3, (1 - k.open) * (1 - k.caseFade));
    setHeat(caseShell, 0.3, 1 - k.caseFade * 0.75);

    // heat: the GPU runs the model, the CPU follows, the rest stays cool
    const flicker = reducedMotion ? 0 : Math.sin(t * 7.3) * 0.02 + Math.sin(t * 2.1) * 0.03;
    const g = clamp01(k.gpu + flicker);
    const inside = 1 - k.caseFade * 0.5;
    parts.gpu.children.forEach((c) => c.userData.fillMat && setHeat(c, g, inside));
    parts.gpuFans.forEach((f) => {
      f.traverse((c) => c.userData && c.userData.fillMat && setHeat(c, g * 0.95, inside));
      if (!reducedMotion) f.userData.blades.rotation.z += dt * (6 + g * 22);
    });
    parts.cpu.children.forEach((c, i) => setHeat(c, clamp01(0.3 + g * 0.35 - i * 0.012), inside));
    parts.ram.children.forEach((c) => setHeat(c, 0.28 + g * 0.1, inside));
    setHeat(parts.board, 0.14 + g * 0.08, inside);
    setHeat(parts.ssd, 0.4 + g * 0.1, inside);
    setHeat(parts.psu, 0.3 + g * 0.15, inside);
    parts.frontFans.forEach((f) => {
      f.traverse((c) => c.userData && c.userData.fillMat && setHeat(c, 0.12, inside));
      if (!reducedMotion) f.userData.blades.rotation.z += dt * 5;
    });

    // airflow
    const speed = reducedMotion ? 0 : 0.9 + g * 1.6;
    for (let i = 0; i < AIR; i++) {
      let z = airPos[i * 3 + 2] - dt * speed * airSeed[i];
      if (z < -D / 2) z += D;
      airPos[i * 3 + 2] = z;
      const warm = clamp01((D / 2 - z) / D) * (0.25 + g * 0.75);
      heat(0.08 + warm * 0.95, tmpC);
      airCol[i * 3] = tmpC.r; airCol[i * 3 + 1] = tmpC.g; airCol[i * 3 + 2] = tmpC.b;
    }
    airGeo.attributes.position.needsUpdate = true;
    airGeo.attributes.color.needsUpdate = true;
    airMat.opacity = 0.85 * inside;

    // layers rise out of the case
    const L = k.layers;
    layers.position.y = lerp(0, 3.4, L);
    layers.scale.setScalar(lerp(0.4, 1, L));
    layers.visible = L > 0.01;
    setHeat(pve, 0.3, L);
    setHeat(vm, 0.42, L);
    vm.position.y = lerp(0, 1.0, L);
    lxc.position.y = lerp(0, 1.0, L);
    setHeat(lxc, 0.5 + g * 0.4, L);
    apps.forEach((c) => {
      const pulse = reducedMotion ? 0 : (Math.sin(t * 1.4 + c.userData.phase) + 1) * 0.12;
      setHeat(c, c.userData.h + pulse, L);
      c.position.y = 0.25 + (reducedMotion ? 0 : Math.sin(t * 1.4 + c.userData.phase) * 0.04);
    });
    setHeat(ollama, g, L);
    if (!reducedMotion) ollama.rotation.y += dt * 1.2;

    // GPU -> AI container beam
    parts.gpu.getWorldPosition(tmp);
    const top = lxc.getWorldPosition(new THREE.Vector3());
    beam.geometry.setFromPoints([tmp.clone(), top]);
    beam.computeLineDistances();
    beamMat.opacity = L * 0.9;
    beam.visible = L > 0.05;
    if (!reducedMotion) beamMat.dashOffset = -t * 0.6;

    // outside links
    const N = k.net;
    net.visible = N > 0.01;
    nodes.forEach((n, j) => {
      setHeat(n.mesh, n.h, N);
      if (!reducedMotion) n.mesh.rotation.y += dt * 0.6;
      n.line.material.opacity = N * 0.7;
      n.packets.forEach((p) => {
        const u = reducedMotion ? p.userData.offset : (t * 0.22 + p.userData.offset + j * 0.11) % 1;
        p.position.copy(n.curve.getPoint(u));
        p.material.opacity = N;
      });
    });

    canvas.style.opacity = String(lerp(1, 0.32, k.dim));
    composer.render();
  }

  // where each label should sit on screen, plus how visible its chapter is
  function labelPositions() {
    const k = state, out = {};
    const w = window.innerWidth, h = window.innerHeight;
    const show = {
      cpu: k.open * (1 - k.layers), gpu: k.open * (1 - k.layers), ssd: k.open * (1 - k.layers), psu: k.open * (1 - k.layers),
      pve: k.layers * (1 - k.net) * (1 - k.dim), vm: k.layers * (1 - k.dim), lxc: k.layers * (1 - k.dim),
      phone: k.net, b2: k.net, github: k.net,
    };
    for (const key in anchors) {
      const { obj, at } = anchors[key];
      tmp.copy(at);
      obj.localToWorld(tmp);
      tmp.project(camera);
      out[key] = { x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h, v: tmp.z < 1 ? show[key] : 0 };
    }
    return out;
  }

  return { render, labelPositions, resize };
}
