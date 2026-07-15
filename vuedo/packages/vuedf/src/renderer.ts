import type { ViteDevServer } from "vite";
import { getSharedDevServer } from "./dev-registry.js";
import { renderComponent } from "./render-component.js";

export type RenderFn = (template: string, data: unknown) => Promise<string>;

// The one instance pdf-kit owns itself (tier 3). Created lazily, at most once,
// and torn down by close().
let ownedVite: ViteDevServer | undefined;

async function createOwnedVite(templatesDir: string): Promise<ViteDevServer> {
  const { createServer } = await import("vite");
  const vue = (await import("@vitejs/plugin-vue")).default;
  return createServer({
    root: templatesDir,
    configFile: false,
    plugins: [vue()],
    server: { middlewareMode: true },
    appType: "custom",
  });
}

// Picks a Vite instance in priority order, every call (§4.3):
//   1. explicit — caller passed one (tests / advanced setups)
//   2. shared   — the host's own Vite server, via the plugin
//   3. owned    — pdf-kit spins up its own, lazily, once
export async function getDevRenderer(
  templatesDir: string,
  explicitVite?: ViteDevServer,
): Promise<RenderFn> {
  const vite =
    explicitVite ??
    getSharedDevServer() ??
    (ownedVite ??= await createOwnedVite(templatesDir));

  return async (template: string, data: unknown) => {
    const mod = await vite.ssrLoadModule(`${templatesDir}/${template}.vue`);
    return renderComponent(mod, data);
  };
}

export async function closeOwnedRenderer(): Promise<void> {
  if (ownedVite) {
    await ownedVite.close();
    ownedVite = undefined;
  }
}
