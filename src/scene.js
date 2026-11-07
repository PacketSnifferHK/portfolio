// The homelab: my old gaming PC, modelled from scratch and lit like a product shot.
// Scrolling sweeps a thermal-camera scan line down the case (the render turns into a heat
// image), pulls the parts apart into an exploded view, then raises the virtual layers out
// of it and draws the links to my phone, backups and GitHub.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

// ---------- palette (same stops as the CSS --heat-* tokens) ----------
const RAMP_HEX = ["#1d1546", "#5a2a88", "#c42f7b", "#ff7a1a", "#ffe9a8"];
const RAMP_T = [0, 0.3, 0.55, 0.8, 1];
const RAMP = RAMP_HEX.map((h) => new THREE.Color(h));
export function heat(t, out = new THREE.Color()) {
  t = Math.min(1, Math.max(0, t));
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP_T[i]) return out.copy(RAMP[i - 1]).lerp(RAMP[i], (t - RAMP_T[i - 1]) / (RAMP_T[i] - RAMP_T[i - 1]));
  }
  return out.copy(RAMP[RAMP.length - 1]);
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const ease = (t) => t * t * (3 - 2 * t);
const window01 = (p, a, b) => ease(clamp01((p - a) / (b - a)));

// ---------- keyframes along the scroll story ----------
// 0 hero (real render) · 1 thermal + exploded · 2 layers · 3 links out · 4 gone
const KEYS = [
  { cam: [7.9, 2.5, 11.2], target: [0, 0.15, 0], sway: 1, explode: 0, gpu: 0.42, layers: 0, net: 0, cool: 0, m: [1.72, -1.75] },
  { cam: [12.4, 2.8, 4.9], target: [1.0, -0.1, -0.25], sway: 0, explode: 1, gpu: 0.98, layers: 0, net: 0, cool: 0, m: [2.55, -2.6] },
  { cam: [9.2, 7.6, 10.2], target: [0, 3.0, 0], sway: 0, explode: 0, gpu: 0.88, layers: 1, net: 0, cool: 0.45, m: [2.0, -2.4] },
  { cam: [12.2, 9.4, 14.2], target: [0.6, 4.5, -0.6], sway: 0, explode: 0, gpu: 0.8, layers: 1, net: 1, cool: 0.45, m: [1.85, -2.6] },
  { cam: [12.2, 9.4, 14.2], target: [0.6, 4.5, -0.6], sway: 0, explode: 0, gpu: 0.6, layers: 1, net: 1, cool: 0.6, m: [1.85, -2.6] },
];
function mixKeys(p) {
  const i = Math.min(KEYS.length - 2, Math.max(0, Math.floor(p)));
  const t = ease(clamp01(p - i));
  const a = KEYS[i], b = KEYS[i + 1], o = {};
  for (const k in a) o[k] = Array.isArray(a[k]) ? a[k].map((v, j) => lerp(v, b[k][j], t)) : lerp(a[k], b[k], t);
  return o;
}

// ---------- thermal shader: injected into every physical material ----------
const G = {
  uScan: { value: 99 },   // world-space height of the scan line; everything above it is shown in thermal
  uBand: { value: 0 },    // brightness of the scan line itself
  uRamp: { value: RAMP.map((c) => new THREE.Vector3(c.r, c.g, c.b)) },
};
const THERMAL_FRAG = /* glsl */ `
  uniform float uScan; uniform float uBand; uniform float uHeat; uniform vec3 uRamp[5];
  varying vec3 vWPos;
  vec3 heatRamp(float t) {
    t = clamp(t, 0.0, 1.0);
    if (t < 0.3) return mix(uRamp[0], uRamp[1], t / 0.3);
    if (t < 0.55) return mix(uRamp[1], uRamp[2], (t - 0.3) / 0.25);
    if (t < 0.8) return mix(uRamp[2], uRamp[3], (t - 0.55) / 0.25);
    return mix(uRamp[3], uRamp[4], (t - 0.8) / 0.2);
  }`;
const THERMAL_APPLY = /* glsl */ `
  {
    float th = smoothstep(uScan - 0.02, uScan + 0.02, vWPos.y);
    float facing = abs(dot(normalize(normal), normalize(vViewPosition)));
    float h = uHeat * (0.7 + 0.3 * facing) + vWPos.y * 0.018 + sin(vWPos.z * 2.3 + vWPos.y * 1.7) * 0.012;
    vec3 tc = heatRamp(h) * (1.0 + smoothstep(0.78, 1.0, h) * 1.6);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, tc, th);
    gl_FragColor.a = mix(gl_FragColor.a, 1.0, th * 0.85);
    float band = 1.0 - smoothstep(0.0, 0.045, abs(vWPos.y - uScan));
    gl_FragColor.rgb += band * uBand * vec3(1.0, 0.72, 0.38) * 2.4;
  }`;

