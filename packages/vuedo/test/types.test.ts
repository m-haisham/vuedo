import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateTypes } from "../src/types.js";

describe("generateTypes — inferred PdfTemplateProps", () => {
  let out: string;
  afterAll(async () => {
    if (out) await fs.rm(out, { force: true });
  });

  it("emits a PdfTemplateProps interface using ComponentProps", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vuedf-types-"));
    await fs.writeFile(
      path.join(dir, "Invoice.vue"),
      "<template><div>{{ id }}</div></template>\n<script setup>defineProps<{ id: string }>();</script>",
    );
    out = path.join(dir, "generated", "pdf-templates.d.ts");
    await generateTypes(dir, out);

    const content = await fs.readFile(out, "utf-8");
    expect(content).toContain(
      `import type { ComponentProps } from "vue-component-type-helpers";`,
    );
    expect(content).toContain(
      `import type { GeneratePdfOptions } from "@hshm/vuedo";`,
    );
    expect(content).toContain("export type PdfTemplateProps = {");
    expect(content).toContain(`"Invoice": {`);
    expect(content).toContain("body: ComponentProps<typeof Invoice>;");
    expect(content).toContain("options?: GeneratePdfOptions;");
    expect(content).toContain(`import Invoice from "../Invoice.vue";`);
  });
});
