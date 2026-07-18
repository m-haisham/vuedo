// Pre-flight DOM measurement — renders header/footer HTML in a headless
// Chromium and returns the true rendered height in inches. Used to set
// page margins automatically so body content never collides with banners.
//
// Follows the same abstract-class pattern as PdfDriver: ChromiumMeasurer
// is the contract, PuppeteerMeasurer is the concrete implementation that
// reuses a ChromiumDriver's browser connection.

import { createHash } from "node:crypto";
import type { ChromiumDriver } from "./chromium.js";
import type { Cache } from "../cache/index.js";

/** CSS pixels per inch — Chromium's print box uses 96 CSS px per inch. */
export const PX_PER_INCH = 96;
/** A4 width in inches (210mm). Used as the default paper width for viewport sizing. */
export const DEFAULT_PAPER_WIDTH_INCHES = 8.27;
/** Default timeout in milliseconds for a single measurement. */
export const DEFAULT_MEASURE_TIMEOUT_MS = 3_000;
/** Cache-key prefix for measurement results to avoid collisions with other cache domains. */
const CACHE_KEY_PREFIX = "measure:";

/**
 * Races `promise` against a timeout. Resolves with the promise's value on
 * success, rejects with a `TimeoutError` if `ms` elapses first. The losing
 * branch's side-effects (open pages, pending navigations) are best-effort
 * cleaned up by the caller — this helper only owns the timer.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(
      () => reject(new Error(`Measurement timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(id);
        resolve(value);
      },
      (err) => {
        clearTimeout(id);
        reject(err);
      },
    );
  });
}

export abstract class ChromiumMeasurer {
  constructor() {
    if (new.target === ChromiumMeasurer) {
      throw new Error(
        "ChromiumMeasurer is abstract and cannot be instantiated directly",
      );
    }
  }

  /** Human-readable name, used in logs/errors. */
  abstract readonly name: string;

  /**
   * Renders `html` in headless Chromium and returns the height (in inches)
   * of its first top-level element — i.e. the banner's true rendered height.
   *
   * @param viewportWidthPx - CSS pixel width for the viewport. When omitted,
   *   the implementation picks a sensible default (A4 width).
   */
  abstract measure(html: string, viewportWidthPx?: number): Promise<number>;

  /** Release any resources. Optional — when composing with a driver, the driver owns the lifecycle. */
  async close(): Promise<void> {}
}

// PuppeteerMeasurer: reuses a ChromiumDriver's browser connection to measure
// the rendered height of an HTML document. The driver owns the Puppeteer
// lifecycle — this class only opens/closes pages for measurement.
export class PuppeteerMeasurer extends ChromiumMeasurer {
  readonly name = "puppeteer";

  constructor(private readonly driver: ChromiumDriver) {
    super();
  }

  async measure(html: string, viewportWidthPx?: number): Promise<number> {
    const width =
      viewportWidthPx ?? Math.round(DEFAULT_PAPER_WIDTH_INCHES * PX_PER_INCH);
    const browser = await this.driver.getBrowser();
    const page = await browser.newPage();
    // TODO: Move timeout into this so that we can handle page.close() on timeout.
    try {
      await page.setViewport({ width, height: 3000 });
      await page.setContent(html, { waitUntil: "networkidle0" });
      const px: number = await page.evaluate(() => {
        const el = document.body.firstElementChild;
        return el ? Math.ceil(el.getBoundingClientRect().height) : 0;
      });
      return px / PX_PER_INCH;
    } finally {
      await page.close();
    }
  }
}

export interface MarginInput {
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  /** Extra margin (inches) added on top of the resolved marginTop (user-provided or measured). Defaults to 0. */
  extraMarginTop?: number;
  /** Extra margin (inches) added on top of the resolved marginBottom (user-provided or measured). Defaults to 0. */
  extraMarginBottom?: number;
  /** Paper width in inches. Used to size the measurement viewport. Defaults to A4 (8.27). */
  paperWidth?: number;
  /** Timeout in milliseconds for each measurement. Defaults to 3 000ms. */
  measureTimeoutMs?: number;
}

/**
 * Measures the rendered height of an HTML snippet, checking `cache` first.
 * Only caches on success — timeouts/failures are not stored.
 */
async function measureOrCache(
  cache: Cache,
  measurer: ChromiumMeasurer,
  html: string,
  viewportWidthPx: number,
  timeout: number,
): Promise<number> {
  const contentHash = createHash("sha256").update(html).digest("hex");
  const key = `${CACHE_KEY_PREFIX}${viewportWidthPx}:${contentHash}`;
  const cached = await cache.get<number>(key);
  if (cached !== undefined) return cached;

  const result = await withTimeout(
    measurer.measure(html, viewportWidthPx),
    timeout,
  );

  await cache.set(key, result);

  return result;
}

/**
 * Resolves final page margins by filling in measured header/footer heights
 * where the caller hasn't provided explicit values. Measurement is best-effort
 * — failures silently fall back to 0.
 *
 * Priority: caller-provided > measured height > 0.
 *
 * The measurement viewport width is derived from `paperWidth` (in inches)
 * so the rendered banner height matches the actual paper geometry.
 *
 * Results are cached via the supplied `Cache` instance, keyed by
 * `viewportWidthPx:sha256(html)`, so repeated generation of the same template + data
 * reuses prior measurements.
 */
export async function resolveMargins(
  cache: Cache,
  measurer: ChromiumMeasurer | undefined,
  options: MarginInput,
  header?: string,
  footer?: string,
): Promise<{
  marginTop: number;
  marginBottom: number;
  marginLeft?: number;
  marginRight?: number;
}> {
  let marginTop: number | undefined = options.marginTop;
  let marginBottom: number | undefined = options.marginBottom;

  if (measurer) {
    const viewportWidthPx = Math.round(
      (options.paperWidth ?? DEFAULT_PAPER_WIDTH_INCHES) * PX_PER_INCH,
    );
    const timeout = options.measureTimeoutMs ?? DEFAULT_MEASURE_TIMEOUT_MS;

    const tasks: Array<Promise<void>> = [];

    if (marginTop === undefined && header) {
      tasks.push(
        measureOrCache(cache, measurer, header, viewportWidthPx, timeout)
          .then((h) => {
            marginTop = h;
          })
          .catch(() => {
            /* measurement best-effort — margin stays 0 */
          }),
      );
    }
    if (marginBottom === undefined && footer) {
      tasks.push(
        measureOrCache(cache, measurer, footer, viewportWidthPx, timeout)
          .then((h) => {
            marginBottom = h;
          })
          .catch(() => {
            /* measurement best-effort — margin stays 0 */
          }),
      );
    }

    await Promise.all(tasks);
  }

  return {
    marginTop: (marginTop ?? 0) + (options.extraMarginTop ?? 0),
    marginBottom: (marginBottom ?? 0) + (options.extraMarginBottom ?? 0),
    marginLeft: options.marginLeft,
    marginRight: options.marginRight,
  };
}
