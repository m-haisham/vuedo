# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **react:** New `@vuedo/react` package — a React adapter built on `@vuedo/core`,
  exposing `createVuedo()` for React SSR → PDF generation. Supports React 18+
  with `react-dom/server` rendering.
- **react:** Single-file template convention — React templates export named
  `Body`, `Header`, `Footer` components from a single `.tsx` file, in contrast
  to Vue's separate-file layout convention.
- **react:** File-based layout convention also supported for compatibility
  (`x.tsx` body, `x-header.tsx` header, `x-footer.tsx` footer).
- **react:** Vite plugin (`@vuedo/react/vite`) with `@vitejs/plugin-react`,
  auto-discovery of `.tsx` templates, type generation via
  `ComponentPropsWithoutRef`, and preview middleware.
- **react:** Example consumer (`examples/react`) — an Elysia server with two
  templates (invoice + POS receipt) mirroring the Vue example, using the
  single-file React convention.
- **react:** Package tests (discover, dev mode, manifest production, types)
  and consumer tests (router + E2E with real Gotenberg).
- **vue:** `discoverLayouts()` now auto-detects a `views/` subdirectory inside
  `templatesDir` — when present, only files under `views/` are discovered as
  templates, and reusable components live in `templates/components/`. Template
  names stay clean (`views/invoice.vue` → `invoice`). When no `views/` directory
  exists, discovery walks `templatesDir` as before (fully backwards-compatible).
- **react:** `discoverLayouts()` also auto-detects a `views/` subdirectory
  inside `templatesDir` for `.tsx` templates, matching the Vue convention.
  Reusable `.tsx` components in `templates/components/` are imported by views
  and are not discovered as template entries.
- **examples:** Both Vue and React example consumers now use the
  `templates/views/` + `templates/components/` convention. A reusable
  `MoneyAmount` component (with `amount`, `bold`, `className` props) is imported
  by both the invoice and POS receipt templates.

### Changed

- **vuedo:** The single `@hshm/vuedo` package has been split into two:
  `@vuedo/core` (framework-agnostic primitives: cache, drivers, HTML wrappers,
  asset inlining, preview) and `@vuedo/vue` (the Vue adapter built on
  `@vuedo/core`, exposing `createVuedo()`). Consumers should now import from
  `@vuedo/vue` instead of `@hshm/vuedo`, and from `@vuedo/vue/vite` instead of
  `@hshm/vuedo/vite`. `@vuedo/vue` re-exports everything from `@vuedo/core`
  for backwards compatibility — existing imports of `createVuedo`,
  `GotenbergDriver`, `ChromiumDriver`, `Cache` etc. continue to work via the
  new `@vuedo/vue` entry-point.

### Removed

- **vuedo:** The `vuedo` CLI (`vuedo build`, `vuedo types`) has been removed.
  The Vite plugin (`@vuedo/vue/vite`) is the sole build path — every consumer
  runs `vite build` with the plugin in their config.

- **vuedo:** The owned-Vite fallback has been removed. In development mode,
  `createVuedo()` lazy-creates a Vite server from the consumer's
  `vite.config.ts` (the standard Vite SSR pattern). `devServer` is an
  optional escape hatch for consumers who need full lifecycle control.

