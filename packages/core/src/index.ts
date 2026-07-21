// ---------------------------------------------------------------------------
// @pandaf/core — framework-agnostic primitives for PDF generation
// ---------------------------------------------------------------------------
//
// This package provides the low-level building blocks:
//   - PDF drivers (Gotenberg, Chromium/Puppeteer)
//   - Header/footer DOM measurement with caching
//   - HTML document-shell wrappers
//   - Asset inlining (Base64) for offline-safe PDFs
//   - Live preview page builder
//   - Pluggable cache backends (memory, Redis, noop)
//   - Shared renderer factories and layout types for framework adapters
//
// Framework adapters (@pandaf/vue, @pandaf/react, etc.) build on top of
// this package to provide SSR + template discovery for their framework.
// ---------------------------------------------------------------------------

export { Cache, DEFAULT_TTL_MS } from "./cache/types.js";
export { NoopCache } from "./cache/noop.js";
export { InMemoryCache } from "./cache/memory.js";
export { RedisCache, type RedisClient } from "./cache/redis.js";

export {
  PdfDriver,
  GotenbergDriver,
  ChromiumDriver,
  ChromiumMeasurer,
  PuppeteerMeasurer,
  resolveMargins,
} from "./drivers/index.js";
export type {
  DriverRenderInput,
  ChromiumDriverOptions,
  MarginInput,
} from "./drivers/index.js";

export { wrapBody, wrapHeader, wrapFooter } from "./html.js";

export {
  inlineAssetsPlugin,
  inlineCssAssets,
  inlineHtmlAssets,
} from "./inline-assets.js";

export { buildPreviewHtml, PAPER_SIZES } from "./preview.js";
export type { PreviewHtmlOptions, PaperSize } from "./preview.js";

export type {
  TemplateKind,
  DiscoveredLayout,
  Discovery,
  PdfManifest,
} from "./layout.js";

export {
  createDevRenderer,
  createProdRenderer,
  type RenderMod,
  type PandafRenderer,
} from "./renderer.js";

export {
  getVitePort,
  resolvePluginOpts,
  type PandafPluginOptions,
} from "./vite-utils.js";
