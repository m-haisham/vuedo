import fs from "node:fs/promises";
import path from "node:path";

// Maps a template name to its compiled SSR module. On disk the paths are
// relative to the manifest file (portable across build/run environments, e.g.
// Docker); loadManifest() resolves them back to absolute at read time.
export type Manifest = Record<string, string>;

// Every `*.vue` directly under templatesDir becomes an SSR entry keyed by its
// basename. The key doubles as the Rollup input name → output `<name>.js`.
export async function discoverTemplates(
  templatesDir: string,
): Promise<Record<string, string>> {
  const files = await fs.readdir(templatesDir);
  const entries: Record<string, string> = {};
  for (const file of files) {
    if (file.endsWith(".vue")) {
      entries[file.slice(0, -4)] = path.resolve(templatesDir, file);
    }
  }
  return entries;
}

export async function writeManifest(
  templatesDir: string,
  outDir: string,
): Promise<Manifest> {
  const entries = await discoverTemplates(templatesDir);
  const manifest: Manifest = {};
  for (const name of Object.keys(entries)) {
    manifest[name] = `./${name}.js`;
  }
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(
    path.resolve(outDir, "pdf-manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  return manifest;
}

export async function loadManifest(manifestPath: string): Promise<Manifest> {
  const raw = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Manifest;
  const base = path.dirname(manifestPath);
  const resolved: Manifest = {};
  for (const [name, rel] of Object.entries(raw)) {
    resolved[name] = path.resolve(base, rel);
  }
  return resolved;
}