function thermal(material, h) {
  material.userData.heat = { value: h };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uScan = G.uScan;
    shader.uniforms.uBand = G.uBand;
    shader.uniforms.uRamp = G.uRamp;
    shader.uniforms.uHeat = material.userData.heat;
    shader.vertexShader = "varying vec3 vWPos;\n" + shader.vertexShader.replace(
      "#include <project_vertex>",
      "#include <project_vertex>\n  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;"
    );
    shader.fragmentShader = THERMAL_FRAG + "\n" + shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      "#include <opaque_fragment>\n" + THERMAL_APPLY
    );
  };
  return material;
}
function std(color, { metal = 0.5, rough = 0.5, h = 0.3, emissive = null, ei = 0, env = 0.7 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, envMapIntensity: env });
  if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = ei; m.userData.ei = ei; }
  return thermal(m, h);
}

// ---------- geometry helpers ----------
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const rbox = (x, y, z, r = 0.03) => new RoundedBoxGeometry(x, y, z, 3, r);
function place(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = geo.clone();
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
}
const mesh = (geo, mat) => new THREE.Mesh(geo, mat);
const at = (parent, m, x, y, z) => { m.position.set(x, y, z); parent.add(m); return m; };

// a case fan facing +z: square frame with a round throat, curved blades, hub, optional RGB ring
function fan(size, mats, { rgb = false } = {}) {
  const g = new THREE.Group();
  const s = size / 2, r = s * 0.92;
  const frame = new THREE.Shape();
  const c = s * 0.18;
  frame.moveTo(-s + c, -s); frame.lineTo(s - c, -s); frame.quadraticCurveTo(s, -s, s, -s + c);
  frame.lineTo(s, s - c); frame.quadraticCurveTo(s, s, s - c, s); frame.lineTo(-s + c, s);
  frame.quadraticCurveTo(-s, s, -s, s - c); frame.lineTo(-s, -s + c); frame.quadraticCurveTo(-s, -s, -s + c, -s);
  const hole = new THREE.Path(); hole.absarc(0, 0, r, 0, Math.PI * 2, true); frame.holes.push(hole);
  const fg = new THREE.ExtrudeGeometry(frame, { depth: size * 0.18, bevelEnabled: false, curveSegments: 28 });
  fg.translate(0, 0, -size * 0.09);
  g.add(mesh(fg, mats.plastic));
  const blades = new THREE.Group();
  const bl = new THREE.Shape();
  bl.moveTo(r * 0.22, -r * 0.08);
  bl.quadraticCurveTo(r * 0.6, -r * 0.22, r * 0.95, -r * 0.05);
  bl.quadraticCurveTo(r * 0.75, r * 0.2, r * 0.22, r * 0.14);
  const bg = new THREE.ExtrudeGeometry(bl, { depth: size * 0.01, bevelEnabled: false, curveSegments: 10 });
  const bladeGeos = [];
  for (let i = 0; i < 7; i++) bladeGeos.push(place(bg, 0, 0, 0, 0.32, 0, (i / 7) * Math.PI * 2));
  blades.add(mesh(mergeGeometries(bladeGeos), mats.blade));
  const hub = new THREE.CylinderGeometry(r * 0.24, r * 0.24, size * 0.12, 28);
  hub.rotateX(Math.PI / 2);
  blades.add(mesh(hub, mats.plastic));
  g.add(blades);
  if (rgb) {
    const ring = new THREE.TorusGeometry(r * 0.985, size * 0.012, 8, 64);
    ring.translate(0, 0, size * 0.09);
    g.add(mesh(ring, mats.rgb));
  }
  g.userData.blades = blades;
  return g;
}

// perforated steel for the front panel, drawn once on a canvas
function meshTexture() {
  const c = document.createElement("canvas");
  c.width = 288; c.height = 252;
  const x = c.getContext("2d");
  x.fillStyle = "#fff"; x.fillRect(0, 0, 288, 252);
  x.fillStyle = "#000";
  const r = 7.2, hw = r * Math.sqrt(3) / 2;
  for (let j = -1; j < 13; j++) for (let i = -1; i < 12; i++) {
    const cx = i * 24 + (j % 2 ? 12 : 0), cy = j * 21;
    x.beginPath();
    for (let a = 0; a < 6; a++) { const t = Math.PI / 6 + (a * Math.PI) / 3; x.lineTo(cx + r * Math.cos(t), cy + r * Math.sin(t)); }
    x.closePath(); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 9);
  return t;
}

