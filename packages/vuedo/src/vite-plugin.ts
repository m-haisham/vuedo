import fs from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";
import { discoverLayouts } from "./discover.js";
import { writeManifest } from "./manifest.js";
import { generateTypes } from "./types.js";
import { inlineAssetsPlugin } from "./inline-assets.js";

export interface VuedoPluginOptions {
  /** Absolute (or cwd-relative) path to the folder of `.vue` templates. */
  templatesDir: string;
  /** Build output dir; must match Vite's `build.outDir`. Default: `dist`. */
  outDir?: string;
  /** Where to write the inferred types `.d.ts`. Default: `<cwd>/src/generated/vuedo.d.ts`. */
  typesOut?: string;
  /**
   * Path to the user's Tailwind v4 CSS entry (e.g. `assets/app.css`).
   * When given, the plugin compiles CSS via `ssrLoadModule` on every relevant
   * file change and writes the result to `<generated>/vuedo.css`.
   */
  cssEntry?: string;
}

export function vuedo(opts: VuedoPluginOptions): Plugin {
  const outDir = opts.outDir ?? "dist";
  const typesOut =
    opts.typesOut ?? path.resolve(process.cwd(), "src/generated/vuedo.d.ts");
  const cssEntry = opts.cssEntry ? path.resolve(opts.cssEntry) : undefined;
  const cssDevOut = cssEntry
    ? path.resolve(path.dirname(typesOut), "vuedo.css")
    : undefined;

  return {
    name: "vuedo",
    configureServer(server) {
      void generateTypes(opts.templatesDir, typesOut).catch(() => {});

      const watcher = server.watcher;
      watcher.add(opts.templatesDir);

      if (cssEntry && cssDevOut) {
        const cssPath = cssEntry.startsWith("/")
          ? cssEntry
          : "/" + path.relative(server.config.root, cssEntry);

        const writeCss = async () => {
          try {
            const mod = await server.ssrLoadModule(cssPath + "?inline");
            const css = (mod as { default?: string }).default ?? "";
            await fs.mkdir(path.dirname(cssDevOut), { recursive: true });
            await fs.writeFile(cssDevOut, css);
            console.log("[vuedo] Wrote CSS to", cssDevOut);
          } catch {
            console.warn("[vuedo] Failed to compile CSS from", cssEntry);
          }
        };

        void writeCss();

        watcher.on("change", (file) => {
          if (file === cssEntry || file.startsWith(opts.templatesDir)) {
            void writeCss();
          }
        });
      }

      const onChange = () =>
        void generateTypes(opts.templatesDir, typesOut).catch(() => {});
      watcher.on("add", (_file) => onChange());
      watcher.on("change", (_file) => onChange());
      watcher.on("unlink", (_file) => onChange());
    },
    async config(_userConfig, { command }) {
      if (command !== "build") return;
      const disc = await discoverLayouts(opts.templatesDir);
      return {
        plugins: [inlineAssetsPlugin()],
        build: { ssr: true, rollupOptions: { input: disc.entries } },
      };
    },
    async closeBundle() {
      await writeManifest(opts.templatesDir, outDir);
      await generateTypes(opts.templatesDir, typesOut);

      if (cssEntry) {
        await compileAndSaveCss(cssEntry, outDir);
      }
    },
  };
}

async function compileAndSaveCss(
  cssEntry: string,
  outDir: string,
): Promise<void> {
  const { createServer } = await import("vite");
  const tailwindcss = (await import("@tailwindcss/vite")).default;

  const server = await createServer({
    configFile: false,
    root: path.dirname(cssEntry),
    plugins: [tailwindcss()],
    server: { middlewareMode: true },
    appType: "custom",
    css: { devSourcemap: false },
  });

  try {
    const cssPath =
      "/" + path.relative(server.config.root, path.resolve(cssEntry));
    const mod = await server.ssrLoadModule(cssPath + "?inline");
    const css = (mod as { default?: string }).default ?? "";

    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.resolve(outDir, "vuedo.css"), css);
  } finally {
    await server.close();
  }
}

export default vuedo;
