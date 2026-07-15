import type { ViteDevServer } from "vite";

// The seam where the Vite plugin (§4.3 tier 2) and the core renderer meet.
// The plugin's `configureServer` hook writes the host's running dev server into
// this module-level slot; the renderer reads it before falling back to an
// owned instance.
let shared: ViteDevServer | undefined;

export function registerDevServer(server: ViteDevServer): void {
  shared = server;
}

export function getSharedDevServer(): ViteDevServer | undefined {
  return shared;
}
