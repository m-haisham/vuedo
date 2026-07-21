import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { discoverLayouts } from "../src/discover.js";

describe("discoverLayouts — file-based layout pairing (.tsx)", () => {
  it("pairs headers/footers recursively and uses dotted names", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pandaf-react-disc-"));
    const write = async (rel: string, content: string) => {
      const p = path.join(dir, rel);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, content);
    };
    await write("A.tsx", "export function Body() { return null; }");
    await write("AHeader.tsx", "export function Header() { return null; }");
    await write("Sub/B.tsx", "export function Body() { return null; }");
    await write("Sub/BHeader.tsx", "export function Header() { return null; }");
    await write("Sub/BFooter.tsx", "export function Footer() { return null; }");

    const disc = await discoverLayouts(dir);

    expect(disc.entries["A"]).toBeDefined();
    expect(disc.entries["Sub.B"]).toBeDefined();
    expect(disc.entries["Sub.BHeader"]).toBeDefined();

    expect(disc.layouts["A"]).toEqual({
      body: "A",
      header: "AHeader",
      footer: undefined,
    });

    expect(disc.layouts["Sub.B"]).toEqual({
      body: "Sub.B",
      header: "Sub.BHeader",
      footer: "Sub.BFooter",
    });
  });

  it("pairs kebab-case -header/-footer suffixes", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pandaf-react-disc-"));
    const write = async (rel: string, content: string) => {
      const p = path.join(dir, rel);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, content);
    };
    await write("invoice.tsx", "export function Body() { return null; }");
    await write("invoice-header.tsx", "export function Header() { return null; }");
    await write("invoice-footer.tsx", "export function Footer() { return null; }");
    await write("pos/pos-order.tsx", "export function Body() { return null; }");
    await write("pos/pos-header.tsx", "export function Header() { return null; }");

    const disc = await discoverLayouts(dir);

    expect(disc.entries["invoice"]).toBeDefined();
    expect(disc.entries["pos.pos-order"]).toBeDefined();
    expect(disc.entries["pos.pos-header"]).toBeDefined();

    expect(disc.layouts["invoice"]).toEqual({
      body: "invoice",
      header: "invoice-header",
      footer: "invoice-footer",
    });
    expect(disc.layouts["pos.pos-order"]).toEqual({
      body: "pos.pos-order",
      header: "pos.pos-header",
      footer: undefined,
    });
  });

  it("auto-detects views/ subdirectory and ignores components/", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pandaf-react-disc-"));
    const write = async (rel: string, content: string) => {
      const p = path.join(dir, rel);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, content);
    };
    await write("views/invoice.tsx", "export function Body() { return null; }");
    await write(
      "views/invoice-header.tsx",
      "export function Header() { return null; }",
    );
    await write(
      "components/MoneyFormat.tsx",
      "export function MoneyFormat() { return null; }",
    );
    await write("orphan.tsx", "export function Body() { return null; }");

    const disc = await discoverLayouts(dir);

    expect(disc.entries["invoice"]).toBeDefined();
    expect(disc.entries["invoice-header"]).toBeDefined();
    expect(disc.entries["components.MoneyFormat"]).toBeUndefined();
    expect(disc.entries["orphan"]).toBeUndefined();

    expect(disc.layouts["invoice"]).toEqual({
      body: "invoice",
      header: "invoice-header",
      footer: undefined,
    });
  });

  it("ignores non-.tsx files", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pandaf-react-disc-"));
    const write = async (rel: string, content: string) => {
      const p = path.join(dir, rel);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, content);
    };
    await write("A.tsx", "export function Body() { return null; }");
    await write("B.jsx", "export function Body() { return null; }");
    await write("C.vue", "<template><div>C</div></template>");

    const disc = await discoverLayouts(dir);

    expect(disc.entries["A"]).toBeDefined();
    expect(disc.entries["B"]).toBeUndefined();
    expect(disc.entries["C"]).toBeUndefined();
  });
});
