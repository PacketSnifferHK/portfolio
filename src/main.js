import "@fontsource-variable/archivo/standard.css";
import "./style.css";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger, SplitText);

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(pointer: fine)").matches;
const capture = new URLSearchParams(location.search).has("capture"); // used to record demo videos
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const ease = (t) => t * t * (3 - 2 * t);

// ---------- smooth scrolling ----------
let lenis = null;
if (!reduced && !capture) {
  lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
$$('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const id = a.getAttribute("href");
    const target = id === "#top" ? 0 : $(id);
    if (target === null) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { offset: id === "#homelab" ? window.innerHeight * 0.55 : -70, duration: 1.4 });
    else (id === "#top" ? window : target).scrollTo?.(0, 0) ?? target.scrollIntoView();
    if (id !== "#top" && target.focus) { target.setAttribute("tabindex", "-1"); target.focus({ preventScroll: true }); }
  });
});

// ---------- scroll position -> story position p ----------
// 0 hero · 1 thermal + exploded · 2 layers · 3 links out · 4 gone (projects onward)
const lab = $(".lab"), projects = $("#projects");
const SEG = [[0, 0.22, 0, 1], [0.22, 0.36, 1, 1], [0.36, 0.58, 1, 2], [0.58, 0.7, 2, 2], [0.7, 0.9, 2, 3], [0.9, 1, 3, 3]];
function storyP() {
  const vh = window.innerHeight;
  const r = lab.getBoundingClientRect();
  const lead = vh * 0.4;
  const s = clamp01((lead - r.top) / (r.height - vh + lead));
  let p = 0;
  for (const [a, b, from, to] of SEG) if (s >= a) p = from + (to - from) * clamp01((s - a) / (b - a));
  const pr = projects.getBoundingClientRect();
  return p + clamp01((vh - pr.top) / (vh * 0.75));
}

// ---------- beats of the homelab story ----------
const beats = $$(".beat");
const steps = $$(".lab-steps li");
function updateBeats(p) {
  beats.forEach((b, i) => {
    const d = p - (i + 1);
    const o = clamp01(1 - Math.abs(d) * 2.4 + 0.2);
    b.style.opacity = o.toFixed(3);
    b.style.transform = `translate3d(0, ${(-d * 46).toFixed(1)}px, 0)`;
    b.style.visibility = o < 0.01 ? "hidden" : "visible";
    b.inert = o < 0.5;
  });
  steps.forEach((s, i) => s.classList.toggle("on", Math.round(p) === i + 1 && p < 3.5));
}

// ---------- callouts: technical-drawing leader lines from the 3D parts ----------
const leaders = $("#leaders");
const labels = Object.fromEntries($$("#overlay [data-label]").map((el) => [el.dataset.label, el]));
const OFFSET = { gpu: [150, 70], cpu: [130, -80], ram: [-160, -90], ssd: [-170, 20], psu: [140, 60], fans: [-150, -40] };
const paths = {};
for (const key in OFFSET) {
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  c.setAttribute("r", "3.5");
  leaders.append(p, c);
  paths[key] = { p, c };
}
function placeLabels(pos) {
  const w = window.innerWidth, small = w < 900;
  for (const key in labels) {
    const el = labels[key], q = pos[key];
    el.style.opacity = q.v.toFixed(3);
    if (OFFSET[key]) {
      const { p, c } = paths[key];
      p.style.opacity = c.style.opacity = q.v.toFixed(3);
      if (q.v < 0.01) continue;
      let [dx, dy] = OFFSET[key];
      if (small) { dx *= 0.55; dy *= 0.7; }
      const lw = el.offsetWidth;
      if (q.x + dx + lw > w - 12) dx = -Math.abs(dx);
      if (q.x + dx - lw < 12 && dx < 0) dx = Math.abs(dx);
      if (small && q.x + dx + lw > w - 8) { el.style.opacity = "0"; p.style.opacity = c.style.opacity = "0"; continue; }
      const ex = q.x + dx, ey = q.y + dy, kx = q.x + dx * 0.45;
      p.setAttribute("d", `M${q.x.toFixed(1)},${q.y.toFixed(1)} L${kx.toFixed(1)},${ey.toFixed(1)} L${ex.toFixed(1)},${ey.toFixed(1)}`);
      c.setAttribute("cx", q.x.toFixed(1));
      c.setAttribute("cy", q.y.toFixed(1));
      el.classList.toggle("left", dx < 0);
      el.style.transform = `translate(${(dx < 0 ? ex - lw - 6 : ex + 6).toFixed(1)}px, ${(ey - el.offsetHeight / 2).toFixed(1)}px)`;
    } else if (q.v > 0.01) {
      const flip = q.x + el.offsetWidth + 14 > w;
      el.classList.toggle("flip", flip);
      el.style.transform = `translate(${(flip ? q.x - el.offsetWidth : q.x).toFixed(1)}px, ${(q.y - el.offsetHeight / 2).toFixed(1)}px)`;
    }
  }
}

