import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { generateTypes } from "../src/types.js";

describe("generateTypes — React PandafProps", () => {
  let tmpDir: string;

  afterAll(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("emits a PandafProps interface with body + header/footer from separate files", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pandaf-react-types-"));
    const templatesDir = path.resolve(
      path.dirname(import.meta.url.replace("file://", "")),
      "fixtures/templates",
    );
    const outFile = path.join(tmpDir, "pandaf.d.ts");

    await generateTypes(templatesDir, outFile);

    const content = await fs.readFile(outFile, "utf-8");
    expect(content).toContain("PandafProps");
    expect(content).toContain("ComponentPropsWithoutRef");
    expect(content).toContain("GeneratePdfOptions");
    expect(content).toContain('"Hello"');
    expect(content).toContain('"Body"');
  });

  it("generates header/footer types for file-based layouts", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pandaf-react-types-"));
    const dir = path.resolve(
      path.dirname(import.meta.url.replace("file://", "")),
      "fixtures/templates",
    );
    const outFile = path.join(tmpDir, "pandaf-m.d.ts");

    await generateTypes(dir, outFile);

    const content = await fs.readFile(outFile, "utf-8");
    expect(content).toContain('"Card"');
    expect(content).toContain("header?:");
    expect(content).toContain('"Pos.PosOrder"');
    expect(content).toContain("header?:");
  });
});
