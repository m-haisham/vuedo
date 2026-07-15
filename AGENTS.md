# AGENTS.md

Guidance for AI agents and contributors working in this repository.

## Project Overview

This is a **pnpm workspace** with two parts:

- **`packages/vuedo`** — `@hshm/vuedo`, an embeddable **library** (not a
  service) that turns Vue+Tailwind templates into PDFs: Vue SSR → asset-inlined
  HTML → Gotenberg (headless Chromium). Consumers keep their own HTTP server and
  routes; the library exposes `createPdfKit()` → `renderHtml()` / `generatePdf()`.
- **root (`vuedo`)** — an example **consumer**: a plain Elysia backend that
  installs `@hshm/vuedo` (via `workspace:*`) and calls it from its own routes.

The authoritative architecture/spec is [`docs/reference.md`](docs/reference.md).
When in doubt, follow it.

## Library Public API (`@hshm/vuedo`)

Three exports (see `docs/reference.md` §4):

- **`@hshm/vuedo`** — `createPdfKit(options)` returning `{ renderHtml, renderComposite, generatePdf, close }`.
- **`@hshm/vuedo/vite`** — a Vite plugin (`vuedo({ templatesDir, outDir })`):
  registers the host's dev server (tier 2) and, on `vite build`, compiles every
  template as an SSR entry, writes `pdf-manifest.json`, and emits the inferred
  `PdfTemplateProps` types.
- **`vuedo` CLI** — `vuedo build --templates <dir> --out <dir>` for hosts
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

## Library Layout (`packages/vuedo/src`)

```
index.ts            createPdfKit() — the only required consumer import
renderer.ts         dev render strategy (3-tier Vite selection) + closeOwnedRenderer
dev-registry.ts     module-level slot the plugin writes and the core reads
discover.ts         file-based layout discovery (body + paired header/footer)
manifest.ts         writeManifest / loadManifest (entries + layouts)
render-component.ts  shared Vue SSR (createSSRApp + renderToString)
gotenberg.ts        Gotenberg HTTP client (returns a ReadableStream)
html.ts             wrapHtml() document shell
types.ts            generateTypes() — emits the inferred PdfTemplateProps
vite-plugin.ts      exported as '@hshm/vuedo/vite'
cli.ts              exported as bin 'vuedo'
```

## Root Service Layout

```
templates/         Vue SFCs — the PDF templates (file-based layout convention, §below).
                    Lowercase kebab-case filenames (Nuxt-style):
  invoice.vue         body
  invoice-header.vue  header (auto-pairs with invoice)
  invoice-footer.vue  footer (auto-pairs with invoice)
  pos/pos-order.vue   nested body
  pos/pos-header.vue  header (auto-pairs with pos.pos-order via folder convention)
assets/            static assets referenced by templates (images + fonts, base64-inlined)
  app.css           Tailwind v4 entry (compiled to dist/app.css by the build/dev scripts)
  logo.png
  fonts/            custom .woff2/.ttf files (referenced from app.css @font-face)
src/
  server.ts         normal Elysia server (node adapter) — one typed route per template
  generated/        AUTO-GENERATED PdfTemplateProps (gitignored) — see "Type Generation"
  vuedo-env.d.ts    shim so `.vue` imports type-check
```

The library defaults `templatesDir` to `<cwd>/templates`, so a consumer usually
doesn't even need to pass it. Assets live in `<cwd>/assets` (sibling of
`templates/`) so a template's `../assets/...` import resolves there.

## File-Based Layout Convention

There is **no** `header`/`footer` field on the request. Layout is inferred from
the template filenames (`packages/vuedo/src/discover.ts`):

- `X.vue` → a **body** template named `X`.
- `XHeader.vue` / `XFooter.vue` in the **same folder** → paired with `X`
  (**legacy PascalCase**). Preferred is the lowercase kebab form:
  `x-header.vue` / `x-footer.vue` pairs with `x.vue`.
- Subdirectories are allowed and matched within their own folder:
  `Pos/PosHeader.vue` pairs with `Pos/PosOrder.vue`, and the kebab
  `pos/pos-header.vue` pairs with `pos/pos-order.vue` (the aux's base is its
  parent folder, `pos`, which matches the longest body `pos.pos-order`).
- A template name is its path with `/` → `.` (`pos/pos-order` → `pos.pos-order`).
- An aux file whose base matches no body is an orphan (compiled but unused).

`createPdfKit().generatePdf(name, data)` resolves the layout automatically and
renders body + the paired header/footer. The `data` object carries each
section's own props, so header/footer are never forced to share the body's data:

```ts
generatePdf("invoice", {
  header:  { id, customerName },
  body:    { id, customerName },
  footer:  { id, customerName },
  options: { marginTop: 24, marginBottom: 24 }, // Gotenberg margins
});
```

`renderComposite(name, data)` returns the same composition as one HTML document
(used by `?preview=html`). A template without a paired aux simply omits that
key from `data` (and from the generated type) — see "Type Generation".

## Type Generation

