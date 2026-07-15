import { describe, it, expect, afterAll } from "vitest";
import { app, pdfKit } from "../src/server";

// Consumer tests (§7): plain requests against the app's own router. No network
// hop to mock — pdf-kit renders in-process; ?preview=html avoids Gotenberg.
const post = (body: unknown, qs = "") =>
  app.handle(
    new Request(`http://localhost/api/v1/generate-pdf${qs}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

afterAll(() => pdfKit.close());

describe("service POST /api/v1/generate-pdf", () => {
  it("returns composed SSR HTML via ?preview=html (no Gotenberg)", async () => {
    const res = await post(
      { template: "Invoice", data: { id: "X1", customerName: "Acme Corp" } },
      "?preview=html",
    );
    const html = await res.text();
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("X1");
    expect(html).toContain("Acme Corp");
  });

  it("renders header and footer templates in the preview", async () => {
    const res = await post(
      {
        template: "Invoice",
        data: { id: "X2", customerName: "Beta LLC" },
        header: { template: "InvoiceHeader", data: {} },
        footer: { template: "InvoiceFooter", data: {} },
      },
      "?preview=html",
    );
    const html = await res.text();
    expect(html).toContain("X2");
  });

  it("returns 422 on an invalid body", async () => {
    const res = await post({ nope: true });
    expect(res.status).toBe(422);
  });
});
