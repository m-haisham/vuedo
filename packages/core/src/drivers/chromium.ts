import { PdfDriver, type DriverRenderInput } from "./types.js";

export interface ChromiumDriverOptions {
  /**
   * Connect to a **remote** Chromium instead of launching a local one. Provide
   * either a WebSocket endpoint (`ws://host:3000`) or an HTTP frontend URL
   * (`http://host:9222`) — typically a browserless.io or `browserless/chromium`
   * Docker container. When set, `launchArgs`/`executablePath` are ignored and
   * the driver calls `puppeteer.connect()` rather than `puppeteer.launch()`.
   */
  browserWSEndpoint?: string;
  /** Alias for `browserWSEndpoint` accepting an HTTP `browserURL` too. */
  browserURL?: string;
  /** Path to a Chrome/Chromium executable (local launch only). Falls back to Puppeteer's bundled browser. */
  executablePath?: string;
  /** Launch args passed to the browser (e.g. sandbox toggles in containers). Ignored when connecting remotely. */
  launchArgs?: string[];
  /** Reuse a single browser across renders; closed in `close()`. Default true. */
  reuseBrowser?: boolean;
}

// Local Chromium driver backed by Puppeteer. Unlike Gotenberg it needs no
// separate service — it launches (or connects to) a headless Chromium and
// prints the composed document via the DevTools `Page.printToPDF` protocol.
//
// Two modes:
//   • **Local** (default): `puppeteer.launch()` starts a bundled or
//     `executablePath` Chromium.
//   • **Remote**: when `browserWSEndpoint`/`browserURL` is supplied, the driver
//     `puppeteer.connect()`s to an already-running Chromium — e.g. a
//     `browserless/chromium` Docker container or browserless.io — so no browser
//     binary is needed on the host.
//
// Puppeteer is an OPTIONAL peer dependency: it is only imported lazily, inside
// this driver, so consumers who only ever use Gotenberg never need to install
// it. The library never imports it at module top level.
export class ChromiumDriver extends PdfDriver {
  readonly name = "chromium";

  private browser: any = null;
  private readonly browserWSEndpoint?: string;
  private readonly browserURL?: string;
  private readonly executablePath?: string;
  private readonly launchArgs: string[];
  private readonly reuseBrowser: boolean;
  /** True when connected to a remote browser we should NOT close on `close()`. */
  private readonly connected: boolean;

  constructor(options: ChromiumDriverOptions = {}) {
    super();
    this.browserWSEndpoint = options.browserWSEndpoint;
    this.browserURL = options.browserURL;
    this.executablePath = options.executablePath;
    this.launchArgs = options.launchArgs ?? ["--no-sandbox", "--disable-setuid-sandbox"];
    this.reuseBrowser = options.reuseBrowser ?? true;
    this.connected = Boolean(this.browserWSEndpoint || this.browserURL);
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

  private async getBrowserInternal(): Promise<any> {
    if (this.browser) return this.browser;
    const puppeteer = await this.getPuppeteer();
    if (this.connected) {
      // Attach to a remote browser (browserless, Docker Chromium, etc.).
      this.browser = await puppeteer.connect({
        browserWSEndpoint: this.browserWSEndpoint,
        browserURL: this.browserURL,
      });
    } else {
      this.browser = await puppeteer.launch({
        headless: true,
        executablePath: this.executablePath,
        args: this.launchArgs,
      });
    }
    return this.browser;
  }

  /** Returns the underlying Puppeteer Browser instance, creating it if needed. Used by PuppeteerMeasurer to compose without duplicating connection logic. */
  async getBrowser(): Promise<any> {
    return this.getBrowserInternal();
  }

  async render(input: DriverRenderInput): Promise<ReadableStream> {
    const puppeteer = await this.getPuppeteer();
    const browser = await this.getBrowserInternal();
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
        printBackground: input.backgroundGraphics ?? true,
        format: input.paperSize ?? "A4",
        marginTop: input.marginTop ?? 0,
        marginBottom: input.marginBottom ?? 0,
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
      if (this.connected) {
        // We attached to a remote browser — detach without killing it so the
        // host (browserless/Docker) keeps serving other clients.
        await this.browser.disconnect();
      } else {
        await this.browser.close();
      }
      this.browser = null;
    }
  }
}
