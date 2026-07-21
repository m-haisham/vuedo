import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { pandaf } from "@pandaf/react/vite";
import path from "node:path";

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
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
