import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

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
// `http(s):`, `#` and protocol-relative refs are left untouched.
export async function inlineCssAssets(
  css: string,
  baseDir: string,
): Promise<string> {
  const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
  const matches = [...css.matchAll(re)];
  let out = css;
  await Promise.all(
    matches.map(async (m) => {
      const ref = m[2];
      if (/^(data:|https?:|#|\/\/)/i.test(ref)) return;
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
        inlineCssAssets(inner, assetsDir).then((inlined) => {
          styled = styled.replace(full, full.replace(inner, inlined));
        }),
      );
    }
    await Promise.all(tasks);
    return styled;
  })();

  return out;
}
