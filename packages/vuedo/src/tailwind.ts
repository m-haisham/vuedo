import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "@tailwindcss/node";
import { Scanner, type SourceEntry } from "@tailwindcss/oxide";

// The package bundles tailwindcss (and @tailwindcss/*) as dependencies, so a
// consumer doesn't need them installed in their own service. But Tailwind's
// `compile` resolves `@import "tailwindcss"` relative to the user's entry file,
// which fails when the consumer has no `tailwindcss` of their own. This resolver
// redirects bare Tailwind specifiers to the copies bundled with the package.
const PKG_DIR = path.dirname(fileURLToPath(import.meta.url));
const PKG_NODE_MODULES = path.resolve(PKG_DIR, "..", "node_modules");

// Resolve a bare specifier (e.g. `tailwindcss`, `@tailwindcss/vite`) to the copy
// bundled with this package. Returns the path of the actual CSS/JS entry file,
// since Tailwind's resolver reads the returned path as a file — a directory
// alone makes it throw EISDIR.
function resolveBundled(id: string): string | false {
  if (!id.startsWith("tailwindcss") && !id.startsWith("@tailwindcss/")) {
    return false;
  }
  let candidate = path.join(PKG_NODE_MODULES, id);
  if (existsSync(candidate) && existsSync(path.join(candidate, "package.json"))) {
    // It's a package directory — point at its CSS entry when present.
    const asIndex = path.join(candidate, "index.css");
    if (existsSync(asIndex)) return asIndex;
  }
  if (existsSync(candidate)) return candidate;
  return false;
}

/**
 * Tailwind v4 compilation, owned by the package.
 *
 * The user passes the path to their own CSS entry (their tunable `app.css`,
 * which `@import "tailwindcss";`s and may declare `@theme` / `@source`
 * directives). The package compiles it on demand by:
 *
 *   1. scanning the PDF templates + assets for class candidates (so we only
 *      capture styles actually used by the templates — not the whole consumer
 *      service), and
 *   2. running those candidates through Tailwind's compiler.
 *
 * The user tunes the scan via `@source`/`@source not` in their entry; any
 * sources they declare there are merged with the package's template/asset
 * defaults rather than replacing them.
 */

export interface TailwindOptions {
  /** Path to the user's Tailwind v4 CSS entry (e.g. `assets/app.css`). */
  entry: string;
  /** Extra content globs to scan for candidates, in addition to templates/assets. */
  sources?: SourceEntry[];
}

interface CompileState {
  entry: string;
  base: string;
  /** Combined sources (package defaults + user-declared). Resolved lazily. */
  sources: SourceEntry[];
  /** All files Tailwind's design system pulled in (e.g. @config, @plugin). */
  deps: Set<string>;
  cache: string | null;
  /** Fingerprint of inputs the cache was built from. */
  fingerprint: string | null;
}

// Resolve the candidate sources: the package always scans the templates and
// assets dirs (auto-added), and the user's own `@source` entries come from the
// entry CSS itself (Tailwind reads those at compile time, so we just pass
// `templates`/`assets` as the scanner's globs). `opts.sources` lets a caller
// widen the scan further if they want.
function resolveSources(
  templatesDir: string,
  assetsDir: string,
  extra?: SourceEntry[],
): SourceEntry[] {
  const norm = (p: string) => path.resolve(p);
  const sources: SourceEntry[] = [
    {
      base: norm(templatesDir),
      pattern: "**/*.{vue,js,ts,jsx,tsx,html,mjs,cjs}",
      negated: false,
    },
    {
      base: norm(assetsDir),
      pattern: "**/*.{vue,js,ts,jsx,tsx,html,css}",
      negated: false,
    },
  ];
  for (const s of extra ?? []) sources.push(s);
  return sources;
}

export class TailwindCompiler {
  private state: CompileState;

  constructor(
    entry: string,
    templatesDir: string,
    assetsDir: string,
    extraSources?: SourceEntry[],
  ) {
    const absEntry = path.resolve(entry);
    this.state = {
      entry: absEntry,
      base: path.dirname(absEntry),
      sources: resolveSources(templatesDir, assetsDir, extraSources),
      deps: new Set(),
      cache: null,
      fingerprint: null,
    };
  }

  /**
   * Compile (or return the cached result) the Tailwind stylesheet. Re-scans
   * whenever the entry, its dependencies, or any scanned file appears to have
   * changed (cheap stat-based fingerprint).
   */
  async compile(): Promise<string> {
    const fp = await this.fingerprint();
    if (this.state.cache !== null && this.state.fingerprint === fp) {
      return this.state.cache;
    }

    const entryCss = await readFile(this.state.entry, "utf8");
    const deps = new Set<string>();
    const result = await compile(entryCss, {
      base: this.state.base,
      from: this.state.entry,
      onDependency: (p) => deps.add(p),
      shouldRewriteUrls: false,
      customCssResolver: async (id: string) => resolveBundled(id),
    });

    const scanner = new Scanner({ sources: this.state.sources });
    const candidates = scanner.scan();
    const css = result.build(candidates);

    this.state.cache = css;
    this.state.deps = deps;
    this.state.fingerprint = fp;
    return css;
  }

  /** Builds a fingerprint from the entry mtime + every scanned/globbed file. */
  private async fingerprint(): Promise<string> {
    const parts: string[] = [];
    try {
      const { stat } = await import("node:fs/promises");
      parts.push(`${this.state.entry}:${(await stat(this.state.entry)).mtimeMs}`);
    } catch {
      parts.push(`${this.state.entry}:missing`);
    }
    // Walk the scanner's globs so a new/changed template busts the cache.
    const scanner = new Scanner({ sources: this.state.sources });
    const files = scanner.files;
    for (const f of files) {
      try {
        const { stat } = await import("node:fs/promises");
        parts.push(`${f}:${(await stat(f)).mtimeMs}`);
      } catch {
        /* file disappeared; ignore */
      }
    }
    return parts.join("|");
  }

  /** Force a recompile on the next `compile()` call. */
  invalidate(): void {
    this.state.fingerprint = null;
  }
}
