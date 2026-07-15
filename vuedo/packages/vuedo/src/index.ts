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
import { compileTailwindCss } from "./tailwind.js";
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
  /**
   * Explicit CSS inlined into every wrapped document. When set, it takes
   * precedence over the built-in Tailwind compilation.
   */
  css?: string;
  /**
   * Tailwind v4 support (on by default). `@hshm/vuedo` compiles Tailwind itself
   * so consumers never run the Tailwind CLI: the CSS entry (`<assetsDir>/app.css`,
   * or a built-in `@import "tailwindcss"` fallback) is compiled against the
   * templates and inlined into every rendered document. Pass `false` to disable,
   * or an object to point at a different entry / enable minification.
   */
  tailwind?: boolean | { input?: string; minify?: boolean };
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
export { compileTailwindCss } from "./tailwind.js";

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

  const tailwind = options.tailwind ?? true;
  const tailwindInputExplicit =
    typeof tailwind === "object" && !!tailwind.input;
  const tailwindInput = tailwindInputExplicit
    ? (tailwind as { input: string }).input
    : path.join(assetsDir, "app.css");
  // Minify by default in production; opt in/out explicitly via `tailwind.minify`.
  const tailwindMinify =
    typeof tailwind === "object" && tailwind.minify !== undefined
      ? tailwind.minify
      : !isDev;

  let devRender: RenderFn | undefined;
  let devDiscovery: Discovery | undefined;
  let prodManifest: PdfManifest | undefined;
  let cachedCss: string | undefined;

  // Makes a CSS string self-contained: inlines any `@import` web-font
  // stylesheets and turns local/remote `url()` refs into Base64 data URIs so
  // Gotenberg needs no network access.
  async function inlineCss(css: string): Promise<string> {
    let out = await inlineCssImports(css, assetsDir);
    out = await inlineCssAssets(out, assetsDir, { fetchRemote: true });
    return out;
  }

  // Resolves the CSS injected into every wrapped document. Order of precedence:
  //   1. an explicit `css` option (inlined as-is);
  //   2. Tailwind — in production, a prebuilt `app.css` next to the manifest
  //      (written by the Vite plugin) is preferred; otherwise it is compiled on
  //      the fly. In development it is (re)compiled per render so newly-used
  //      utility classes show up without a build step.
  async function resolveCss(): Promise<string> {
    if (options.css !== undefined) {
      if (cachedCss === undefined) {
        cachedCss = options.css ? await inlineCss(options.css) : "";
      }
      return cachedCss;
    }
    if (tailwind === false) return "";
    if (!isDev && cachedCss !== undefined) return cachedCss;

    let css: string | undefined;
    if (!isDev) {
      const prebuilt = path.resolve(path.dirname(manifestPath), "app.css");
      try {
        css = await (await import("node:fs/promises")).readFile(prebuilt, "utf8");
      } catch {
        /* no prebuilt CSS — compile below */
      }
    }
    if (css === undefined) {
      css = await compileTailwindCss({
        input: tailwindInput,
        warnOnMissingInput: tailwindInputExplicit,
        base: assetsDir,
        content: [{ base: templatesDir, pattern: "**/*.vue", negated: false }],
        minify: tailwindMinify,
      });
    }
    const inlined = await inlineCss(css);
    if (!isDev) cachedCss = inlined;
    return inlined;
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
    return wrapHtml(inlined, await resolveCss());
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
