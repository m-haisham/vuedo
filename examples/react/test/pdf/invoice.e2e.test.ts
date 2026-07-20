import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";
import { createVuedo, GotenbergDriver } from "@vuedo/react";
import type { VuedoProps } from "../../src/generated/vuedo";
import pdfParse from "pdf-parse";

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
  "PDF generation — invoice (production kit + real Gotenberg, E2E)",
  () => {
    beforeAll(() => {
      execSync("pnpm build --logLevel error", {
        cwd: process.cwd(),
        stdio: "inherit",
      });
    }, 120_000);

    it("renders body + auto-paired header/footer and returns a real PDF", async () => {
      const kit = createVuedo<VuedoProps>({
        templatesDir: path.resolve("templates"),
        driver: new GotenbergDriver(GOTENBERG_URL),
        mode: "production",
        manifestPath: path.resolve("dist/pdf-manifest.json"),
        css: path.resolve("dist/vuedo.css"),
      });

      const stream = await kit.generatePdf("invoice", {
        header: {
          companyName: "React Studio",
          companyEmail: "billing@react.example",
          invoiceNumber: "INV-R-1",
          issueDate: "2026-07-15",
          dueDate: "2026-08-14",
        },
        body: {
          billTo: { name: "React Co", address: "1 TSX Ln" },
          items: [{ description: "Consulting", qty: 1, unitPrice: 1000 }],
          taxRate: 0.1,
        },
        footer: {
          thankYou: "Thank you for your business!",
          contactEmail: "billing@react.example",
          website: "react.example",
        },
        options: {},
      });

      const buffer = Buffer.from(await new Response(stream).arrayBuffer());
      const parsed = await pdfParse(buffer);

      expect(parsed.numpages).toBeGreaterThanOrEqual(1);
      expect(parsed.text).toContain("INV-R-1");
      expect(parsed.text).toContain("React Co");
      expect(parsed.text).toContain("React Studio");
      expect(parsed.text).toContain("Thank you for your business!");
      await kit.close();
    });
  },
);
