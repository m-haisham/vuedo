import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { pandaf } from "../src/vite-plugin.js";
import { createPandaf, GotenbergDriver } from "../src/index.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(dir, "fixtures/templates");
const outDir = path.resolve(dir, "..", ".tmp-dist");

beforeAll(async () => {
  await build({
    root: templatesDir,
    configFile: false,
    plugins: [react(), pandaf({ templatesDir, outDir })],
    build: { outDir },
    logLevel: "warn",
  });
}, 120_000);

afterAll(async () => {
  await fs.rm(outDir, { recursive: true, force: true });
});

describe("createPandaf — production (manifest, compiled module)", () => {
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

  it("renders a body + paired header from the manifest", async () => {
    const kit = createPandaf({
      templatesDir,
      driver: new GotenbergDriver("http://unused.local"),
      mode: "production",
      manifestPath: path.resolve(outDir, "pdf-manifest.json"),
    });
    const composite = await kit.renderComposite("Pos.PosOrder", {
      body: { orderId: "42" },
      header: {},
      options: {},
    });
    expect(composite).toContain("POS order");
    expect(composite).toContain("42");
    expect(composite).toContain("POS HEADER");
    await kit.close();
  });
});
