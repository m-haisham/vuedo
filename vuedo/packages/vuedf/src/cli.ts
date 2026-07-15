#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pdfKit } from "./vite-plugin.js";

// The CLI is literally the plugin driving a throwaway, internal Vite build
// (§4.4 Path B) — for hosts with no Vite config of their own.
//
// We shell out to `vite build` with a generated config file rather than calling
// the programmatic build() API: a programmatic build with ssr:true +
// multiple inputs silently enables inlineDynamicImports, which corrupts
// plugin-vue's SFC transform. A real config-file build doesn't hit that path.
export async function runBuild(
  templatesDir: string,
  outDir: string,
): Promise<void> {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { spawn } = await import("node:child_process");

  const configPath = path.join(
    import.meta.dirname,
    `.vuedf-build-${process.pid}-${Date.now()}.ts`,
  );
  await fs.writeFile(
    configPath,
    `import vue from '@vitejs/plugin-vue';\n` +
      `import { pdfKit } from './vite-plugin.js';\n` +
      `export default { plugins: [vue(), pdfKit({ templatesDir: ${JSON.stringify(
        templatesDir,
      )}, outDir: ${JSON.stringify(outDir)} })], build: { outDir: ${JSON.stringify(
        outDir,
      )} } };\n`,
  );

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.resolve(import.meta.dirname, "../node_modules/vite/bin/vite.js"),
        "build",
        "--config",
        configPath,
        "--logLevel",
        "warn",
      ],
      { stdio: "inherit" },
    );
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`vite build failed (exit ${code})`)),
    );
  });

  await fs.rm(configPath, { force: true });
}

function parseArgs(argv: string[]): { templates?: string; out?: string } {
  const args: { templates?: string; out?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--templates") args.templates = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
  }
  return args;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd !== "build") {
    console.error("usage: pdf-kit build --templates <dir> --out <dir>");
    process.exit(1);
  }
  const args = parseArgs(rest);
  const templates = path.resolve(args.templates ?? "./src/pdf-templates");
  const out = path.resolve(args.out ?? "./dist");
  await runBuild(templates, out);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
