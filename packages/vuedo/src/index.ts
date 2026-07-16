import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  getDevRenderer,
  closeOwnedRenderer,
  type RenderFn,
} from "./renderer.js";
import { loadManifest, type PdfManifest } from "./manifest.js";
import { renderComponent } from "./render-component.js";
import { wrapBody, wrapHeader, wrapFooter } from "./html.js";
import { inlineCssAssets, inlineHtmlAssets } from "./inline-assets.js";
import { TailwindCompiler, type TailwindOptions } from "./tailwind.js";
import type { Discovery } from "./discover.js";
import {
  type PdfDriver,
  GotenbergDriver,
  type ChromiumMeasurer,
  resolveMargins,
} from "./drivers/index.js";
import { Cache, NoopCache } from "./cache/index.js";

export interface VuedoOptions {
  /** Folder of `.vue` templates. Defaults to `<cwd>/templates`. */
  templatesDir?: string;
  /**
   * The PDF backend to render with. Required. Two are built in:
   * `GotenbergDriver` (remote Chromium service) and `ChromiumDriver` (local
   * Puppeteer). Pass a `gotenbergUrl` instead to auto-build a Gotenberg driver
   * (kept for backwards compatibility). Implement `PdfDriver` to add your own.
   */
  driver?: PdfDriver;
  /** Shorthand for `driver: new GotenbergDriver(url)`. Deprecated in favor of `driver`. */
  gotenbergUrl?: string;
  /** Optional — enables layout-measurement caching (planned). */
  redisUrl?: string;
  /**
   * The measurer to use for pre-flight DOM measurement of header/footer
   * heights. When set, `generatePdf()` measures rendered banner heights and
   * uses them as page margins automatically.
   */
  measurer?: ChromiumMeasurer;
  /** Defaults to NODE_ENV. */
  mode?: "development" | "production";
  /** Defaults to `<templatesDir>/../dist/pdf-manifest.json`. */
  manifestPath?: string;
  /** Optional CSS inlined into every wrapped document. */
  css?: string;
  /**
   * Optional Tailwind v4 entry (e.g. `assets/app.css`). When given, the package
   * compiles it itself — scanning only the PDF templates and assets so the
   * whole consumer service doesn't need its own Tailwind build step. The user
   * tunes scan scope via `@source` in their entry. Mutually exclusive with
   * `css`; `tailwind` wins when both are present.
   */
  tailwind?: string | TailwindOptions;
  /** Folder of static assets (images/fonts) inlined as Base64. Defaults to `<templatesDir>/../assets`. */
  assetsDir?: string;
  /**
   * Optional cache backend for memoizing expensive operations (SSR renders,
   * Tailwind compilation, etc.). Defaults to `NoopCache` (no caching).
   * Pass `new InMemoryCache()` or `new RedisCache(client)` to enable.
   */
  cache?: Cache;
}

/** Page geometry, sent as the `options` field of `generatePdf`. */
export interface GeneratePdfOptions {
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  /** Paper width in inches. Defaults to A4 (8.27). Also sizes the measurement viewport. */
  paperWidth?: number;
  /** Paper height in inches. Defaults to A4 (11.69). */
  paperHeight?: number;
  /** Timeout in milliseconds for each header/footer measurement. Defaults to 3 000ms. */
  measureTimeoutMs?: number;
}

// `Props` maps a template name to its full data object:
//   { header?, body, footer?, options }
// Build it from the generated `PdfTemplateProps` (whose `header`/`footer`
// keys are present only when the template actually has those sections) so
// `generatePdf(name, data)` is type-checked against exactly the sections that
// exist:
//   createVuedo<PdfTemplateProps>({ ... })
export interface Vuedo<
  Props extends Record<string, { body: any; options?: any }> = Record<
    string,
    { body: any }
  >,
