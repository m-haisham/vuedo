import { describe, it, expect, vi } from "vitest";
import { PdfDriver, type DriverRenderInput } from "../src/drivers/types.js";
import { GotenbergDriver } from "../src/drivers/gotenberg.js";

describe("drivers — abstraction", () => {
  it("PdfDriver is abstract and cannot be instantiated directly", () => {
    expect(() => new (PdfDriver as any)()).toThrow();
  });

  it("a custom driver must implement render() and expose a name", async () => {
    class StubDriver extends PdfDriver {
      readonly name = "stub";
      async render(input: DriverRenderInput): Promise<ReadableStream> {
        const bytes = new TextEncoder().encode(input.body);
        return new ReadableStream({
          start(c) {
            c.enqueue(bytes);
            c.close();
          },
        });
      }
    }
    const d = new StubDriver();
    const stream = await d.render({ body: "hello" });
    const buf = await new Response(stream).text();
    expect(d.name).toBe("stub");
    expect(buf).toBe("hello");
  });
});

describe("GotenbergDriver", () => {
  it("POSTs body/header/footer to the chromium html route and returns the stream", async () => {
    const fakeBody = new ReadableStream();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(fakeBody, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const driver = new GotenbergDriver("http://gotenberg.local");
    const stream = await driver.render({
      body: "<html>b</html>",
      header: "<html>h</html>",
      footer: "<html>f</html>",
      marginTop: 1,
      marginBottom: 2,
      marginLeft: 3,
      marginRight: 4,
    });

    expect(driver.name).toBe("gotenberg");
    expect(stream).toBe(fakeBody);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://gotenberg.local/forms/chromium/convert/html");
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    expect(form.get("marginTop")).toBe("1");
    expect(form.get("marginBottom")).toBe("2");
    expect(form.get("marginLeft")).toBe("3");
    expect(form.get("marginRight")).toBe("4");
    // body + header + footer => 3 file parts
    const files = form.getAll("files") as Blob[];
    expect(files).toHaveLength(3);
    expect((await files[0].text())).toBe("<html>b</html>");

    vi.unstubAllGlobals();
  });

  it("throws on a non-ok Gotenberg response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    );
    const driver = new GotenbergDriver("http://gotenberg.local");
    await expect(driver.render({ body: "x" })).rejects.toThrow(
      /Gotenberg conversion failed/,
    );
    vi.unstubAllGlobals();
  });
});
