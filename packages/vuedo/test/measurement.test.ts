import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock puppeteer so ChromiumDriver (needed by PuppeteerMeasurer) resolves.
const disconnectBrowser = vi.fn();
vi.mock("puppeteer", () => {
  const browser = {
    newPage: () =>
      Promise.resolve({
        setContent: () => Promise.resolve(),
        setViewport: () => Promise.resolve(),
        evaluate: () => Promise.resolve(0),
        close: () => Promise.resolve(),
        pdf: () => Promise.resolve(new Uint8Array()),
        browser: () => browser,
      }),
    close: () => Promise.resolve(),
    disconnect: () => {
      disconnectBrowser();
      return Promise.resolve();
    },
  };
  return { launch: () => Promise.resolve(browser), connect: () => Promise.resolve(browser) };
});

const { ChromiumDriver } = await import("../src/drivers/chromium.js");
const {
  ChromiumMeasurer,
  PuppeteerMeasurer,
  resolveMargins,
  withTimeout,
  PX_PER_INCH,
  DEFAULT_PAPER_WIDTH_INCHES,
} = await import("../src/drivers/measurement.js");
const { InMemoryCache } = await import("../src/cache/memory.js");

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// withTimeout
// ---------------------------------------------------------------------------
describe("withTimeout", () => {
  it("resolves with the promise value when it completes before timeout", async () => {
    const result = await withTimeout(Promise.resolve(42), 1000);
    expect(result).toBe(42);
  });

  it("rejects with a timeout error when the promise is too slow", async () => {
    const slow = new Promise<number>((r) => setTimeout(() => r(1), 500));
    await expect(withTimeout(slow, 10)).rejects.toThrow(
      /timed out after 10ms/,
    );
  });

  it("clears the timer when the promise wins the race", async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(global, "clearTimeout");
    const fast = Promise.resolve("ok");
    await withTimeout(fast, 5000);
    expect(spy).toHaveBeenCalled();
    vi.useRealTimers();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// ChromiumMeasurer (abstract)
// ---------------------------------------------------------------------------
describe("ChromiumMeasurer", () => {
  it("is abstract and cannot be instantiated directly", () => {
    expect(() => new (ChromiumMeasurer as any)()).toThrow(
      /cannot be instantiated directly/,
    );
  });

  it("a custom subclass can be instantiated", () => {
    class StubMeasurer extends ChromiumMeasurer {
      readonly name = "stub";
      async measure() {
        return 0.5;
      }
    }
    const m = new StubMeasurer();
    expect(m.name).toBe("stub");
  });
});

// ---------------------------------------------------------------------------
// PuppeteerMeasurer
// ---------------------------------------------------------------------------
describe("PuppeteerMeasurer", () => {
  it("measures the height of the first element and returns inches", async () => {
    const driver = new ChromiumDriver();
    const browser = await driver.getBrowser();
    const fakePage = {
      setViewport: vi.fn().mockResolvedValue(undefined),
      setContent: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(96), // 96px = 1 inch
      close: vi.fn().mockResolvedValue(undefined),
    };
    browser.newPage = vi.fn().mockResolvedValue(fakePage);

    const measurer = new PuppeteerMeasurer(driver);
    const inches = await measurer.measure("<header>h</header>");

    expect(inches).toBeCloseTo(1); // 96 / PX_PER_INCH = 1
    expect(fakePage.setViewport).toHaveBeenCalledWith({
      width: Math.round(DEFAULT_PAPER_WIDTH_INCHES * PX_PER_INCH),
      height: 3000,
    });
    expect(fakePage.setContent).toHaveBeenCalledWith("<header>h</header>", {
      waitUntil: "networkidle0",
    });
    expect(fakePage.close).toHaveBeenCalled();
  });

  it("uses a custom viewport width when provided", async () => {
    const driver = new ChromiumDriver();
    const browser = await driver.getBrowser();
    const fakePage = {
      setViewport: vi.fn().mockResolvedValue(undefined),
      setContent: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(48),
      close: vi.fn().mockResolvedValue(undefined),
    };
    browser.newPage = vi.fn().mockResolvedValue(fakePage);

    const measurer = new PuppeteerMeasurer(driver);
    await measurer.measure("<div>narrow</div>", 600);

    expect(fakePage.setViewport).toHaveBeenCalledWith({
      width: 600,
      height: 3000,
    });
  });

  it("returns 0 when the HTML has no top-level element", async () => {
    const driver = new ChromiumDriver();
    const browser = await driver.getBrowser();
    const fakePage = {
      setViewport: vi.fn().mockResolvedValue(undefined),
      setContent: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(0),
      close: vi.fn().mockResolvedValue(undefined),
    };
    browser.newPage = vi.fn().mockResolvedValue(fakePage);

    const measurer = new PuppeteerMeasurer(driver);
    const inches = await measurer.measure("<span>empty</span>");
    expect(inches).toBe(0);
  });

  it("closes the page even when measurement throws", async () => {
    const driver = new ChromiumDriver();
    const browser = await driver.getBrowser();
    const fakePage = {
      setViewport: vi.fn().mockResolvedValue(undefined),
      setContent: vi.fn().mockRejectedValue(new Error("nav failed")),
      evaluate: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    browser.newPage = vi.fn().mockResolvedValue(fakePage);

    const measurer = new PuppeteerMeasurer(driver);
    await expect(measurer.measure("<div>x</div>")).rejects.toThrow(
      "nav failed",
    );
    expect(fakePage.close).toHaveBeenCalled();
  });

  it("reuses the same browser from the driver", async () => {
    const driver = new ChromiumDriver();
    const browser = await driver.getBrowser();
    const fakePage = {
      setViewport: vi.fn().mockResolvedValue(undefined),
      setContent: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(48),
      close: vi.fn().mockResolvedValue(undefined),
    };
    browser.newPage = vi.fn().mockResolvedValue(fakePage);

    const measurer = new PuppeteerMeasurer(driver);
    await measurer.measure("<div>a</div>");
    await measurer.measure("<div>b</div>");

    // Both calls go through the same browser — newPage called twice.
    expect(browser.newPage).toHaveBeenCalledTimes(2);
  });

  it("close() is a no-op (driver owns the browser lifecycle)", async () => {
    const driver = new ChromiumDriver();
    const measurer = new PuppeteerMeasurer(driver);
    // Should not throw and should not disconnect the driver's browser.
    await measurer.close();
    expect(disconnectBrowser).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// resolveMargins
// ---------------------------------------------------------------------------
describe("resolveMargins", () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache();
  });
  it("returns all zeros when no measurer and no user options", async () => {
    const result = await resolveMargins(cache, undefined, {});
    expect(result).toEqual({
      marginTop: 0,
      marginBottom: 0,
      marginLeft: undefined,
      marginRight: undefined,
    });
  });

  it("preserves user-provided margins (user takes precedence)", async () => {
    class StubMeasurer extends ChromiumMeasurer {
      readonly name = "stub";
      async measure() {
        return 99; // would be used if user didn't provide their own
      }
    }
    const result = await resolveMargins(cache, 
      new StubMeasurer(),
      { marginTop: 1.5, marginBottom: 2.5 },
      "<header>h</header>",
      "<footer>f</footer>",
    );
    expect(result.marginTop).toBe(1.5);
    expect(result.marginBottom).toBe(2.5);
  });

  it("measures header when user has not provided marginTop", async () => {
    class StubMeasurer extends ChromiumMeasurer {
      readonly name = "stub";
      async measure() {
        return 0.75;
      }
    }
    const result = await resolveMargins(cache, 
      new StubMeasurer(),
      {},
      "<header>h</header>",
      undefined,
    );
    expect(result.marginTop).toBe(0.75);
    expect(result.marginBottom).toBe(0);
  });

  it("measures footer when user has not provided marginBottom", async () => {
    class StubMeasurer extends ChromiumMeasurer {
      readonly name = "stub";
      async measure() {
        return 0.5;
      }
    }
    const result = await resolveMargins(cache, 
      new StubMeasurer(),
      {},
      undefined,
      "<footer>f</footer>",
    );
    expect(result.marginTop).toBe(0);
    expect(result.marginBottom).toBe(0.5);
  });

  it("measures header and footer concurrently", async () => {
    const order: string[] = [];
    class SlowMeasurer extends ChromiumMeasurer {
      readonly name = "slow";
      async measure(html: string) {
        if (html.includes("header")) {
          await new Promise((r) => setTimeout(r, 10));
          order.push("header");
          return 1;
        } else {
          await new Promise((r) => setTimeout(r, 5));
          order.push("footer");
          return 0.5;
        }
      }
    }
    const result = await resolveMargins(cache, 
      new SlowMeasurer(),
      {},
      "<header>h</header>",
      "<footer>f</footer>",
    );
    expect(result.marginTop).toBe(1);
    expect(result.marginBottom).toBe(0.5);
    // Both ran — order doesn't matter, just that both completed.
    expect(order).toHaveLength(2);
  });

  it("skips measurement when header is absent", async () => {
    const measureFn = vi.fn().mockResolvedValue(0.5);
    class SpyMeasurer extends ChromiumMeasurer {
      readonly name = "spy";
      measure = measureFn;
    }
    const result = await resolveMargins(cache, new SpyMeasurer(), {}, undefined, "<footer>f</footer>");
    expect(measureFn).toHaveBeenCalledOnce(); // only footer
    expect(result.marginTop).toBe(0);
    expect(result.marginBottom).toBe(0.5);
  });

  it("skips measurement when footer is absent", async () => {
    const measureFn = vi.fn().mockResolvedValue(0.5);
    class SpyMeasurer extends ChromiumMeasurer {
      readonly name = "spy";
      measure = measureFn;
    }
    const result = await resolveMargins(cache, new SpyMeasurer(), {}, "<header>h</header>", undefined);
    expect(measureFn).toHaveBeenCalledOnce(); // only header
    expect(result.marginTop).toBe(0.5);
    expect(result.marginBottom).toBe(0);
  });

  it("falls back to 0 when measurement throws", async () => {
    class FailMeasurer extends ChromiumMeasurer {
      readonly name = "fail";
      async measure() {
        throw new Error("browser down");
      }
    }
    const result = await resolveMargins(cache, 
      new FailMeasurer(),
      {},
      "<header>h</header>",
      "<footer>f</footer>",
    );
    expect(result.marginTop).toBe(0);
    expect(result.marginBottom).toBe(0);
  });

  it("passes through left/right margins unchanged", async () => {
    const result = await resolveMargins(cache, undefined, {
      marginLeft: 0.5,
      marginRight: 1,
    });
    expect(result.marginLeft).toBe(0.5);
    expect(result.marginRight).toBe(1);
  });

  it("passes paperWidth-derived viewport width to the measurer", async () => {
    const measureFn = vi.fn().mockResolvedValue(0.5);
    class SpyMeasurer extends ChromiumMeasurer {
      readonly name = "spy";
      measure = measureFn;
    }
    // Letter width: 8.5 inches → 816px
    await resolveMargins(cache, 
      new SpyMeasurer(),
      { paperWidth: 8.5 },
      "<header>h</header>",
      undefined,
    );
    expect(measureFn).toHaveBeenCalledWith("<header>h</header>", 816);
  });

  it("defaults to A4 width when paperWidth is not given", async () => {
    const measureFn = vi.fn().mockResolvedValue(0.5);
    class SpyMeasurer extends ChromiumMeasurer {
      readonly name = "spy";
      measure = measureFn;
    }
    await resolveMargins(cache, new SpyMeasurer(), {}, "<header>h</header>", undefined);
    const expectedWidth = Math.round(DEFAULT_PAPER_WIDTH_INCHES * PX_PER_INCH);
    expect(measureFn).toHaveBeenCalledWith("<header>h</header>", expectedWidth);
  });

  // ---------------------------------------------------------------------------
  // Measurement cache
  // ---------------------------------------------------------------------------
  it("caches a measurement and reuses the cached value on a second call", async () => {
    let callCount = 0;
    class CounterMeasurer extends ChromiumMeasurer {
      readonly name = "counter";
      async measure() {
        callCount++;
        return 0.75;
      }
    }

    const measurer = new CounterMeasurer();

    // First call — measures both header and footer.
    const r1 = await resolveMargins(cache, 
      measurer,
      {},
      "<header>h</header>",
      "<footer>f</footer>",
    );
    expect(r1.marginTop).toBe(0.75);
    expect(r1.marginBottom).toBe(0.75);
    expect(callCount).toBe(2);

    // Second call — same content, same A4 width — uses cache.
    const r2 = await resolveMargins(cache, 
      measurer,
      {},
      "<header>h</header>",
      "<footer>f</footer>",
    );
    expect(r2.marginTop).toBe(0.75);
    expect(r2.marginBottom).toBe(0.75);
    // measurer.measure was NOT called again — results came from cache.
    expect(callCount).toBe(2);
  });

  it("distinguishes cache entries by content — different HTML, different measure", async () => {
    const measured: string[] = [];
    class RecorderMeasurer extends ChromiumMeasurer {
      readonly name = "recorder";
      async measure(html: string) {
        measured.push(html);
        return html.includes("header") ? 1 : 0.5;
      }
    }

    const measurer = new RecorderMeasurer();

    await resolveMargins(cache, 
      measurer,
      {},
      "<header>one</header>",
      "<footer>one</footer>",
    );
    expect(measured).toHaveLength(2);

    // Same header, different footer — only footer should be re-measured.
    await resolveMargins(cache, 
      measurer,
      {},
      "<header>one</header>",
      "<footer>two</footer>",
    );
    // Header was cached — only the new footer hit the measurer.
    expect(measured).toHaveLength(3);
    expect(measured[2]).toBe("<footer>two</footer>");
  });

  it("distinguishes cache entries by viewport width", async () => {
    let callCount = 0;
    class CounterMeasurer extends ChromiumMeasurer {
      readonly name = "counter";
      async measure() {
        callCount++;
        return 0.75;
      }
    }

    const measurer = new CounterMeasurer();

    // First call at default A4 width.
    await resolveMargins(cache, 
      measurer,
      {},
      "<header>h</header>",
      undefined,
    );
    expect(callCount).toBe(1);

    // Same content, but different paper width → different viewport → cache miss.
    await resolveMargins(cache, 
      measurer,
      { paperWidth: 8.5 },
      "<header>h</header>",
      undefined,
    );
    expect(callCount).toBe(2);
  });

  it("does not cache failed measurements", async () => {
    let callCount = 0;
    class FailOnceMeasurer extends ChromiumMeasurer {
      readonly name = "fail-once";
      async measure() {
        callCount++;
        if (callCount === 1) throw new Error("transient failure");
        return 0.5;
      }
    }

    const measurer = new FailOnceMeasurer();

    await resolveMargins(cache, measurer, {}, "<header>h</header>", undefined);
    // First call failed → marginTop is 0 (best-effort fallback).
    expect(callCount).toBe(1);

    // Retry with same content — should NOT be cached (failure wasn't stored).
    await resolveMargins(cache, measurer, {}, "<header>h</header>", undefined);
    expect(callCount).toBe(2);
  });

  it("cache hits do not count toward user-provided margin skip", async () => {
    let callCount = 0;
    class CounterMeasurer extends ChromiumMeasurer {
      readonly name = "counter";
      async measure() {
        callCount++;
        return 0.75;
      }
    }

    const measurer = new CounterMeasurer();

    // Prime the cache for this content.
    await resolveMargins(cache, 
      measurer,
      {},
      "<header>h</header>",
      undefined,
    );
    expect(callCount).toBe(1);

    // Call with explicit marginTop — header measurement is skipped entirely
    // (user value takes precedence). Even though cache has a hit, it's not consulted.
    const result = await resolveMargins(cache, 
      measurer,
      { marginTop: 2 },
      "<header>h</header>",
      undefined,
    );
    expect(result.marginTop).toBe(2);
    expect(callCount).toBe(1); // no extra calls
  });
});
