import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { vuedo } from "@hshm/vuedo/vite";
import path from "node:path";

// Path A (§4.4): the host already has a Vite config, so the vuedo plugin
// piggybacks on the normal `vite build` to compile every template under
// templatesDir as an SSR entry and drop pdf-manifest.json into dist/.
export default defineConfig({
  plugins: [
    vue(),
    vuedo({ templatesDir: path.resolve("templates"), outDir: "dist" }),
  ],
  build: {
    outDir: "dist",
    assetsInlineLimit: 100_000_000,
  },
});
