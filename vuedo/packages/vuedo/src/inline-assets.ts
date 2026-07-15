import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

// Best-effort MIME guess from a URL/file path, used when a remote fetch does
// not report a usable content-type (e.g. font CDNs serving woff2 as octet-stream).
function guessMime(ref: string): string | undefined {
  const ext = ref.split(/[#?]/)[0].split(".").pop()?.toLowerCase();
  return ext ? MIME[ext] : undefined;
}

// Fetches a binary asset over HTTP(S) and returns it as a Base64 data URI.
// Used to inline remote `@import` CSS and the font files it references so the
// final document needs no network access at PDF-conversion time.
async function fetchDataUri(ref: string): Promise<string | null> {
  // TODO: cache by `ref` (e.g. Map or the planned Redis layer, see
  // PdfKitOptions.redisUrl) so remote fonts/assets fetched via `@import` or
  // `url()` are not re-downloaded on every render call.
  try {
    const res = await fetch(ref);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct =
      res.headers.get("content-type")?.split(";")[0].trim() ||
      guessMime(ref) ||
      "application/octet-stream";
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",
};

// Forces Vite to inline any imported asset (image or font) as a Base64 data
// URI instead of a dev-server URL / output file. Applied in both dev (tier-3
// owned server) and the production SSR build, so the rendered HTML/CSS contains
// no external asset references — Gotenberg can convert without network access.
export function inlineAssetsPlugin(): Plugin {
  return {
    name: "vuedo-inline-assets",
    enforce: "pre",
    async load(id) {
      const clean = id.split("?")[0];
      const m = clean.match(/\.([a-z0-9]+)$/i);
      if (!m) return null;
      const ext = m[1].toLowerCase();
      const mime = MIME[ext];
      if (!mime) return null;
      let buf: Buffer;
      try {
        buf = await readFile(clean);
      } catch {
        return null;
      }
      const base64 = buf.toString("base64");
      return `export default "data:${mime};base64,${base64}";`;
    },
  };
}

// Rewrites local `url(...)` references inside an already-compiled CSS string
// (e.g. Tailwind's app.css) into Base64 data URIs so the PDF needs no network
// access. Absolute refs (`/assets/...`) resolve against `baseDir`; `data:`,
// `#` and protocol-relative refs are left untouched. Remote `http(s):` refs are
// inlined only when `fetchRemote` is set (used for font files pulled in via a
// `@import`ed web-font stylesheet), since fetching them makes the document
// self-contained for Gotenberg.
export interface InlineCssAssetsOptions {
  /** Fetch and inline remote `http(s):` `url(...)` references. Default: false. */
  fetchRemote?: boolean;
}

export async function inlineCssAssets(
  css: string,
  baseDir: string,
  opts: InlineCssAssetsOptions = {},
): Promise<string> {
  const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
  const matches = [...css.matchAll(re)];
  let out = css;
  await Promise.all(
    matches.map(async (m) => {
      const ref = m[2];
      if (/^(data:|#|\/\/)/i.test(ref)) return;
      if (/^https?:/i.test(ref)) {
        if (!opts.fetchRemote) return;
        const dataUri = await fetchDataUri(ref);
        if (dataUri) out = out.replace(m[0], `url("${dataUri}")`);
        return;
      }
      const filePath = path.isAbsolute(ref)
        ? ref
        : path.resolve(baseDir, ref.replace(/^\//, ""));
      try {
        const buf = await readFile(filePath);
        const ext = path.extname(filePath).slice(1).toLowerCase();
        const mime = MIME[ext] ?? "application/octet-stream";
        const dataUri = `data:${mime};base64,${buf.toString("base64")}`;
        out = out.replace(m[0], `url("${dataUri}")`);
      } catch {
        /* leave the original url if the file can't be read */
      }
    }),
  );
  return out;
}

// Matches `@import "url";` and `@import url("url");` (with an optional trailing
// media query). Capture groups 2/4 hold the imported URL depending on form.
const IMPORT_RE =
  /@import\s+(?:url\(\s*(['"]?)([^'")]+)\1\s*\)|(["'])([^'"]+)\3)[^;]*;/gi;

// Resolves a single `@import` reference to its CSS text plus the base directory
// used to resolve *its* relative `url()`/`@import` children.
async function resolveImport(
  ref: string,
  baseDir: string,
): Promise<{ css: string; baseDir: string } | null> {
  if (/^(data:|#|\/\/)/i.test(ref)) return null;
  if (/^https?:/i.test(ref)) {
    try {
      const res = await fetch(ref);
      if (!res.ok) return null;
      const css = await res.text();
      // Nested relative refs resolve against the imported stylesheet's location.
      const base = ref.slice(0, ref.lastIndexOf("/") + 1);
      return { css, baseDir: base };
    } catch {
      return null;
    }
  }
  const filePath = path.isAbsolute(ref)
    ? ref
    : path.resolve(baseDir, ref.replace(/^\//, ""));
  try {
    const css = await readFile(filePath, "utf8");
    return { css, baseDir: path.dirname(filePath) };
  } catch {
    return null;
  }
}

// Inlines `@import` rules found in a CSS string. Each import — local file or
// remote `http(s):` stylesheet — is fetched/read, then recursively inlined
// (its own `@import`s and `url()` font references become Base64 data URIs).
// The `@import` statement is replaced by the self-contained CSS it pulled in,
// so web fonts declared via `@import` work without network access at PDF time.
export async function inlineCssImports(
  css: string,
  baseDir: string,
): Promise<string> {
  const matches = [...css.matchAll(IMPORT_RE)];
  let out = css;
  await Promise.all(
    matches.map(async (m) => {
      const ref = m[2] ?? m[4];
      if (!ref) return;
      const resolved = await resolveImport(ref, baseDir);
      if (!resolved) return; // leave the original @import if it can't be fetched
      let inlined = await inlineCssImports(resolved.css, resolved.baseDir);
      inlined = await inlineCssAssets(inlined, resolved.baseDir, {
        fetchRemote: true,
      });
      out = out.replace(m[0], inlined);
    }),
  );
  return out;
}

// Maps a local URL found in rendered HTML/CSS to an on-disk file. Handles the
// forms Vite produces: `/assets/foo.png` (dev server URL), `/@fs/<abs>` (dev
// fs URL), absolute paths, and paths relative to `assetsDir`.
function resolveAssetPath(ref: string, assetsDir: string): string | null {
  if (/^(data:|https?:|#|\/\/)/i.test(ref)) return null;
  let p: string;
  if (ref.startsWith("/@fs/")) p = ref.slice("/@fs/".length);
  else if (ref.startsWith("/assets/")) p = path.join(assetsDir, ref.slice("/assets/".length));
  else if (path.isAbsolute(ref)) p = ref;
  else p = path.resolve(assetsDir, ref);
  return p;
}

// Inlines local asset references in rendered HTML (and any inline <style>
// blocks) as Base64 data URIs, so the final document needs no network access.
// Applied after SSR in both dev and prod; no-ops when refs are already data URIs.
// TODO: cache the resolved data URIs (keyed by ref) across calls — the file
// reads below run on every render and are the other half of the asset-inlining
// cost alongside fetchDataUri.
export async function inlineHtmlAssets(
  html: string,
  assetsDir: string,
): Promise<string> {
  const inlineUrl = async (url: string): Promise<string> => {
    const file = resolveAssetPath(url, assetsDir);
    if (!file) return url;
    try {
      const buf = await readFile(file);
      const ext = path.extname(file).slice(1).toLowerCase();
      const mime = MIME[ext] ?? "application/octet-stream";
      return `data:${mime};base64,${buf.toString("base64")}`;
    } catch {
      return url;
    }
  };

  // <img src>, <image href>, <use href>, <source src>, <link href> (images)
  const attrRe =
    /(<(?:img|image|use|source)\b[^>]*?\b(?:src|href|xlink:href)=)(["'])(.*?)\2/gi;
  let out = html;
  const attrTasks: Promise<void>[] = [];
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(html)) !== null) {
    const [full, pre, q, url] = m;
    attrTasks.push(
      inlineUrl(url).then((replacement) => {
        if (replacement !== url) {
          out = out.replace(full, `${pre}${q}${replacement}${q}`);
        }
      }),
    );
  }
  await Promise.all(attrTasks);

  // Inline <style> blocks (e.g. SFC <style> with url() font references).
  out = await (async () => {
    const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
    const tasks: Promise<void>[] = [];
    let s: RegExpExecArray | null;
    let styled = out;
    while ((s = styleRe.exec(out)) !== null) {
      const full = s[0];
      const inner = s[1];
      tasks.push(
        (async () => {
          let inlined = await inlineCssImports(inner, assetsDir);
          inlined = await inlineCssAssets(inlined, assetsDir, {
            fetchRemote: true,
          });
          return inlined;
        })().then((inlined) => {
          styled = styled.replace(full, full.replace(inner, inlined));
        }),
      );
    }
    await Promise.all(tasks);
    return styled;
  })();

  return out;
}
