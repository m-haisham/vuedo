import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  getDevRenderer,
  closeOwnedRenderer,
  type RenderFn,
} from "./renderer.js";
import { loadManifest } from "./manifest.js";
import { renderComponent } from "./render-component.js";
import { sendToGotenberg } from "./gotenberg.js";
import { wrapHtml } from "./html.js";

export interface TemplateRef {
  template: string;
  data: unknown;
}

export interface GeneratePdfOptions {
  marginTop?: number;
  marginBottom?: number;
  header?: TemplateRef;
  footer?: TemplateRef;
}

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

export interface PdfKit {
  /** Vue SSR → wrapped, asset-inlined HTML string. No Gotenberg call. */
  renderHtml(template: string, data: unknown): Promise<string>;
  /** renderHtml() + Gotenberg conversion. Returns a ReadableStream of PDF bytes. */
  generatePdf(
    template: string,
    data: unknown,
    opts?: GeneratePdfOptions,
  ): Promise<ReadableStream>;
  /** Closes any internally-owned Vite instance / Redis connection. */
  close(): Promise<void>;
}

export function createPdfKit(options: PdfKitOptions): PdfKit {
  const mode =
    options.mode ??
    (process.env.NODE_ENV === "production" ? "production" : "development");
  const isDev = mode === "development";

  // The chosen render strategy is resolved once and memoised. Production never
  // touches Vite — `vite` need not even be installed in that deploy target.
  let renderPromise: Promise<RenderFn> | undefined;

  function getRender(): Promise<RenderFn> {
    if (!renderPromise) {
      renderPromise = isDev
        ? getDevRenderer(options.templatesDir)
        : buildProdRenderer();
    }
    return renderPromise;
  }

  async function buildProdRenderer(): Promise<RenderFn> {
    const manifestPath =
      options.manifestPath ??
      path.resolve(options.templatesDir, "..", "dist", "pdf-manifest.json");
    const manifest = await loadManifest(manifestPath);
    return async (template, data) => {
      const modPath = manifest[template];
      if (!modPath) throw new Error(`Unknown template: ${template}`);
      const mod = await import(pathToFileURL(modPath).href);
      return renderComponent(mod, data);
    };
  }

  async function renderHtml(template: string, data: unknown): Promise<string> {
    const render = await getRender();
    return wrapHtml(await render(template, data), options.css);
  }

  async function generatePdf(
    template: string,
    data: unknown,
    opts?: GeneratePdfOptions,
  ): Promise<ReadableStream> {
    const body = await renderHtml(template, data);
    const header = opts?.header
      ? await renderHtml(opts.header.template, opts.header.data)
      : undefined;
    const footer = opts?.footer
      ? await renderHtml(opts.footer.template, opts.footer.data)
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
    generatePdf,
    async close() {
      await closeOwnedRenderer();
    },
  };
}
