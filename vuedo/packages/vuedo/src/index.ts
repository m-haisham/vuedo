import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  getDevRenderer,
  closeOwnedRenderer,
  type RenderFn,
} from "./renderer.js";
import { loadManifest, type PdfManifest } from "./manifest.js";
import { renderComponent } from "./render-component.js";
import { sendToGotenberg } from "./gotenberg.js";
import { wrapHtml } from "./html.js";
import { inlineCssAssets, inlineCssImports, inlineHtmlAssets } from "./inline-assets.js";
import type { Discovery } from "./discover.js";

export interface PdfKitOptions {
  /** Folder of `.vue` templates. Defaults to `<cwd>/templates`. */
  templatesDir?: string;
  gotenbergUrl: string;
  /** Optional — enables layout-measurement caching (planned). */
  redisUrl?: string;
  /** Optional — enables pre-flight DOM measurement (planned). */
  browserlessUrl?: string;
  /** Defaults to NODE_ENV. */
  mode?: "development" | "production";
  /** Defaults to `<templatesDir>/../dist/pdf-manifest.json`. */
  manifestPath?: string;
  /** Optional CSS inlined into every wrapped document. */
  css?: string;
  /** Folder of static assets (images/fonts) inlined as Base64. Defaults to `<templatesDir>/../assets`. */
  assetsDir?: string;
}

/** Gotenberg page margins, sent as the `options` field of `generatePdf`. */
export interface GeneratePdfOptions {
  marginTop?: number;
  marginBottom?: number;
}

// `Props` maps a template name to its full data object:
//   { header?, body, footer?, options }
// Build it from the generated `PdfTemplateProps` (whose `header`/`footer`
// keys are present only when the template actually has those sections) so
// `generatePdf(name, data)` is type-checked against exactly the sections that
// exist:
//   createPdfKit<PdfTemplateProps>({ ... })
export interface PdfKit<
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
  generatePdf<T extends keyof Props>(template: T, data: Props[T]): Promise<ReadableStream>;
  /** Closes any internally-owned Vite instance / Redis connection. */
  close(): Promise<void>;
}

export { inlineCssAssets, inlineCssImports };

export function createPdfKit<
  Props extends Record<string, { body: any; options?: any }> = Record<
    string,
    { body: any }
  >,
>(options: PdfKitOptions): PdfKit<Props> {
  const templatesDir = options.templatesDir ?? path.join(process.cwd(), "templates");
  const assetsDir = options.assetsDir ?? path.join(templatesDir, "..", "assets");
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
  // The user-supplied `css` is inlined once (its `@import` web fonts and any
  // `url()` asset refs become Base64) so every wrapped document is self-contained.
  let inlinedCss: string | undefined;
  async function ensureCss(): Promise<string> {
    if (inlinedCss === undefined) {
      if (!options.css) {
        inlinedCss = "";
      } else {
        const base = options.assetsDir ?? assetsDir;
        let css = await inlineCssImports(options.css, base);
        css = await inlineCssAssets(css, base, { fetchRemote: true });
        inlinedCss = css;
      }
    }
    return inlinedCss;
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
  async function renderOne(name: string, data: unknown): Promise<string> {
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
    const css = await ensureCss();
    return wrapHtml(inlined, css);
  }

  async function renderHtml(template: any, data: any): Promise<string> {
    return renderOne(template, data);
  }

  async function renderComposite(template: any, data: any): Promise<string> {
    const layout = await layoutOf(template);
    const body = await renderOne(template, data.body);
    const header =
      layout.header && data.header !== undefined
        ? await renderOne(layout.header, data.header)
        : null;
    const footer =
      layout.footer && data.footer !== undefined
        ? await renderOne(layout.footer, data.footer)
        : null;
    const sections = [
      header ? `<div class="vuedo-header">${header}</div>` : "",
      `<div class="vuedo-body">${body}</div>`,
      footer ? `<div class="vuedo-footer">${footer}</div>` : "",
    ].join("\n");
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${sections}</body></html>`;
  }

  async function generatePdf(template: any, data: any): Promise<ReadableStream> {
    const layout = await layoutOf(template);
    const body = await renderOne(template, data.body);
    const header =
      layout.header && data.header !== undefined
        ? await renderOne(layout.header, data.header)
        : undefined;
    const footer =
      layout.footer && data.footer !== undefined
        ? await renderOne(layout.footer, data.footer)
        : undefined;
    return sendToGotenberg(options.gotenbergUrl, {
      body,
      header,
      footer,
      marginTop: data.options?.marginTop,
      marginBottom: data.options?.marginBottom,
    });
  }

  return {
    renderHtml,
    renderComposite,
    generatePdf,
    async close() {
      await closeOwnedRenderer();
    },
  };
}
