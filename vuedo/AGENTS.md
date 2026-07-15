# AGENTS.md

Guidance for AI agents and contributors working in this repository.

## Project Overview

**vuedo** is an enterprise PDF Generation Microservice. It transforms JSON data
into pixel-perfect PDFs by rendering Vue.js + Tailwind templates to HTML via SSR
and converting that HTML to PDF with Gotenberg (headless Chromium).

The authoritative architecture/spec is [`docs/reference.md`](docs/reference.md).
When in doubt, follow it.

## Repository Status

Implemented and tested. The architecture follows the **single `src/server.ts`**
design from the reference: one Elysia app, one entrypoint, with an `if (isDev)`
branch choosing the render strategy (Vite `ssrLoadModule` in dev, static
`dist/entry-server.js` import in prod).

## Tech Stack

- **Orchestrator:** Node.js 20+, Elysia, TypeBox validation
- **Renderer:** Vue 3 SSR via `@vue/server-renderer`
- **PDF engine:** Gotenberg (Chromium) — `GOTENBERG_URL`
- **Measurement:** Browserless (Chromium) — `BROWSERLESS_URL` (planned)
- **Cache:** Redis — `REDIS_URL` (planned)
- **Build:** Vite (dev middleware mode + prod SSR build), pnpm
- **Test:** Vitest

## Two Runtime Modes (critical)

- **Dev (`pnpm dev`):** single process. Vite runs in **middleware mode** inside
  the Elysia process; `vite.ssrLoadModule()` compiles templates on every request.
  **No `vite build` step.** Live HMR preview at `/dev/preview.html`, template
  list at `/`.
- **Prod (`pnpm build && pnpm start`):** loads pre-built `dist/entry-server.js`.
  Vite is a `devDependency` only and absent from the production image.

`src/server.ts` branches on `NODE_ENV` once at boot to pick the `render`
function; routes, validation, and the Gotenberg call are identical in both modes.

## Project Layout

```
src/
  templates/        Vue SFCs — the PDF templates (Invoice.vue, InvoiceHeader.vue, InvoiceFooter.vue)
  assets/           static assets referenced by templates
  shared-types/     types shared between Vue props and Elysia schema
  entry-server.ts   SSR render entry (renderPdfBody) — the one file Vite's --ssr build needs
  dev/              preview.html, preview-main.ts, fixtures/
  server.ts         ONE Elysia app + entrypoint; branches on NODE_ENV at boot
deploy/             production Docker files (Dockerfile, docker-compose.yml)
vite.config.ts      SSR build + Base64 asset inlining (§3.3)
```

## Commands

- `pnpm install` — install deps
- `pnpm dev` — zero-build dev server on `:8080` (+ HMR preview, `/` lists templates)
- `pnpm build` — `vite build --ssr src/entry-server.ts` → `dist/entry-server.js`
- `pnpm start` — run production server (`NODE_ENV=production`, uses `dist/`)
- `pnpm test` — Vitest (see Testing Notes)

## Header / Footer

The `POST /api/v1/generate-pdf` body accepts optional `header` and `footer`,
each shaped like `{ template: string, data: unknown }`. They are rendered
through the same `render` pipeline as the body and sent to Gotenberg as
`header.html` / `footer.html` form parts (only when present). `?preview=html`
composes them inline for dev sanity checks. Example templates:
`InvoiceHeader.vue`, `InvoiceFooter.vue`.

## Conventions

- Keep `src/shared-types/index.ts` in sync with the Elysia `t.Object` schemas in
  `src/server.ts`.
- New templates go in `src/templates/` and must be loadable via
  `vite.ssrLoadModule('/src/templates/<Name>.vue')`. Register every template in
  the `registry` in `src/entry-server.ts` so it bundles into `dist/`.
- All assets must inline as Base64 at build time (no runtime network fetches).
- Don't duplicate route/orchestration logic per mode; vary only the `render`
  function chosen by the `if (isDev)` branch in `src/server.ts`.

## Testing Notes (§7)

- E2E test (`test/pdf.e2e.test.ts`) targets the **production** renderer path:
  builds `dist/` (`vite build --ssr`) and drives `src/server.ts` with
  `NODE_ENV=production`. It posts to the endpoint and the request is rendered
  through the real Gotenberg Chromium container, then the returned PDF is parsed
  with `pdf-parse` to assert on text content and page count. Requires a running
  Gotenberg — bring it up with `docker compose -f deploy/docker-compose.yml up`
  (or set `GOTENBERG_URL`); the suite **skips automatically** when Gotenberg is
  unreachable, so `pnpm test` stays green without Docker.
- A lighter suite (`test/render.dev.test.ts`) calls the dev branch's `render`
  logic directly via `vite.ssrLoadModule` for fast template-author feedback
  without Gotenberg.
- `test/app.test.ts` covers `src/server.ts` routing, header/footer composition in
  `?preview=html`, and TypeBox validation without needing a PDF engine.
