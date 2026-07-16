/**
 * Standalone Gotenberg smoke test — plain HTML files, no @hshm/vuedo.
 *
 * Posts header.html, body.html, footer.html to Gotenberg's Chromium HTML
 * route and writes a PDF. Also renders body-only to compare.
 *
 * Pre-flight DOM measurement (docs/reference.md §2, §4.2 browserlessUrl):
 * before converting, the header/footer HTML is measured in a real headless
 * Chrome (Browserless) so the page margins are set to exactly the rendered
 * banner heights — no guessing, no body text sliding under the header.
 *
 * Prereqs:
 *   docker compose -f deploy/docker-compose.yml up   # Gotenberg :3000, Browserless :3001
 *
 * Run:
 *   node pdf-test/run.mjs
 *
 * Env:
 *   GOTENBERG_URL     default http://localhost:3000
 *   BROWSERLESS_URL   default ws://localhost:3001  (unset/blank → skip measuring)
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gotenbergUrl = process.env.GOTENBERG_URL ?? "http://localhost:3000";
const browserlessUrl =
  process.env.BROWSERLESS_URL ?? "ws://localhost:3001";

// CSS px → inches (Chromium print box is 96 CSS px per inch).
const PX_PER_INCH = 96;
// A4 width in CSS px (210mm @ 96dpi) — matches Gotenberg's default page size.
const PAGE_WIDTH_PX = 794;

async function html(file) {
  return readFile(path.join(__dirname, file), "utf8");
}

/**
 * Renders `docHtml` in headless Chrome and returns the height (in inches) of
 * its first top-level element — i.e. the banner's true rendered height.
 */
async function measureHeightInches(docHtml, label) {
  const browser = await puppeteer.connect({ browserWSEndpoint: browserlessUrl });
  try {
    const page = await browser.newPage();
    // Tall viewport at page width so the banner lays out exactly as it will in
    // the PDF and nothing gets clipped while measuring.
    await page.setViewport({ width: PAGE_WIDTH_PX, height: 3000 });
    await page.setContent(docHtml, { waitUntil: "networkidle0" });
    const px = await page.evaluate(() => {
      const el = document.body.firstElementChild;
      return el ? Math.ceil(el.getBoundingClientRect().height) : 0;
    });
    await page.close();
    const inches = px / PX_PER_INCH;
    console.log(
      `measured ${label}: ${px}px → ${inches.toFixed(3)}in`,
    );
    return inches;
  } finally {
    await browser.disconnect();
  }
}

async function toPdf(docFiles, outPath, margins) {
  const form = new FormData();
  for (const [name, content] of docFiles) {
    form.append("files", new Blob([content], { type: "text/html" }), name);
  }
  form.append("marginTop", String(margins.marginTop ?? 0.4));
  form.append("marginBottom", String(margins.marginBottom ?? 0.4));
  form.append("printBackground", "true");
  if (margins.marginLeft !== undefined)
    form.append("marginLeft", String(margins.marginLeft));
  if (margins.marginRight !== undefined)
    form.append("marginRight", String(margins.marginRight));

  const res = await fetch(`${gotenbergUrl}/forms/chromium/convert/html`, {
    method: "POST",
    body: form,
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gotenberg failed (${res.status}): ${detail.slice(0, 500)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.subarray(0, 5).toString().startsWith("%PDF-")) {
    throw new Error("Response is not a PDF");
  }
  await writeFile(outPath, buf);
  return buf.length;
}

async function main() {
  console.log(`Gotenberg: ${gotenbergUrl}`);

  const header = await html("header.html");
  const body = await html("body.html");
  const footer = await html("footer.html");

  // Body only.
  const bodyBytes = await toPdf(
    [["index.html", body]],
    "pdf-test/body.pdf",
    { marginTop: 0.4, marginBottom: 0.4 },
  );
  console.log(`body.pdf      OK (${bodyBytes} bytes)`);

  // Pre-flight: measure the header/footer banners so the page margins reserve
  // exactly their rendered heights (avoids body text colliding with them).
  let marginTop = 0.5;
  let marginBottom = 0.5;
  if (browserlessUrl) {
    try {
      marginTop = await measureHeightInches(header, "header");
      marginBottom = await measureHeightInches(footer, "footer");
    } catch (err) {
      console.warn(
        `measure skipped (${err.message}) — falling back to ${marginTop}in margins`,
      );
    }
  } else {
    console.log("BROWSERLESS_URL unset — using fallback margins");
  }

  // Header + body + footer (full document), margins == measured banner heights.
  const fullBytes = await toPdf(
    [
      ["index.html", body],
      ["header.html", header],
      ["footer.html", footer],
    ],
    "pdf-test/full.pdf",
    { marginTop, marginBottom },
  );
  console.log(`full.pdf      OK (${fullBytes} bytes)`);

  console.log("DONE — Gotenberg header/footer PDF generation verified.");
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
