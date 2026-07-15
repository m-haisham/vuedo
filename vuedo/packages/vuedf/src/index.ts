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
import type { Discovery } from "./discover.js";

export interface PdfKitOptions {
  /** Absolute path to the folder of `.vue` templates. */
  templatesDir: string;
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
}

export interface GeneratePdfOptions {
  marginTop?: number;
  marginBottom?: number;
}

// `Props` maps a template name to its data type. Build it from the generated
// `PdfTemplateProps` so `generatePdf(template, data)` is type-checked:
//   createPdfKit<PdfTemplateProps>({ ... })
export interface PdfKit<
  Props extends Record<string, any> = Record<string, any>,
> {
  /** Vue SSR → wrapped, asset-inlined HTML string (body only). */
  renderHtml<T extends keyof Props>(template: T, data: Props[T]): Promise<string>;
  /** Body + paired header/footer composed into one HTML document. */
  renderComposite<T extends keyof Props>(
    template: T,
    data: Props[T],
  ): Promise<string>;
  /** renderComposite() + Gotenberg conversion. Returns a ReadableStream of PDF bytes. */
  generatePdf<T extends keyof Props>(
    template: T,
    data: Props[T],
    opts?: GeneratePdfOptions,
  ): Promise<ReadableStream>;
  /** Closes any internally-owned Vite instance / Redis connection. */
  close(): Promise<void>;
}

export function createPdfKit<
  Props extends Record<string, any> = Record<string, any>,
>(options: PdfKitOptions): PdfKit<Props> {
  const isDev =
    (options.mode ??
      (process.env.NODE_ENV === "production"
        ? "production"
        : "development")) === "development";
  const manifestPath =
    options.manifestPath ??
    path.resolve(options.templatesDir, "..", "dist", "pdf-manifest.json");

  let devRender: RenderFn | undefined;
  let devDiscovery: Discovery | undefined;
  let prodManifest: PdfManifest | undefined;

  async function ensureDev(): Promise<void> {
    if (!devRender) {
      const r = await getDevRenderer(options.templatesDir);
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
    if (isDev) {
      await ensureDev();
      return wrapHtml(await devRender!(name, data), options.css);
    }
    await ensureProd();
    const modPath = prodManifest!.entries[name];
    if (!modPath) throw new Error(`Unknown template: ${name}`);
    const mod = await import(pathToFileURL(modPath).href);
    return wrapHtml(await renderComponent(mod, data), options.css);
  }

  async function renderHtml(template: any, data: any): Promise<string> {
    return renderOne(template, data);
  }

  async function renderComposite(template: any, data: any): Promise<string> {
    const layout = await layoutOf(template);
    const body = await renderOne(template, data);
    const header = layout.header
      ? await renderOne(layout.header, data)
      : null;
    const footer = layout.footer
      ? await renderOne(layout.footer, data)
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
    opts?: GeneratePdfOptions,
  ): Promise<ReadableStream> {
    const layout = await layoutOf(template);
    const body = await renderOne(template, data);
    const header = layout.header
      ? await renderOne(layout.header, data)
      : undefined;
    const footer = layout.footer
      ? await renderOne(layout.footer, data)
      : undefined;
    return sendToGotenberg(options.gotenbergUrl, {
      body,
      header,
      footer,
      marginTop: opts?.marginTop,
      marginBottom: opts?.marginBottom,
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
