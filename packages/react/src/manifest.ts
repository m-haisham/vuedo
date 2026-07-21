import fs from "node:fs/promises";
import path from "node:path";
import { discoverLayouts, type Discovery } from "./discover.js";
import type { PdfManifest } from "@pandaf/core";

export type { PdfManifest };

export async function writeManifest(
  templatesDir: string,
  outDir: string,
): Promise<PdfManifest> {
  const disc = await discoverLayouts(templatesDir);
  const manifest: PdfManifest = { entries: {}, layouts: disc.layouts };
  for (const name of Object.keys(disc.entries)) {
    manifest.entries[name] = `./${name}.js`;
  }
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(
    path.resolve(outDir, "pdf-manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  return manifest;
}

export async function loadManifest(manifestPath: string): Promise<PdfManifest> {
  const raw = JSON.parse(await fs.readFile(manifestPath, "utf8")) as PdfManifest;
  const base = path.dirname(manifestPath);
  const entries: Record<string, string> = {};
  for (const [name, rel] of Object.entries(raw.entries)) {
    entries[name] = path.resolve(base, rel);
  }
  return { entries, layouts: raw.layouts };
}
