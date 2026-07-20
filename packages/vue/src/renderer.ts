import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ViteDevServer } from "vite";
import { renderComponent } from "./render-component.js";
import { discoverLayouts, type Discovery } from "./discover.js";
import { loadManifest, type PdfManifest } from "./manifest.js";

export interface VuedoRenderer {
  render(name: string, data: unknown): Promise<string>;
  layoutOf(name: string): Promise<{ header?: string; footer?: string }>;
  resolveCss(): Promise<string>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// DevRenderer — uses a Vite dev server (consumer-provided or auto-created)
// ---------------------------------------------------------------------------

export function createDevRenderer(
  templatesDir: string,
  devServer?: ViteDevServer,
  cssOutput?: string,
): VuedoRenderer {
  let discovery: Discovery | undefined;
  let ownedServer: ViteDevServer | undefined;

  async function getServer(): Promise<ViteDevServer> {
    if (devServer) return devServer;
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
    render(name: string, data: unknown): Promise<string>;
  }> {
    if (!discovery) {
      discovery = await discoverLayouts(templatesDir);
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
      async render(name, data) {
        const mod = await server.ssrLoadModule(urlFor(name));
        return renderComponent(mod, data);
      },
    };
  }

  async function resolveCss(): Promise<string> {
    if (cssOutput) {
      try {
        return await fs.readFile(cssOutput, "utf-8");
      } catch {
        console.warn(`[vuedo] Failed to read CSS output from ${cssOutput}`);
      }
    }
    return "";
  }

  return {
    async render(name, data) {
      const { render } = await ensure();
      return render(name, data);
    },
    async layoutOf(name) {
      await ensure();
      return discovery!.layouts[name] ?? {};
    },
    resolveCss,
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

export function createProdRenderer(
  manifestPath: string,
  cssOutput: string,
): VuedoRenderer {
  let manifest: PdfManifest | undefined;
  let cssCache: string | null = null;

  async function ensure(): Promise<PdfManifest> {
    if (!manifest) manifest = await loadManifest(manifestPath);
    return manifest;
  }

  return {
    async render(name, data) {
      const m = await ensure();
      const modPath = m.entries[name];
      if (!modPath) throw new Error(`Unknown template: ${name}`);
      const mod = await import(pathToFileURL(modPath).href);
      return renderComponent(mod, data);
    },
    async layoutOf(name) {
      const m = await ensure();
      return m.layouts[name] ?? {};
    },
    async resolveCss() {
      if (cssCache !== null) return cssCache;
      try {
        cssCache = await fs.readFile(cssOutput, "utf-8");
      } catch {
        cssCache = "";
      }
      return cssCache;
    },
    async close() {
      manifest = undefined;
      cssCache = null;
    },
  };
}
