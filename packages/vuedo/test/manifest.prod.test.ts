import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBuild } from "../src/cli.js";
import { createVuedo } from "../src/index.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(dir, "fixtures/templates");
const outDir = path.resolve(dir, "..", ".tmp-dist");

// Production mode: the manifest written by the build (§4.4) is read and the
// pre-compiled SSR modules are imported directly — no ssrLoadModule, no dev Vite.
beforeAll(async () => {
  await runBuild(templatesDir, outDir);
}, 60_000);

afterAll(async () => {
  // await fs.rm(outDir, { recursive: true, force: true });
});

describe("createVuedo — production (manifest, compiled module)", () => {
  it("writes a pdf-manifest.json with entries + paired layouts", async () => {
    const manifest = JSON.parse(
      await fs.readFile(path.resolve(outDir, "pdf-manifest.json"), "utf8"),
    );
    expect(manifest.entries.Hello).toBe("./Hello.js");
    expect(manifest.entries["Pos.PosOrder"]).toBe("./Pos.PosOrder.js");
    expect(manifest.layouts["Pos.PosOrder"]).toEqual({
      body: "Pos.PosOrder",
      header: "Pos.PosHeader",
      footer: undefined,
    });
  });

  it("renders a body + paired header from the manifest without a dev Vite", async () => {
    const kit = createVuedo({
      templatesDir,
      gotenbergUrl: "http://unused.local",
      mode: "production",
      manifestPath: path.resolve(outDir, "pdf-manifest.json"),
    });
    const composite = await kit.renderComposite("Pos.PosOrder", {
      body: { orderId: "42" },
      header: {},
      options: {},
    });
    expect(composite).toContain("POS order 42");
    expect(composite).toContain("POS HEADER");
    await kit.close();
  });
});
