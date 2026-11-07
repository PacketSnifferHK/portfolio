# Harsh Kapoor: portfolio

My portfolio site. The centrepiece is a scroll-driven 3D tour of my homelab: the old gaming PC that runs it opens up, the GPU heats up while it runs a local model, and the virtual layers (Proxmox, the docker VM, the AI container) rise out of it, colored like a thermal camera.

**Live:** https://harashkapoor.github.io/portfolio/

## Stack

- [Vite](https://vite.dev) for the build, plain HTML, CSS and JavaScript (no framework)
- [three.js](https://threejs.org) for the 3D scene, with bloom post-processing
- Archivo variable font, self-hosted through Fontsource
- GitHub Actions builds and deploys to GitHub Pages on every push to `main`

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the build
```

## How the 3D scroll works

- `src/scene.js` builds the PC from simple shapes and defines five keyframes (hero, one machine, layers, production, rest). Each keyframe sets the camera, how open the case is, the GPU heat, and which layers are visible.
- `src/main.js` maps scroll position to a point between keyframes: each `[data-key]` block in `index.html` holds its keyframe and blends to the next as it leaves the screen.
- Labels are HTML elements positioned each frame from 3D anchor points, so they stay sharp and readable.
- Respects `prefers-reduced-motion` (no idle animation) and falls back to a static background when WebGL isn't available.

## Editing content

All text is in `index.html`. Images are in `public/img/` (WebP), PDFs in `public/docs/`.

## Deploying

One-time: repo **Settings → Pages → Source: GitHub Actions**. After that, every push to `main` deploys.

For a custom domain, add it under **Settings → Pages → Custom domain** and point DNS at GitHub Pages. Asset paths are relative (`base: "./"` in `vite.config.js`), so the same build works on both addresses.
