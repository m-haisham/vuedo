import { Elysia, t } from "elysia";
import fs from "node:fs";
import path from "node:path";
import { createPdfKit } from "@hshm/vuedf";

// This root package is a *consumer* of @hshm/vuedf — an ordinary Elysia
// backend that owns its own routing. The library does the Vue SSR + Gotenberg
// work behind createPdfKit(); dev-mode live template compilation is a property
// of the kit (§4.3 tier 3), not of this router.
const templatesDir = path.resolve("src/pdf-templates");

export const pdfKit = createPdfKit({
  templatesDir,
  gotenbergUrl: process.env.GOTENBERG_URL ?? "http://localhost:3000",
  manifestPath: path.resolve("dist/pdf-manifest.json"),
});

export const app = new Elysia().post(
  "/api/v1/generate-pdf",
  async ({ body, query, set }) => {
    try {
      // Dev convenience: ?preview=html returns the composed SSR HTML directly
      // instead of round-tripping through Gotenberg.
      if (query.preview === "html") {
        const bodyHtml = await pdfKit.renderHtml(body.template, body.data);
        const headerHtml = body.header
          ? await pdfKit.renderHtml(body.header.template, body.header.data)
          : null;
        const footerHtml = body.footer
          ? await pdfKit.renderHtml(body.footer.template, body.footer.data)
          : null;
        const sections = [
          headerHtml ? `<div class="vuedo-header">${headerHtml}</div>` : "",
          `<div class="vuedo-body">${bodyHtml}</div>`,
          footerHtml ? `<div class="vuedo-footer">${footerHtml}</div>` : "",
        ].join("\n");
        const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${sections}</body></html>`;
        return new Response(doc, {
          headers: { "Content-Type": "text/html" },
        });
      }

      const stream = await pdfKit.generatePdf(body.template, body.data, {
        header: body.header,
        footer: body.footer,
      });
      return new Response(stream, {
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

function listTemplates(): string[] {
  if (!fs.existsSync(templatesDir)) return [];
  return fs
    .readdirSync(templatesDir)
    .filter((file) => file.endsWith(".vue"))
    .map((file) => file.replace(/\.vue$/, ""))
    .sort();
}

// Elysia 1.x defaults to the WebStandard adapter (no `.listen()`), so we serve
// via a native HTTP server and delegate `/api/*` to `app.handle`.
export async function startServer(port = 8080): Promise<void> {
  const { createServer } = await import("node:http");
  const server = createServer(async (req, res) => {
    const url = (req.url ?? "/").split("?")[0];

    if (url.startsWith("/api/")) {
      const method = req.method ?? "GET";
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const requestBody =
        method !== "GET" && method !== "HEAD"
          ? Buffer.concat(chunks)
          : undefined;
      const request = new Request(`http://localhost${req.url}`, {
        method,
        headers: req.headers as Record<string, string>,
        body: requestBody,
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
            `<li>${name} — <code>POST /api/v1/generate-pdf {"template":"${name}",...}</code></li>`,
        )
        .join("");
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html");
      res.end(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>vuedo</title></head><body><h1>vuedo templates</h1><ul>${items}</ul></body></html>`,
      );
      return;
    }

    res.statusCode = 404;
    res.end("Not found");
  });

  server.listen(port, () => {
    const mode =
      process.env.NODE_ENV === "production"
        ? "prod, manifest"
        : "dev, live templates";
    console.log(`🦊 vuedo running (${mode}) on :${port}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer(8080);
}