On every `vite build` (and via `vuedo types`), the library writes
`src/generated/pdf-templates.d.ts` mapping each template name to the **exact**
`generatePdf` data shape. `header`/`footer` keys are present **only** when the
template actually has a paired aux, so the call is type-checked against exactly
the sections that exist:

```ts
import type { ComponentProps } from "vue-component-type-helpers";
import type { GeneratePdfOptions } from "@hshm/vuedo";
import Invoice from "../templates/invoice.vue";
import InvoiceFooter from "../templates/invoice-footer.vue";
import InvoiceHeader from "../templates/invoice-header.vue";
import Pos_PosHeader from "../templates/pos/pos-header.vue";
import Pos_PosOrder from "../templates/pos/pos-order.vue";

export type PdfTemplateProps = {
  "invoice": {
    header:  ComponentProps<typeof InvoiceHeader>;
    body:    ComponentProps<typeof Invoice>;
    footer:  ComponentProps<typeof InvoiceFooter>;
    options?: GeneratePdfOptions;
  };
  "pos.pos-order": {
    header:  ComponentProps<typeof Pos_PosHeader>;
    body:    ComponentProps<typeof Pos_PosOrder>;
    options: GeneratePdfOptions; // no footer key — pos.pos-order has no footer
  };
};
```

Consumers pass it to the kit for full type-checking:

```ts
const pdf = createPdfKit<PdfTemplateProps>({ templatesDir, gotenbergUrl });
pdf.generatePdf("invoice", { header, body, footer, options }); // fully type-checked
```

Accurate prop inference requires type-checking with **`vue-tsc`** (the root
`pnpm typecheck` script), not plain `tsc` — `ComponentProps` reads the real SFC
props via Volar. The generated file is gitignored (`src/generated/`).

## Commands

- `pnpm install` — install all workspace deps
- `pnpm --filter @hshm/vuedo build` — compile the library to `packages/vuedo/dist`
  (**do this first** — the root service and its Vite config import the built lib)
- `pnpm dev` (root) — dev server on `:8080` (normal Elysia `app.listen`) plus a
  Tailwind CLI `--watch` (via `concurrently`) compiling `app.css` → `dist/app.css`;
  templates hot-compile via the library's tier-3 owned Vite, **no vite build step**
- `pnpm build` (root) — `vite build` with the `vuedo` plugin → `dist/` +
  `pdf-manifest.json` + `src/generated/pdf-templates.d.ts`, then `build:css`
  compiles Tailwind `app.css` → `dist/app.css`
- `pnpm start` (root) — `NODE_ENV=production` server, reads the manifest
- `pnpm typecheck` (root) — `vue-tsc --noEmit` (validates generated props)
- `pnpm -r test` — run both suites (library + consumer)

## Conventions

- The per-template prop types are **inferred** from the SFCs — do **not** maintain
  a hand-written registry (and there is no `shared-types/` folder). Each consumer
  route hand-writes its own TypeBox `t.Object` schema mirroring the SFC props; the
  generated `PdfTemplateProps` keeps the `generatePdf` call type-checked.
- New templates: drop a `.vue` file in the consumer's `templatesDir` — that's
  it. `discoverLayouts()` finds them (and pairs headers/footers) for dev
  (`ssrLoadModule`) and build (SSR entry) automatically; no registry to maintain.
- Each template gets **its own typed Elysia route** (e.g. `POST /invoice`), not a
  single generic public endpoint — TypeBox validates the `{ header?, body, footer?,
  options }` payload per template at the edge.
- **Styling**: templates use Tailwind utility classes. `app.css` (`@import
  "tailwindcss";`) is compiled to `dist/app.css` by the `dev`/`build:css` scripts
  and passed to `createPdfKit({ css })`, which `wrapHtml` injects into every
  rendered section. Custom fonts go in `assets/fonts/` and are referenced via
  `@font-face` in `app.css`; vuedo base64-inlines them at runtime.
- All assets inline as Base64 (no runtime network fetches): imported images/fonts
  in templates are inlined by the library's `inlineAssetsPlugin` (dev + prod), and
  local `url()` refs in `app.css` are inlined by `inlineCssAssets` before injection.
- The library must never import `vite` at module top level (only dynamically, in
  the tier-3 fallback and the CLI) so the optional-peer-dependency guarantee
  holds. `vite-plugin.ts` uses `import type` only.

## Testing Notes (§7)

- **Library** (`packages/vuedo/test`): `discover.test.ts` (recursive pairing +
  dotted names), `types.test.ts` (generated `PdfTemplateProps`), `dev.test.ts`
  drives `createPdfKit` in development mode against a fixture `templatesDir`
  (tier-3 ssrLoadModule, incl. `renderComposite`); `manifest.prod.test.ts` runs
  the real build (`runBuild`) then renders via the manifest in production mode.
- **Consumer** (root `test`): `app.test.ts` hits each typed Elysia route with
  `?preview=html` (no Gotenberg) and checks TypeBox validation (422 on a missing
  required section); `pdf.e2e.test.ts` builds `dist/`, renders through **real
  Gotenberg**, and parses the PDF with `pdf-parse`. Both skip automatically when
  Gotenberg is unreachable — bring it up with `docker compose -f deploy/docker-compose.yml up` (§6, infra only).
