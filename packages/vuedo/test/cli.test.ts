import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(__dirname, "fixtures/templates");
const distCliPath = path.resolve(__dirname, "..", "dist", "cli.js");

async function resolveCliPath(): Promise<string> {
  try {
    await fs.access(distCliPath);
  } catch {
    execSync("pnpm build", {
      cwd: path.resolve(__dirname, ".."),
      stdio: "pipe",
      timeout: 60_000,
    });
  }
  return distCliPath;
}

describe("vuedo CLI", () => {
  let cliPath: string;

  beforeAll(async () => {
    cliPath = await resolveCliPath();
  }, 120_000);

  describe("argument parsing", () => {
    it("prints usage and exits 1 with no arguments", () => {
      const result = spawnSync("node", [cliPath], { encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("usage:");
    });

    it("prints usage and exits 1 with an unknown command", () => {
      const result = spawnSync("node", [cliPath, "unknown"], {
        encoding: "utf8",
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("usage:");
    });
  });

  describe("types command (dev mode)", () => {
    it("generates PdfTemplateProps to the specified output file", async () => {
      const tmpDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "vuedo-cli-types-"),
      );
      const typesOut = path.join(tmpDir, "vuedo.d.ts");
      try {
        const result = spawnSync(
          "node",
          [
            cliPath,
            "types",
            "--templates",
            templatesDir,
            "--types-out",
            typesOut,
          ],
          { encoding: "utf8", timeout: 30_000 },
        );

        expect(result.status).toBe(0);

        const content = await fs.readFile(typesOut, "utf8");
        expect(content).toContain("export type PdfTemplateProps = {");
        expect(content).toContain('"Card"');
        expect(content).toContain('"Hello"');
        expect(content).toContain('"Pos.PosOrder"');
        expect(content).toContain("body: ComponentProps<typeof Card>;");
        expect(content).toContain("header: ComponentProps<typeof CardHeader>;");
        expect(content).toContain(
          "body: ComponentProps<typeof Pos_PosOrder>;",
        );
        expect(content).toContain(
          "header: ComponentProps<typeof Pos_PosHeader>;",
        );
        expect(content).toContain("options?: GeneratePdfOptions;");
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("build command (prod mode)", () => {
    let outDir: string;

    beforeAll(async () => {
      outDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "vuedo-cli-build-"),
      );
      const result = spawnSync(
        "node",
        [cliPath, "build", "--templates", templatesDir, "--out", outDir],
        { encoding: "utf8", timeout: 120_000 },
      );
      expect(result.status).toBe(0);
    }, 120_000);

    afterAll(async () => {
      await fs.rm(outDir, { recursive: true, force: true });
    });

    it("produces pdf-manifest.json with entries and layouts", async () => {
      const manifestPath = path.join(outDir, "pdf-manifest.json");
      const content = await fs.readFile(manifestPath, "utf8");
      const manifest = JSON.parse(content);

      expect(manifest.entries.Hello).toBe("./Hello.js");
      expect(manifest.entries.Card).toBe("./Card.js");
      expect(manifest.entries["Pos.PosOrder"]).toBe("./Pos.PosOrder.js");

      expect(manifest.layouts.Hello).toEqual({
        body: "Hello",
        header: undefined,
        footer: undefined,
      });
      expect(manifest.layouts.Card).toEqual({
        body: "Card",
        header: "CardHeader",
        footer: undefined,
      });
      expect(manifest.layouts["Pos.PosOrder"]).toEqual({
        body: "Pos.PosOrder",
        header: "Pos.PosHeader",
        footer: undefined,
      });
    });

    it("compiles SSR entry files for every template and aux", async () => {
      for (const entry of [
        "Hello.js",
        "Card.js",
        "CardHeader.js",
        "Pos.PosOrder.js",
        "Pos.PosHeader.js",
      ]) {
        const stat = await fs.stat(path.join(outDir, entry));
        expect(stat.isFile()).toBe(true);
      }
    });

    it("can render templates from the build output via createVuedo in production mode", async () => {
      const { createVuedo, GotenbergDriver } = await import(
        "../src/index.js"
      );
      const kit = createVuedo({
        templatesDir,
        driver: new GotenbergDriver("http://unused.local"),
        mode: "production",
        manifestPath: path.join(outDir, "pdf-manifest.json"),
      });

      const html = await kit.renderHtml("Hello", { name: "CLI Build" });
      expect(html).toContain("Hello CLI Build");

      const composite = await kit.renderComposite("Card", {
        body: { name: "CardBody" },
        header: {},
        options: {},
      });
      expect(composite).toContain("Card CardBody");
      expect(composite).toContain("CARD HEADER");

      await kit.close();
    });
  });

  describe("error handling", () => {
    it("exits with non-zero when templates directory does not exist", () => {
      const result = spawnSync(
        "node",
        [cliPath, "types", "--templates", "/nonexistent/templates"],
        { encoding: "utf8", timeout: 30_000 },
      );
      expect(result.status).not.toBe(0);
    });
  });
});
