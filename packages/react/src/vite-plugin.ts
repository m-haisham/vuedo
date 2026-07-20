import fs from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";
import { discoverLayouts } from "./discover.js";
import { writeManifest } from "./manifest.js";
import { generateTypes } from "./types.js";
import { inlineAssetsPlugin, buildPreviewHtml, type PaperSize } from "@vuedo/core";
import { renderComponent, renderNamedComponent, type TemplateModule } from "./render-component.js";
import { getVitePort, resolvePluginOpts, type VuedoPluginOptions } from "@vuedo/core";

export type { VuedoPluginOptions };

export function vuedo(opts: VuedoPluginOptions): Plugin {
  const { outDir, typesOut, cssEntry, cssDevOut } = resolvePluginOpts(opts);

  const previewEnabled =
    opts.preview !== undefined && opts.preview !== false;
  const previewBase =
    opts.preview === true || typeof opts.preview === "boolean"
      ? "/__vuedo"
      : (opts.preview?.basePath ?? "/__vuedo");
  const defaultPaperSize: PaperSize =
    opts.preview === true || typeof opts.preview === "boolean"
      ? "a4"
      : ((opts.preview as any)?.defaultPaperSize ?? "a4");

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

  async function ssrLoadAndRender(
    server: import("vite").ViteDevServer,
    templateName: string,
    data: unknown,
    section: string = "body",
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
    if (section === "body") return renderComponent(mod, data);
    return renderNamedComponent(mod, section, data);
  }

  async function loadAndCheckExports(
    server: import("vite").ViteDevServer,
    templateName: string,
  ): Promise<{ hasHeader: boolean; hasFooter: boolean }> {
    try {
      const disc = await getDiscovery();
      const file = disc.entries[templateName];
      if (!file) return { hasHeader: false, hasFooter: false };
      const root = server.config.root;
      const rel = path.relative(root, file);
      const url = rel.startsWith("..")
        ? "/@fs/" + file
        : "/" + rel.split(path.sep).join("/");
      const mod = await server.ssrLoadModule(url);
      const m = mod as TemplateModule;
      return {
        hasHeader: typeof m.Header === "function",
        hasFooter: typeof m.Footer === "function",
      };
    } catch {
      return { hasHeader: false, hasFooter: false };
    }
  }

  return {
    name: "vuedo",
    configureServer(server) {
      void generateTypes(opts.templatesDir, typesOut).catch(() => {});

      const watcher = server.watcher;
      watcher.add(opts.templatesDir);

      const onTemplateChange = async () => {
        discovery = undefined;
        await generateTypes(opts.templatesDir, typesOut).catch(() => {});
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

            // Check for named exports in the body file for React-style templates
            const exports = await loadAndCheckExports(server, layout.body);
            const effectiveHeader = layout.header ?? (exports.hasHeader ? layout.body : undefined);
            const effectiveFooter = layout.footer ?? (exports.hasFooter ? layout.body : undefined);

            const body = await ssrLoadAndRender(server, layout.body, {});
            const header = effectiveHeader
              ? effectiveHeader === layout.body
                ? await renderNamedComponent(
                    await server.ssrLoadModule(
                      "/" + path.relative(server.config.root, disc.entries[layout.body]).split(path.sep).join("/"),
                    ),
                    "Header",
                    {},
                  )
                : await ssrLoadAndRender(server, effectiveHeader, {}, "Header")
              : null;
            const footer = effectiveFooter
              ? effectiveFooter === layout.body
                ? await renderNamedComponent(
                    await server.ssrLoadModule(
                      "/" + path.relative(server.config.root, disc.entries[layout.body]).split(path.sep).join("/"),
                    ),
                    "Footer",
                    {},
                  )
                : await ssrLoadAndRender(server, effectiveFooter, {}, "Footer")
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
