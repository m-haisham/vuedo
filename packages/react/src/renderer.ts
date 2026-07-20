import {
  createDevRenderer,
  createProdRenderer,
  type VuedoRenderer,
  type RenderMod,
} from "@vuedo/core";
import { renderComponent, renderNamedComponent } from "./render-component.js";
import { discoverLayouts } from "./discover.js";
import { loadManifest } from "./manifest.js";

// React renderMod: Body uses named export, Header/Footer use named exports
// from the same module (single-file convention). The section name "header"
// maps to the "Header" export, "footer" to "Footer".
const reactRenderMod: RenderMod = async (mod, data, section = "body") => {
  if (section === "body") return renderComponent(mod, data);
  const exportName =
    section === "header" ? "Header" : section === "footer" ? "Footer" : section;
  return renderNamedComponent(mod, exportName, data);
};

export function createDevRendererEx(
  templatesDir: string,
  devServer?: import("vite").ViteDevServer,
  cssOutput?: string,
): VuedoRenderer {
  return createDevRenderer({
    templatesDir,
    devServer,
    cssOutput,
    discoverLayouts,
    renderMod: reactRenderMod,
  });
}

export function createProdRendererEx(
  manifestPath: string,
  cssOutput: string,
): VuedoRenderer {
  return createProdRenderer({
    manifestPath,
    cssOutput,
    loadManifest,
    renderMod: reactRenderMod,
  });
}

export { type VuedoRenderer };
