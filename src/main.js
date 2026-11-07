import "@fontsource-variable/archivo/standard.css";
import "./style.css";
import { createScene } from "./scene.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.getElementById("stage");
const snap = new URLSearchParams(location.search).has("capture"); // used to record the demo video
const stage = createScene(canvas, { reducedMotion });
if (!stage) document.documentElement.classList.add("no-webgl");

// ---------- scroll -> scene position ----------
// Each [data-key] block is one keyframe. The scene holds a keyframe while its
// block is on screen and blends to the next one as the block leaves.
const blocks = [...document.querySelectorAll("[data-key]")];
function target() {
  const mid = window.innerHeight * 0.55;
  let s = 0;
  for (const el of blocks) {
    const r = el.getBoundingClientRect();
    const key = Number(el.dataset.key);
    if (r.top <= mid) {
      const p = (mid - r.top) / Math.max(1, r.height);
      s = key + (key === 4 ? 0 : smooth((p - 0.62) / 0.38));
    }
  }
  return Math.min(4, s);
}
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// ---------- labels that follow the 3D parts ----------
const labels = Object.fromEntries([...document.querySelectorAll("[data-label]")].map((el) => [el.dataset.label, el]));
function placeLabels() {
  const pos = stage.labelPositions();
  for (const key in labels) {
    const p = pos[key], el = labels[key];
    el.style.opacity = p.v.toFixed(3);
    if (p.v > 0.01) {
      // near the right edge, put the text on the left of its dot
      const flip = p.x + el.offsetWidth + 12 > window.innerWidth;
      el.classList.toggle("flip", flip);
      el.style.transform = `translate(${p.x.toFixed(1)}px, ${(p.y - el.offsetHeight / 2).toFixed(1)}px)${flip ? " translateX(-100%)" : ""}`;
    }
  }
}

if (stage) {
  let s = target(), prev = performance.now();
  const loop = (now) => {
    const t = target();
    // ease toward the scroll position at the same speed whatever the frame rate
    const dt = Math.min(0.1, (now - prev) / 1000);
    prev = now;
    s = reducedMotion || snap ? t : s + (t - s) * (1 - Math.exp(-dt * 5));
    stage.render(s, now);
    placeLabels();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// ---------- contact form: send without leaving the page ----------
const form = document.querySelector(".form");
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
    if (!r.ok) throw new Error();
    form.reset();
    note.textContent = "Message sent. I’ll reply to the email you gave.";
  } catch {
    note.textContent = "That didn’t send. Check your connection and try again, or message me on LinkedIn.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Send message";
  }
});
