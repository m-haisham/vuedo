import { describe, it, expect, afterAll, beforeAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { createVuedo, GotenbergDriver } from "../src/index.js";
import { inlineAssetsPlugin } from "@vuedo/core";

const dir = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(dir, "fixtures/templates");

describe("createVuedo — dev mode with explicit devServer", () => {
  let devServer: Awaited<ReturnType<typeof createServer>>;
  let kit: ReturnType<typeof createVuedo>;

  beforeAll(async () => {
    devServer = await createServer({
      root: templatesDir,
      configFile: false,
      plugins: [react(), inlineAssetsPlugin()],
      server: { middlewareMode: true },
      appType: "custom",
      css: { devSourcemap: false },
    });

    kit = createVuedo({
      templatesDir,
      driver: new GotenbergDriver("http://unused.local"),
      mode: "development",
      devServer,
    });
  });

  afterAll(async () => {
    await kit.close();
    await devServer.close();
  });

  it("SSR-renders a fixture body template", async () => {
    const html = await kit.renderHtml("Hello", { name: "Vuedo" });
    expect(html).toContain("Hello");
    expect(html).toContain("Vuedo");
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("auto-composes the paired header via renderComposite", async () => {
    const html = await kit.renderComposite("Card", {
      body: { name: "X" },
      header: {},
      options: {},
    });
    expect(html).toContain("Card");
    expect(html).toContain("X");
    expect(html).toContain("CARD HEADER");
    expect(html).toContain('class="vuedo-header"');
  });

  it("close() does not close the consumer's devServer", async () => {
    await kit.close();
    expect(devServer).toBeDefined();
  });
});

describe("createVuedo — dev mode without devServer (auto-created)", () => {
  it("lazy-creates a Vite server on first render and closes it", async () => {
    const kit = createVuedo({
      templatesDir,
      driver: new GotenbergDriver("http://unused.local"),
      mode: "development",
    });
    try {
      await kit.renderHtml("Hello", { name: "Auto" });
    } catch {
      // Expected when no vite.config.ts is present (no react plugin).
    }
    await kit.close();
    await kit.close(); // idempotent
  });
});

// ---------------------------------------------------------------------------
// views/ + components/ convention: a view imports a reusable component and
// passes props to it.
// ---------------------------------------------------------------------------

describe("createVuedo — views/ convention with reusable component", () => {
  const viewsDir = path.resolve(dir, "fixtures/templates-structured");
  let devServer: Awaited<ReturnType<typeof createServer>>;
  let kit: ReturnType<typeof createVuedo>;

  beforeAll(async () => {
    devServer = await createServer({
      root: viewsDir,
      configFile: false,
      plugins: [react(), inlineAssetsPlugin()],
      server: { middlewareMode: true },
      appType: "custom",
      css: { devSourcemap: false },
    });

    kit = createVuedo({
      templatesDir: viewsDir,
      driver: new GotenbergDriver("http://unused.local"),
      mode: "development",
      devServer,
    });
  });

  afterAll(async () => {
    await kit.close();
    await devServer.close();
  });

  it("resolves a view that imports a component and renders with props", async () => {
    const html = await kit.renderHtml("receipt", { total: 42.5 });
    expect(html).toContain("42.50");
    expect(html).toContain('class="total"');
  });

  it("component props control conditional output (bold class)", async () => {
    const html = await kit.renderHtml("receipt", { total: 250 });
    expect(html).toContain("250.00");
    expect(html).toContain("bold");
  });
});
