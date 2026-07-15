import type { Plugin } from "vite";
import { registerDevServer } from "./dev-registry.js";
import { discoverTemplates, writeManifest } from "./manifest.js";

export interface PdfKitPluginOptions {
  /** Absolute (or cwd-relative) path to the folder of `.vue` templates. */
  templatesDir: string;
  /** Build output dir; must match Vite's `build.outDir`. Default: `dist`. */
  outDir?: string;
}

// Exported as `@hshm/vuedf/vite`. Two jobs:
//   • dev  — register the host's running Vite server so the core reuses it (§4.3 tier 2)
//   • build — add every template as an SSR entry and drop pdf-manifest.json (§4.4)
export function pdfKit(opts: PdfKitPluginOptions): Plugin {
  const outDir = opts.outDir ?? "dist";
  return {
    name: "hshm-vuedf",
    configureServer(server) {
      registerDevServer(server);
    },
    async config(_config, { command }) {
      if (command !== "build") return;
      const entries = await discoverTemplates(opts.templatesDir);
      return { build: { ssr: true, rollupOptions: { input: entries } } };
    },
    async closeBundle() {
      await writeManifest(opts.templatesDir, outDir);
    },
  };
}

export default pdfKit;
