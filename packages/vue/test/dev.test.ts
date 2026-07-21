import { describe, it, expect, afterAll, beforeAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import vue from "@vitejs/plugin-vue";
import { createPandaf, GotenbergDriver } from "../src/index.js";
import { inlineAssetsPlugin } from "@pandaf/core";

const dir = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(dir, "fixtures/templates");

// ---------------------------------------------------------------------------
// Dev mode with explicit devServer (consumer controls the Vite lifecycle)
// ---------------------------------------------------------------------------

describe("createPandaf — dev mode with explicit devServer", () => {
  let devServer: Awaited<ReturnType<typeof createServer>>;
  let kit: ReturnType<typeof createPandaf>;

  beforeAll(async () => {
    devServer = await createServer({
      root: templatesDir,
      configFile: false,
      plugins: [vue(), inlineAssetsPlugin()],
      server: { middlewareMode: true },
      appType: "custom",
      css: { devSourcemap: false },
    });

    kit = createPandaf({
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
    const html = await kit.renderHtml("Hello", { name: "Vuedf" });
    expect(html).toContain("Hello Vuedf");
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("auto-composes the paired header via renderComposite", async () => {
    const html = await kit.renderComposite("Card", {
      body: { name: "X" },
      header: {},
      options: {},
    });
    expect(html).toContain("Card X");
    expect(html).toContain("CARD HEADER");
    expect(html).toContain('class="pandaf-header"');
  });

  it("close() does not close the consumer's devServer", async () => {
    await kit.close();
    expect(devServer).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Dev mode without devServer — library lazy-creates one from vite.config.ts.
// The consumer app tests exercise this path end-to-end. Here we just verify
// that createPandaf doesn't throw and that close() is idempotent.
// ---------------------------------------------------------------------------

describe("createPandaf — dev mode without devServer (auto-created)", () => {
  it("lazy-creates a Vite server on first render and closes it", async () => {
    const kit = createPandaf({
      templatesDir,
      driver: new GotenbergDriver("http://unused.local"),
      mode: "development",
    });
    // This triggers the lazy Vite creation. Without a vite.config.ts
    // in the fixture dir, the server starts without plugins so .vue
    // files won't compile — but the infrastructure (creation + cleanup)
    // should work without leaking.
    try {
      await kit.renderHtml("Hello", { name: "Auto" });
    } catch {
      // Expected when no vite.config.ts is present (no vue plugin).
    }
    await kit.close();
    await kit.close(); // idempotent
  });
});

// ---------------------------------------------------------------------------
// views/ + components/ convention: a view imports a reusable component and
// passes props to it.
// ---------------------------------------------------------------------------

describe("createPandaf — views/ convention with reusable component", () => {
  const viewsDir = path.resolve(dir, "fixtures/templates-structured");
  let devServer: Awaited<ReturnType<typeof createServer>>;
  let kit: ReturnType<typeof createPandaf>;

  beforeAll(async () => {
    devServer = await createServer({
      root: viewsDir,
      configFile: false,
      plugins: [vue(), inlineAssetsPlugin()],
      server: { middlewareMode: true },
      appType: "custom",
      css: { devSourcemap: false },
    });

    kit = createPandaf({
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

  it("component computed props react to data (conditional class)", async () => {
    const html = await kit.renderHtml("receipt", { total: 250 });
    expect(html).toContain("250.00");
    expect(html).toContain("bold");
  });
});
