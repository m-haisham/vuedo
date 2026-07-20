import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { vuedo } from "@vuedo/react/vite";
import path from "node:path";

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    vuedo({
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
