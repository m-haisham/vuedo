import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { pdfKit } from "@hshm/vuedf/vite";
import path from "node:path";

// Path A (§4.4): the host already has a Vite config, so the pdfKit plugin
// piggybacks on the normal `vite build` to compile every template under
// templatesDir as an SSR entry and drop pdf-manifest.json into dist/.
export default defineConfig({
  plugins: [
    vue(),
    pdfKit({ templatesDir: path.resolve("src/pdf-templates"), outDir: "dist" }),
  ],
  build: {
    outDir: "dist",
    assetsInlineLimit: 100_000_000,
  },
});
