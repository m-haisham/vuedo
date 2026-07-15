import fs from "node:fs/promises";
import path from "node:path";

export type TemplateKind = "body" | "header" | "footer";

export interface DiscoveredLayout {
  body: string; // dotted name of the body template
  header?: string; // dotted name of the paired header template
  footer?: string; // dotted name of the paired footer template
}

export interface Discovery {
  /** dottedName -> absolute .vue path (every file, used as Vite SSR input) */
  entries: Record<string, string>;
  /** body dottedName -> its paired layout */
  layouts: Record<string, DiscoveredLayout>;
}

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
//   XHeader.vue          -> header paired with "X" (same folder)
//   XFooter.vue          -> footer paired with "X" (same folder)
// Subdirectories are allowed and matched within their own folder
// (Pos/PosHeader.vue pairs with Pos/PosOrder.vue).
export async function discoverLayouts(templatesDir: string): Promise<Discovery> {
  const rels: string[] = [];
  await walk(templatesDir, templatesDir, rels);

  const entries: Record<string, string> = {};
  const bodies = new Set<string>();
  const aux: { name: string; kind: TemplateKind; base: string }[] = [];

  for (const rel of rels) {
    const dotted = toDotted(rel);
    entries[dotted] = path.resolve(templatesDir, rel);

    let kind: TemplateKind = "body";
    if (dotted.endsWith("Header")) kind = "header";
    else if (dotted.endsWith("Footer")) kind = "footer";

    if (kind === "body") {
      bodies.add(dotted);
    } else {
      // The aux's base is its parent folder segment. For `InvoiceHeader` the
      // parent is `Invoice`; for `Pos.PosHeader` (Pos/PosHeader.vue) the parent
      // is `Pos`, which pairs it with `Pos.PosOrder`. This supports both the
      // "<Body>Header.vue" rule and nested "<Folder>/<Folder>Header.vue".
      const stripped = dotted.slice(0, -kind.length); // drop "Header"/"Footer"
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
