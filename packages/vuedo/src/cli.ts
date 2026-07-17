#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vuedo } from "./vite-plugin.js";
import { generateTypes } from "./types.js";

export async function runBuild(
  templatesDir: string,
  outDir: string,
): Promise<void> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { spawn } = await import("node:child_process");

  const configPath = path.join(
    import.meta.dirname,
    `.vuedo-build-${process.pid}-${Date.now()}.ts`,
  );
  await fs.writeFile(
    configPath,
    `import tailwindcss from '@tailwindcss/vite';\n` +
      `import vue from '@vitejs/plugin-vue';\n` +
      `import { vuedo } from './vite-plugin.js';\n` +
      `export default { plugins: [tailwindcss(), vue(), vuedo({ templatesDir: ${JSON.stringify(
        templatesDir,
      )}, outDir: ${JSON.stringify(outDir)} })], build: { outDir: ${JSON.stringify(
        outDir,
      )} } };\n`,
  );

  await new Promise<void>((resolve, reject) => {
    const vitePath = (() => {
      try {
        return fileURLToPath(import.meta.resolve("vite/bin/vite.js"));
      } catch {
        return path.resolve(
          import.meta.dirname,
          "../node_modules/vite/bin/vite.js",
        );
      }
    })();
    const child = spawn(process.execPath, [
      vitePath,
      "build",
      "--config",
      configPath,
      "--logLevel",
      "warn",
    ]);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`vite build failed (exit ${code})`)),
    );
  });

  await fs.rm(configPath, { force: true });
}

function parseArgs(argv: string[]): {
  templates?: string;
  out?: string;
  typesOut?: string;
} {
  const args: { templates?: string; out?: string; typesOut?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--templates") args.templates = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--types-out") args.typesOut = argv[++i];
  }
  return args;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const templates = path.resolve(args.templates ?? "./src/pdf-templates");
  const out = path.resolve(args.out ?? "./dist");

  if (cmd === "build") {
    await runBuild(templates, out);
    return;
  }

  if (cmd === "types") {
    const typesOut =
      args.typesOut ?? path.resolve(process.cwd(), "src/generated/vuedo.d.ts");
    await generateTypes(templates, typesOut);
    return;
  }

  console.error(
    "usage: vuedo <build|types> --templates <dir> [--out <dir>] [--types-out <file>]",
  );
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
