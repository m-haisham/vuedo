import path from "node:path";
import {
  createDevRenderer,
  createProdRenderer,
  type PandafRenderer,
  type RenderMod,
} from "@pandaf/core";
import { renderComponent } from "./render-component.js";
import { discoverLayouts } from "./discover.js";
import { loadManifest } from "./manifest.js";

// Vue renderMod: always renders the default export, regardless of section.
const vueRenderMod: RenderMod = async (mod, data, _section) =>
  renderComponent(mod, data);

export function createDevRendererEx(
  templatesDir: string,
  devServer?: import("vite").ViteDevServer,
  cssOutput?: string,
): PandafRenderer {
  return createDevRenderer({
    templatesDir,
    devServer,
    cssOutput,
    discoverLayouts,
    renderMod: vueRenderMod,
  });
}

export function createProdRendererEx(
  manifestPath: string,
  cssOutput: string,
): PandafRenderer {
  return createProdRenderer({
    manifestPath,
    cssOutput,
    loadManifest,
    renderMod: vueRenderMod,
  });
}

export { type PandafRenderer };
