# AGENTS.md

Guidance for AI agents and contributors working in this repository.

**Keep this file and [`docs/reference.md`](docs/reference.md) in sync** — when you update one, update the other. When code or behaviour changes, update both.

## Project Overview

This is a **pnpm workspace** with three parts:

- **`packages/core`** — `@pandaf/core`, framework-agnostic **primitives**:
  pluggable PDF drivers (Gotenberg, Chromium/Puppeteer), header/footer DOM
  measurement with caching, HTML document-shell wrappers, asset-inlining
  utilities, and a live-preview page builder. No framework-specific code —
  designed to be reused by framework adapters.
- **`packages/vue`** — `@pandaf/vue`, the **Vue adapter** built on
  `@pandaf/core`: Vue SSR compilation of print templates, file-based layout
  discovery, dev-mode live compilation via a Vite dev server, type generation,
  and a Vite plugin. Exposes `createPandaf()` → `renderHtml()` /
  `generatePdf()`.
- **`examples/vue`** — an example **consumer**: a plain Elysia backend that
  installs `@pandaf/vue` (via `workspace:*`) and calls it from its own routes.

The authoritative architecture/spec is [`docs/reference.md`](docs/reference.md).
When in doubt, follow it.

## Library Public API

Three exports (see `docs/reference.md` §4):

- **`@pandaf/core`** — framework-agnostic primitives: `PdfDriver`, `GotenbergDriver`,
  `ChromiumDriver`, `PuppeteerMeasurer`, `resolveMargins`, `Cache`,
  `InMemoryCache`, `RedisCache`, `wrapBody`/`wrapHeader`/`wrapFooter`,
  `inlineAssetsPlugin`, `buildPreviewHtml`, etc.
- **`@pandaf/vue`** — `createPandaf(options)` returning
  `{ renderHtml, renderComposite, generatePdf, previewHtml, close }`. Re-exports
  everything from `@pandaf/core` for convenience.
- **`@pandaf/vue/vite`** — a Vite plugin (`pandaf({ templatesDir, outDir })`):
  auto-discovers template SSR entries for the production build, runs type
  generation, compiles CSS via `@tailwindcss/vite`, and emits
  `pdf-manifest.json`.

There is no CLI. The Vite plugin is the sole build path — every consumer runs
`vite build` with the plugin in their config.

`vite` is an **optional peer dependency** — production (manifest path) never
imports it.

## Dev-Mode Rendering — Standard Vite SSR Pattern (§4.3)

`devServer` is optional. When omitted in dev mode, the library lazy-creates a
Vite server from the consumer's `vite.config.ts` and closes it on
`pandaf.close()`. Pass your own `devServer` to control the lifecycle (e.g. for
testing). In either case the library calls `vite.ssrLoadModule()` for live
template compilation with HMR. No owned Vite fallback, no shared-instance
registry — just the standard Vite SSR approach:

```ts
// Dev mode — zero-config (library auto-creates from vite.config.ts)
const pandaf = createPandaf({ templatesDir, driver });

// Dev mode — explicit server (consumer controls lifecycle)
const devServer = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
});
const pandaf = createPandaf({ templatesDir, driver, devServer });

// Prod mode
const pandaf = createPandaf({
  templatesDir, driver, mode: 'production',
  manifestPath: './dist/pdf-manifest.json',
  css: './dist/pandaf.css',
});
```

## Library Layout

### `packages/core/src` — framework-agnostic primitives

```
index.ts            re-exports all primitives
cache/              pluggable cache backends
  index.ts          re-exports
  types.ts          Cache abstract class + DEFAULT_TTL_MS
  memory.ts         InMemoryCache
  redis.ts          RedisCache
  noop.ts           NoopCache
drivers/            pluggable PDF backends
  index.ts          re-exports
  types.ts          PdfDriver abstract class + DriverRenderInput
  gotenberg.ts      GotenbergDriver — remote Chromium service
  chromium.ts       ChromiumDriver — local/remote Puppeteer
  measurement.ts    ChromiumMeasurer + PuppeteerMeasurer + resolveMargins
html.ts             wrapBody() / wrapHeader() / wrapFooter() document shells
inline-assets.ts    inlineAssetsPlugin() + inlineCssAssets() + inlineHtmlAssets()
preview.ts          buildPreviewHtml() + PAPER_SIZES
```

### `packages/vue/src` — Vue adapter (@pandaf/vue)

```
index.ts            createPandaf() — the only required consumer import;
                    re-exports everything from @pandaf/core for convenience
renderer.ts         dev vs. prod render strategy (devServer-based in dev, manifest-based in prod)
discover.ts         .vue file-based layout discovery (body + paired header/footer)
manifest.ts         writeManifest / loadManifest (entries + layouts)
render-component.ts  shared Vue SSR (createSSRApp + renderToString)
types.ts            generateTypes() — emits the inferred PandafProps
vite-plugin.ts      exported as '@pandaf/vue/vite'
```

No `cli.ts` or `dev-registry.ts` — these have been removed.

## Example Consumer Layout (`examples/vue`)

