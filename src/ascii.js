// Portrait → ASCII on hover (tap on touch screens).
// The photo is sampled into a grid; each cell becomes a character by brightness.
// It spreads in from where the pointer entered, and characters near the pointer scramble.
const RAMP = " .:-=+*#%@";
const NOISE = "01<>/\\{}[]$#*+=-_";

export function asciiPortrait(button, { reduced = false } = {}) {
  const img = button.querySelector("img");
  const canvas = button.querySelector("canvas");
  if (!img || !canvas) return;
  const ctx = canvas.getContext("2d");
  const COLS = 60;
  let rows = COLS, cells = null, size = 0, dpr = 1;
  let on = false, t = 0, raf = 0, last = 0;
  let origin = { x: 0.5, y: 0.5 }, pointer = null;

  function sample() {
    const off = document.createElement("canvas");
    off.width = COLS; off.height = rows;
    const o = off.getContext("2d", { willReadFrequently: true });
    o.drawImage(img, 0, 0, COLS, rows);
    const d = o.getImageData(0, 0, COLS, rows).data;
    const n = COLS * rows, lum = new Float32Array(n);
    for (let i = 0; i < n; i++) lum[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
    // stretch contrast between the 6th and 97th percentile so the face, not the backdrop, uses the full ramp
    const sorted = Float32Array.from(lum).sort();
    const lo = sorted[Math.floor(n * 0.06)], hi = sorted[Math.floor(n * 0.97)];
    cells = new Float32Array(n);
    for (let i = 0; i < n; i++) cells[i] = Math.pow(Math.min(1, Math.max(0, (lum[i] - lo) / (hi - lo || 1))), 0.75);
  }
  function fit() {
    size = button.clientWidth;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.height = Math.round(size * dpr);
  }

  function draw(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    t = reduced ? (on ? 1 : 0) : Math.min(1, Math.max(0, t + (on ? dt / 0.55 : -dt / 0.35)));
    button.style.setProperty("--ascii", t.toFixed(3));
    const cw = size / COLS, ch = size / rows;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0d0a1c";
    ctx.fillRect(0, 0, size, size);
    ctx.font = `600 ${Math.round(ch * 1.05)}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const reach = t * 1.6; // the reveal grows out from the entry point
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = cells[r * COLS + c];
        const nx = (c + 0.5) / COLS, ny = (r + 0.5) / rows;
        if (Math.hypot(nx - origin.x, ny - origin.y) > reach) continue;
        let ch_ = RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))];
        let color = `rgba(239, 233, 248, ${(0.35 + v * 0.65).toFixed(2)})`;
        if (pointer && !reduced) {
          const near = Math.hypot(nx - pointer.x, ny - pointer.y);
          if (near < 0.11) {
            ch_ = NOISE[(Math.random() * NOISE.length) | 0];
            color = near < 0.05 ? "#ffe9a8" : "#ff7a1a";
          }
        }
        if (ch_ === " ") continue;
        ctx.fillStyle = color;
        ctx.fillText(ch_, (c + 0.5) * cw, (r + 0.5) * ch);
      }
    }
    if (on || t > 0) raf = requestAnimationFrame(draw);
    else raf = 0;
  }
  const start = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(draw); } };
  const rel = (e) => {
    const b = button.getBoundingClientRect();
    return { x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height };
  };
  function set(next, e) {
    if (!cells) return;
    on = next;
    if (on && e) origin = rel(e);
    button.setAttribute("aria-pressed", String(on));
    start();
  }

  const ready = () => { fit(); sample(); };
  if (img.complete && img.naturalWidth) ready(); else img.addEventListener("load", ready, { once: true });
  window.addEventListener("resize", () => { if (cells) fit(); });

  const hover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (hover) {
    button.addEventListener("pointerenter", (e) => set(true, e));
    button.addEventListener("pointermove", (e) => { pointer = rel(e); });
    button.addEventListener("pointerleave", () => { pointer = null; set(false); });
  }
  // touch and keyboard: toggle
  button.addEventListener("click", (e) => {
    if (hover && e.detail > 0) return; // mouse clicks are already handled by hover
    origin = e.detail > 0 ? rel(e) : { x: 0.5, y: 0.5 };
    set(!on);
  });
}
