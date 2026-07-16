import { PdfDriver, type DriverRenderInput } from "./types.js";

export interface ChromiumDriverOptions {
  /** Path to a Chrome/Chromium executable. Falls back to Puppeteer's bundled browser. */
  executablePath?: string;
  /** Launch args passed to the browser (e.g. sandbox toggles in containers). */
  launchArgs?: string[];
  /** Reuse a single browser across renders; closed in `close()`. Default true. */
  reuseBrowser?: boolean;
}

// Local Chromium driver backed by Puppeteer. Unlike Gotenberg it needs no
// separate service — it launches (or connects to) a headless Chromium and
// prints the composed document via the DevTools `Page.printToPDF` protocol.
//
// Puppeteer is an OPTIONAL peer dependency: it is only imported lazily, inside
// this driver, so consumers who only ever use Gotenberg never need to install
// it. The library never imports it at module top level.
export class ChromiumDriver extends PdfDriver {
  readonly name = "chromium";

  private browser: any = null;
  private readonly executablePath?: string;
  private readonly launchArgs: string[];
  private readonly reuseBrowser: boolean;

  constructor(options: ChromiumDriverOptions = {}) {
    super();
    this.executablePath = options.executablePath;
    this.launchArgs = options.launchArgs ?? ["--no-sandbox", "--disable-setuid-sandbox"];
    this.reuseBrowser = options.reuseBrowser ?? true;
  }

  private async getPuppeteer(): Promise<any> {
    try {
      return await import("puppeteer");
    } catch {
      try {
        return await import("puppeteer-core");
      } catch {
        throw new Error(
          "The 'chromium' driver requires 'puppeteer' (or 'puppeteer-core') " +
            "to be installed. Install it with `pnpm add puppeteer`, or use the " +
            "'gotenberg' driver instead.",
        );
      }
    }
  }

  private async getBrowser(): Promise<any> {
    if (this.browser) return this.browser;
    const puppeteer = await this.getPuppeteer();
    this.browser = await puppeteer.launch({
      headless: true,
      executablePath: this.executablePath,
      args: this.launchArgs,
    });
    return this.browser;
  }

  async render(input: DriverRenderInput): Promise<ReadableStream> {
    const puppeteer = await this.getPuppeteer();
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(input.body, { waitUntil: "networkidle0" });

      if (input.header || input.footer) {
        await page.evaluate(
          (h: string, f: string) => {
            const root = document.body;
            if (h) {
              const el = document.createElement("div");
              el.className = "vuedo-header";
              el.innerHTML = h;
              root.prepend(el);
            }
            if (f) {
              const el = document.createElement("div");
              el.className = "vuedo-footer";
              el.innerHTML = f;
              root.append(el);
            }
          },
          input.header ?? "",
          input.footer ?? "",
        );
      }

      const pdf: Uint8Array = await page.pdf({
        printBackground: true,
        marginTop: input.marginTop ?? 0.4,
        marginBottom: input.marginBottom ?? 0.4,
        marginLeft: input.marginLeft,
        marginRight: input.marginRight,
      });

      return new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(pdf));
          controller.close();
        },
      });
    } finally {
      if (!this.reuseBrowser) {
        await page.browser().close();
      } else {
        await page.close();
      }
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
