import { describe, it, expect, vi, beforeEach } from "vitest";

// Puppeteer is an OPTIONAL peer dependency and is not installed in the test
// environment. We mock the dynamic `import("puppeteer")` call inside the driver
// so the driver logic (setContent, header/footer injection, pdf options,
// browser lifecycle) is exercised without a real browser.
const closeBrowser = vi.fn();
const newPage = vi.fn();
const pageClose = vi.fn();
const pagePdf = vi.fn();
const pageSetContent = vi.fn();
const pageEvaluate = vi.fn();

vi.mock("puppeteer", () => {
  const browser = {
    newPage: () => {
      newPage();
      return Promise.resolve({
        setContent: (...a: any[]) => {
          pageSetContent(...a);
          return Promise.resolve();
        },
        evaluate: (...a: any[]) => {
          pageEvaluate(...a);
          return Promise.resolve();
        },
        pdf: (...a: any[]) => {
          pagePdf(...a);
          return Promise.resolve(new Uint8Array([1, 2, 3]));
        },
        close: () => {
          pageClose();
          return Promise.resolve();
        },
        browser: () => browser,
      });
    },
    close: () => {
      closeBrowser();
      return Promise.resolve();
    },
    disconnect: () => {
      disconnectBrowser();
      return Promise.resolve();
    },
  };
  return {
    launch: () => Promise.resolve(browser),
    connect: () => Promise.resolve(browser),
  };
});

const disconnectBrowser = vi.fn();

// Import after mocking so the dynamic import resolves to the mock.
const { ChromiumDriver } = await import("../src/drivers/chromium.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ChromiumDriver", () => {
  it("launches a browser, renders the body, and returns a PDF stream", async () => {
    const driver = new ChromiumDriver();
    const stream = await driver.render({ body: "<html>b</html>" });

    expect(driver.name).toBe("chromium");
    expect(newPage).toHaveBeenCalled();
    expect(pageSetContent).toHaveBeenCalledWith(
      "<html>b</html>",
      expect.objectContaining({ waitUntil: "networkidle0" }),
    );
    // No header/footer => no injection
    expect(pageEvaluate).not.toHaveBeenCalled();
    expect(pagePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        printBackground: true,
        format: "A4",
        marginTop: 0,
      }),
    );

    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    expect([...bytes]).toEqual([1, 2, 3]);
  });

  it("injects header/footer into the page when present", async () => {
    const driver = new ChromiumDriver();
    await driver.render({
      body: "<html>b</html>",
      header: "<header>h</header>",
      footer: "<footer>f</footer>",
      marginTop: 5,
      marginBottom: 6,
    });
    expect(pageEvaluate).toHaveBeenCalledOnce();
    const [, html, footer] = pageEvaluate.mock.calls[0];
    expect(html).toBe("<header>h</header>");
    expect(footer).toBe("<footer>f</footer>");
    expect(pagePdf).toHaveBeenCalledWith(
      expect.objectContaining({ marginTop: 5, marginBottom: 6 }),
    );
  });

  it("reuses a single browser and closes it on close()", async () => {
    const driver = new ChromiumDriver();
    await driver.render({ body: "1" });
    await driver.render({ body: "2" });
    expect(closeBrowser).not.toHaveBeenCalled();
    await driver.close();
    expect(closeBrowser).toHaveBeenCalledOnce();
  });

  it("connects to a remote browser and detaches (not closes) it on close()", async () => {
    const driver = new ChromiumDriver({ browserWSEndpoint: "ws://chromium:3000" });
    await driver.render({ body: "<html>b</html>" });
    // No local launch — connect() path was used.
    expect(closeBrowser).not.toHaveBeenCalled();
    await driver.close();
    expect(disconnectBrowser).toHaveBeenCalledOnce();
    expect(closeBrowser).not.toHaveBeenCalled();
  });
});
