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
});
