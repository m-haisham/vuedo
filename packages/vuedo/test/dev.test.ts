import { describe, it, expect, afterAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createVuedo } from "../src/index.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(dir, "fixtures/templates");

// Development mode with no explicit and no shared Vite server: exercises the
// tier-3 fallback where vuedo lazily owns its own middleware-mode instance
// and compiles the fixture template via ssrLoadModule — no build step.
const kit = createVuedo({
  templatesDir,
  gotenbergUrl: "http://unused.local",
  mode: "development",
});

afterAll(() => kit.close());

describe("createVuedo — development (tier-3 owned Vite, ssrLoadModule)", () => {
  it("SSR-renders a fixture body template with provided data", async () => {
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
    expect(html).toContain('class="vuedo-header"');
  });
});
