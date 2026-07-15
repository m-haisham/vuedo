import { createServer as createViteServer } from "vite";
import { Elysia } from "elysia";
import { createServer as createHttpServer } from "node:http";
import fs from "fs";
import path from "path";
import { renderDev } from "./server/render.dev";
import { buildApp } from "./server/index";

// Dev entrypoint: boots Vite in middleware mode inside the same process and
// wires up the dev renderer + HMR preview. No build step, per §3.4 / §4.3.

function listTemplates(): string[] {
  const templatesDir = path.resolve("src/templates");
  if (!fs.existsSync(templatesDir)) return [];
  return fs
    .readdirSync(templatesDir)
    .filter((file) => file.endsWith(".vue"))
    .map((file) => file.replace(/\.vue$/, ""))
    .sort();
}

function renderTemplateIndex(templates: string[]): string {
  const items = templates.length
    ? templates
        .map(
          (name) =>
            `<li><a href="/dev/preview.html?template=${encodeURIComponent(
              name,
            )}">${name}</a></li>`,
        )
        .join("")
    : "<li><em>No templates found</em></li>";

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>vuedo — Templates</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 3rem; color: #111; }
      h1 { font-size: 1.5rem; }
      a { color: #2563eb; text-decoration: none; }
      a:hover { text-decoration: underline; }
      ul { line-height: 1.9; }
    </style>
  </head>
  <body>
    <h1>vuedo templates</h1>
    <ul>${items}</ul>
  </body>
</html>`;
}

async function main() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "custom",
  });

  const app = buildApp({
    render: (template: string, data: unknown) =>
      renderDev(vite, template, data),
  });

  const httpServer = createHttpServer(async (req, res) => {
    // Vite owns everything except the API: serves /dev/preview.html with full
    // HMR and transforms /src modules on the fly.
    if (!req.url?.startsWith("/api/")) {
      const url = (req.url ?? "/").split("?")[0];
      if (url === "/" || url === "") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html");
        res.end(renderTemplateIndex(listTemplates()));
        return;
      }
      if (url === "/dev/preview.html") {
        const raw = fs.readFileSync(
          path.resolve("src/dev/preview.html"),
          "utf-8",
        );
        const html = await vite.transformIndexHtml(url, raw);
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html");
        res.end(html);
        return;
      }
      vite.middlewares(req, res, () => {
        res.statusCode = 404;
        res.end("Not found");
      });
      return;
    }

    const url = `http://localhost${req.url}`;
    const method = req.method ?? "GET";
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body =
      method !== "GET" && method !== "HEAD"
        ? Buffer.concat(chunks)
        : undefined;

    const request = new Request(url, {
      method,
      headers: req.headers as Record<string, string>,
      body,
    });

    const response = await app.handle(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    const buffer = Buffer.from(await response.arrayBuffer());
    res.end(buffer);
  });

  httpServer.listen(8080, () => {
    console.log(
      "🦊 Dev orchestrator on :8080 — templates hot-reload, no build step",
    );
  });
}

main();
