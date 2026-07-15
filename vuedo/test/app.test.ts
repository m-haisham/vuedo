import { describe, it, expect } from "vitest";
import { buildApp } from "../src/server/index";

describe("buildApp /generate-pdf", () => {
  it("returns composed HTML via ?preview=html without hitting Gotenberg", async () => {
    const app = buildApp({ render: async () => "<p>rendered body</p>" });

    const res = await app.handle(
      new Request("http://localhost/api/v1/generate-pdf?preview=html", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ template: "Invoice", data: {} }),
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html");
    const text = await res.text();
    expect(text).toContain("<p>rendered body</p>");
    expect(text).toContain("<!DOCTYPE html>");
  });

  it("rejects malformed bodies via TypeBox validation", async () => {
    const app = buildApp({ render: async () => "<p>x</p>" });

    const res = await app.handle(
      new Request("http://localhost/api/v1/generate-pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ foo: "bar" }),
      }),
    );

    expect(res.status).toBe(422);
  });

  it("composes header and footer into the ?preview=html response", async () => {
    const app = buildApp({
      render: async (template: string) => `<p>rendered ${template}</p>`,
    });

    const res = await app.handle(
      new Request("http://localhost/api/v1/generate-pdf?preview=html", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          template: "Invoice",
          data: {},
          header: { template: "InvoiceHeader", data: {} },
          footer: { template: "InvoiceFooter", data: {} },
        }),
      }),
    );

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("<p>rendered Invoice</p>");
    expect(text).toContain("<p>rendered InvoiceHeader</p>");
    expect(text).toContain("<p>rendered InvoiceFooter</p>");
  });
});
