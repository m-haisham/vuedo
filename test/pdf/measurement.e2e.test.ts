import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";
import {
  createVuedo,
  ChromiumDriver,
  PuppeteerMeasurer,
  resolveMargins,
} from "@hshm/vuedo";
import pdfParse from "pdf-parse";

// E2E tests for pre-flight DOM measurement: exercises PuppeteerMeasurer against
// a real Browserless container, resolveMargins() integration, and the full
// generatePdf flow where measured banner heights become page margins. Bring up
// infra with `docker compose -f compose.yml up` or set the env vars below;
// suites skip automatically when services are unreachable.

const BROWSERLESS_URL = process.env.BROWSERLESS_URL || "ws://localhost:3001";
const GOTENBERG_URL = process.env.GOTENBERG_URL || "http://localhost:3000";

// ---------------------------------------------------------------------------
// Availability probes — each suite independently skips its dependency.
// ---------------------------------------------------------------------------
let browserlessAvailable = false;
try {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2000);
  await fetch(BROWSERLESS_URL.replace("ws://", "http://"), {
    signal: ctrl.signal,
  });
  clearTimeout(timer);
  browserlessAvailable = true;
} catch {
  // Browserless HTTP probe may not respond; also try WS connect.
  try {
    const ws = new WebSocket(BROWSERLESS_URL);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => {
        ws.close();
        resolve();
      };
      ws.onerror = () => reject(new Error("ws failed"));
      setTimeout(() => reject(new Error("timeout")), 2000);
    });
    browserlessAvailable = true;
  } catch {
    browserlessAvailable = false;
  }
}

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

// ---------------------------------------------------------------------------
// PuppeteerMeasurer — real Browserless
// ---------------------------------------------------------------------------
describe.skipIf(!browserlessAvailable)(
  "PuppeteerMeasurer — E2E (real Browserless)",
  () => {
    let driver: InstanceType<typeof ChromiumDriver>;
    let measurer: InstanceType<typeof PuppeteerMeasurer>;

    beforeAll(() => {
      driver = new ChromiumDriver({ browserWSEndpoint: BROWSERLESS_URL });
      measurer = new PuppeteerMeasurer(driver);
    });

    afterAll(async () => {
      await measurer.close();
      await driver.close();
    });

    it("measures a simple banner and returns a positive height in inches", async () => {
      const html = `<!DOCTYPE html><html><head><style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        header { width: 100%; height: 64px; background: #333; color: white; font-size: 16px; display: flex; align-items: center; }
      </style></head><body><header>Invoice Header — Company Name</header></body></html>`;

      const inches = await measurer.measure(html);
      expect(inches).toBeGreaterThan(0);
      // 64px at 96dpi ≈ 0.667 inches — allow generous tolerance for font metrics.
      expect(inches).toBeGreaterThan(0.4);
      expect(inches).toBeLessThan(1.5);
    });

    it("measures different heights for different content", async () => {
      const short = `<!DOCTYPE html><html><head><style>
        * { margin: 0; padding: 0; }
        div { height: 20px; }
      </style></head><body><div>short</div></body></html>`;

      const tall = `<!DOCTYPE html><html><head><style>
        * { margin: 0; padding: 0; }
        div { height: 120px; }
      </style></head><body><div>tall</div></body></html>`;

      const [hShort, hTall] = await Promise.all([
        measurer.measure(short),
        measurer.measure(tall),
      ]);
      expect(hTall).toBeGreaterThan(hShort);
    });

    it("returns 0 for empty/zero-height content", async () => {
      const html = `<!DOCTYPE html><html><body><span style="display:none">hidden</span></body></html>`;
      const inches = await measurer.measure(html);
      expect(inches).toBe(0);
    });
  },
);

