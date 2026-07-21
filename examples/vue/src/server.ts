import { Elysia, t } from "elysia";
import { node } from "@elysiajs/node";
import path from "node:path";
import {
  ChromiumDriver,
  createPandaf,
  GotenbergDriver,
  InMemoryCache,
  PuppeteerMeasurer,
  type PaperSize,
} from "@pandaf/vue";
import { openapi } from "@elysiajs/openapi";
import type { PandafProps } from "./generated/pandaf";

const templatesDir = path.resolve("templates");
const isDev = process.env.NODE_ENV !== "production";

export const pandaf = createPandaf<PandafProps>({
  templatesDir,
  driver: new GotenbergDriver(
    process.env.GOTENBERG_URL ?? "http://localhost:3000",
  ),
  measurer: new PuppeteerMeasurer(
    new ChromiumDriver({
      browserURL: "http://localhost:3001",
    }),
  ),
  cache: new InMemoryCache(),
  mode: isDev ? "development" : "production",
  manifestPath: path.resolve("dist/pdf-manifest.json"),
  css: isDev ? undefined : path.resolve("dist/pandaf.css"),
});

// Each template's request body: `{ header?, body, footer?, options }`, shaped
// exactly like the generated PandafProps entry (a template without a
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

// Mock data for the live preview routes (§preview-pipeline).
const INVOICE_MOCK = {
  header: {
    companyName: "Acme Corp",
    companyEmail: "billing@acme.com",
    invoiceNumber: "INV-2024-001",
    issueDate: "2024-01-15",
    dueDate: "2024-02-14",
  },
  body: {
    billTo: {
      name: "Jane Smith",
      company: "Smith & Co",
      address: "123 Main St, Springfield, IL 62701",
    },
    items: [
      { description: "Consulting services (Jan)", qty: 40, unitPrice: 150 },
      { description: "Software license", qty: 1, unitPrice: 1200 },
      { description: "Hosting (monthly)", qty: 1, unitPrice: 99 },
    ],
    taxRate: 0.08,
    notes: "Payment due within 30 days",
  },
  footer: {
    thankYou: "Thank you for your business!",
    contactEmail: "support@acme.com",
    website: "https://acme.com",
  },
  options: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
};

const POS_ORDER_MOCK = {
  header: {
    store: "Corner Store #42",
    address: "456 Oak Ave, Portland, OR 97201",
    orderNumber: "POS-2024-89123",
    date: "2024-07-15 14:32",
    cashier: "Alex Rivera",
  },
  body: {
    items: [
      { name: "Organic Honey", qty: 2, price: 8.99 },
      { name: "Sourdough Bread", qty: 1, price: 5.49 },
      { name: "Almond Milk", qty: 3, price: 4.29 },
      { name: "Free-Range Eggs (dozen)", qty: 1, price: 6.99 },
    ],
    tax: 3.12,
    total: 42.14,
    paymentMethod: "Visa **** 4242",
  },
  footer: {
    thankYou: "Thank you — come again!",
    returnPolicy: "Returns accepted within 30 days with receipt.",
  },
  options: { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
};

export const app = new Elysia({ adapter: node() })
  .use(
    openapi({
      path: "/docs",
      specPath: "/openapi.json",
      documentation: {
        info: {
          title: "pandaf PDF Service",
          version: "1.0.0",
          description:
            "A small example consumer of `@pandaf/vue` that turns Vue + " +
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
          title: "pandaf PDF Service",
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
        const html = await pandaf.renderComposite("invoice", body);
        return new Response(html, {
          headers: { "Content-Type": "text/html" },
        });
      }
      return pdfResponse(await pandaf.generatePdf("invoice", body), "invoice");
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
        const html = await pandaf.renderComposite("pos.pos-order", body);
        return new Response(html, {
          headers: { "Content-Type": "text/html" },
        });
      }
      return pdfResponse(
        await pandaf.generatePdf("pos.pos-order", body),
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
    "/invoice/preview",
    async ({ query }) => {
      const VITE_PORT = Number(process.env.VITE_PORT) || 5173;
      const html = await pandaf.previewHtml("invoice", INVOICE_MOCK, {
        vitePort: VITE_PORT,
        paperSize: (query.paperSize as PaperSize) ?? "a4",
        downloadUrl: "/invoice/pdf",
      });
      return new Response(html, {
        headers: { "Content-Type": "text/html" },
      });
    },
    {
      query: t.Object({
        paperSize: t.Optional(t.String()),
      }),
      detail: {
        tags: ["PDF Templates"],
        summary: "Live preview of the invoice template",
        description:
          "Renders the invoice template in a preview page with paper-size " +
          "selector and hot-reload via Vite HMR. Edit the Vue template and " +
          "the browser updates automatically.",
      },
    },
  )
  .get(
    "/pos-order/preview",
    async ({ query }) => {
      const VITE_PORT = Number(process.env.VITE_PORT) || 5173;
      const html = await pandaf.previewHtml("pos.pos-order", POS_ORDER_MOCK, {
        vitePort: VITE_PORT,
        paperSize: (query.paperSize as PaperSize) ?? "a4",
        downloadUrl: "/pos-order/pdf",
      });
      return new Response(html, {
        headers: { "Content-Type": "text/html" },
      });
    },
    {
      query: t.Object({
        paperSize: t.Optional(t.String()),
      }),
      detail: {
        tags: ["PDF Templates"],
        summary: "Live preview of the POS receipt template",
        description:
          "Renders the POS receipt template in a preview page with paper-size " +
          "selector and hot-reload. Edit the Vue template and the browser " +
          "updates automatically.",
      },
    },
  )
  .get(
    "/invoice/pdf",
    async () => {
      return pdfResponse(
        await pandaf.generatePdf("invoice", INVOICE_MOCK),
        "invoice",
      );
    },
    {
      detail: {
        tags: ["PDF Templates"],
        summary: "Download invoice as PDF",
        description:
          "Returns the invoice template rendered as a PDF using mock data.",
      },
    },
  )
  .get(
    "/pos-order/pdf",
    async () => {
      return pdfResponse(
        await pandaf.generatePdf("pos.pos-order", POS_ORDER_MOCK),
        "pos-order",
      );
    },
    {
      detail: {
        tags: ["PDF Templates"],
        summary: "Download POS receipt as PDF",
        description:
          "Returns the POS receipt template rendered as a PDF using mock data.",
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
  console.log(`🦊 pandaf running (${mode}) on :8080`);
}
