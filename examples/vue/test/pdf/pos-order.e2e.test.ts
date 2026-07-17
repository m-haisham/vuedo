import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";
import { createVuedo } from "@hshm/vuedo";
import pdfParse from "pdf-parse";

// Per-template E2E for the `pos.pos-order` (POS receipt) PDF (§7): exercise the
// *production* renderer path (manifest, no dev Vite) end-to-end through a real
// Gotenberg container, then parse the returned PDF with pdf-parse. Bring
// Gotenberg up with `docker compose -f deploy/docker-compose.yml up` (or set
// GOTENBERG_URL); the suite skips automatically when Gotenberg is unreachable.

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
  "PDF generation — pos.pos-order (production kit + real Gotenberg, E2E, §7)",
  () => {
    beforeAll(() => {
      // Real production build via the vuedo Vite plugin → dist/ + manifest.
      execSync("pnpm build --logLevel error", {
        cwd: process.cwd(),
        stdio: "inherit",
      });
    }, 120_000);

    it("renders a nested template with its paired header and footer", async () => {
      const kit = createVuedo({
        templatesDir: path.resolve("templates"),
        gotenbergUrl: GOTENBERG_URL,
        mode: "production",
        manifestPath: path.resolve("dist/pdf-manifest.json"),
      });

      const stream = await kit.generatePdf("pos.pos-order", {
        header: {
          store: "Downtown",
          address: "12 Pine St",
          orderNumber: "ORD-9",
          date: "2026-07-15 14:32",
          cashier: "Sam",
        },
        body: {
          items: [{ name: "Flat White", qty: 2, price: 4.5 }],
          tax: 0.98,
          total: 9.98,
          paymentMethod: "Card",
        },
        footer: { thankYou: "Thanks — see you again!", returnPolicy: "No returns" },
        options: {},
      });

      const buffer = Buffer.from(await new Response(stream).arrayBuffer());
      const parsed = await pdfParse(buffer);
      expect(parsed.text).toContain("ORD-9");
      expect(parsed.text).toContain("Downtown");
      expect(parsed.text).toContain("Thanks — see you again!");
      await kit.close();
    });
  },
);
