import type { ViteDevServer } from "vite";
import path from "node:path";

export interface VuedoPluginOptions {
  templatesDir: string;
  outDir?: string;
  typesOut?: string;
  cssEntry?: string;
  preview?:
    | boolean
    | {
        basePath?: string;
        defaultPaperSize?: string;
      };
}

export function getVitePort(
  server: ViteDevServer,
): number | undefined {
  const addr = server.httpServer?.address();
  if (addr && typeof addr === "object") return addr.port;
  return server.config.server.port;
}

export function resolvePluginOpts(opts: VuedoPluginOptions): {
  outDir: string;
  typesOut: string;
  cssEntry: string | undefined;
  cssDevOut: string | undefined;
} {
  const outDir = opts.outDir ?? "dist";
  const typesOut =
    opts.typesOut ?? path.resolve(process.cwd(), "src/generated/vuedo.d.ts");
  const cssEntry = opts.cssEntry ? path.resolve(opts.cssEntry) : undefined;
  const cssDevOut = cssEntry
    ? path.resolve(process.cwd(), ".vuedo", "vuedo.css")
    : undefined;
  return { outDir, typesOut, cssEntry, cssDevOut };
}
