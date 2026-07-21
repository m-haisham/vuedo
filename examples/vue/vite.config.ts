import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { pandaf } from "@pandaf/vue/vite";
import path from "node:path";

export default defineConfig({
  plugins: [
    tailwindcss(),
    vue(),
    pandaf({
      templatesDir: path.resolve("templates"),
      outDir: "dist",
      cssEntry: "assets/app.css",
    }),
  ],
  build: {
    outDir: "dist",
    assetsInlineLimit: 100_000_000,
  },
});
