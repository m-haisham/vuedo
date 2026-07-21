import { describe, it, expect, afterAll } from "vitest";
import { app, pandaf } from "../src/server";

// Consumer tests (§7): plain requests against the app's own router. No network
// hop to mock — pandaf renders in-process; ?preview=html avoids Gotenberg. Each
// template is its own typed Elysia route, so TypeBox validation guards the
// { header?, body, footer?, options } payload before it reaches generatePdf.
const post = (path: string, body: unknown, qs = "") =>
  app.handle(
    new Request(`http://localhost${path}${qs}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

afterAll(() => pandaf.close());

describe("service POST /invoice", () => {
  it("composes body + paired header/footer via ?preview=html (no Gotenberg)", async () => {
    const res = await post(
      "/invoice",
      {
        header: {
          companyName: "Northwind Studio",
          companyEmail: "billing@northwind.example",
          invoiceNumber: "INV-HF-1",
          issueDate: "2026-07-15",
          dueDate: "2026-08-14",
        },
        body: {
          billTo: { name: "Header Footer Co", address: "1 Main St" },
          items: [{ description: "Consulting", qty: 1, unitPrice: 1000 }],
          taxRate: 0.1,
        },
        footer: {
          thankYou: "Thank you for your business!",
          contactEmail: "billing@northwind.example",
          website: "northwind.example",
        },
        options: {},
      },
      "?preview=html",
    );
    const html = await res.text();
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("INV-HF-1");
    expect(html).toContain("Header Footer Co");
    // Auto-paired InvoiceHeader / InvoiceFooter from the file convention.
    expect(html).toContain("Northwind Studio");
    expect(html).toContain("Thank you for your business!");
    expect(html).toContain('class="pandaf-header"');
    expect(html).toContain('class="pandaf-footer"');
  });

  it("returns 422 when a required section is missing", async () => {
    const res = await post("/invoice", {
      body: {
        billTo: { name: "Header Footer Co", address: "1 Main St" },
        items: [{ description: "Consulting", qty: 1, unitPrice: 1000 }],
        taxRate: 0.1,
      },
      options: {},
    });
    expect(res.status).toBe(422);
  });
});

describe("service POST /pos-order", () => {
  it("renders the nested template with its paired header and footer", async () => {
    const res = await post(
      "/pos-order",
      {
        header: {
          store: "Downtown",
          address: "12 Pine St",
          orderNumber: "ORD-9042",
          date: "2026-07-15 14:32",
          cashier: "Sam",
        },
        body: {
          items: [{ name: "Flat White", qty: 2, price: 4.5 }],
          tax: 0.98,
          total: 9.98,
          paymentMethod: "Card",
        },
        footer: { thankYou: "Thanks — see you again!", returnPolicy: "No returns" },
        options: {},
      },
      "?preview=html",
    );
    const html = await res.text();
    expect(html).toContain("ORD-9042");
    expect(html).toContain("Downtown");
    expect(html).toContain("Thanks — see you again!");
    expect(html).toContain('class="pandaf-header"');
    expect(html).toContain('class="pandaf-footer"');
  });
});

describe("service GET meta routes", () => {
  it("serves the OpenAPI document at /openapi.json", async () => {
    const res = await app.handle(new Request("http://localhost/openapi.json"));
    expect(res.headers.get("content-type")).toContain("application/json");
    const doc = await res.json();
    expect(doc.openapi).toContain("3.0");
    expect(doc.paths["/invoice"]).toBeDefined();
    expect(doc.paths["/pos-order"]).toBeDefined();
  });

  it("serves the Scalar docs page at /docs", async () => {
    const res = await app.handle(new Request("http://localhost/docs"));
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("cdn.jsdelivr.net/npm/@scalar/api-reference");
    expect(html).toContain("/openapi.json");
  });

  it("redirects the root to /docs", async () => {
    const res = await app.handle(new Request("http://localhost/"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/docs");
  });
});
