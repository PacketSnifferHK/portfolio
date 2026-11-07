import { defineConfig } from "vite";

// base "./" makes every asset path relative, so the same build works at
// https://harashkapoor.github.io/portfolio/ and at a custom domain root.
export default defineConfig({
  base: "./",
  build: { target: "es2020", chunkSizeWarningLimit: 900 },
});
