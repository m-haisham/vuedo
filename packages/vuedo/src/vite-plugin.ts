import path from "node:path";
import type { Plugin } from "vite";
import { registerDevServer } from "./dev-registry.js";
import { discoverLayouts } from "./discover.js";
import { writeManifest } from "./manifest.js";
import { generateTypes } from "./types.js";
import { inlineAssetsPlugin } from "./inline-assets.js";

export interface VuedoPluginOptions {
  /** Absolute (or cwd-relative) path to the folder of `.vue` templates. */
  templatesDir: string;
  /** Build output dir; must match Vite's `build.outDir`. Default: `dist`. */
  outDir?: string;
  /** Where to write the inferred types `.d.ts`. Default: `<cwd>/src/generated/pdf-templates.d.ts`. */
  typesOut?: string;
}

// Exported as `@hshm/vuedo/vite`. Two jobs:
//   • dev  — register the host's running Vite server so the core reuses it (§4.3 tier 2)
//   • build — compile every template as an SSR entry, write pdf-manifest.json,
//             and emit the inferred PdfTemplateProps types.
export function vuedo(opts: VuedoPluginOptions): Plugin {
  const outDir = opts.outDir ?? "dist";
  return {
    name: "vuedo",
    configureServer(server) {
      registerDevServer(server);
    },
    async config(_config, { command }) {
      if (command !== "build") return;
      const disc = await discoverLayouts(opts.templatesDir);
      return {
        plugins: [inlineAssetsPlugin()],
        build: { ssr: true, rollupOptions: { input: disc.entries } },
      };
    },
    async closeBundle() {
      await writeManifest(opts.templatesDir, outDir);
      const typesOut =
        opts.typesOut ??
        path.resolve(process.cwd(), "src/generated/pdf-templates.d.ts");
      await generateTypes(opts.templatesDir, typesOut);
    },
  };
}

export default vuedo;
