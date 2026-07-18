import fs from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";
import { discoverLayouts } from "./discover.js";
import { writeManifest } from "./manifest.js";
import { generateTypes } from "./types.js";
import { inlineAssetsPlugin } from "./inline-assets.js";
import { renderComponent } from "./render-component.js";
import { buildPreviewHtml, type PaperSize } from "./preview.js";

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
   * file change and writes the result to `<.vuedo>/vuedo.css`.
   */
  cssEntry?: string;
  /**
   * Preview dev-server middleware.
   * When enabled, registers `/__vuedo/preview/:template` on the Vite dev server
   * for live preview with hot-reload. Set to `true` to enable with defaults.
   */
  preview?:
    | boolean
    | {
        /** Base path for preview routes. Default: `/__vuedo`. */
        basePath?: string;
        /** Default paper size for previews. Default: `a4`. */
        defaultPaperSize?: PaperSize;
      };
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function vuedo(opts: VuedoPluginOptions): Plugin {
  const outDir = opts.outDir ?? "dist";
  const typesOut =
    opts.typesOut ?? path.resolve(process.cwd(), "src/generated/vuedo.d.ts");
  const cssEntry = opts.cssEntry ? path.resolve(opts.cssEntry) : undefined;
  const cssDevOut = cssEntry
    ? path.resolve(process.cwd(), ".vuedo", "vuedo.css")
    : undefined;

  const previewEnabled =
    opts.preview !== undefined && opts.preview !== false;
  const previewBase =
    opts.preview === true || typeof opts.preview === "boolean"
      ? "/__vuedo"
      : (opts.preview?.basePath ?? "/__vuedo");
  const defaultPaperSize: PaperSize =
    opts.preview === true || typeof opts.preview === "boolean"
      ? "a4"
      : (opts.preview?.defaultPaperSize ?? "a4");

  let discovery: Awaited<ReturnType<typeof discoverLayouts>> | undefined;
  let discoveryCache: Promise<void> | undefined;

  async function getDiscovery() {
    if (!discovery) {
      const p = discoverLayouts(opts.templatesDir);
      discoveryCache ??= p.then((d) => { discovery = d; });
      await discoveryCache;
    }
    return discovery!;
  }

  async function ssrRenderSection(
    server: import("vite").ViteDevServer,
    templateName: string,
    data: unknown,
  ): Promise<string> {
    const disc = await getDiscovery();
    const file = disc.entries[templateName];
    if (!file) throw new Error("Unknown template: " + templateName);
    const root = server.config.root;
    const rel = path.relative(root, file);
    const url = rel.startsWith("..")
      ? "/@fs/" + file
      : "/" + rel.split(path.sep).join("/");
    const mod = await server.ssrLoadModule(url);
    return renderComponent(mod, data);
  }

  /** Best-effort Vite dev server port for the WebSocket HMR client URL. */
  function getVitePort(server: import("vite").ViteDevServer): number | undefined {
    // In middleware mode or when not listening, httpServer may not be present.
    const addr = server.httpServer?.address();
    if (addr && typeof addr === "object") return addr.port;
    // Fall back to the configured port.
    return server.config.server.port;
  }

  return {
    name: "vuedo",
    configureServer(server) {
      void generateTypes(opts.templatesDir, typesOut).catch(() => {});

      const watcher = server.watcher;
      watcher.add(opts.templatesDir);

      // -----------------------------------------------------------------------
      // File-watcher: re-generate types on every template add/remove/change,
      // re-compile CSS on template/CSS changes, and notify HMR clients.
      // -----------------------------------------------------------------------

      const onTemplateChange = async () => {
        discovery = undefined;
        await generateTypes(opts.templatesDir, typesOut).catch(() => {});

        // Broadcast custom reload event to all WebSocket clients (Vite's HMR
        // clients + our preview page's raw WebSocket connections).
        try {
          server.ws.send({
            type: "custom",
            event: "vuedo:reload",
            data: {},
          });
        } catch {
          /* Vite WebSocket may not be available in middleware-only mode */
        }
      };

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
          } catch {
            /* silently retry next change */
          }
        };

        void writeCss();

        watcher.on("change", (file: string) => {
          if (file === cssEntry || file.startsWith(opts.templatesDir)) {
            void writeCss();
            void onTemplateChange();
          }
        });
      } else {
        watcher.on("change", () => void onTemplateChange());
      }

      watcher.on("add", () => void onTemplateChange());
      watcher.on("unlink", () => void onTemplateChange());

      // -----------------------------------------------------------------------
      // Preview middleware
      // -----------------------------------------------------------------------

      if (!previewEnabled) return;

      const vitePort = getVitePort(server);

      server.middlewares.use(
        previewBase + "/preview",
        async (req, res, next) => {
          if (req.method !== "GET") return next();

          const qIndex = (req.url ?? "").indexOf("?");
          const pathname =
            qIndex >= 0 ? (req.url ?? "").slice(0, qIndex) : (req.url ?? "");
          const templateName = pathname.replace(/^\//, "").replace(/-/g, ".");
          if (!templateName) return next();

          try {
            const disc = await getDiscovery();
            const layout = disc.layouts[templateName];
            if (!layout) {
              res.statusCode = 404;
              res.end("Template not found: " + templateName);
              return;
            }

            const body = await ssrRenderSection(server, layout.body, {});
            const header =
              layout.header
                ? await ssrRenderSection(server, layout.header, {})
                : null;
            const footer =
              layout.footer
                ? await ssrRenderSection(server, layout.footer, {})
                : null;

            const sections = [
              header
                ? '<div class="vuedo-header">' + header + "</div>"
                : "",
              '<div class="vuedo-body">' + body + "</div>",
              footer
                ? '<div class="vuedo-footer">' + footer + "</div>"
                : "",
            ].join("\n");

            // Compile Tailwind CSS via the running Vite server.
            let css = "";
            if (cssEntry) {
              try {
                const cssPath = cssEntry.startsWith("/")
                  ? cssEntry
                  : "/" + path.relative(server.config.root, cssEntry);
                const mod = await server.ssrLoadModule(cssPath + "?inline");
                css = (mod as { default?: string }).default ?? "";
              } catch {
                /* CSS may not be configured; proceed without it */
              }
            }
            const html = await buildPreviewHtml(sections, {
              paperSize: defaultPaperSize,
              css,
              vitePort,
            });

            res.statusCode = 200;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(html);
          } catch (err) {
            console.error("[vuedo] Preview error:", err);
            res.statusCode = 500;
            res.end("Preview error: " + String(err));
          }
        },
      );
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
