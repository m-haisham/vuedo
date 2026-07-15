import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { Readable } from "node:stream";
import { AddressInfo } from "node:net";
import pdfLib from "pdf-lib";
import pdfParse from "pdf-parse";
import { buildApp } from "../src/server/index";

// §7 strategy: test against the PRODUCTION renderer path (render.prod.ts +
// a real `dist/` build). Gotenberg (Chromium) is an external container, so we
// stand up a tiny local mock that returns a genuine PDF built from the posted
// HTML text. The orchestration, bundling, header/footer wiring, and pdf-parse
// assertions are all real; only the headless browser is stubbed.
//
// Point GOTENBERG_URL at a real Gotenberg to run against actual Chromium.

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface GotenbergCall {
  receivedHeader: boolean;
  receivedFooter: boolean;
}

function startMockGotenberg(onCall: (call: GotenbergCall) => void): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  return new Promise((resolve) => {
    const server: Server = createServer(async (req, res) => {
      const webReq = new Request(`http://gotenberg${req.url}`, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: Readable.toWeb(req) as unknown as ReadableStream,
        duplex: "half" as unknown as undefined,
      });
      const form = await webReq.formData();
      const files = form.getAll("files") as Blob[];
      let receivedHeader = false;
      let receivedFooter = false;
      for (const file of files) {
        const name = (file as File).name;
        if (name === "header.html") receivedHeader = true;
        if (name === "footer.html") receivedFooter = true;
      }
      onCall({ receivedHeader, receivedFooter });

      const pdfDoc = await pdfLib.PDFDocument.create();
      const font = await pdfDoc.embedFont(pdfLib.StandardFonts.Helvetica);
      const page1 = pdfDoc.addPage([612, 792]);
      page1.drawText("VUEDO-PDF-MARKER " + stripHtml(await files[0].text()), {
        x: 50,
        y: 700,
        size: 11,
        font,
        maxWidth: 500,
      });
      pdfDoc.addPage([612, 792]); // second page -> numpages === 2

      const bytes = await pdfDoc.save();
      res.setHeader("Content-Type", "application/pdf");
      res.end(Buffer.from(bytes));
    });

    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        url: `http://localhost:${port}`,
        close: () =>
          new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

describe("PDF generation — production renderer path (E2E, §7)", () => {
  let gotenberg: Awaited<ReturnType<typeof startMockGotenberg>>;
  let lastCall: GotenbergCall = {
    receivedHeader: false,
    receivedFooter: false,
  };
  const originalGotenbergUrl = process.env.GOTENBERG_URL;

  beforeAll(async () => {
    // Real production build: bundle entry-server.ts -> dist/entry-server.js.
    execSync(
      "pnpm exec vite build --ssr src/entry-server.ts --outDir dist --logLevel error",
      { cwd: process.cwd(), stdio: "inherit" },
    );
    gotenberg = await startMockGotenberg((call) => {
      lastCall = call;
    });
    process.env.GOTENBERG_URL = gotenberg.url;
  }, 120_000);

  afterAll(async () => {
    process.env.GOTENBERG_URL = originalGotenbergUrl;
    await gotenberg?.close();
  });

  beforeEach(() => {
    lastCall = { receivedHeader: false, receivedFooter: false };
  });

  it("renders body + header + footer through the prod bundle and returns a PDF", async () => {
    // render.prod is dynamically imported AFTER the build so the dist import
    // resolves.
    const { renderProd } = await import("../src/server/render.prod");
    const app = buildApp({ render: renderProd });

    const res = await app.handle(
      new Request("http://localhost/api/v1/generate-pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          template: "Invoice",
          data: { id: "INV-HF-1", customerName: "Header Footer Co" },
          header: { template: "InvoiceHeader", data: {} },
          footer: { template: "InvoiceFooter", data: {} },
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="Invoice.pdf"',
    );

    const buffer = Buffer.from(await res.arrayBuffer());
    const parsed = await pdfParse(buffer);

    // pdf-parse assertions on the actual PDF bytes.
    expect(parsed.numpages).toBe(2);
    expect(parsed.text).toContain("VUEDO-PDF-MARKER");
    expect(parsed.text).toContain("INV-HF-1");
    expect(parsed.text).toContain("Header Footer Co");

    // Header/footer wiring: Gotenberg received both extra HTML parts.
    expect(lastCall.receivedHeader).toBe(true);
    expect(lastCall.receivedFooter).toBe(true);
  });

  it("still works without header/footer (body only)", async () => {
    const { renderProd } = await import("../src/server/render.prod");
    const app = buildApp({ render: renderProd });

    const res = await app.handle(
      new Request("http://localhost/api/v1/generate-pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          template: "Invoice",
          data: { id: "INV-NO-HF", customerName: "Body Only" },
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");

    // Header/footer wiring: Gotenberg received no extra HTML parts.
    expect(lastCall.receivedHeader).toBe(false);
    expect(lastCall.receivedFooter).toBe(false);
  });
});
