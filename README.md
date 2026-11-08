# Harsh Kapoor: portfolio

My portfolio. It opens on the old gaming PC that runs my homelab, modelled from scratch in three.js and lit like a product shot. As you scroll, a thermal-camera scan line sweeps down the case and turns the render into a heat image, the parts pull apart into an exploded view with technical-drawing callouts, and the virtual layers (Proxmox, the docker VM, the AI container) rise out of it.

**Live:** https://harshops.com

## Stack

- [Vite](https://vite.dev) build; plain HTML, CSS and JavaScript (no framework)
- [three.js](https://threejs.org) for the scene: procedural models, a custom shader that blends the physical render into a thermal ramp along a moving scan line, bloom
- [GSAP](https://gsap.com) (ScrollTrigger, SplitText) for text reveals and the stacking project cards, [Lenis](https://lenis.darkroom.engineering) for smooth scrolling
- Archivo variable font (width and weight axes), self-hosted through Fontsource
- Cloudflare builds and hosts it on every push to `main`; GitHub Actions checks that every push installs, passes `npm audit` and builds

All versions are pinned exactly in `package.json`, and `package-lock.json` is committed, so a build in a few years produces the same site.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve the build
```

## How it's put together

| File | What it does |
|---|---|
| `index.html` | All the content. Edit text here. |
| `src/scene.js` | The 3D PC, the thermal shader, the exploded view, the layers and links, and five keyframes (hero, machine, layers, production, gone) |
| `src/main.js` | Maps scroll position to the story, places the callouts, loads the 3D after the page is readable, text reveals, stacking cards, the portrait toggle and the contact form |
| `src/style.css` | Design tokens (the heat ramp) and layout |
| `public/img`, `public/docs` | Images (WebP) and PDFs |

Care taken for real visitors:
- Text shows immediately; the 3D loads afterwards and fades in.
- Slow devices are detected in the first seconds and get a lighter render (lower resolution, no glow).
- `prefers-reduced-motion` turns off smooth scrolling, idle animation and reveals.
- Without WebGL the page falls back to a static heat glow; without JavaScript every section is still readable.
- Passes an axe accessibility scan; keyboard focus is visible and the tab order follows the page.

## Deploying

Hosted on Cloudflare Workers (static assets only, no server code), connected to this repo. `wrangler.jsonc` tells Cloudflare to serve the built `dist/` folder. Build settings in the dashboard:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

Every push to `main` deploys. `public/_headers` sets the security headers (CSP, no framing, HSTS, nosniff) and long caching for the hashed files in `/assets`. If the domain changes, update the `og:image` URL in `index.html`. Asset paths are relative (`base: "./"` in `vite.config.js`), so the build works on any address.
