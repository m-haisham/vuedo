import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBuild } from "../src/cli.js";
import { createPdfKit } from "../src/index.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(dir, "fixtures/templates");
const outDir = path.resolve(dir, "..", ".tmp-dist");

// Production mode: the manifest written by the build (§4.4) is read and the
// pre-compiled SSR module is imported directly — no ssrLoadModule, no dev Vite.
beforeAll(async () => {
  await runBuild(templatesDir, outDir);
}, 60_000);

afterAll(async () => {
  await fs.rm(outDir, { recursive: true, force: true });
});

describe("createPdfKit — production (manifest, compiled module)", () => {
  it("writes a pdf-manifest.json mapping template → compiled module", async () => {
    const manifest = JSON.parse(
      await fs.readFile(path.resolve(outDir, "pdf-manifest.json"), "utf8"),
    );
    expect(manifest.Hello).toBe("./Hello.js");
  });

  it("renders from the manifest without a dev Vite instance", async () => {
    const kit = createPdfKit({
      templatesDir,
      gotenbergUrl: "http://unused.local",
      mode: "production",
      manifestPath: path.resolve(outDir, "pdf-manifest.json"),
    });
    const html = await kit.renderHtml("Hello", { name: "Prod" });
    expect(html).toContain("Hello Prod");
    await kit.close();
  });
});
