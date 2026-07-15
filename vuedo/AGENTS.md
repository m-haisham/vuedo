# AGENTS.md

Guidance for AI agents and contributors working in this repository.

## Project Overview

**vuedo** is an enterprise PDF Generation Microservice. It transforms JSON data
into pixel-perfect PDFs by rendering Vue.js + Tailwind templates to HTML via SSR
and converting that HTML to PDF with Gotenberg (headless Chromium).

The authoritative architecture/spec is [`docs/reference.md`](docs/reference.md).
When in doubt, follow it.

## Repository Status

This is a **bootstrap scaffold**. The directory layout, config files, Docker
files, and source module structure are in place, but **the actual rendering /
orchestration / PDF logic is NOT implemented yet** — relevant functions throw
`not implemented`. Fill those in next; do not assume they work.

## Tech Stack

- **Orchestrator:** Node.js 20+, Elysia (`@elysiajs/node`), TypeBox validation
- **Renderer:** Vue 3 SSR via `@vue/server-renderer`
- **PDF engine:** Gotenberg (Chromium) — `GOTENBERG_URL`
- **Measurement:** Browserless (Chromium) — `BROWSERLESS_URL` (planned)
- **Cache:** Redis — `REDIS_URL` (planned)
- **Build:** Vite (dev middleware mode + prod SSR/client build), pnpm
- **Test:** Vitest

## Two Runtime Modes (critical)

- **Dev (`pnpm dev`):** single process. Vite runs in **middleware mode** inside
  the Elysia process; `vite.ssrLoadModule()` compiles templates on every request.
  **No `vite build` step.** Live HMR preview at `/dev/preview.html`.
- **Prod (`pnpm build && pnpm start`):** loads pre-built `dist/entry-server.js`.
  Vite is a `devDependency` only and absent from the production image.

`src/server/index.ts` (`buildApp`) is mode-agnostic — it receives a `render`
function via dependency injection. Only the entrypoint differs
(`src/dev-server.ts` vs `src/server-prod.ts`).

## Project Layout

```
src/
  templates/        Vue SFCs — the PDF templates (Invoice.vue)
  assets/           static assets referenced by templates
  shared-types/     types shared between Vue props and Elysia schema
  entry-server.ts   SSR render entry (renderPdfBody)
  dev/              preview.html, preview-main.ts, fixtures/
  server/           index.ts (buildApp), render.dev.ts, render.prod.ts
  dev-server.ts     dev entrypoint (Vite middleware mode)
  server-prod.ts    prod entrypoint
vite.config.ts      SSR build + Base64 asset inlining (§3.3)
Dockerfile / Dockerfile.dev
docker-compose.yml / docker-compose.dev.yml
```

## Commands

- `pnpm install` — install deps
- `pnpm dev` — zero-build dev server on `:8080` (+ HMR preview, `/` lists templates)
- `pnpm build` — `vite build --ssr src/entry-server.ts` → `dist/entry-server.js`
- `pnpm start` — run production server (uses the built `dist/` bundle)
- `pnpm test` — Vitest (run against prod renderer path where possible, §7)

## Header / Footer

The `POST /api/v1/generate-pdf` body accepts optional `header` and `footer`,
each shaped like `{ template: string, data: unknown }`. They are rendered
through the same `render` pipeline as the body and sent to Gotenberg as
`header.html` / `footer.html` form parts (only when present). `?preview=html`
composes them inline for dev sanity checks. Example templates:
`InvoiceHeader.vue`, `InvoiceFooter.vue`.

## Conventions

- Keep `src/shared-types/index.ts` in sync with the Elysia `t.Object` schemas in
  `src/server/index.ts`.
- New templates go in `src/templates/` and must be loadable via
  `vite.ssrLoadModule('/src/templates/<Name>.vue')`. Register every template in
  the `registry` in `src/entry-server.ts` so it bundles into `dist/`.
- All assets must inline as Base64 at build time (no runtime network fetches).
- Don't add logic that diverges between dev and prod inside `buildApp`; vary only
  the injected `render` function.

## Testing Notes (§7)

- E2E tests target the **production** renderer path (`render.prod.ts` + a real
  `dist/` build produced with `vite build --ssr`). They drive the Elysia
  endpoint and parse the returned PDF with `pdf-parse` to assert on text content
  and page count. A local mock Gotenberg (tiny HTTP server) returns a valid PDF
  so the suite runs without Docker; set `GOTENBERG_URL` to a real Gotenberg to
  exercise actual Chromium. See `test/pdf.e2e.test.ts`.
- A lighter suite runs `render.dev.ts` directly via `ssrLoadModule` for fast
  template-author feedback without Gotenberg (`test/render.dev.test.ts`).
- `test/app.test.ts` covers `buildApp` routing, header/footer composition, and
  TypeBox validation without needing a PDF engine.
