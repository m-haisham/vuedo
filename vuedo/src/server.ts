import { Elysia, t } from "elysia";
import fs from "fs";
import path from "path";
import { createSSRApp } from "vue";
import { renderToString } from "@vue/server-renderer";

// Single Elysia app + single entrypoint, used for both `pnpm dev` and
// production. The only difference between modes is which `render()` is closed
// over at boot — decided once, below, before the route is defined.
const isDev = process.env.NODE_ENV !== "production";

let compiledCss = "";
const cssPath = path.resolve("./dist/assets/style.css");
if (fs.existsSync(cssPath)) {
  compiledCss = fs.readFileSync(cssPath, "utf-8");
}

const wrapHtml = (content: string) => `
  <!DOCTYPE html>
  <html><head><style>${compiledCss}</style></head><body>${content}</body></html>
`;

// --- Decide the render strategy ONCE, at boot, not per-file. -------------
// In dev, Vite runs in middleware mode: ssrLoadModule compiles + SSR-
// transforms a .vue template on demand, using Vite's module graph for
// invalidation. No dist/, no bundle. In prod, this branch is never evaluated
// — dist/entry-server.js is a static import, and vite isn't even installed in
// the production image.
export let render: (template: string, data: unknown) => Promise<string>;
let vite: import("vite").ViteDevServer | undefined;

if (isDev) {
  const { createServer: createViteServer } = await import("vite");
  vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "custom",
  });
  render = async (template: string, data: unknown) => {
    const mod = await vite!.ssrLoadModule(`/src/templates/${template}.vue`);
    const app = createSSRApp(
      (mod as { default: never }).default,
      data as Record<string, unknown>,
    );
    return await renderToString(app);
  };
} else {
  const { renderPdfBody } = await import("../dist/entry-server.js");
  render = renderPdfBody;
}
// ---------------------------------------------------------------------

export const app = new Elysia().post(
  "/api/v1/generate-pdf",
  async ({ body, query, set }) => {
    try {
      const rawVueHtml = await render(body.template, body.data);
      const bodyHtml = wrapHtml(rawVueHtml);

      // Optional header/footer, each rendered from its own template + data.
      const headerHtml = body.header
        ? wrapHtml(await render(body.header.template, body.header.data))
        : null;
      const footerHtml = body.footer
        ? wrapHtml(await render(body.footer.template, body.footer.data))
        : null;

      // Dev convenience: ?preview=html returns the composed SSR HTML directly
      // instead of round-tripping through Gotenberg, for quick sanity checks.
      if (query.preview === "html") {
        const sections = [
          headerHtml ? `<div class="vuedo-header">${headerHtml}</div>` : "",
          `<div class="vuedo-body">${bodyHtml}</div>`,
          footerHtml ? `<div class="vuedo-footer">${footerHtml}</div>` : "",
        ].join("\n");
        const doc = `<!DOCTYPE html><html><head><style>${compiledCss}</style></head><body>${sections}</body></html>`;
        return new Response(doc, { headers: { "Content-Type": "text/html" } });
      }

      const form = new FormData();
      form.append(
        "files",
        new Blob([bodyHtml], { type: "text/html" }),
        "index.html",
      );
      if (headerHtml) {
        form.append(
          "files",
          new Blob([headerHtml], { type: "text/html" }),
          "header.html",
        );
      }
      if (footerHtml) {
        form.append(
          "files",
          new Blob([footerHtml], { type: "text/html" }),
          "footer.html",
        );
      }
      form.append("marginTop", "1");
      form.append("marginBottom", "1");

      const gotenbergRes = await fetch(
        process.env.GOTENBERG_URL + "/forms/chromium/convert/html",
        { method: "POST", body: form },
      );

      if (!gotenbergRes.ok)
        throw new Error("Gotenberg failed to generate PDF");

      return new Response(gotenbergRes.body, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${body.template}.pdf"`,
        },
      });
    } catch (error) {
      console.error(error);
      set.status = 500;
      return { error: "PDF Generation Failed" };
    }
  },
  {
    body: t.Object({
      template: t.String(),
      data: t.Any(),
      header: t.Optional(t.Object({ template: t.String(), data: t.Any() })),
      footer: t.Optional(t.Object({ template: t.String(), data: t.Any() })),
    }),
    query: t.Object({ preview: t.Optional(t.String()) }),
  },
);

// Dev-only helpers used by the boot/HTTP layer (HMR preview, template list).
function listTemplates(): string[] {
  const templatesDir = path.resolve("src/templates");
  if (!fs.existsSync(templatesDir)) return [];
  return fs
    .readdirSync(templatesDir)
    .filter((file) => file.endsWith(".vue"))
    .map((file) => file.replace(/\.vue$/, ""))
    .sort();
}

// Boot the server. Elysia 1.x defaults to the WebStandard adapter, which has
// no `.listen()`, so we serve via a native HTTP server and delegate `/api/*`
// to `app.handle`. Vite's connect middleware (live-preview HMR) is only wired
// in dev — the same app instance, one extra branch when the dev boot ran.
export async function startServer(port = 8080) {
  const { createServer } = await import("node:http");
  const server = createServer(async (req, res) => {
    const url = (req.url ?? "/").split("?")[0];

    if (url.startsWith("/api/")) {
      const method = req.method ?? "GET";
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body =
        method !== "GET" && method !== "HEAD"
          ? Buffer.concat(chunks)
          : undefined;
      const request = new Request(`http://localhost${req.url}`, {
        method,
        headers: req.headers as Record<string, string>,
        body,
      });
      const response = await app.handle(request);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }

    if (url === "/" || url === "") {
      const items = listTemplates()
        .map(
          (name) =>
            `<li><a href="/dev/preview.html?template=${encodeURIComponent(
              name,
            )}">${name}</a></li>`,
        )
        .join("");
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html");
      res.end(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>vuedo — Templates</title>
        <style>body{font-family:system-ui,sans-serif;margin:3rem;color:#111}a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}ul{line-height:1.9}</style>
        </head><body><h1>vuedo templates</h1><ul>${items}</ul></body></html>`,
      );
      return;
    }

    if (url === "/dev/preview.html") {
      const raw = fs.readFileSync(
        path.resolve("src/dev/preview.html"),
        "utf-8",
      );
      const html = await vite!.transformIndexHtml(req.url ?? url, raw);
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html");
      res.end(html);
      return;
    }

    if (vite) {
      vite.middlewares(req, res, () => {
        res.statusCode = 404;
        res.end("Not found");
      });
      return;
    }

    res.statusCode = 404;
    res.end("Not found");
  });

  server.listen(port, () => {
    console.log(
      `🦊 vuedo running (${isDev ? "dev, live templates" : "prod, static dist/"}) on :${port}`,
    );
  });
}

// Auto-boot when run directly (pnpm dev / pnpm start); importing for tests
// only pulls in `app` without starting a listener.
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer(8080);
}