// ---------- the 3D scene loads after the page is readable ----------
const canvas = $("#stage");
let stage = null;
async function bootScene() {
  try {
    const { createScene } = await import("./scene.js");
    stage = createScene(canvas, { reducedMotion: reduced });
  } catch (err) {
    console.warn("3D scene unavailable:", err);
  }
  if (!stage) { document.documentElement.classList.add("no-webgl"); return; }
  canvas.classList.add("ready");
}
if ("requestIdleCallback" in window) requestIdleCallback(bootScene, { timeout: 600 });
else setTimeout(bootScene, 200);

// watch the frame rate for the first few seconds of 3D; slow devices get a lighter render
let fpsStart = 0, fpsFrames = 0, fpsChecked = capture;
function watchFps(now) {
  if (fpsChecked || !stage) return;
  if (!fpsStart) { fpsStart = now; return; }
  fpsFrames++;
  if (now - fpsStart > 2500) {
    fpsChecked = true;
    if ((fpsFrames * 1000) / (now - fpsStart) < 32) stage.lowerQuality();
  }
}

function frame(now) {
  watchFps(now);
  const p = storyP();
  updateBeats(p);
  const visible = p < 3.98;
  canvas.style.opacity = stage ? String(1 - clamp01(p - 3)) : "0";
  document.body.classList.toggle("past-lab", !visible);
  if (stage && visible) {
    stage.render(p, now);
    placeLabels(stage.labelPositions());
  } else if (!visible) {
    for (const k in labels) labels[k].style.opacity = "0";
    for (const k in paths) paths[k].p.style.opacity = paths[k].c.style.opacity = "0";
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- type: the name and the section headings ----------
document.fonts.ready.then(() => {
  if (reduced) return;
  const name = new SplitText(".name-line", { type: "chars", mask: "chars", aria: "none" });
  $(".name").setAttribute("aria-label", "Harsh Kapoor");
  $$(".name-line").forEach((l) => l.setAttribute("aria-hidden", "true"));
  gsap.from(name.chars, { yPercent: 115, duration: 1.15, ease: "expo.out", stagger: 0.035, delay: 0.1 });
  gsap.from([".status", ".lede", ".actions", ".legend"], { opacity: 0, y: 14, duration: 0.9, ease: "power3.out", stagger: 0.08, delay: 0.45 });
  $$(".reveal").forEach((h) => {
    const s = new SplitText(h, { type: "lines,words", mask: "lines" });
    gsap.from(s.words, { yPercent: 110, duration: 1, ease: "expo.out", stagger: 0.04, scrollTrigger: { trigger: h, start: "top 85%", once: true } });
  });
});

// ---------- project cards stack as you scroll ----------
if (!reduced) {
  const cards = $$(".card");
  cards.forEach((card, i) => {
    const next = cards[i + 1];
    if (!next) return;
    gsap.to(card, {
      scale: 0.93, "--shade": 0.55, ease: "none",
      scrollTrigger: { trigger: next, start: "top 85%", end: "top 20%", scrub: true },
    });
  });
  gsap.from(".timeline li", { opacity: 0, x: -16, duration: 0.8, ease: "power3.out", stagger: 0.12, scrollTrigger: { trigger: ".timeline", start: "top 80%", once: true } });
}

// ---------- magnetic buttons (mouse only) ----------
if (finePointer && !reduced) {
  $$(".magnetic").forEach((el) => {
    const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" });
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - r.left - r.width / 2) * 0.22);
      yTo((e.clientY - r.top - r.height / 2) * 0.32);
    });
    el.addEventListener("pointerleave", () => { xTo(0); yTo(0); });
  });
}

// ---------- thermal portrait ----------
const portrait = $(".portrait");
portrait?.addEventListener("click", () => {
  const on = portrait.getAttribute("aria-pressed") !== "true";
  portrait.setAttribute("aria-pressed", String(on));
  portrait.setAttribute("aria-label", on ? "Show my regular photo" : "Show me through a thermal camera");
  portrait.querySelector(".portrait-hint").textContent = on ? "Tap for the regular photo" : "Tap for the thermal view";
});

// ---------- contact form: send without leaving the page ----------
const form = $(".form");
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = form.querySelector("button");
  let note = form.querySelector(".form-note");
  if (!note) {
    note = document.createElement("p");
    note.className = "form-note";
    note.setAttribute("role", "status");
    form.append(note);
  }
  btn.disabled = true;
  btn.textContent = "Sending…";
  try {
    const r = await fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error(String(r.status));
    form.reset();
    note.textContent = "Message sent. I’ll reply to the email you gave.";
  } catch {
    note.textContent = "That didn’t send. Check your connection and try again, or message me on LinkedIn.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Send message";
  }
});

window.addEventListener("load", () => ScrollTrigger.refresh());
