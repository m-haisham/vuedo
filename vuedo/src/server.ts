import { Elysia, t } from "elysia";
import { node } from "@elysiajs/node";
import path from "node:path";
import { createPdfKit } from "@hshm/vuedo";
import type { PdfTemplateProps } from "./generated/pdf-templates";

// This root package is a *consumer* of @hshm/vuedo — an ordinary Elysia
// backend that owns its own routing. The library does the Vue SSR + Gotenberg
// work behind createPdfKit(); layout (body + paired header/footer) is resolved
// by naming convention, and the generated PdfTemplateProps keeps each template's
// data type-checked. Consumers expose one typed route per template (not a
// generic public endpoint) so Elysia's TypeBox validation guards the body,
// header and footer data at the edge.
const templatesDir = path.resolve("src/pdf-templates");

export const vuedo = createPdfKit<PdfTemplateProps>({
  templatesDir,
  gotenbergUrl: process.env.GOTENBERG_URL ?? "http://localhost:3000",
  manifestPath: path.resolve("dist/pdf-manifest.json"),
});

// Each template's request body: `{ header?, body, footer?, options }`, shaped
// exactly like the generated PdfTemplateProps entry (a template without a
// paired header/footer simply omits that key). `options` carries the Gotenberg
// page margins.
const optionsSchema = t.Object({
  marginTop: t.Optional(t.Number()),
  marginBottom: t.Optional(t.Number()),
});

const invoiceSchema = t.Object({
  header: t.Object({ id: t.String(), customerName: t.String() }),
  body: t.Object({ id: t.String(), customerName: t.String() }),
  footer: t.Object({ id: t.String(), customerName: t.String() }),
  options: optionsSchema,
});

const posOrderSchema = t.Object({
  header: t.Object({ store: t.String() }),
  body: t.Object({ orderId: t.String(), total: t.Number() }),
  options: optionsSchema,
});

function pdfResponse(
  stream: ReadableStream,
  filename: string,
): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
    },
  });
}

export const app = new Elysia({ adapter: node() })
  .post(
    "/invoice",
    async ({ body, query }) => {
      if (query.preview === "html") {
        const html = await vuedo.renderComposite("Invoice", body);
        return new Response(html, {
          headers: { "Content-Type": "text/html" },
        });
      }
      return pdfResponse(await vuedo.generatePdf("Invoice", body), "Invoice");
    },
    { body: invoiceSchema },
  )
  .post(
    "/pos-order",
    async ({ body, query }) => {
      if (query.preview === "html") {
        const html = await vuedo.renderComposite("Pos.PosOrder", body);
        return new Response(html, {
          headers: { "Content-Type": "text/html" },
        });
      }
      return pdfResponse(
        await vuedo.generatePdf("Pos.PosOrder", body),
        "Pos.PosOrder",
      );
    },
    { body: posOrderSchema },
  )
  .get("/", () => {
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>vuedo</title></head>` +
        `<body><h1>vuedo</h1><p>POST a typed body to each template route:</p>` +
        `<ul><li><code>POST /invoice</code></li><li><code>POST /pos-order</code></li></ul>` +
        `<p>Add <code>?preview=html</code> to get the composed SSR HTML instead of a PDF.</p></body></html>`,
      { headers: { "Content-Type": "text/html" } },
    );
  })
  .listen(8080);

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode =
    process.env.NODE_ENV === "production"
      ? "prod, manifest"
      : "dev, live templates";
  console.log(`🦊 vuedo running (${mode}) on :8080`);
}
