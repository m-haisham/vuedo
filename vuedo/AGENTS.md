# AGENTS.md

Guidance for AI agents and contributors working in this repository.

## Project Overview

This is a **pnpm workspace** with two parts:

- **`packages/vuedf`** — `@hshm/vuedf`, an embeddable **library** (not a
  service) that turns Vue+Tailwind templates into PDFs: Vue SSR → asset-inlined
  HTML → Gotenberg (headless Chromium). Consumers keep their own HTTP server and
  routes; the library exposes `createPdfKit()` → `renderHtml()` / `generatePdf()`.
- **root (`vuedo`)** — an example **consumer**: a plain Elysia backend that
  installs `@hshm/vuedf` (via `workspace:*`) and calls it from its own route.

The authoritative architecture/spec is [`docs/reference.md`](docs/reference.md).
When in doubt, follow it.

## Library Public API (`@hshm/vuedf`)

Three exports (see `docs/reference.md` §4):

- **`@hshm/vuedf`** — `createPdfKit(options)` returning `{ renderHtml, generatePdf, close }`.
- **`@hshm/vuedf/vite`** — a Vite plugin (`pdfKit({ templatesDir, outDir })`):
  registers the host's dev server (tier 2) and, on `vite build`, compiles every
  template as an SSR entry and writes `pdf-manifest.json`.
- **`pdf-kit` CLI** — `pdf-kit build --templates <dir> --out <dir>` for hosts
  with no Vite of their own (Path B); it just drives the same plugin.

`vite` is an **optional peer dependency** — production (manifest path) never
imports it.

## Dev-Mode Rendering — Three Tiers (§4.3)

`renderer.ts` picks a Vite instance per render call, in priority order:

1. **explicit** — one passed by the caller (tests/advanced).
2. **shared** — the host's own Vite server, registered by the plugin's
   `configureServer` hook via `src/dev-registry.ts`.
3. **owned** — the library lazily boots its own middleware-mode instance, once.

Production takes none of this: `createPdfKit({ mode: 'production' })` reads the
manifest and `import()`s the pre-compiled SSR module. No Vite involved.

## Library Layout (`packages/vuedf/src`)

```
index.ts            createPdfKit() — the only required consumer import
renderer.ts         dev render strategy (3-tier Vite selection) + closeOwnedRenderer
dev-registry.ts     module-level slot the plugin writes and the core reads
manifest.ts         discoverTemplates / writeManifest / loadManifest
render-component.ts  shared Vue SSR (createSSRApp + renderToString)
gotenberg.ts        Gotenberg HTTP client (returns a ReadableStream)
html.ts             wrapHtml() document shell
vite-plugin.ts      exported as '@hshm/vuedf/vite'
cli.ts              exported as bin 'pdf-kit'
```

## Root Service Layout (`src`)

```
pdf-templates/      Vue SFCs — the PDF templates (Invoice/InvoiceHeader/InvoiceFooter)
assets/             static assets referenced by templates (inlined at build)
shared-types/       types shared between Vue props and Elysia schema
server.ts           Elysia app + native-http boot; calls createPdfKit()
```

## Commands

- `pnpm install` — install all workspace deps
- `pnpm --filter @hshm/vuedf build` — compile the library to `packages/vuedf/dist`
  (**do this first** — the root service and its Vite config import the built lib)
- `pnpm dev` (root) — dev server on `:8080`; templates hot-compile via the
  library's tier-3 owned Vite, **no build step**
- `pnpm build` (root) — `vite build` with the pdfKit plugin → `dist/` + `pdf-manifest.json`
- `pnpm start` (root) — `NODE_ENV=production` server, reads the manifest
- `pnpm -r test` — run both suites (library + consumer)

## Header / Footer

`generatePdf(template, data, opts)` accepts optional `opts.header` and
`opts.footer`, each `{ template, data }`. They render through the same pipeline
and are sent to Gotenberg as `header.html` / `footer.html` only when present.
The root service maps its request body's `header`/`footer` straight onto these.

## Conventions

- Keep `src/shared-types/index.ts` in sync with the Elysia `t.Object` schema in
  `src/server.ts`.
- New templates: drop a `.vue` file in the consumer's `templatesDir` — that's
  it. `discoverTemplates` finds them for dev (ssrLoadModule) and build (SSR
  entry) automatically; no registry to maintain.
- All assets inline as Base64 at build time (no runtime network fetches).
- The library must never import `vite` at module top level (only dynamically, in
  the tier-3 fallback and the CLI) so the optional-peer-dependency guarantee
  holds. `vite-plugin.ts` uses `import type` only.

## Testing Notes (§7)

- **Library** (`packages/vuedf/test`): `dev.test.ts` drives `createPdfKit` in
  development mode against a fixture `templatesDir` (tier-3 ssrLoadModule);
  `manifest.prod.test.ts` runs the real build (`runBuild`) then renders via the
  manifest in production mode.
- **Consumer** (root `test`): `app.test.ts` hits the Elysia route with
  `?preview=html` (no Gotenberg) and checks TypeBox validation; `pdf.e2e.test.ts`
  builds `dist/`, renders through **real Gotenberg**, and parses the PDF with
  `pdf-parse`. It **skips automatically** when Gotenberg is unreachable — bring
  it up with `docker compose -f deploy/docker-compose.yml up` (§6, infra only).