> {
  /** Vue SSR → wrapped, asset-inlined HTML string (body only). */
  renderHtml<T extends keyof Props>(
    template: T,
    data: Props[T]["body"],
  ): Promise<string>;
  /** Body + paired header/footer composed into one HTML document. */
  renderComposite<T extends keyof Props>(
    template: T,
    data: Props[T],
  ): Promise<string>;
  /** renderComposite() + Gotenberg conversion. Returns a ReadableStream of PDF bytes. */
  generatePdf<T extends keyof Props>(
    template: T,
    data: Props[T],
  ): Promise<ReadableStream>;
  /** Closes any internally-owned Vite instance / Redis connection. */
  close(): Promise<void>;
}

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

  // Resolve the render driver. A caller must supply either `driver` or the
  // legacy `gotenbergUrl` shorthand. We do NOT silently default to an engine —
  // users opt into their backend intentionally.
  const driver: PdfDriver =
    options.driver ??
    (options.gotenbergUrl
      ? new GotenbergDriver(options.gotenbergUrl)
      : (() => {
          throw new Error(
            "createVuedo requires a render `driver`. Pass " +
              "`driver: new GotenbergDriver(url)` or `driver: new ChromiumDriver()` " +
              "(see @hshm/vuedo drivers), or set `gotenbergUrl` for the legacy shorthand.",
          );
        })());

  // Resolve the measurer for pre-flight DOM measurement of header/footer
  // heights. Optional — when present, `generatePdf()` measures rendered banner
  // heights and uses them as page margins automatically.
  const measurer = options.measurer;

  // Cache backend — defaults to a no-op so consumers pay no cost unless they
  // explicitly opt in.
  const cache: Cache = options.cache ?? new NoopCache();

  const isDev =
    (options.mode ??
      (process.env.NODE_ENV === "production"
        ? "production"
        : "development")) === "development";
  const manifestPath =
    options.manifestPath ??
    path.resolve(templatesDir, "..", "dist", "pdf-manifest.json");

  let devRender: RenderFn | undefined;
  let devDiscovery: Discovery | undefined;
  let prodManifest: PdfManifest | undefined;

  // Tailwind: when the consumer opts in, the package owns compilation. We
  // lazily build a single compiler scoped to this templatesDir/assetsDir so the
  // cache persists across renders.
  const twOptions = options.tailwind;
  const twCompiler =
    twOptions === undefined
      ? undefined
      : new TailwindCompiler(
          typeof twOptions === "string" ? twOptions : twOptions.entry,
          templatesDir,
          assetsDir,
          typeof twOptions === "string" ? undefined : twOptions.sources,
        );

  // Resolves the CSS to inline: an explicit `css` string, a `tailwind` entry
  // compiled by the package, or empty. `tailwind` takes precedence.
  async function resolveCss(): Promise<string> {
    if (twCompiler) return twCompiler.compile();
    return options.css ?? "";
  }

  async function ensureDev(): Promise<void> {
    if (!devRender) {
      const r = await getDevRenderer(templatesDir);
      devRender = r.render;
      devDiscovery = r.discovery;
    }
  }
  async function ensureProd(): Promise<void> {
    if (!prodManifest) prodManifest = await loadManifest(manifestPath);
  }

  async function layoutOf(
    name: string,
  ): Promise<{ header?: string; footer?: string }> {
    if (isDev) {
      await ensureDev();
      return devDiscovery!.layouts[name] ?? {};
    }
    await ensureProd();
    return prodManifest!.layouts[name] ?? {};
  }

  // Renders a single template (by dotted name) to a wrapped HTML string. Picks
  // the dev ssrLoadModule path or the pre-compiled prod module accordingly.
  // `section` selects the wrapper tuning (body vs header vs footer).
  async function renderOne(
    name: string,
    data: unknown,
    section: "body" | "header" | "footer" = "body",
  ): Promise<string> {
    let inner: string;
    if (isDev) {
      await ensureDev();
      inner = await devRender!(name, data);
    } else {
      await ensureProd();
      const modPath = prodManifest!.entries[name];
      if (!modPath) throw new Error(`Unknown template: ${name}`);
      const mod = await import(pathToFileURL(modPath).href);
      inner = await renderComponent(mod, data);
    }
    // Embed any remaining local asset refs (dev URLs, SFC <style> fonts) as
    // Base64 so Gotenberg needs no network. Prod builds already inline via the
    // Vite plugin, so this is mostly a no-op there.
    const inlined = await inlineHtmlAssets(inner, assetsDir);
    const css = await resolveCss();
    if (section === "header") return wrapHeader(inlined, css);
    if (section === "footer") return wrapFooter(inlined, css);
    return wrapBody(inlined, css);
  }

  async function renderHtml(template: any, data: any): Promise<string> {
    return renderOne(template, data);
  }

  async function renderComposite(template: any, data: any): Promise<string> {
    const layout = await layoutOf(template);
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
    const layout = await layoutOf(template);
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

  return {
    renderHtml,
    renderComposite,
    generatePdf,
    async close() {
      await closeOwnedRenderer();
      await driver.close();
      await measurer?.close();
    },
  };
}
