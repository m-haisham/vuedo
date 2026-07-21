import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("tailwind CSS generation via @tailwindcss/vite plugin", () => {
  let tmpDir: string;
  let templatesDir: string;
  let assetsDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pandaf-css-"));
    templatesDir = path.join(tmpDir, "templates");
    assetsDir = path.join(tmpDir, "assets");
    await fs.mkdir(templatesDir, { recursive: true });
    await fs.mkdir(assetsDir, { recursive: true });

    await fs.writeFile(
      path.join(templatesDir, "Test.vue"),
      `<template><div class="bg-red-500 text-white p-4 rounded-lg shadow-md hover:bg-red-600">Hello {{ name }}</div></template>\n<script setup>defineProps<{ name: string }>();</script>\n`,
    );
    await fs.writeFile(
      path.join(templatesDir, "TestHeader.vue"),
      `<template><div class="bg-gray-800 text-gray-100 px-6 py-2 font-bold">Header</div></template>\n`,
    );

    await fs.writeFile(
      path.join(assetsDir, "app.css"),
      `@import "tailwindcss";\n`,
    );
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("generates compiled CSS via ssrLoadModule with ?inline in dev mode", async () => {
    const { createServer } = await import("vite");
    const tailwindcss = (await import("@tailwindcss/vite")).default;

    const server = await createServer({
      root: tmpDir,
      configFile: false,
      plugins: [tailwindcss()],
      server: { middlewareMode: true },
      appType: "custom",
      css: { devSourcemap: false },
    });

    try {
      const cssUrl = "/assets/app.css?inline";
      const mod = await server.ssrLoadModule(cssUrl);
      const css: string = (mod as { default?: string }).default ?? "";

      expect(css).toContain(".bg-red-500");
      expect(css).toContain(".text-white");
      expect(css).toContain(".p-4");
      expect(css).toContain(".rounded-lg");
      expect(css).toContain(".shadow-md");
      expect(css).toContain("hover\\:bg-red-600");
      expect(css).toContain(".bg-gray-800");
      expect(css).toContain(".px-6");
      expect(css).toContain(".font-bold");
    } finally {
      await server.close();
    }
  });
});
