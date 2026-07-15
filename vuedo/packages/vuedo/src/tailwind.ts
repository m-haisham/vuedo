import { readFile } from "node:fs/promises";
import path from "node:path";
import { compile, optimize } from "@tailwindcss/node";
import { Scanner, type SourceEntry } from "@tailwindcss/oxide";

// The default CSS entry used when a consumer has no `assets/app.css` of their
// own. Pulls in the full Tailwind v4 layer stack; utilities are tree-shaken to
// only the classes actually used by the scanned templates.
const DEFAULT_INPUT = '@import "tailwindcss";';

export interface CompileTailwindOptions {
  /** Path to the CSS entry (e.g. `<assetsDir>/app.css`). Falls back to a built-in `@import "tailwindcss"` when absent. */
  input?: string;
  /**
   * Warn (instead of silently falling back to the built-in entry) when `input`
   * is set but can't be read — use it when the path was explicitly chosen by the
   * user rather than a convention-based default.
   */
  warnOnMissingInput?: boolean;
  /** Base dir Tailwind resolves `@import`/`@source`/relative `url()` against. Defaults to the input's dir (or cwd). */
  base?: string;
  /** Extra content roots to scan for utility classes (in addition to Tailwind's auto-detected sources). */
  content?: SourceEntry[];
  /** Minify the produced CSS. Default `false`. */
  minify?: boolean;
}

// Compiles Tailwind v4 to a plain CSS string using the same programmatic
// pipeline the official CLI uses (`@tailwindcss/node` compile + `@tailwindcss/oxide`
// Scanner). This lets `@hshm/vuedo` own Tailwind end-to-end — consumers never
// run the Tailwind CLI or a `--watch` build of their own.
export async function compileTailwindCss(
  options: CompileTailwindOptions = {},
): Promise<string> {
  const base =
    options.base ??
    (options.input ? path.dirname(options.input) : process.cwd());

  let input = DEFAULT_INPUT;
  if (options.input) {
    try {
      input = await readFile(options.input, "utf8");
    } catch (err) {
      // Only a user-specified entry warrants a warning; a missing convention
      // default (`<assetsDir>/app.css`) is an expected zero-config case.
      if (options.warnOnMissingInput) {
        console.warn(
          `[vuedo] Tailwind CSS entry not found at ${options.input}; ` +
            `falling back to the built-in \`${DEFAULT_INPUT}\`. (${
              (err as NodeJS.ErrnoException)?.code ?? err
            })`,
        );
      }
    }
  }

  const compiler = await compile(input, {
    base,
    from: options.input,
    onDependency: () => {},
  });

  const sources: SourceEntry[] = [
    ...compiler.sources,
    ...(options.content ?? []),
  ];
  const scanner = new Scanner({ sources });
  const candidates = scanner.scan();

  const css = compiler.build(candidates);
  if (!options.minify) return css;
  return optimize(css, { minify: true }).code;
}