- **vuedo:** The `cssEntry` option on `createVuedo()` has been removed. CSS
  compilation is handled entirely by the `@tailwindcss/vite` plugin (configured
  in the consumer's Vite config) and the `@hshm/vuedo/vite` plugin's
  `configureServer` watcher.

### Added

- **vuedo:** `createVuedo()` accepts an optional `devServer` option — a
  `ViteDevServer` instance. When omitted in dev mode, the library
  lazy-creates one from the consumer's `vite.config.ts` and closes it on
  `vuedo.close()`. Pass your own to control the lifecycle (e.g. for testing).

- **server:** The example consumer's `dev` script is now a single `tsx watch`
  — no concurrent `vite dev` process. The library auto-creates Vite from
  `vite.config.ts`.

### Changed

- **vuedo:** Dev-mode rendering follows the standard Vite SSR pattern
  (see [Vite SSR guide](https://vite.dev/guide/ssr)). `devServer` is optional
  — when omitted, the library lazy-creates Vite from `vite.config.ts` and
  calls `vite.ssrLoadModule()` for live template compilation. When provided,
  the consumer owns the Vite lifecycle.

### Added

- **vuedo:** A `.vuedo/` development folder at the consumer project root now
  holds auto-generated dev artifacts (gitignored). The compiled Tailwind v4 CSS
  is no longer written to `src/generated/vuedo.css` — it goes to
  `.vuedo/vuedo.css` instead. These files are never used in production builds
  (e.g. inside a Docker image).

- **vuedo:** `createVuedo()` now exposes a `previewHtml(template, data, options?)`
  method that returns a live-preview HTML page with an interactive paper-size
  selector (default A4). Unlike `renderComposite`, assets are NOT inlined
  (fonts/images are served via Vite's dev server). The compiled Tailwind CSS is
  compiled server-side via `ssrLoadModule` with `?inline` and injected as a
  `<style>` tag so it contains the actual utility classes, not the `@import`
  source. Accepts `paperSize`, `css` (pre-compiled CSS string), and `vitePort`
  options; when `vitePort` is set, the page includes a WebSocket client that
  connects to Vite's HMR WebSocket and reloads on template changes.

- **vuedo:** The `@hshm/vuedo/vite` plugin accepts a new `preview` option.
  When enabled (`vuedo({ preview: true })`), the Vite dev server registers
  `/__vuedo/hmr` (SSE endpoint) and `/__vuedo/preview/:template` (preview
  middleware). The preview middleware SSR-renders the template with layout
  discovery, wraps it in a preview page with paper-size overlay, and pipes the
  HTML through Vite's transform pipeline for HMR client injection. The file
  watcher sends `reload` events to connected SSE clients on any template
  change, so the browser auto-refreshes during development.

- **vuedo:** New `@hshm/vuedo/preview` sub-module exports `buildPreviewHtml()`
  for building the preview HTML frame, `PAPER_SIZES` (A4, A3, Letter, Legal,
  A5) and the `PaperSize` type. Exported from the main `@hshm/vuedo` entry.

- **vuedo:** `GeneratePdfOptions` now supports `extraMarginTop` and
  `extraMarginBottom` fields that add to the resolved margin (user-provided
  or measured), both defaulting to 0.

- **server:** The example consumer (`GET /invoice/preview` and
  `GET /pos-order/preview`) now serves live previews with paper-size selection
  via `?paperSize=letter` and hot-reload driven by Vite's HMR WebSocket.

- **vuedo:** CSS is now compiled via `@tailwindcss/vite` Vite plugin instead of a
  custom `@tailwindcss/node` pipeline. The plugin integrates with the host's
  Vite dev server for live CSS and compiles CSS during `vite build`, saving the
  result to `<outDir>/vuedo.css`. Removes `tailwindcss`, `@tailwindcss/node`,
  and `@tailwindcss/oxide` dependencies — replaced by `@tailwindcss/vite`.

### Changed

- **vuedo:** The `tailwind` option on `createVuedo` is removed. Use `css` (path
  to the pre-compiled `dist/vuedo.css` for production, or a raw CSS string) and
  `cssEntry` (path to the Tailwind entry, e.g. `assets/app.css`, for
  dev-mode Vite compilation). The `@hshm/vuedo/vite` plugin accepts a new
  `cssEntry` option for configuring the Tailwind entry.

- **vuedo:** Consumers must add `@tailwindcss/vite` to their Vite config
  alongside the `@hshm/vuedo/vite` plugin. The library no longer owns Tailwind
  compilation — the Vite plugin handles it, which enables importing UI libraries
  with their own Tailwind styles.

### Added

- **repo:** Migrated to Turborepo for task orchestration — `turbo.json` defines the
  pipeline (`build` → `^build`, `dev`, `test`, `typecheck`, etc.) with local
  caching of `dist/**` outputs. Root scripts now delegate to `turbo` instead of
  raw `pnpm --filter`; `pnpm dev` / `pnpm build` / `pnpm start` / `pnpm test`
  work as before with automatic dependency resolution and caching.

### Changed

- **repo:** Moved the example consumer from the root into
  `examples/vue/`, published as `@vuedo/example-vue`. Root is now the
  workspace root only; run `pnpm dev` / `pnpm build` / `pnpm start` from
  the root as before (delegated via `--filter`).

### Fixed

- **vuedo:** Header top padding and footer bottom padding were being stripped
  (content sat flush to the page edges). `wrapHeader`/`wrapFooter` zeroed
  `padding-top`/`padding-bottom` with `!important` on the `header`/`footer`
  tags, which overrode the template's own padding (e.g. `py-8`, `pb-8`). Chromium's
  default header/footer padding lives on its own generated wrapper, not the
  user's `<header>` element, so the override was removed and templates now
  control their own edge spacing.

### Added

- **vuedo:** Header/footer height measurement now respects `createVuedo({ cache })` —
  when a cache backend is configured, `resolveMargins` stores measured heights
  keyed by `viewportWidthPx:sha256(html)`, avoiding redundant Chromium renders
  on repeated calls with the same template content.
- **vuedo:** Abstract `Cache` class with three implementations — `NoopCache`
  (default, no-op), `InMemoryCache` (in-process `Map` with TTL), and `RedisCache`
  (any Redis client implementing `get`/`set`/`del`). Each entry accepts a
  per-operation TTL (default 1 hour). The cache backend is injected via
  `createVuedo({ cache: new InMemoryCache() })`.
- **vuedo:** The inferred `VuedoProps` types file is now generated in dev
  mode by the `@hshm/vuedo/vite` plugin's `configureServer` hook (on dev start)
  and kept in sync via a file watcher as templates are edited — so consumers get
  full type inference with no import errors without running `vite build` or
  `vuedo types`. The output path defaults to `<cwd>/src/generated/vuedo.d.ts`
  and is overridable via the plugin's `typesOut` option. Consumers that run no
  `vite dev` server at all fall back to vuedo's tier-3 owned Vite, where
  `createVuedo` emits the types once at dev startup instead.

- **server:** `pnpm dev` now runs `vite dev` (`:5173`) and the Elysia server
  (`:8080`) concurrently, so the vuedo plugin shares the host's Vite instance
  (tier 2) for template hot-compile and type generation.

- **vuedo:** The generated types file was renamed from `src/generated/pdf-templates.d.ts`
  to `src/generated/vuedo.d.ts`. Update your consumer's import to
  `import type { VuedoProps } from "./generated/vuedo";`.

- **vuedo:** Tailwind v4 is now compiled by the package itself. Pass
  `tailwind: "<path-to-app.css>"` to `createVuedo` and the library scans only the
  PDF templates + assets (not the whole consumer service) and inlines the result
  into every rendered section — no standalone Tailwind build step needed. The
  consumer tunes scan scope via `@source` in their own entry CSS.

### Changed

- **vuedo:** Split HTML wrapping into per-section `wrapBody`, `wrapHeader`, and
  `wrapFooter` functions. Header/footer get `!important` resets and a negative
  margin pull into their reserved Gotenberg band; the deprecated `wrapHtml`
  alias has been removed — use `wrapBody` instead.

- **vuedo:** Header/footer template files now carry their own edge padding
  (header `pt-8`, footer `pb-8` for the invoice; `pt-2`/`pb-2` for the pos
  receipt) so the three sections align with balanced inset spacing instead of
  hugging the page edge. The package no longer injects section padding itself.

### Added

- **vuedo:** `ChromiumDriver` can now connect to a **remote** Chromium by passing
  `browserWSEndpoint` (e.g. `ws://host:3000`) or `browserURL` (e.g.
  `http://host:9222`) — for browserless.io or a `browserless/chromium` Docker
  container. When set, it `puppeteer.connect()`s instead of launching locally and
  detaches (without closing) the browser on `close()`.
- **vuedo:** Pluggable PDF render drivers behind an abstract `PdfDriver` interface.
  Built-in `GotenbergDriver` (remote Chromium service) and `ChromiumDriver`
  (local Puppeteer) — implement `PdfDriver` to add new backends (e.g. a cloud
  render API) without touching core.
- **vuedo:** `createVuedo` now requires an explicit `driver` (or legacy
  `gotenbergUrl` shorthand); it no longer silently assumes Gotenberg. Exports
  `PdfDriver`, `GotenbergDriver`, and `ChromiumDriver`.

### Changed

- **vuedo:** `ChromiumDriver` is now the recommended default backend (local
  Puppeteer, no separate service); `GotenbergDriver` remains available for those
  running a Gotenberg instance. `puppeteer` is an optional peer dependency,
  imported lazily so Gotenberg-only consumers need not install it.

- **vuedo:** Both drivers now enable **background graphics** (CSS backgrounds,
  images) by default and default the **paper size to A4** (`paperWidth` 8.27 ×
  `paperHeight` 11.69 inches for Gotenberg; `format: "A4"` for Chromium). Each
  can be overridden per render via the new `paperWidth`/`paperHeight`/
  `paperSize`/`backgroundGraphics` fields on `DriverRenderInput`.

- Initial public structure: `@hshm/vuedo` library (`createPdfKit`, `renderHtml`,
  `renderComposite`, `generatePdf`) with Vue SSR → asset-inlined HTML → Gotenberg
  pipeline.
- `@hshm/vuedo/vite` Vite plugin and `vuedo` CLI for template compilation,
  manifest emission, and `VuedoProps` type generation.
- Example Elysia consumer with per-template typed routes (invoice, pos) and
  `?preview=html` support.
- File-based layout discovery (body + paired header/footer) and Tailwind/asset
  inlining (Base64) for offline rendering.

[Unreleased]: https://github.com/hshm/vuedo/commits/main
