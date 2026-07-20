import fs from "node:fs/promises";
import path from "node:path";
import type { ViteDevServer } from "vite";
import { pathToFileURL } from "node:url";
import type { Discovery, PdfManifest } from "./layout.js";

export type RenderMod = (
  mod: unknown,
  data: unknown,
  section?: string,
) => Promise<string>;

export interface VuedoRenderer {
  render(name: string, data: unknown, section?: string): Promise<string>;
  layoutOf(name: string): Promise<{ header?: string; footer?: string }>;
  resolveCss(): Promise<string>;
  close(): Promise<void>;
}

async function resolveCssFile(cssOutput: string): Promise<string> {
  try {
    return await fs.readFile(cssOutput, "utf-8");
  } catch {
    console.warn(`[vuedo] Failed to read CSS output from ${cssOutput}`);
    return "";
  }
}

// ---------------------------------------------------------------------------
// DevRenderer — uses a Vite dev server (consumer-provided or auto-created)
// ---------------------------------------------------------------------------

export function createDevRenderer(opts: {
  templatesDir: string;
  devServer?: ViteDevServer;
  cssOutput?: string;
  discoverLayouts: (dir: string) => Promise<Discovery>;
  renderMod: RenderMod;
}): VuedoRenderer {
  let discovery: Discovery | undefined;
  let ownedServer: ViteDevServer | undefined;

  async function getServer(): Promise<ViteDevServer> {
    if (opts.devServer) return opts.devServer;
    if (!ownedServer) {
      const { createServer } = await import("vite");
      ownedServer = await createServer({
        server: { middlewareMode: true },
        appType: "custom",
      });
    }
    return ownedServer;
  }

  async function ensure(): Promise<{
    render(name: string, data: unknown, section?: string): Promise<string>;
  }> {
    if (!discovery) {
      discovery = await opts.discoverLayouts(opts.templatesDir);
    }

    const server = await getServer();

    function urlFor(name: string): string {
      const file = discovery!.entries[name];
      if (!file) throw new Error(`Unknown template: ${name}`);
      return (
        "/" + path.relative(server.config.root, file).split(path.sep).join("/")
      );
    }

    return {
      async render(name, data, section) {
        const mod = await server.ssrLoadModule(urlFor(name));
        return opts.renderMod(mod, data, section);
      },
    };
  }

  return {
    async render(name, data, section) {
      const { render } = await ensure();
      return render(name, data, section);
    },
    async layoutOf(name) {
      await ensure();
      return discovery!.layouts[name] ?? {};
    },
    async resolveCss() {
      return opts.cssOutput ? resolveCssFile(opts.cssOutput) : "";
    },
    async close() {
      discovery = undefined;
      if (ownedServer) {
        await ownedServer.close();
        ownedServer = undefined;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// ProdRenderer — pre-compiled SSR modules from the build manifest
// ---------------------------------------------------------------------------

export function createProdRenderer(opts: {
  manifestPath: string;
  cssOutput: string;
  loadManifest: (path: string) => Promise<PdfManifest>;
  renderMod: RenderMod;
}): VuedoRenderer {
  let manifest: PdfManifest | undefined;
  let cssCache: string | null = null;

  async function ensure(): Promise<PdfManifest> {
    if (!manifest) manifest = await opts.loadManifest(opts.manifestPath);
    return manifest;
  }

  return {
    async render(name, data, section) {
      const m = await ensure();
      const modPath = m.entries[name];
      if (!modPath) throw new Error(`Unknown template: ${name}`);
      const mod = await import(pathToFileURL(modPath).href);
      return opts.renderMod(mod, data, section);
    },
    async layoutOf(name) {
      const m = await ensure();
      return m.layouts[name] ?? {};
    },
    async resolveCss() {
      if (cssCache !== null) return cssCache;
      cssCache = await resolveCssFile(opts.cssOutput);
      return cssCache;
    },
    async close() {
      manifest = undefined;
      cssCache = null;
    },
  };
}
