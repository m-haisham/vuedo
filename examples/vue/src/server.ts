import { Elysia, t } from "elysia";
import { node } from "@elysiajs/node";
import path from "node:path";
import { createVuedo, GotenbergDriver } from "@hshm/vuedo";
import { openapi } from "@elysiajs/openapi";
import type { PdfTemplateProps } from "./generated/vuedo";

// This root package is a *consumer* of @hshm/vuedo — an ordinary Elysia
// backend that owns its own routing. The library does the Vue SSR + Gotenberg
// work behind createVuedo(); layout (body + paired header/footer) is resolved
// by naming convention, and the generated PdfTemplateProps keeps each template's
// data type-checked. Consumers expose one typed route per template (not a
// generic public endpoint) so Elysia's TypeBox validation guards the body,
// header and footer data at the edge.
const templatesDir = path.resolve("templates");

// Tailwind is compiled by the package itself from this entry (scoped to the
// PDF templates + assets by default — the whole service needs no Tailwind build
// step). The consumer tunes scan scope via `@source` in this file.
const tailwindEntry = path.resolve("assets/app.css");

export const vuedo = createVuedo<PdfTemplateProps>({
  templatesDir,
  driver: new GotenbergDriver(
    process.env.GOTENBERG_URL ?? "http://localhost:3000",
  ),
  tailwind: tailwindEntry,
  manifestPath: path.resolve("dist/pdf-manifest.json"),
});

// Each template's request body: `{ header?, body, footer?, options }`, shaped
// exactly like the generated PdfTemplateProps entry (a template without a
// paired header/footer simply omits that key). `options` carries the Gotenberg
// page margins.
const optionsSchema = t.Object({
  marginTop: t.Optional(t.Number()),
  marginBottom: t.Optional(t.Number()),
  marginLeft: t.Optional(t.Number()),
  marginRight: t.Optional(t.Number()),
});

const invoiceSchema = t.Object({
  header: t.Object({
    companyName: t.String(),
    companyEmail: t.String(),
    invoiceNumber: t.String(),
    issueDate: t.String(),
    dueDate: t.String(),
  }),
  body: t.Object({
    billTo: t.Object({
      name: t.String(),
      company: t.Optional(t.String()),
      address: t.String(),
    }),
    items: t.Array(
      t.Object({
        description: t.String(),
        qty: t.Number(),
        unitPrice: t.Number(),
      }),
    ),
    taxRate: t.Number(),
    notes: t.Optional(t.String()),
  }),
  footer: t.Object({
    thankYou: t.String(),
    contactEmail: t.String(),
    website: t.String(),
  }),
  options: t.Optional(optionsSchema),
});

const posOrderSchema = t.Object({
  header: t.Object({
    store: t.String(),
    address: t.String(),
    orderNumber: t.String(),
    date: t.String(),
    cashier: t.String(),
  }),
  body: t.Object({
    items: t.Array(
      t.Object({
        name: t.String(),
        qty: t.Number(),
        price: t.Number(),
      }),
    ),
    tax: t.Number(),
    total: t.Number(),
    paymentMethod: t.String(),
  }),
  footer: t.Object({
    thankYou: t.String(),
    returnPolicy: t.String(),
  }),
  options: t.Optional(optionsSchema),
});

function pdfResponse(stream: ReadableStream, filename: string): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
    },
  });
}

export const app = new Elysia({ adapter: node() })
  .use(
    openapi({
      path: "/docs",
      specPath: "/openapi.json",
      documentation: {
        info: {
          title: "vuedo PDF Service",
          version: "1.0.0",
          description:
            "A small example consumer of `@hshm/vuedo` that turns Vue + " +
            "Tailwind templates into PDFs via Gotenberg. Each PDF is its own " +
            "typed route. Send the `{ header?, body, footer?, options }` " +
            "payload as JSON; add `?preview=html` to get the composed SSR " +
            "HTML instead of a PDF.",
        },
        servers: [
          { url: "http://localhost:8080", description: "Local dev server" },
        ],
        tags: [
          {
            name: "PDF Templates",
            description: "Generate or preview a PDF from a Vue template.",
          },
          {
            name: "API Reference",
            description: "Service metadata endpoints.",
          },
        ],
      },
      scalar: {
        spec: { url: "/openapi.json" },
        theme: "default",
        metaData: {
          title: "vuedo PDF Service",
          description:
            "Generate and preview PDFs from Vue + Tailwind templates.",
        },
      },
    }),
  )
  .post(
    "/invoice",
    async ({ body, query }) => {
      if (query.preview === "html") {
        const html = await vuedo.renderComposite("invoice", body);
        return new Response(html, {
          headers: { "Content-Type": "text/html" },
        });
      }
      return pdfResponse(await vuedo.generatePdf("invoice", body), "invoice");
    },
    {
      body: invoiceSchema,
      query: t.Object({
        preview: t.Optional(t.String()),
      }),
      detail: {
        tags: ["PDF Templates"],
        summary: "Generate an invoice PDF",
        description:
          "Renders the invoice template (header + body + footer) into a PDF. " +
          "Append `?preview=html` to receive the composed SSR HTML instead.",
      },
    },
  )
  .post(
    "/pos-order",
    async ({ body, query }) => {
      if (query.preview === "html") {
        const html = await vuedo.renderComposite("pos.pos-order", body);
        return new Response(html, {
          headers: { "Content-Type": "text/html" },
        });
      }
      return pdfResponse(
        await vuedo.generatePdf("pos.pos-order", body),
        "pos-order",
      );
    },
    {
      body: posOrderSchema,
      query: t.Object({
        preview: t.Optional(t.String()),
      }),
      detail: {
        tags: ["PDF Templates"],
        summary: "Generate a POS receipt PDF",
        description:
          "Renders the POS receipt template (header + body + footer) into a PDF. " +
          "Append `?preview=html` to receive the composed SSR HTML instead.",
      },
    },
  )
  .get(
    "/",
    () => {
      return new Response(null, {
        status: 302,
        headers: { location: "/docs" },
      });
    },
    {
      detail: {
        hide: true,
      },
    },
  )
  .listen(8080);

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode =
    process.env.NODE_ENV === "production"
      ? "prod, manifest"
      : "dev, live templates";
  console.log(`🦊 vuedo running (${mode}) on :8080`);
}
