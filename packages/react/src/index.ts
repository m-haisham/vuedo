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
import { renderNamedComponent, type TemplateModule } from "./render-component.js";

export interface PandafOptions {
  templatesDir?: string;
  driver?: PdfDriver;
  measurer?: ChromiumMeasurer;
  mode?: "development" | "production";
  manifestPath?: string;
  css?: string;
  devServer?: ViteDevServer;
  assetsDir?: string;
  cache?: Cache;
}

export interface GeneratePdfOptions {
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  extraMarginTop?: number;
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

// React conventions:
// 1. File-based: x.tsx (body), x-header.tsx (header), x-footer.tsx (footer)
// 2. Single-file: x.tsx exports named Body, Header, Footer components
//
// File-based aux files take precedence. When no file-based header/footer
// exists, the renderer checks the body module for named Header/Footer exports.
// This lets React users write everything in one file while Vue users rely on
// the file-based convention.

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
          "`driver: new GotenbergDriver(url)` or `driver: new ChromiumDriver()`.",
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

  // Check if a body template module has named Header/Footer exports
  // (single-file React convention). Used as fallback when file-based
  // aux files don't exist.
  const namedExportCache = new Map<string, { hasHeader: boolean; hasFooter: boolean }>();

  async function resolveLayout(
    name: string,
  ): Promise<{ header?: string; footer?: string }> {
    const layout = await renderer.layoutOf(name);

    // If file-based layout defines both header and footer, we're done
    if (layout.header && layout.footer) return layout;

    // For single-file React templates (or partial file-based), check
    // whether the body module exports named Header/Footer components.
    const cacheKey = name;
    if (!namedExportCache.has(cacheKey)) {
      let hasHeader = !!layout.header;
      let hasFooter = !!layout.footer;
      try {
        // Only probe for exports that aren't already covered by file-based aux.
        // Pass empty object {} so component rendering succeeds even with
        // required props — React renders undefined values as nothing.
        if (!hasHeader) {
          try {
            const headerHtml = await renderer.render(name, {}, "Header");
            hasHeader = headerHtml.length > 0;
          } catch { /* no Header export or component threw */ }
        }
        if (!hasFooter) {
          try {
            const footerHtml = await renderer.render(name, {}, "Footer");
            hasFooter = footerHtml.length > 0;
          } catch { /* no Footer export or component threw */ }
        }
      } catch {
        // renderer throw — leave defaults
      }
      namedExportCache.set(cacheKey, { hasHeader, hasFooter });
    }

    const named = namedExportCache.get(cacheKey)!;
    return {
      header: layout.header ?? (named.hasHeader ? name : undefined),
      footer: layout.footer ?? (named.hasFooter ? name : undefined),
    };
  }

  async function renderOne(
    name: string,
    data: unknown,
    section: "body" | "header" | "footer" = "body",
  ): Promise<string> {
    const inner = await renderer.render(name, data, section === "body" ? undefined : section);
    const inlined = await inlineHtmlAssets(inner, assetsDir);
    const css = await renderer.resolveCss();
    if (section === "header") return wrapHeader(inlined, css);
    if (section === "footer") return wrapFooter(inlined, css);
    return wrapBody(inlined, css);
  }

  // Render a single section (body by default) for use in renderComposite/generatePdf.
  // For React single-file templates, section can be "Header" or "Footer" to render
  // the named export from the same file.
  async function renderSection(
    name: string,
    data: unknown,
    section: "body" | "header" | "footer",
    sourceName: string,
  ): Promise<string> {
    const inner = await renderer.render(sourceName, data, section === "body" ? undefined : section);
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
    const resolved = await resolveLayout(template);
    const hasFileHeader =
      resolved.header !== template && resolved.header !== undefined;
    const hasFileFooter =
      resolved.footer !== template && resolved.footer !== undefined;

    const body = await renderOne(template, data.body);
    const header =
      resolved.header && data.header !== undefined
        ? hasFileHeader
          ? await renderOne(resolved.header, data.header, "header")
          : await renderSection(template, data.header, "header", template)
        : null;
    const footer =
      resolved.footer && data.footer !== undefined
        ? hasFileFooter
          ? await renderOne(resolved.footer, data.footer, "footer")
          : await renderSection(template, data.footer, "footer", template)
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
    const resolved = await resolveLayout(template);
    const hasFileHeader =
      resolved.header !== template && resolved.header !== undefined;
    const hasFileFooter =
      resolved.footer !== template && resolved.footer !== undefined;

    const body = await renderOne(template, data.body);
    const header =
      resolved.header && data.header !== undefined
        ? hasFileHeader
          ? await renderOne(resolved.header, data.header, "header")
          : await renderSection(template, data.header, "header", template)
        : undefined;
    const footer =
      resolved.footer && data.footer !== undefined
        ? hasFileFooter
          ? await renderOne(resolved.footer, data.footer, "footer")
          : await renderSection(template, data.footer, "footer", template)
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
    const resolved = await resolveLayout(template);
    const hasFileHeader =
      resolved.header !== template && resolved.header !== undefined;
    const hasFileFooter =
      resolved.footer !== template && resolved.footer !== undefined;

    const body = await renderer.render(template, data.body);
    const header =
      resolved.header && data.header !== undefined
        ? hasFileHeader
          ? await renderer.render(resolved.header, data.header)
          : await renderer.render(template, data.header, "Header")
        : null;
    const footer =
      resolved.footer && data.footer !== undefined
        ? hasFileFooter
          ? await renderer.render(resolved.footer, data.footer)
          : await renderer.render(template, data.footer, "Footer")
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