export function createScene(canvas, { reducedMotion = false, small = () => window.innerWidth < 900 || window.innerHeight < 520 } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, small() ? 1.5 : 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  // three clears render targets with the colour already converted to sRGB and OutputPass
  // converts again, so pre-linearise once more to land exactly on the page's #0d0a1c
  const bg = new THREE.Color(0x0d0a1c);
  renderer.setClearColor(new THREE.Color().setRGB(...bg.toArray(), THREE.SRGBColorSpace), 1);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);

  // lights: cool key from the front, magenta rim from behind, violet glow inside the case
  scene.add(new THREE.HemisphereLight(0x8c7fd1, 0x0d0a1c, 0.35));
  const key = new THREE.DirectionalLight(0xf3eefe, 1.6);
  key.position.set(6, 9, 8);
  scene.add(key);
  const rim = new THREE.PointLight(0xc42f7b, 45, 0, 2);
  rim.position.set(-4.5, 0.6, -5.5);
  scene.add(rim);
  const rim2 = new THREE.PointLight(0x5a2a88, 60, 0, 2);
  rim2.position.set(5, -2, -6);
  scene.add(rim2);

  const world = new THREE.Group();
  scene.add(world);
  const pc = new THREE.Group();
  world.add(pc);
  const inner = new THREE.PointLight(0xb9ccff, 6, 4.5, 2);
  inner.position.set(0.3, 0.6, 0.6);
  pc.add(inner);

  // ---------- materials ----------
  const M = {
    steel: std(0x16141d, { metal: 0.85, rough: 0.38, h: 0.16 }),
    steelIn: std(0x100e16, { metal: 0.6, rough: 0.62, h: 0.16 }),
    front: std(0x1c1a24, { metal: 0.9, rough: 0.32, h: 0.14 }),
    pcb: std(0x15121c, { metal: 0.25, rough: 0.7, h: 0.32 }),
    sink: std(0x2b2834, { metal: 0.9, rough: 0.3, h: 0.5 }),
    fin: std(0x9b98a6, { metal: 1, rough: 0.28, h: 0.58 }),
    copper: std(0xb87333, { metal: 1, rough: 0.25, h: 0.62 }),
    gpu: std(0x1b1922, { metal: 0.55, rough: 0.38, h: 0.9 }),
    gpuPlate: std(0x2a2733, { metal: 0.85, rough: 0.3, h: 0.92 }),
    plastic: std(0x121117, { metal: 0.1, rough: 0.55, h: 0.2 }),
    blade: std(0x17151d, { metal: 0.1, rough: 0.45, h: 0.2 }),
    gpuBlade: std(0x17151d, { metal: 0.1, rough: 0.45, h: 0.85 }),
    ram: std(0x26232e, { metal: 0.85, rough: 0.3, h: 0.42 }),
    sleeve: std(0x1b1824, { metal: 0.1, rough: 0.82, h: 0.3 }),
    shroud: std(0x17151e, { metal: 0.75, rough: 0.42, h: 0.45 }),
    rgb: std(0x000000, { metal: 0, rough: 1, h: 0.25, emissive: 0xcfe0ff, ei: 2.4 }),
    rgbHot: std(0x000000, { metal: 0, rough: 1, h: 0.9, emissive: 0xdbe8ff, ei: 2.2 }),
    logo: std(0x000000, { metal: 0, rough: 1, h: 0.95, emissive: 0xf4f7ff, ei: 1.5 }),
  };
  const glassMat = thermal(new THREE.MeshPhysicalMaterial({
    color: 0x1a1726, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.22, envMapIntensity: 1.6, depthWrite: false,
  }), 0.12);
  const frontMat = thermal(new THREE.MeshStandardMaterial({ color: 0x1c1a24, metalness: 0.9, roughness: 0.35, alphaMap: meshTexture(), alphaTest: 0.5, side: THREE.DoubleSide }), 0.14);
  const emissives = [M.rgb, M.rgbHot, M.logo];

  // ---------- the case ----------
  const W = 2.3, H = 4.9, D = 4.9, T = 0.06;
  const parts = {};
  const add = (name, obj, parent = pc) => { parts[name] = obj; obj.userData.base = obj.position.clone(); parent.add(obj); return obj; };

  const shell = new THREE.Group();
  at(shell, mesh(rbox(T, H, D, 0.025), M.steel), -W / 2, 0, 0);
  const bottom = mesh(rbox(W, T, D, 0.025), M.steel); bottom.position.set(0, -H / 2, 0); shell.add(bottom);
  const back = mesh(rbox(W, H, T, 0.025), M.steelIn); back.position.set(0, 0, -D / 2); shell.add(back);
  // front trim frame around the mesh
  const trimGeos = [place(box(W, 0.12, 0.08), 0, H / 2 - 0.06, 0), place(box(W, 0.12, 0.08), 0, -H / 2 + 0.06, 0),
    place(box(0.1, H, 0.08), -W / 2 + 0.05, 0, 0), place(box(0.1, H, 0.08), W / 2 - 0.05, 0, 0)];
  const trim = mesh(mergeGeometries(trimGeos), M.front); trim.position.z = D / 2; shell.add(trim);
  // feet
  const feet = [];
  for (const [fx, fz] of [[-0.8, 1.9], [0.8, 1.9], [-0.8, -1.9], [0.8, -1.9]]) feet.push(place(new THREE.CylinderGeometry(0.13, 0.15, 0.12, 20), fx, -H / 2 - 0.08, fz));
  shell.add(mesh(mergeGeometries(feet), M.plastic));
  // rear: I/O and PCIe slot covers
  const rearGeos = [];
  for (let i = 0; i < 6; i++) rearGeos.push(place(box(0.9, 0.08, 0.02), 0.25, -0.2 - i * 0.16, -D / 2 - 0.035));
  rearGeos.push(place(box(0.42, 1.0, 0.02), -0.62, 1.7, -D / 2 - 0.035));
  shell.add(mesh(mergeGeometries(rearGeos), M.sink));
  add("shell", shell);

  const top = add("top", mesh(rbox(W, T, D, 0.025), M.steel));
  top.position.set(0, H / 2, 0); top.userData.base = top.position.clone();
  const front = add("front", mesh(new THREE.PlaneGeometry(W - 0.2, H - 0.24), frontMat));
  front.position.set(0, 0, D / 2 + 0.03); front.userData.base = front.position.clone();
  const glass = add("glass", mesh(rbox(0.02, H - 0.1, D - 0.1, 0.01), glassMat));
  glass.position.set(W / 2, 0, 0); glass.userData.base = glass.position.clone();

  // ---------- motherboard and what sits on it ----------
  const X0 = -W / 2 + 0.14; // board surface
  const board = new THREE.Group();
  at(board, mesh(box(0.04, 3.7, 3.9), M.pcb), X0 - 0.02, 0.35, -0.3);
  const slotGeos = [place(box(0.06, 0.07, 1.8), X0 + 0.03, -0.12, -1.0), place(box(0.06, 0.07, 1.8), X0 + 0.03, -1.05, -1.0),
    place(box(0.14, 0.85, 0.16), X0 + 0.07, 0.75, 1.55)];
  board.add(mesh(mergeGeometries(slotGeos), M.plastic));
  add("board", board);

  const vrm = new THREE.Group();
  vrm.add(mesh(mergeGeometries([place(rbox(0.24, 0.36, 1.25, 0.03), X0 + 0.12, 2.0, -0.55), place(rbox(0.24, 1.15, 0.34, 0.03), X0 + 0.12, 1.25, -1.6),
    place(rbox(0.3, 0.95, 0.6, 0.04), X0 + 0.15, 1.72, -2.0)]), M.sink));
  at(vrm, mesh(box(0.02, 0.6, 0.05), M.rgb), X0 + 0.31, 1.72, -1.68);
  add("vrm", vrm);

  const chipset = new THREE.Group();
  at(chipset, mesh(rbox(0.1, 0.75, 0.75, 0.03), M.sink), X0 + 0.05, -0.85, 0.9);
  at(chipset, mesh(box(0.02, 0.4, 0.04), M.logo), X0 + 0.11, -0.85, 0.9);
  add("chipset", chipset);

  const m2 = new THREE.Group();
  at(m2, mesh(rbox(0.07, 0.28, 1.0, 0.02), M.sink), X0 + 0.04, 0.38, -0.3);
  add("m2", m2);

  const ram = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    at(ram, mesh(rbox(0.5, 1.32, 0.05, 0.015), M.ram), X0 + 0.25, 1.1, 0.33 + i * 0.12);
    at(ram, mesh(box(0.05, 1.22, 0.052), M.rgb), X0 + 0.52, 1.1, 0.33 + i * 0.12);
  }
  add("ram", ram);

  // tower cooler: fin stack parallel to the board, copper heatpipes, fan on the intake side
  const cooler = new THREE.Group();
  const fins = [];
  for (let i = 0; i < 26; i++) fins.push(place(box(0.018, 1.3, 1.02), X0 + 0.38 + i * 0.031, 1.15, -0.55));
  cooler.add(mesh(mergeGeometries(fins), M.fin));
  const pipes = [];
  for (const [py, pz] of [[0.95, -0.75], [1.05, -0.35], [1.25, -0.75], [1.35, -0.35]]) {
    const pg = new THREE.CylinderGeometry(0.035, 0.035, 0.95, 12);
    pg.rotateZ(Math.PI / 2);
    pipes.push(place(pg, X0 + 0.66, py, pz));
  }
  cooler.add(mesh(mergeGeometries(pipes), M.copper));
  at(cooler, mesh(rbox(0.2, 0.55, 0.55, 0.03), M.copper), X0 + 0.1, 1.15, -0.55);
  at(cooler, mesh(rbox(0.03, 1.32, 1.04, 0.012), M.gpuPlate), X0 + 1.2, 1.15, -0.55);
  at(cooler, mesh(box(0.01, 0.06, 0.6), M.logo), X0 + 1.22, 1.15, -0.55);
  const coolFan = fan(1.2, M);
  coolFan.position.set(X0 + 0.78, 1.15, 0.05);
  coolFan.rotation.y = 0;
  cooler.add(coolFan);
  add("cooler", cooler);

  // GPU: fans face down toward the PSU shroud, backplate on top, lit logo on the edge facing the glass
  const gpu = new THREE.Group();
  const gx = X0 + 0.7, gy = -0.47, gz = -0.82;
  at(gpu, mesh(rbox(1.26, 0.42, 3.1, 0.06), M.gpu), gx, gy, gz);
  at(gpu, mesh(rbox(1.22, 0.05, 3.06, 0.02), M.gpuPlate), gx, gy + 0.24, gz);
  at(gpu, mesh(box(0.012, 0.06, 1.7), M.logo), gx + 0.635, gy + 0.02, gz + 0.3);
  at(gpu, mesh(box(0.012, 0.03, 2.8), M.rgbHot), gx + 0.635, gy - 0.16, gz);
  at(gpu, mesh(box(0.2, 0.08, 0.32), M.plastic), gx + 0.45, gy + 0.3, gz + 1.0);
  at(gpu, mesh(box(0.06, 0.62, 0.03), M.sink), gx - 0.3, gy + 0.05, -D / 2 + 0.08);
  const gpuFanMats = { ...M, blade: M.gpuBlade, plastic: M.gpu };
  const gpuFans = [-0.95, 0.05, 1.05].map((z) => {
    const f = fan(0.88, gpuFanMats);
    f.rotation.x = Math.PI / 2;
    f.position.set(gx, gy - 0.22, gz + z);
    gpu.add(f);
    return f;
  });
  add("gpu", gpu);

  const shroudGrp = new THREE.Group();
  at(shroudGrp, mesh(rbox(W - 0.14, 0.86, D - 0.55, 0.04), M.shroud), 0, -H / 2 + 0.49, -0.25);
  at(shroudGrp, mesh(box(0.01, 0.05, 2.2), M.rgb), (W - 0.14) / 2 + 0.002, -H / 2 + 0.62, -0.25);
  add("shroud", shroudGrp);

  const frontFans = new THREE.Group();
  const intake = [1.35, 0.0, -1.35].map((y) => {
    const f = fan(1.28, M, { rgb: true });
    f.position.set(0, y + 0.1, D / 2 - 0.16);
    frontFans.add(f);
    return f;
  });
  add("frontFans", frontFans);
  const rear = add("rearFan", fan(1.0, M, { rgb: true }));
  rear.position.set(0.1, 1.55, -D / 2 + 0.14); rear.userData.base = rear.position.clone();

  // sleeved cables: 24-pin, GPU power, CPU power
  const cable = (pts, r) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 48, r, 10);
  const cablesMat = M.sleeve.clone();
  thermal(cablesMat, 0.3);
  cablesMat.transparent = true;
  const cables = add("cables", mesh(mergeGeometries([
    cable([[X0 + 0.16, 0.75, 1.64], [X0 + 0.45, 0.72, 2.0], [X0 + 0.5, -0.4, 2.05], [X0 + 0.42, -1.05, 1.9]], 0.075),
    cable([[gx + 0.45, gy + 0.34, gz + 1.0], [gx + 0.5, gy + 0.55, gz + 1.7], [gx + 0.3, gy - 0.3, gz + 2.0], [gx + 0.2, -1.05, gz + 1.8]], 0.05),
    cable([[X0 + 0.12, 2.2, -1.95], [X0 + 0.4, 2.35, -1.6], [X0 + 0.5, 2.3, -0.2], [X0 + 0.3, 2.2, 0.4]], 0.04),
  ]), cablesMat));

  // exploded view: where each part goes (scaled by explode 0..1)
  const EXPLODE = {
    glass: [2.6, 0.5, 0], top: [0, 0.9, 0], front: [0, 0, 1.6], gpu: [1.6, -0.15, 0.1], cooler: [1.15, 0.2, 0],
    ram: [0.8, 0.35, 0.15], vrm: [0.35, 0.25, -0.1], m2: [0.55, 0, 0.1], chipset: [0.45, -0.15, 0.15],
    shroud: [0.7, -0.75, 0], frontFans: [0, 0, 0.85], rearFan: [0, 0, -0.9],
  };

  // ---------- airflow: particles visible in the thermal view ----------
  const AIR = small() ? 150 : 280;
  const airGeo = new THREE.BufferGeometry();
  const airPos = new Float32Array(AIR * 3), airCol = new Float32Array(AIR * 3), airSeed = new Float32Array(AIR);
  for (let i = 0; i < AIR; i++) {
    airPos[i * 3] = (Math.random() - 0.4) * (W - 0.4);
    airPos[i * 3 + 1] = (Math.random() - 0.5) * (H - 1.4) + 0.3;
    airPos[i * 3 + 2] = (Math.random() - 0.5) * D;
    airSeed[i] = 0.6 + Math.random() * 0.8;
  }
  airGeo.setAttribute("position", new THREE.BufferAttribute(airPos, 3));
  airGeo.setAttribute("color", new THREE.BufferAttribute(airCol, 3));
  const airMat = new THREE.PointsMaterial({ size: 0.045, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  pc.add(new THREE.Points(airGeo, airMat));

  // ---------- virtual layers (always shown as heat: they're software) ----------
  const glow = (geo, h, { fill = 0.14, edge = 1 } = {}) => {
    const g = new THREE.Group();
    const fm = new THREE.MeshBasicMaterial({ color: heat(h), transparent: true, opacity: fill, depthWrite: false, side: THREE.DoubleSide });
    const em = new THREE.LineBasicMaterial({ color: heat(h), transparent: true, opacity: edge });
    g.add(new THREE.Mesh(geo, fm));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), em));
    g.userData = { fm, em, fill, edge, h };
    return g;
  };
  const setGlow = (g, h, fade) => {
    heat(h, g.userData.fm.color); heat(h, g.userData.em.color);
    g.userData.fm.opacity = g.userData.fill * fade; g.userData.em.opacity = g.userData.edge * fade;
  };
  const layers = new THREE.Group();
  world.add(layers);
  const pve = glow(new THREE.BoxGeometry(4.8, 0.08, 4.8), 0.32, { fill: 0.1 });
  const vm = glow(new THREE.BoxGeometry(2.4, 0.07, 3.9), 0.42, { fill: 0.12 });
  const lxc = glow(new THREE.BoxGeometry(1.7, 0.07, 2.1), 0.85, { fill: 0.16 });
  vm.position.set(-1.05, 0, 0);
  lxc.position.set(1.4, 0, 0.6);
  layers.add(pve, vm, lxc);
  const apps = [];
  for (let i = 0; i < 14; i++) {
    const c = glow(new THREE.BoxGeometry(0.36, 0.36, 0.36), 0.36 + ((i * 37) % 10) / 22, { fill: 0.24 });
    c.position.set(-1.6 + (i % 3) * 0.56, 0.25, -1.55 + Math.floor(i / 3) * 0.64);
    c.userData.phase = i * 0.7;
    vm.add(c);
    apps.push(c);
  }
  const ollama = glow(new THREE.OctahedronGeometry(0.32), 1, { fill: 0.35 });
  ollama.position.set(0, 0.48, 0);
  lxc.add(ollama);
  const beamMat = new THREE.LineDashedMaterial({ color: heat(0.95), dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0 });
  const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), beamMat);
  world.add(beam);

  // ---------- links out: phone (Tailscale), Backblaze B2, GitHub ----------
  const net = new THREE.Group();
  world.add(net);
  const nodes = [
    { key: "phone", pos: new THREE.Vector3(4.1, 5.3, 0.7), h: 0.55 },
    { key: "b2", pos: new THREE.Vector3(2.5, 7.5, -3.7), h: 0.72 },
    { key: "github", pos: new THREE.Vector3(-1.2, 8.1, -3.5), h: 0.62 },
  ].map((n) => {
    const m = glow(new THREE.IcosahedronGeometry(0.34, 0), n.h, { fill: 0.3 });
    m.position.copy(n.pos);
    net.add(m);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-1, 4.7, 0), n.pos.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, 2.2, 0)), n.pos);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)), new THREE.LineBasicMaterial({ color: heat(n.h), transparent: true }));
    net.add(line);
    const packets = [0, 0.33, 0.66].map((o) => {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), new THREE.MeshBasicMaterial({ color: heat(0.98), transparent: true }));
      p.userData.offset = o;
      net.add(p);
      return p;
    });
    return { ...n, mesh: m, curve, line, packets };
  });

  // ---------- callout anchors (screen positions go to the page for the labels) ----------
  const anchor = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };
  const anchors = {
    gpu: anchor(gpu, gx + 0.64, gy, gz + 0.9),
    cpu: anchor(cooler, X0 + 1.22, 1.6, -0.55),
    ram: anchor(ram, X0 + 0.53, 1.75, 0.5),
    ssd: anchor(m2, X0 + 0.08, 0.38, 0.15),
    psu: anchor(shroudGrp, W / 2 - 0.07, -H / 2 + 0.75, 1.3),
    fans: anchor(frontFans, 0.5, 1.95, D / 2 - 0.1),
    pve: anchor(pve, 2.4, 0, 2.4),
    vm: anchor(vm, -1.2, 0.5, 1.95),
    lxc: anchor(lxc, 0.85, 0.3, 1.05),
    phone: anchor(nodes[0].mesh, 0, 0.45, 0),
    b2: anchor(nodes[1].mesh, 0, 0.45, 0),
    github: anchor(nodes[2].mesh, 0, 0.45, 0),
  };

  // ---------- post-processing ----------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.42, 0.68);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let VW = 1, VH = 1;
  function resize() {
    const w = (VW = window.innerWidth), h = (VH = window.innerHeight);
    // size the canvas to the *visible* viewport (iOS Safari's bars change it), not 100lvh
    renderer.setSize(w, h, true);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    camera.aspect = w / h;
    if (!small()) camera.setViewOffset(w, h, -w * 0.21, 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  const tmp = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Color();
  const born = performance.now();
  let last = born, k = mixKeys(0), cur = 0;

  // area: on phones, the free band of screen above the text box ({ top, bottom } in px)
  function render(p, now = performance.now(), area = null) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    cur = p;
    k = mixKeys(p);
    const t = now / 1000;
    const sm = small();

    // power-on moment when the page first loads: RGB and fans come up in sequence
    const age = (now - born) / 1000;
    const power = reducedMotion ? 1 : ease(clamp01((age - 0.3) / 1.4));
    emissives.forEach((m, i) => { m.emissiveIntensity = m.userData.ei * ease(clamp01(power * 1.6 - i * 0.25)); });

    // camera
    // phones are tall and narrow: pull back further and push the scene into the top half,
    // above the text panel (per-keyframe values in KEYS[].m)
    // phones and short screens: the camera distance (fitS) and the projection shift (offX/offY)
    // are adjusted every frame so the scene's real on-screen bounds fit the free area (see autoFit)
    const far = sm ? (area ? k.m[0] * fitS : k.m[0]) : 1;
    const lift = sm && !area ? k.m[1] : 0;
    if (sm && area) {
      camera.setViewOffset(VW, VH, offX, offY, VW, VH);
      camera.updateProjectionMatrix();
    }
    camera.position.set(k.target[0] + (k.cam[0] - k.target[0]) * far, k.target[1] + lift + (k.cam[1] - k.target[1]) * far, k.target[2] + (k.cam[2] - k.target[2]) * far);
    camera.lookAt(k.target[0], k.target[1] + lift, k.target[2]);

    // gentle product-turntable sway in the hero
    const sway = reducedMotion ? 0 : Math.sin(t * 0.32) * 0.42;
    pc.rotation.y = (sway - 0.12) * k.sway;
    layers.rotation.y = net.rotation.y = pc.rotation.y;

    // thermal scan: sweeps top to bottom between the hero and the first chapter
    const scan = window01(p, 0.05, 0.55);
    G.uScan.value = lerp(H / 2 + 0.25, -H / 2 - 0.35, scan);
    G.uBand.value = scan > 0 && scan < 1 ? 1 : 0;

    // exploded view
    const ex = k.explode;
    for (const name in EXPLODE) {
      const o = parts[name], d = EXPLODE[name];
      o.position.set(o.userData.base.x + d[0] * ex, o.userData.base.y + d[1] * ex, o.userData.base.z + d[2] * ex);
    }
    glassMat.opacity = 0.22 * (1 - ex);
    glass.visible = ex < 0.98;
    cablesMat.opacity = 1 - ex;
    cables.visible = ex < 0.98;

    // heat: the GPU runs the model, everything else follows; cools once the story moves to software
    const flicker = reducedMotion ? 0 : Math.sin(t * 7.3) * 0.015 + Math.sin(t * 2.1) * 0.025;
    const g = clamp01(k.gpu + flicker);
    const cool = 1 - k.cool;
    M.gpu.userData.heat.value = g * cool;
    M.gpuPlate.userData.heat.value = clamp01(g + 0.03) * cool;
    M.gpuBlade.userData.heat.value = g * 0.85 * cool;
    M.rgbHot.userData.heat.value = g * cool;
    M.fin.userData.heat.value = (0.4 + g * 0.25) * cool;
    M.copper.userData.heat.value = (0.45 + g * 0.25) * cool;
    M.sink.userData.heat.value = (0.38 + g * 0.18) * cool;
    M.ram.userData.heat.value = (0.33 + g * 0.1) * cool;
    M.pcb.userData.heat.value = (0.22 + g * 0.12) * cool;
    M.shroud.userData.heat.value = (0.32 + g * 0.15) * cool;

    // fans
    if (!reducedMotion) {
      const spin = dt * (3 + power * 9);
      intake.forEach((f) => (f.userData.blades.rotation.z += spin));
      rear.userData.blades.rotation.z -= spin;
      coolFan.userData.blades.rotation.z += spin * (0.8 + g * 0.6);
      gpuFans.forEach((f, i) => (f.userData.blades.rotation.z += dt * (2 + g * 26) * (i % 2 ? -1 : 1)));
    }

    // airflow (thermal view only)
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
    airMat.opacity = 0.85 * scan * (1 - ex * 0.6) * cool;

    // layers rise out of the case
    const L = k.layers;
    layers.visible = L > 0.01;
    layers.position.y = lerp(0, 3.5, L);
    layers.scale.setScalar(lerp(0.4, 1, L));
    setGlow(pve, 0.32, L);
    setGlow(vm, 0.42, L);
    vm.position.y = lxc.position.y = lerp(0, 1.0, L);
    setGlow(lxc, 0.55 + g * 0.35, L);
    apps.forEach((c) => {
      const pulse = reducedMotion ? 0 : (Math.sin(t * 1.4 + c.userData.phase) + 1) * 0.12;
      setGlow(c, c.userData.h + pulse, L);
      c.position.y = 0.25 + (reducedMotion ? 0 : Math.sin(t * 1.4 + c.userData.phase) * 0.04);
    });
    setGlow(ollama, g, L);
    if (!reducedMotion) ollama.rotation.y += dt * 1.2;
    gpu.getWorldPosition(tmp);
    tmp.set(gx, gy, gz);
    gpu.localToWorld(tmp);
    lxc.getWorldPosition(tmpB);
    beam.geometry.setFromPoints([tmp, tmpB]);
    beam.computeLineDistances();
    beamMat.opacity = L * 0.9;
    beam.visible = L > 0.05;
    if (!reducedMotion) beamMat.dashOffset = -t * 0.6;

    const N = k.net;
    net.visible = N > 0.01;
    nodes.forEach((n, j) => {
      setGlow(n.mesh, n.h, N);
      if (!reducedMotion) n.mesh.rotation.y += dt * 0.6;
      n.line.material.opacity = N * 0.7;
      n.packets.forEach((pk) => {
        const u = reducedMotion ? pk.userData.offset : (t * 0.22 + pk.userData.offset + j * 0.11) % 1;
        pk.position.copy(n.curve.getPoint(u));
        pk.material.opacity = N;
      });
    });

    if (sm && area) autoFit(area);
    composer.render();
  }

  // ---------- auto-fit for phones (portrait and landscape) ----------
  // Measure where the subject actually lands on screen and nudge distance and centring so it
  // sits inside the free area. Converges within a few frames and keeps adapting while the
  // story moves, the text box changes height, or the phone rotates.
  let fitS = 1, offX = 0, offY = 0;
  const fitBox = new THREE.Box3(), partBox = new THREE.Box3(), corner = new THREE.Vector3();
  function autoFit(a) {
    const L = k.layers, N = k.net;
    fitBox.makeEmpty();
    if (L < 0.5) fitBox.expandByObject(pc);
    else {
      // once the layers are up, frame them plus the top of the case, not the whole tower
      partBox.makeEmpty().expandByObject(pc);
      partBox.min.y = Math.max(partBox.min.y, partBox.max.y - 1.4);
      fitBox.union(partBox);
      fitBox.expandByObject(layers);
    }
    if (N > 0.5) nodes.forEach((n) => fitBox.expandByObject(n.mesh));
    if (fitBox.isEmpty()) return;
    camera.updateMatrixWorld();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? fitBox.max.x : fitBox.min.x, i & 2 ? fitBox.max.y : fitBox.min.y, i & 4 ? fitBox.max.z : fitBox.min.z).project(camera);
      const sx = (corner.x * 0.5 + 0.5) * VW, sy = (-corner.y * 0.5 + 0.5) * VH;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    const aw = Math.max(40, a.right - a.left), ah = Math.max(40, a.bottom - a.top);
    // bounding boxes of rotated parts overestimate a little, so allow a slight overfill
    const ratio = Math.max((x1 - x0) / (aw * 1.0), (y1 - y0) / (ah * 0.96));
    fitS = Math.min(5, Math.max(0.45, fitS * Math.pow(ratio, 0.3)));
    offX += ((x0 + x1) / 2 - (a.left + a.right) / 2) * 0.3;
    offY += ((y0 + y1) / 2 - (a.top + a.bottom) / 2) * 0.3;
    lastFit = { x0, x1, y0, y1 };
  }
  let lastFit = null;

  // where each label sits on screen, and how visible it should be right now
  function labelPositions() {
    const out = {}, w = window.innerWidth, h = window.innerHeight;
    // labels wait until their part has mostly arrived, so they never float over a moving scene
    const late = (v) => clamp01((v - 0.6) / 0.4);
    const ex = late(k.explode), ly = late(k.layers), nt = late(k.net);
    const show = {
      gpu: ex, cpu: ex, ram: ex, ssd: small() ? 0 : ex, psu: ex, fans: small() ? 0 : ex,
      pve: ly * (1 - nt), vm: ly, lxc: ly,
      phone: nt, b2: nt, github: nt,
    };
    const fade = 1 - clamp01((cur - 3.2) / 0.5);
    for (const key in anchors) {
      anchors[key].getWorldPosition(tmp);
      tmp.project(camera);
      out[key] = { x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h, v: tmp.z < 1 ? show[key] * fade : 0 };
    }
    return out;
  }

  // older phones: drop resolution and the glow pass if frames come too slowly
  let lowPower = false;
  function lowerQuality() {
    if (lowPower) return;
    lowPower = true;
    renderer.setPixelRatio(1);
    bloom.enabled = false;
    resize();
  }

  return { render, labelPositions, resize, lowerQuality, fitInfo: () => lastFit };
}
