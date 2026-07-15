import { Elysia, t } from "elysia";
import { node } from "@elysiajs/node";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createPdfKit, inlineCssAssets } from "@hshm/vuedo";
import type { PdfTemplateProps } from "./generated/pdf-templates";

// This root package is a *consumer* of @hshm/vuedo — an ordinary Elysia
// backend that owns its own routing. The library does the Vue SSR + Gotenberg
// work behind createPdfKit(); layout (body + paired header/footer) is resolved
// by naming convention, and the generated PdfTemplateProps keeps each template's
// data type-checked. Consumers expose one typed route per template (not a
// generic public endpoint) so Elysia's TypeBox validation guards the body,
// header and footer data at the edge.
const templatesDir = path.resolve("templates");

// Tailwind is compiled to dist/app.css by the `build:css` / `dev` scripts.
// vuedo base64-inlines any local font `url()` so the PDF needs no network.
async function loadCss(): Promise<string> {
  try {
    const raw = readFileSync(path.resolve("dist/app.css"), "utf8");
    return await inlineCssAssets(raw, process.cwd());
  } catch {
    return "";
  }
}

const css = await loadCss();

export const vuedo = createPdfKit<PdfTemplateProps>({
  templatesDir,
  gotenbergUrl: process.env.GOTENBERG_URL ?? "http://localhost:3000",
  css,
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
  options: t.Optional(optionsSchema),
});

const posOrderSchema = t.Object({
  header: t.Object({ store: t.String() }),
  body: t.Object({ orderId: t.String(), total: t.Number() }),
  options: t.Optional(optionsSchema),
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

// Browser-friendly landing page: each template is its own typed POST route, so
// navigating directly to /invoice (a GET) would 404. This GET / page posts
// sample payloads via fetch so the PDF / preview can be triggered from a browser.
const SAMPLE_PAYLOADS: Record<string, unknown> = {
  invoice: {
    header: { id: "INV-1", customerName: "Acme Corp" },
    body: { id: "INV-1", customerName: "Acme Corp" },
    footer: { id: "INV-1", customerName: "Acme Corp" },
    options: {},
  },
  "pos-order": {
    header: { store: "Downtown" },
    body: { orderId: "ORD-9", total: 42 },
    options: {},
  },
};

function landingPage(): string {
  const cards = Object.keys(SAMPLE_PAYLOADS)
    .map((name) => {
      const sample = JSON.stringify(SAMPLE_PAYLOADS[name], null, 2);
      return `
      <div class="card">
        <h2>POST /${name}</h2>
        <textarea id="ta-${name}" rows="9">${sample}</textarea>
        <div class="row">
          <button onclick="gen('${name}', false)">Generate PDF</button>
          <button onclick="gen('${name}', true)">Preview HTML</button>
        </div>
        <iframe id="out-${name}"></iframe>
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>vuedo</title>
  <style>body{font-family:sans-serif;margin:2rem;color:#111}
  .card{border:1px solid #ddd;border-radius:8px;padding:1rem;margin-bottom:1.5rem;max-width:720px}
  textarea{width:100%;font-family:monospace;box-sizing:border-box}
  .row{margin:.6rem 0} button{margin-right:.5rem;padding:.4rem .8rem}
  iframe{width:100%;height:420px;border:1px solid #eee;border-radius:6px}</style>
  </head><body>
  <h1>vuedo</h1>
  <p>Each template is its own typed <code>POST</code> route with TypeBox validation.
     Edit the sample payload, then generate a PDF or preview the composed SSR HTML.</p>
  ${cards}
  <script>
    async function gen(name, preview) {
      const ta = document.getElementById('ta-' + name);
      let payload;
      try { payload = JSON.parse(ta.value); } catch (e) { alert('Invalid JSON: ' + e.message); return; }
      const res = await fetch('/' + name + (preview ? '?preview=html' : ''), {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      const out = document.getElementById('out-' + name);
      if (preview) { out.srcdoc = await res.text(); }
      else { out.src = URL.createObjectURL(await res.blob()); }
    }
  </script>
  </body></html>`;
}

export const app = new Elysia({ adapter: node() })
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
    { body: invoiceSchema },
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
        "pos.pos-order",
      );
    },
    { body: posOrderSchema },
  )
  .get("/", () => {
    return new Response(landingPage(), {
      headers: { "Content-Type": "text/html" },
    });
  })
  .listen(8080);

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode =
    process.env.NODE_ENV === "production"
      ? "prod, manifest"
      : "dev, live templates";
  console.log(`🦊 vuedo running (${mode}) on :8080`);
}
