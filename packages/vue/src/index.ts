import path from "node:path";
import type { ViteDevServer } from "vite";
import {
  type PandafRenderer,
  createDevRendererEx,
  createProdRendererEx,
} from "./renderer.js";
import { wrapBody, wrapHeader, wrapFooter } from "@pandaf/core";
import { inlineCssAssets, inlineHtmlAssets } from "@pandaf/core";
import {
  type PdfDriver,
  GotenbergDriver,
  type ChromiumMeasurer,
  resolveMargins,
} from "@pandaf/core";
import { Cache, NoopCache } from "@pandaf/core";
import {
  buildPreviewHtml,
  type PreviewHtmlOptions,
  type PaperSize,
} from "@pandaf/core";

export interface PandafOptions {
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
   * Defaults to `<manifestDir>/pandaf.css` in production,
   * `<.pandaf>/pandaf.css` in development.
   */
  css?: string;
  /**
   * The consumer's Vite dev server. Optional — when omitted in dev mode,
   * the library lazy-creates one from the consumer's `vite.config.ts` and
   * closes it on `pandaf.close()`. Pass your own instance to control the
   * lifecycle (e.g. for testing or when you need to mount its middleware).
   */
  devServer?: ViteDevServer;
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
  /** Extra margin (inches) added on top of the resolved marginTop (user-provided or measured). Defaults to 0. */
  extraMarginTop?: number;
  /** Extra margin (inches) added on top of the resolved marginBottom (user-provided or measured). Defaults to 0. */
  extraMarginBottom?: number;
  paperWidth?: number;
  paperHeight?: number;
  measureTimeoutMs?: number;
}

export interface Pandaf<
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

export type { PreviewHtmlOptions, PaperSize } from "@pandaf/core";

export { inlineCssAssets };
export {
  PdfDriver,
  GotenbergDriver,
  ChromiumDriver,
  ChromiumMeasurer,
  PuppeteerMeasurer,
  resolveMargins,
} from "@pandaf/core";
export type {
  DriverRenderInput,
  ChromiumDriverOptions,
  MarginInput,
} from "@pandaf/core";
export { Cache, NoopCache, InMemoryCache, RedisCache } from "@pandaf/core";
export type { RedisClient } from "@pandaf/core";

export function createPandaf<
  Props extends Record<string, { body: any; options?: any }> = Record<
    string,
    { body: any }
  >,
>(options: PandafOptions): Pandaf<Props> {
  const templatesDir =
    options.templatesDir ?? path.join(process.cwd(), "templates");
  const assetsDir =
    options.assetsDir ?? path.join(templatesDir, "..", "assets");

  const driver: PdfDriver =
    options.driver ??
    (() => {
      throw new Error(
        "createPandaf requires a render `driver`. Pass " +
          "`driver: new GotenbergDriver(url)` or `driver: new ChromiumDriver()` " +
          "(see @pandaf/vue drivers).",
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

  const cssOutput =
    options.css ??
    (isDev
      ? path.resolve(templatesDir, "..", ".pandaf", "pandaf.css")
      : path.resolve(path.dirname(manifestPath), "pandaf.css"));

  const renderer: PandafRenderer = isDev
    ? createDevRendererEx(templatesDir, options.devServer, cssOutput)
    : createProdRendererEx(manifestPath, cssOutput);

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
      header ? `<div class="pandaf-header">${header}</div>` : "",
      `<div class="pandaf-body">${body}</div>`,
      footer ? `<div class="pandaf-footer">${footer}</div>` : "",
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
      header ? '<div class="pandaf-header">' + header + "</div>" : "",
      '<div class="pandaf-body">' + body + "</div>",
      footer ? '<div class="pandaf-footer">' + footer + "</div>" : "",
    ].join("\n");

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