```
templates/         Vue SFCs — the PDF templates (file-based layout convention, §below).
                    Lowercase kebab-case filenames (Nuxt-style).
  components/      Reusable Vue SFCs imported by view templates.
    MoneyAmount.vue  Shared formatting component (takes `amount` prop).
  views/           Discovered template files (auto-detected when present).
    invoice.vue         body
    invoice-header.vue  header (auto-pairs with invoice)
    invoice-footer.vue  footer (auto-pairs with invoice)
    pos/pos-order.vue   nested body
    pos/pos-header.vue  header (auto-pairs with pos.pos-order via folder convention)
assets/            static assets referenced by templates (images + fonts, base64-inlined)
  app.css           Tailwind v4 entry — compiled by @pandaf/vue itself (no build step in the service)
  logo.png
  fonts/            custom .woff2/.ttf files (referenced from app.css @font-face)
.pandaf/           AUTO-GENERATED dev artifacts (compiled CSS, etc.) — gitignored, see ".pandaf Dev Folder"
src/
  server.ts         normal Elysia server (node adapter) — one typed route per template
  generated/        AUTO-GENERATED PandafProps (gitignored) — see "Type Generation"
  pandaf-env.d.ts    shim so `.vue` imports type-check
```

The consumer creates the Vite dev server in dev mode and passes it to `createPandaf()`.

## `.pandaf` Dev Folder

