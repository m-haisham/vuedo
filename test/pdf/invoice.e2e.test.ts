import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";
import { createVuedo } from "@hshm/vuedo";
import pdfParse from "pdf-parse";

// Per-template E2E for the `invoice` PDF (§7): exercise the *production*
// renderer path (manifest, no dev Vite) end-to-end through a real Gotenberg
// container, then parse the returned PDF with pdf-parse. Bring Gotenberg up with
// `docker compose -f deploy/docker-compose.yml up` (or set GOTENBERG_URL); the
// suite skips automatically when Gotenberg is unreachable.

const GOTENBERG_URL = process.env.GOTENBERG_URL || "http://localhost:3000";

let gotenbergAvailable = false;
try {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2000);
  await fetch(`${GOTENBERG_URL}/forms/chromium/convert/html`, {
    method: "POST",
    signal: ctrl.signal,
    body: new FormData(),
  });
  clearTimeout(timer);
  gotenbergAvailable = true;
} catch {
  gotenbergAvailable = false;
}

describe.skipIf(!gotenbergAvailable)(
  "PDF generation — invoice (production kit + real Gotenberg, E2E, §7)",
  () => {
    beforeAll(() => {
      // Real production build via the vuedo Vite plugin → dist/ + manifest.
      execSync("pnpm build --logLevel error", {
        cwd: process.cwd(),
        stdio: "inherit",
      });
    }, 120_000);

    it("renders body + auto-paired header/footer and returns a real PDF", async () => {
      const kit = createVuedo({
        templatesDir: path.resolve("templates"),
        gotenbergUrl: GOTENBERG_URL,
        mode: "production",
        manifestPath: path.resolve("dist/pdf-manifest.json"),
      });

      const stream = await kit.generatePdf("invoice", {
        header: {
          companyName: "Northwind Studio",
          companyEmail: "billing@northwind.example",
          invoiceNumber: "INV-HF-1",
          issueDate: "2026-07-15",
          dueDate: "2026-08-14",
        },
        body: {
          billTo: { name: "Header Footer Co", address: "1 Main St" },
          items: [{ description: "Consulting", qty: 1, unitPrice: 1000 }],
          taxRate: 0.1,
        },
        footer: {
          thankYou: "Thank you for your business!",
          contactEmail: "billing@northwind.example",
          website: "northwind.example",
        },
        options: {},
      });

      const buffer = Buffer.from(await new Response(stream).arrayBuffer());
      const parsed = await pdfParse(buffer);

      expect(parsed.numpages).toBeGreaterThanOrEqual(1);
      expect(parsed.text).toContain("INV-HF-1");
      expect(parsed.text).toContain("Header Footer Co");
      // Header/footer wiring: Gotenberg rendered the extra HTML parts.
      expect(parsed.text).toContain("Northwind Studio");
      expect(parsed.text).toContain("Thank you for your business!");
      await kit.close();
    });
  },
);
