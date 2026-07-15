import { describe, it, expect, afterAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPdfKit } from "../src/index.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(dir, "fixtures/templates");

// Development mode with no explicit and no shared Vite server: exercises the
// tier-3 fallback where pdf-kit lazily owns its own middleware-mode instance
// and compiles the fixture template via ssrLoadModule — no build step.
const kit = createPdfKit({
  templatesDir,
  gotenbergUrl: "http://unused.local",
  mode: "development",
});

afterAll(() => kit.close());

describe("createPdfKit — development (tier-3 owned Vite, ssrLoadModule)", () => {
  it("SSR-renders a fixture template with provided data", async () => {
    const html = await kit.renderHtml("Hello", { name: "Vuedf" });
    expect(html).toContain("Hello Vuedf");
    expect(html).toContain("<!DOCTYPE html>");
  });
});
