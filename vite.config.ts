import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  // App source lives under src/ so the repository ROOT can hold the committed
  // production build (index.html + assets). GitHub Pages for this repo is
  // configured "deploy from branch main, folder /" (legacy), which serves the
  // repo root directly — the root therefore must contain the BUILT app, not
  // the Vite source entry (a source index.html at / is what caused the blank
  // white page: /src/main.tsx 404s / wrong MIME on github.io).
  root: "src",
  publicDir: "../public",
  // relative base so the built app works under any GitHub Pages subpath (e.g. /T-E-S-T/)
  base: "./",
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