// ---------------------------------------------------------------------------
// resolveMargins — real Browserless
// ---------------------------------------------------------------------------
describe.skipIf(!browserlessAvailable)(
  "resolveMargins — E2E (real Browserless)",
  () => {
    let driver: InstanceType<typeof ChromiumDriver>;
    let measurer: InstanceType<typeof PuppeteerMeasurer>;

    beforeAll(() => {
      driver = new ChromiumDriver({ browserWSEndpoint: BROWSERLESS_URL });
      measurer = new PuppeteerMeasurer(driver);
    });

    afterAll(async () => {
      await measurer.close();
      await driver.close();
    });

    const headerHtml = `<!DOCTYPE html><html><head><style>
      * { margin: 0; padding: 0; }
      header { height: 80px; background: navy; color: white; }
    </style></head><body><header>Company Invoice Header</header></body></html>`;

    const footerHtml = `<!DOCTYPE html><html><head><style>
      * { margin: 0; padding: 0; }
      footer { height: 40px; background: #eee; }
    </style></head><body><footer>Thank you</footer></body></html>`;

    it("fills marginTop/marginBottom from measurement when user provides none", async () => {
      const result = await resolveMargins(measurer, {}, headerHtml, footerHtml);
      expect(result.marginTop).toBeGreaterThan(0.5);
      expect(result.marginBottom).toBeGreaterThan(0.2);
    });

    it("user-provided margins override measurement", async () => {
      const result = await resolveMargins(
        measurer,
        { marginTop: 99, marginBottom: 99 },
        headerHtml,
        footerHtml,
      );
      expect(result.marginTop).toBe(99);
      expect(result.marginBottom).toBe(99);
    });
  },
);

// ---------------------------------------------------------------------------
// Full generatePdf flow — measurement + Gotenberg
// ---------------------------------------------------------------------------
describe.skipIf(!browserlessAvailable || !gotenbergAvailable)(
  "generatePdf with measurement — E2E (Browserless + Gotenberg)",
  () => {
    beforeAll(() => {
      execSync("pnpm build --logLevel error", {
        cwd: process.cwd(),
        stdio: "inherit",
      });
    }, 120_000);

    it(
      "generates a PDF with measured margins (no user-provided margins)",
      async () => {
      const driver = new ChromiumDriver({ browserWSEndpoint: BROWSERLESS_URL });
      const measurer = new PuppeteerMeasurer(driver);

      const kit = createVuedo({
        templatesDir: path.resolve("templates"),
        gotenbergUrl: GOTENBERG_URL,
        mode: "production",
        manifestPath: path.resolve("dist/pdf-manifest.json"),
        measurer,
      });

      const stream = await kit.generatePdf("invoice", {
        header: {
          companyName: "Measured Co",
          companyEmail: "hi@measured.example",
          invoiceNumber: "INV-M-1",
          issueDate: "2026-07-16",
          dueDate: "2026-08-16",
        },
        body: {
          billTo: { name: "Test Client", address: "1 Test St" },
          items: [{ description: "Service", qty: 1, unitPrice: 500 }],
          taxRate: 0.1,
        },
        footer: {
          thankYou: "Thank you!",
          contactEmail: "hi@measured.example",
          website: "measured.example",
        },
        options: {},
      });

      const buffer = Buffer.from(await new Response(stream).arrayBuffer());
      const parsed = await pdfParse(buffer);

      expect(parsed.numpages).toBeGreaterThanOrEqual(1);
      expect(parsed.text).toContain("INV-M-1");
      expect(parsed.text).toContain("Test Client");
      expect(parsed.text).toContain("Measured Co");
      expect(parsed.text).toContain("Thank you!");

      await kit.close();
    }, 30_000);

    it("user-provided margins take precedence over measurement", async () => {
      const driver = new ChromiumDriver({ browserWSEndpoint: BROWSERLESS_URL });
      const measurer = new PuppeteerMeasurer(driver);

      const kit = createVuedo({
        templatesDir: path.resolve("templates"),
        gotenbergUrl: GOTENBERG_URL,
        mode: "production",
        manifestPath: path.resolve("dist/pdf-manifest.json"),
        measurer,
      });

      const stream = await kit.generatePdf("invoice", {
        header: {
          companyName: "Override Co",
          companyEmail: "hi@override.example",
          invoiceNumber: "INV-O-1",
          issueDate: "2026-07-16",
          dueDate: "2026-08-16",
        },
        body: {
          billTo: { name: "Override Client", address: "2 Override St" },
          items: [{ description: "Work", qty: 2, unitPrice: 100 }],
          taxRate: 0,
        },
        footer: {
          thankYou: "Thanks!",
          contactEmail: "hi@override.example",
          website: "override.example",
        },
        options: { marginTop: 2, marginBottom: 2 },
      });

      const buffer = Buffer.from(await new Response(stream).arrayBuffer());
      const parsed = await pdfParse(buffer);

      expect(parsed.numpages).toBeGreaterThanOrEqual(1);
      expect(parsed.text).toContain("INV-O-1");
      expect(parsed.text).toContain("Override Client");

      await kit.close();
    }, 30_000);
  },
);
