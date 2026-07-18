import path from "node:path";
import {
  VuedoRenderer,
  createDevRenderer,
  createProdRenderer,
} from "./renderer.js";
import { wrapBody, wrapHeader, wrapFooter } from "./html.js";
import { inlineCssAssets, inlineHtmlAssets } from "./inline-assets.js";
import {
  type PdfDriver,
  GotenbergDriver,
  type ChromiumMeasurer,
  resolveMargins,
} from "./drivers/index.js";
import { Cache, NoopCache } from "./cache/index.js";
import {
  buildPreviewHtml,
  type PreviewHtmlOptions,
  type PaperSize,
} from "./preview.js";

export interface VuedoOptions {
  /** Folder of `.vue` templates. Defaults to `<cwd>/templates`. */
  templatesDir?: string;
  /** The PDF backend to render with. Required. */
  driver?: PdfDriver;
  /** The measurer for pre-flight DOM measurement of header/footer heights. */
  measurer?: ChromiumMeasurer;
  /** Defaults to NODE_ENV. */
  mode?: "development" | "production";
  /** Defaults to `<templatesDir>/../dist/pdf-manifest.json`. */
  manifestPath?: string;
  /**
   * Path to a pre-compiled CSS file inlined into every wrapped document.
   * Defaults to `<manifestDir>/vuedo.css` in production,
   * `<generated>/vuedo.css` in development.
   */
  css?: string;
  /**
   * Path to the user's Tailwind v4 CSS entry (e.g. `assets/app.css`).
   * For the owned-Vite dev fallback — the Vite dev process writes CSS to disk
   * via the `@hshm/vuedo/vite` plugin, which `createVuedo` reads by convention.
   */
  cssEntry?: string;
  /** Folder of static assets (images/fonts) inlined as Base64. Defaults to `<templatesDir>/../assets`. */
  assetsDir?: string;
  /** Optional cache backend for memoizing expensive operations. */
  cache?: Cache;
}

export interface GeneratePdfOptions {
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  paperWidth?: number;
  paperHeight?: number;
  measureTimeoutMs?: number;
}

export interface Vuedo<
  Props extends Record<string, { body: any; options?: any }> = Record<
    string,
    { body: any }
  >,
> {
  renderHtml<T extends keyof Props>(
    template: T,
    data: Props[T]["body"],
  ): Promise<string>;
  renderComposite<T extends keyof Props>(
    template: T,
    data: Props[T],
  ): Promise<string>;
  generatePdf<T extends keyof Props>(
    template: T,
    data: Props[T],
  ): Promise<ReadableStream>;
  previewHtml<T extends keyof Props>(
    template: T,
    data: Props[T],
    options?: PreviewHtmlOptions,
  ): Promise<string>;
  close(): Promise<void>;
}

export type { PreviewHtmlOptions, PaperSize } from "./preview.js";

export { inlineCssAssets };
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
export { Cache, NoopCache, InMemoryCache, RedisCache } from "./cache/index.js";
export type { RedisClient } from "./cache/index.js";

export function createVuedo<
  Props extends Record<string, { body: any; options?: any }> = Record<
    string,
    { body: any }
  >,
>(options: VuedoOptions): Vuedo<Props> {
  const templatesDir =
    options.templatesDir ?? path.join(process.cwd(), "templates");
  const assetsDir =
    options.assetsDir ?? path.join(templatesDir, "..", "assets");

  const driver: PdfDriver =
    options.driver ??
    (() => {
      throw new Error(
        "createVuedo requires a render `driver`. Pass " +
          "`driver: new GotenbergDriver(url)` or `driver: new ChromiumDriver()` " +
          "(see @hshm/vuedo drivers).",
      );
    })();

  const measurer = options.measurer;
  const cache: Cache = options.cache ?? new NoopCache();

  const isDev =
    (options.mode ??
      (process.env.NODE_ENV === "production"
        ? "production"
        : "development")) === "development";
  const manifestPath =
    options.manifestPath ??
    path.resolve(templatesDir, "..", "dist", "pdf-manifest.json");

  const cssEntry = options.cssEntry;

  const cssOutput =
    options.css ??
    (isDev
      ? path.resolve(templatesDir, "..", "src", "generated", "vuedo.css")
      : path.resolve(path.dirname(manifestPath), "vuedo.css"));

  const renderer: VuedoRenderer = isDev
    ? createDevRenderer(templatesDir, cssEntry, cssOutput)
    : createProdRenderer(manifestPath, cssOutput);

  async function renderOne(
    name: string,
    data: unknown,
    section: "body" | "header" | "footer" = "body",
  ): Promise<string> {
    const inner = await renderer.render(name, data);
    const inlined = await inlineHtmlAssets(inner, assetsDir);
    const css = await renderer.resolveCss();
    if (section === "header") return wrapHeader(inlined, css);
    if (section === "footer") return wrapFooter(inlined, css);
    return wrapBody(inlined, css);
  }

  async function renderHtml(template: any, data: any): Promise<string> {
    return renderOne(template, data);
  }

  async function renderComposite(template: any, data: any): Promise<string> {
    const layout = await renderer.layoutOf(template);
    const body = await renderOne(template, data.body);
    const header =
      layout.header && data.header !== undefined
        ? await renderOne(layout.header, data.header, "header")
        : null;
    const footer =
      layout.footer && data.footer !== undefined
        ? await renderOne(layout.footer, data.footer, "footer")
        : null;
    const sections = [
      header ? `<div class="vuedo-header">${header}</div>` : "",
      `<div class="vuedo-body">${body}</div>`,
      footer ? `<div class="vuedo-footer">${footer}</div>` : "",
    ].join("\n");
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${sections}</body></html>`;
  }

  async function generatePdf(
    template: any,
    data: any,
  ): Promise<ReadableStream> {
    const layout = await renderer.layoutOf(template);
    const body = await renderOne(template, data.body);
    const header =
      layout.header && data.header !== undefined
        ? await renderOne(layout.header, data.header, "header")
        : undefined;
    const footer =
      layout.footer && data.footer !== undefined
        ? await renderOne(layout.footer, data.footer, "footer")
        : undefined;

    const margins = await resolveMargins(
      cache,
      measurer,
      data.options ?? {},
      header,
      footer,
    );

    return driver.render({
      body,
      header,
      footer,
      ...margins,
      paperWidth: data.options?.paperWidth,
      paperHeight: data.options?.paperHeight,
    });
  }

  async function previewHtml(
    template: any,
    data: any,
    previewOptions?: PreviewHtmlOptions,
  ): Promise<string> {
    const layout = await renderer.layoutOf(template);

    const body = await renderer.render(template, data.body);
    const header =
      layout.header && data.header !== undefined
        ? await renderer.render(layout.header, data.header)
        : null;
    const footer =
      layout.footer && data.footer !== undefined
        ? await renderer.render(layout.footer, data.footer)
        : null;

    const sections = [
      header ? '<div class="vuedo-header">' + header + "</div>" : "",
      '<div class="vuedo-body">' + body + "</div>",
      footer ? '<div class="vuedo-footer">' + footer + "</div>" : "",
    ].join("\n");

    // Compile the Tailwind CSS string for the preview page.
    const css = await renderer.resolveCss();

    return buildPreviewHtml(sections, {
      paperSize: previewOptions?.paperSize,
      css,
      vitePort: previewOptions?.vitePort,
      downloadUrl: previewOptions?.downloadUrl,
    });
  }

  return {
    renderHtml,
    renderComposite,
    generatePdf,
    previewHtml,
    async close() {
      await renderer.close();
      await driver.close();
      await measurer?.close();
    },
  };
}
