import fs from "node:fs/promises";
import path from "node:path";
import type { TemplateKind, Discovery, DiscoveredLayout } from "@vuedo/core";

export type { TemplateKind, Discovery, DiscoveredLayout };

function toDotted(relPath: string): string {
  return relPath
    .replace(/\\/g, "/")
    .replace(/\.tsx$/, "")
    .replace(/\//g, ".");
}

async function walk(dir: string, root: string, out: string[]): Promise<void> {
  const items = await fs.readdir(dir, { withFileTypes: true });
  for (const item of items) {
    const abs = path.join(dir, item.name);
    if (item.isDirectory()) {
      await walk(abs, root, out);
    } else if (item.isFile() && item.name.endsWith(".tsx")) {
      const rel = path
        .relative(await fs.realpath(root), await fs.realpath(abs))
        .split(path.sep)
        .join("/");
      out.push(rel);
    }
  }
}

// File-based layout convention (mirrors Vue's, but for .tsx files):
//   X.tsx                -> body template named "X"
//   XHeader.tsx          -> header paired with "X" (same folder)  [legacy]
//   X-header.tsx         -> header paired with "X" (same folder)  [kebab]
//   XFooter.tsx          -> footer paired with "X" (same folder)  [legacy]
//   X-footer.tsx         -> footer paired with "X" (same folder)  [kebab]
//
// React also supports single-file templates where one .tsx file exports
// named Body, Header, Footer components. File-based aux files take
// precedence when they exist; otherwise the renderer checks the body
// module for named Header/Footer exports at render time.
export async function discoverLayouts(templatesDir: string): Promise<Discovery> {
  const rels: string[] = [];
  await walk(templatesDir, templatesDir, rels);

  const entries: Record<string, string> = {};
  const bodies = new Set<string>();
  const aux: { name: string; kind: TemplateKind; base: string }[] = [];

  for (const rel of rels) {
    const dotted = toDotted(rel);
    entries[dotted] = path.resolve(templatesDir, rel);

    const segs = dotted.split(".");
    const last = segs[segs.length - 1];
    let kind: TemplateKind = "body";
    let suffixLen = 0;
    if (last.endsWith("-header")) {
      kind = "header";
      suffixLen = "-header".length;
    } else if (last.endsWith("-footer")) {
      kind = "footer";
      suffixLen = "-footer".length;
    } else if (last.endsWith("Header")) {
      kind = "header";
      suffixLen = "Header".length;
    } else if (last.endsWith("Footer")) {
      kind = "footer";
      suffixLen = "Footer".length;
    }

    if (kind === "body") {
      bodies.add(dotted);
    } else {
      const stripped = dotted.slice(0, dotted.length - suffixLen);
      const base = stripped.includes(".")
        ? stripped.slice(0, stripped.lastIndexOf("."))
        : stripped;
      if (base) aux.push({ name: dotted, kind, base });
    }
  }

  const baseToAux: Record<
    string,
    { body?: string; header?: string; footer?: string }
  > = {};
  for (const a of aux) {
    let best = "";
    for (const b of bodies) {
      if (b === a.base || b.startsWith(a.base + ".")) {
        if (b.length > best.length) best = b;
      }
    }
    if (!best) continue;
    const slot = (baseToAux[best] ??= {});
    if (a.kind === "header") slot.header = a.name;
    else slot.footer = a.name;
  }

  const layouts: Record<string, DiscoveredLayout> = {};
  for (const body of bodies) {
    const slot = baseToAux[body] ?? {};
    layouts[body] = {
      body,
      header: slot.header,
      footer: slot.footer,
    };
  }

  return { entries, layouts };
}
