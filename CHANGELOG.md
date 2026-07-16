# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **vuedo:** Tailwind v4 is now compiled by the package itself. Pass
  `tailwind: "<path-to-app.css>"` to `createVuedo` and the library scans only the
  PDF templates + assets (not the whole consumer service) and inlines the result
  into every rendered section — no standalone Tailwind build step needed. The
  consumer tunes scan scope via `@source` in their own entry CSS.

### Changed

- **vuedo:** Split HTML wrapping into per-section `wrapBody`, `wrapHeader`, and
  `wrapFooter` functions. Header/footer get `!important` resets and a negative
  margin pull into their reserved Gotenberg band; `wrapHtml` is now a deprecated
  alias for `wrapBody`.

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
