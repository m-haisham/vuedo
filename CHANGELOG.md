# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

- **vuedo:** Abstract `Cache` class with three implementations — `NoopCache`
  (default, no-op), `InMemoryCache` (in-process `Map` with TTL), and `RedisCache`
  (any Redis client implementing `get`/`set`/`del`). Each entry accepts a
  per-operation TTL (default 1 hour). The cache backend is injected via
  `createVuedo({ cache: new InMemoryCache() })`.
- **vuedo:** The inferred `PdfTemplateProps` types file is now generated in dev
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
  `import type { PdfTemplateProps } from "./generated/vuedo";`.

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
  manifest emission, and `PdfTemplateProps` type generation.
- Example Elysia consumer with per-template typed routes (invoice, pos) and
  `?preview=html` support.
- File-based layout discovery (body + paired header/footer) and Tailwind/asset
  inlining (Base64) for offline rendering.

[Unreleased]: https://github.com/hshm/vuedo/commits/main