The `.pandaf/` directory (at the consumer's project root, gitignored) holds
auto-generated artifacts used only during development:

- **`pandaf.css`** — the compiled Tailwind v4 CSS produced by the
  `@tailwindcss/vite` plugin during `vite dev`. The `@pandaf/vue/vite` plugin
  watches the CSS entry (`assets/app.css`) and templates, and on each change
  re-compiles the CSS and writes it here. `createPandaf()` reads it from this
  path in dev mode.

## File-Based Layout Convention

There is **no** `header`/`footer` field on the request. Layout is inferred from
the template filenames (`packages/vue/src/discover.ts`):

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
- **views/ convention**: when a `views/` subdirectory exists inside `templatesDir`,
  discovery scans only that directory for templates. Reusable components belong
  in `templates/components/` (imported by views, not discovered as template
  entries). Template names stay clean — `views/invoice.vue` becomes `invoice`,
  not `views.invoice`.

`createPandaf().generatePdf(name, data)` resolves the layout automatically and
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

On every `vite build`, the library writes `src/generated/pandaf.d.ts` mapping
each template name to the **exact** `generatePdf` data shape. Consumers pass it
to the kit for full type-checking:

```ts
const pdf = createPandaf<PandafProps>({ templatesDir, driver, devServer });
pdf.generatePdf("invoice", { header, body, footer, options }); // fully type-checked
```

Accurate prop inference requires type-checking with **`vue-tsc`** (the root
`pnpm typecheck` script), not plain `tsc` — `ComponentProps` reads the real SFC
props via Volar. The generated file is gitignored (`src/generated/`).

## Commands

- `pnpm install` — install all workspace deps
- `pnpm --filter @pandaf/core build` — compile the core library to
  `packages/core/dist`
- `pnpm --filter @pandaf/vue build` — compile the Vue adapter to
  `packages/vue/dist` (**do this first** — the example service and its Vite
  config import the built lib)
- `pnpm dev` (root) — uses `turbo` to build the library first (from cache if
  unchanged) then runs the Elysia server (`:8080`) with `tsx watch`. The server
  creates a Vite dev server in middleware mode, which triggers the
  `@pandaf/vue/vite` plugin's `configureServer` for CSS compilation, type
  generation, and template watching. Tailwind is compiled by the package from
  `assets/app.css` at render time and written to `.pandaf/pandaf.css`.
- `pnpm build` (root) — `turbo build` => builds core first (`tsc`), then
  the vue adapter (`tsc`), then `vite build` in the example with the `pandaf`
  plugin → `dist/` + `pdf-manifest.json` + `src/generated/pandaf.d.ts`. All
  cached by turbo.
- `pnpm start` (root) — `NODE_ENV=production` server, reads the manifest
- `pnpm typecheck` (root) — `vue-tsc --noEmit` via turbo (validates generated props)
- `pnpm test` (root) — `vitest run` in all packages via turbo (build deps resolved
  and cached automatically).

## Changelog (`CHANGELOG.md`)

This repo keeps a `CHANGELOG.md` in the
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format. **You must keep
it up to date** whenever you change user-facing behavior.

Rules:

- **One `[Unreleased]` section at the top** under which every change lands, until
  a release is cut. Never write directly under a version heading during dev.
- Group entries under these headings only: `Added`, `Changed`, `Deprecated`,
  `Removed`, `Fixed`, `Security`. Use sentence case, and describe the change from
  the user's/consumer's perspective (not implementation trivia).
- Every entry is a succinct bullet. Prefix with a package/scope where useful
  (e.g. `**vue:**`, `**core:**`, `**docs:**`, `**server:**`). Reference
  PRs/issues as `(#123)` where known.
- When a release is cut, rename `[Unreleased]` to the new semver version
  (e.g. `## [1.2.0] - 2026-07-16`), add a comparison link at the bottom
  (`[1.2.0]: https://github.com/hshm/pandaf/compare/v1.1.0...v1.2.0`), and open a
  fresh `[Unreleased]` section. Keep versions ordered newest-first.
- Link the top `[Unreleased]` to the commit stream
  (`[Unreleased]: https://github.com/hshm/pandaf/commits/main`).
- Treat the changelog as a record of **notable** changes: new features, breaking
  changes, bug fixes, deprecations, removals, and security fixes. Do not log
  internal refactors, formatting, or test-only changes.

## Conventions

- The per-template prop types are **inferred** from the SFCs — do **not** maintain
  a hand-written registry (and there is no `shared-types/` folder). Each consumer
  route hand-writes its own TypeBox `t.Object` schema mirroring the SFC props; the
  generated `PandafProps` keeps the `generatePdf` call type-checked.
- New templates: drop a `.vue` file in the consumer's `templatesDir` — that's
  it. `discoverLayouts()` finds them (and pairs headers/footers) for dev
  (`ssrLoadModule`) and build (SSR entry) automatically; no registry to maintain.
- Each template gets **its own typed Elysia route** (e.g. `POST /invoice`), not a
  single generic public endpoint — TypeBox validates the `{ header?, body, footer?,
  options }` payload per template at the edge.
- **Styling**: templates use Tailwind utility classes. `app.css` (`@import
  "tailwindcss";`) is compiled by the `@tailwindcss/vite` Vite plugin, included
  in the consumer's Vite config. The `@pandaf/vue/vite` plugin's
  `configureServer` writes compiled CSS to `.pandaf/pandaf.css` on file changes;
  `createPandaf()` reads it and inlines it into every rendered section.
- All assets inline as Base64 (no runtime network fetches): imported images/fonts
  in templates are inlined by the library's `inlineAssetsPlugin` (dev + prod), and
  local `url()` refs in `app.css` are inlined by `inlineCssAssets` before injection.
- The library must never import `vite` at module top level (only dynamically or
  via type imports) so the optional-peer-dependency guarantee holds.
  `vite-plugin.ts` uses `import type` only.

## Naming Conventions

- **Reveal intent, skip type hints**: `items: string[]`, not `itemsArray`. Name says what it *is for*, not its shape.
- **Casing**: `camelCase` for variables/functions, `PascalCase` for types/interfaces/classes/components, `SCREAMING_SNAKE_CASE` for module-level constants and env vars. Don't prefix interfaces with `I`.
- **Booleans read as predicates**: `isActive`, `hasPermission`, `canEdit` — never bare adjectives (`active`) or negated forms (`isNotValid`).
- **Async functions get a verb**: `fetchUser()` not `user()`. Mutators are imperative (`sortItems`), pure derivations are noun-ish (`sortedItems`).
- **No vague catch-alls** (`data`, `temp`, `value`, `result`, `obj`) except as a genuine last resort — even then, scope it (`rawResponseData` beats `data`).
- **Short names only in short scopes**: `i`/`x`/`row` are fine in a 3-line loop, never past a function boundary.
- **One name per concept, everywhere**: don't alternate `user`/`customer`/`client` for the same entity across files.
- **Use the project's domain terms**, not generic synonyms — if the product says "booking," the code says `booking`, not `reservation`.
- **No shadowing**: don't reuse a name for a different purpose in a nested scope, even if TS allows it.
- **Singular/plural must match cardinality**: a single item is never named `items`.

## Testing Notes (§7)

- **Core** (`packages/core/test`): `cache.test.ts` (all cache backends),
  `drivers.test.ts` (PdfDriver + Gotenberg mock), `chromium-driver.test.ts`
  (ChromiumDriver with mocked Puppeteer), `measurement.test.ts` (withTimeout,
  PuppeteerMeasurer, resolveMargins + caching).
- **Vue adapter** (`packages/vue/test`): `discover.test.ts` (recursive pairing +
  dotted names), `types.test.ts` (generated `PandafProps`), `dev.test.ts`
  drives `createPandaf` in development mode covering both paths — with an explicit
  `devServer` (for lifecycle control) and without (library auto-creates from
  `vite.config.ts`); `manifest.prod.test.ts` runs the real build via the pandaf
  Vite plugin then renders via the manifest in production mode.
- **Consumer** (`examples/vue/test`): `app.test.ts` hits each typed Elysia route with
  `?preview=html` (no Gotenberg) and checks TypeBox validation (422 on a missing
  required section); `invoice.e2e.test.ts`, `pos-order.e2e.test.ts`,
  `measurement.e2e.test.ts` build `dist/`, render through **real
  Gotenberg** (and Browserless for measurement), and parse the PDF with
  `pdf-parse`. All e2e tests skip automatically when Gotenberg/Browserless are
  unreachable — bring them up with `pnpm infra:up`.
- Turbo caches test results — re-running `pnpm test` after no source changes
  replays from cache in milliseconds.
