import path from "node:path";
import type { ViteDevServer } from "vite";
import { getSharedDevServer } from "./dev-registry.js";
import { renderComponent } from "./render-component.js";
import { discoverLayouts, type Discovery } from "./discover.js";
import { inlineAssetsPlugin } from "./inline-assets.js";

export type RenderFn = (template: string, data: unknown) => Promise<string>;

// The one instance vuedo owns itself (tier 3). Created lazily, at most once,
// and torn down by close().
let ownedVite: ViteDevServer | undefined;

async function createOwnedVite(templatesDir: string): Promise<ViteDevServer> {
  const { createServer } = await import("vite");
  const vue = (await import("@vitejs/plugin-vue")).default;
  return createServer({
    root: templatesDir,
    configFile: false,
    plugins: [vue(), inlineAssetsPlugin()],
    server: { middlewareMode: true },
    appType: "custom",
  });
}

// Dev renderer: resolves a dotted template name to its `.vue` file (recursively)
// and compiles it on demand via ssrLoadModule. Also returns the discovered
// layout map so the core can find the paired header/footer.
export async function getDevRenderer(
  templatesDir: string,
): Promise<{ render: RenderFn; discovery: Discovery }> {
  const discovery = await discoverLayouts(templatesDir);
  const vite =
    getSharedDevServer() ?? (ownedVite ??= await createOwnedVite(templatesDir));

  function urlFor(name: string): string {
    const file = discovery.entries[name];
    if (!file) throw new Error(`Unknown template: ${name}`);
    return "/" + path.relative(templatesDir, file).split(path.sep).join("/");
  }

  const render: RenderFn = async (template, data) => {
    const mod = await vite.ssrLoadModule(urlFor(template));
    return renderComponent(mod, data);
  };

  return { render, discovery };
}

export async function closeOwnedRenderer(): Promise<void> {
  if (ownedVite) {
    await ownedVite.close();
    ownedVite = undefined;
  }
}
