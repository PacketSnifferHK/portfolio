import { defineConfig } from "vite";

// base "./" makes every asset path relative, so the same build works at
// a custom domain root, a *.pages.dev address or a sub-folder.
export default defineConfig({
  base: "./",
  build: { target: "es2020", chunkSizeWarningLimit: 900 },
});
