import fs from "node:fs/promises";
import path from "node:path";
import type { TemplateKind, Discovery, DiscoveredLayout } from "@pandaf/core";

export type { TemplateKind, Discovery, DiscoveredLayout };

// A relative path on disk ("Pos/PosOrder.vue") becomes a dotted template name
// ("Pos.PosOrder") — stable as both a Vite input key and a lookup key.
function toDotted(relPath: string): string {
  return relPath
    .replace(/\\/g, "/")
    .replace(/\.vue$/, "")
    .replace(/\//g, ".");
}

async function walk(dir: string, root: string, out: string[]): Promise<void> {
  const items = await fs.readdir(dir, { withFileTypes: true });
  for (const item of items) {
    const abs = path.join(dir, item.name);
    if (item.isDirectory()) {
      await walk(abs, root, out);
    } else if (item.isFile() && item.name.endsWith(".vue")) {
      const rel = path
        .relative(await fs.realpath(root), await fs.realpath(abs))
        .split(path.sep)
        .join("/");
      out.push(rel);
    }
  }
}

// File-based layout convention (no per-request config):
//   X.vue                -> body template named "X"
//   XHeader.vue          -> header paired with "X" (same folder)  [legacy]
//   X-header.vue         -> header paired with "X" (same folder)  [kebab]
//   XFooter.vue          -> footer paired with "X" (same folder)  [legacy]
//   X-footer.vue         -> footer paired with "X" (same folder)  [kebab]
// Subdirectories are allowed and matched within their own folder
// (Pos/PosHeader.vue pairs with Pos/PosOrder.vue).
export async function discoverLayouts(templatesDir: string): Promise<Discovery> {
  // When the consumer follows the Vue/React convention and places templates
  // under a `views/` subdirectory, we walk from there so template names stay
  // clean ("invoice" rather than "views.invoice").  Components in `components/`
  // are imported by views and are not discovered as template entries.
  const viewsDir = path.resolve(templatesDir, "views");
  let scanRoot = templatesDir;
  try {
    const stat = await fs.stat(viewsDir);
    if (stat.isDirectory()) scanRoot = viewsDir;
  } catch {
    /* no views/ dir — use templatesDir as before */
  }

  const rels: string[] = [];
  await walk(scanRoot, scanRoot, rels);

  const entries: Record<string, string> = {};
  const bodies = new Set<string>();
  const aux: { name: string; kind: TemplateKind; base: string }[] = [];

  for (const rel of rels) {
    const dotted = toDotted(rel);
    entries[dotted] = path.resolve(scanRoot, rel);

    // Classify by the LAST dotted segment so nested templates (Pos.pos-header)
    // are handled correctly. Supports both kebab (-header/-footer) and legacy
    // PascalCase (Header/Footer) suffixes.
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
      // The aux's base is its parent folder prefix. Drop the suffix from the
      // whole dotted name, then take everything up to the last `.`:
      //   invoice-header  -> invoice
      //   pos.pos-header   -> pos  (pairs with pos.pos-order)
      const stripped = dotted.slice(0, dotted.length - suffixLen);
      const base = stripped.includes(".")
        ? stripped.slice(0, stripped.lastIndexOf("."))
        : stripped;
      if (base) aux.push({ name: dotted, kind, base });
    }
  }

  // Pair each aux with the best body under its base folder (longest wins, so
  // `Pos` matches `Pos.PosOrder` rather than a shallower `Pos` body if both
  // existed). An aux whose base matches no body is left as an orphan.
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
