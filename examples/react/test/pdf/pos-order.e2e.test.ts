import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";
import { createPandaf, GotenbergDriver } from "@pandaf/react";
import type { PandafProps } from "../../src/generated/pandaf";
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
  "PDF generation — pos-order (production kit + real Gotenberg, E2E)",
  () => {
    beforeAll(() => {
      execSync("pnpm build --logLevel error", {
        cwd: process.cwd(),
        stdio: "inherit",
      });
    }, 120_000);

    it("renders body + auto-paired header/footer and returns a real PDF", async () => {
      const kit = createPandaf<PandafProps>({
        templatesDir: path.resolve("templates"),
        driver: new GotenbergDriver(GOTENBERG_URL),
        mode: "production",
        manifestPath: path.resolve("dist/pdf-manifest.json"),
        css: path.resolve("dist/pandaf.css"),
      });

      const stream = await kit.generatePdf("pos.pos-order", {
        header: {
          store: "Downtown React",
          address: "12 JSX Ave",
          orderNumber: "ORD-R42",
          date: "2026-07-15 14:32",
          cashier: "Sam",
        },
        body: {
          items: [{ name: "Flat White", qty: 2, price: 4.5 }],
          tax: 0.98,
          total: 9.98,
          paymentMethod: "Card",
        },
        footer: {
          thankYou: "Thanks — see you again!",
          returnPolicy: "No returns",
        },
        options: {},
      });

      const buffer = Buffer.from(await new Response(stream).arrayBuffer());
      const parsed = await pdfParse(buffer);

      expect(parsed.numpages).toBeGreaterThanOrEqual(1);
      expect(parsed.text).toContain("ORD-R42");
      expect(parsed.text).toContain("Downtown React");
      expect(parsed.text).toContain("Thanks — see you again!");
      await kit.close();
    });
  },
);
