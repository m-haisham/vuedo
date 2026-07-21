import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { discoverLayouts } from "../src/discover.js";

// File-based layout convention: XHeader/XFooter in the same folder pair with X.
describe("discoverLayouts — file-based layout pairing", () => {
  it("pairs headers/footers recursively and uses dotted names", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vuedf-disc-"));
    const write = async (rel: string, content: string) => {
      const p = path.join(dir, rel);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, content);
    };
    await write("A.vue", "<template><div>A</div></template>");
    await write("AHeader.vue", "<template><div>A-H</div></template>");
    await write("Sub/B.vue", "<template><div>B</div></template>");
    await write("Sub/BHeader.vue", "<template><div>B-H</div></template>");
    await write("Sub/BFooter.vue", "<template><div>B-F</div></template>");

    const disc = await discoverLayouts(dir);

    // dotted names include the nested path
    expect(disc.entries["A"]).toBeDefined();
    expect(disc.entries["Sub.B"]).toBeDefined();
    expect(disc.entries["Sub.BHeader"]).toBeDefined();

    // A has a header, no footer
    expect(disc.layouts["A"]).toEqual({
      body: "A",
      header: "AHeader",
      footer: undefined,
    });

    // Sub.B pairs with both header and footer within its own folder
    expect(disc.layouts["Sub.B"]).toEqual({
      body: "Sub.B",
      header: "Sub.BHeader",
      footer: "Sub.BFooter",
    });
  });

  it("auto-detects views/ subdirectory and ignores components/", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pandaf-disc-"));
    const write = async (rel: string, content: string) => {
      const p = path.join(dir, rel);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, content);
    };
    // Templates under views/ are discovered
    await write("views/invoice.vue", "<template><div>A</div></template>");
    await write(
      "views/invoice-header.vue",
      "<template><div>A-H</div></template>",
    );
    // Components under components/ are NOT discovered as templates
    await write(
      "components/MoneyFormat.vue",
      "<template><span>{{ amount }}</span></template>",
    );
    // Root-level files are also ignored when views/ exists
    await write("orphan.vue", "<template><div>O</div></template>");

    const disc = await discoverLayouts(dir);

    // Only views/ content appears
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

  it("also pairs kebab-case -header/-footer suffixes", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pandaf-disc-"));
    const write = async (rel: string, content: string) => {
      const p = path.join(dir, rel);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, content);
    };
    await write("invoice.vue", "<template><div>A</div></template>");
    await write("invoice-header.vue", "<template><div>A-H</div></template>");
    await write("invoice-footer.vue", "<template><div>A-F</div></template>");
    await write("pos/pos-order.vue", "<template><div>B</div></template>");
    await write("pos/pos-header.vue", "<template><div>B-H</div></template>");

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
});
