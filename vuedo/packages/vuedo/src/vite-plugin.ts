import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { Plugin } from "vite";
import { registerDevServer } from "./dev-registry.js";
import { discoverLayouts } from "./discover.js";
import { writeManifest } from "./manifest.js";
import { generateTypes } from "./types.js";
import { inlineAssetsPlugin, inlineCssAssets } from "./inline-assets.js";
import { compileTailwindCss } from "./tailwind.js";

export interface VuedoPluginOptions {
  /** Absolute (or cwd-relative) path to the folder of `.vue` templates. */
  templatesDir: string;
  /** Build output dir; must match Vite's `build.outDir`. Default: `dist`. */
  outDir?: string;
  /** Where to write the inferred types `.d.ts`. Default: `<cwd>/src/generated/pdf-templates.d.ts`. */
  typesOut?: string;
  /**
   * Tailwind v4 support (on by default). On build, the plugin compiles Tailwind
   * to `<outDir>/app.css` so production reads it directly (no runtime scan). Pass
   * `false` to disable, or an object to override the entry / assets dir.
   */
  tailwind?: boolean | { input?: string; assetsDir?: string; minify?: boolean };
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

      const tailwind = opts.tailwind ?? true;
      if (tailwind !== false) {
        const assetsDir =
          (typeof tailwind === "object" && tailwind.assetsDir) ||
          path.resolve(opts.templatesDir, "..", "assets");
        const inputExplicit = typeof tailwind === "object" && !!tailwind.input;
        const input = inputExplicit
          ? (tailwind as { input: string }).input
          : path.join(assetsDir, "app.css");
        const css = await compileTailwindCss({
          input,
          warnOnMissingInput: inputExplicit,
          base: assetsDir,
          content: [
            { base: opts.templatesDir, pattern: "**/*.vue", negated: false },
          ],
          // Build output is production — minify unless explicitly disabled.
          minify:
            typeof tailwind === "object" && tailwind.minify !== undefined
              ? tailwind.minify
              : true,
        });
        const inlined = await inlineCssAssets(css, assetsDir);
        await mkdir(outDir, { recursive: true });
        await writeFile(path.resolve(outDir, "app.css"), inlined);
      }
    },
  };
}

export default vuedo;
