# Architecture & Technical Specification: `@hshm/vuedo`

## 1. Executive Summary

This document specifies `@hshm/vuedo` — a library, not a service. Consumers keep their own HTTP server (Elysia, Express, Fastify, Hono, whatever) and their own routes. The package does the nitty-gritty — Vue SSR compilation of print templates, dev-mode live compilation with no build step, Gotenberg orchestration, layout-measurement caching — behind three small exports:

- **`@hshm/vuedo`** — the core: `createVuedo()`, returns `renderHtml()` / `generatePdf()`. Framework-agnostic; the consumer calls these from inside whatever route handler they already have.
- **`@hshm/vuedo/vite`** — an optional Vite plugin. Auto-discovers template SSR entries for production builds and, if the host app already runs a Vite dev server, lets `vuedo` share it instead of spinning up a second one.
- **`vuedo build`** — a CLI, for hosts with no Vite of their own (a plain Node/Elysia backend), that runs the same compile step standalone.

Dev-mode stays live with **no `vite build` in the loop**, same guarantee as before — the difference is that the library, not a bespoke `server.ts`, now owns the decision of *how* to get a running Vite instance, and it has two ways to do that in priority order (§4.3).

## 2. System Architecture

```
┌───────────────────────────────────────────────────────────────┐
│  Consumer's own app (Elysia / Express / Fastify / anything)    │
│                                                                   │
│    app.post('/invoices/:id/pdf', async (ctx) => {                │
│      const data = await getInvoiceData(ctx.params.id);           │
│      return vuedo.generatePdf('invoice', { header: data, body: data, footer: data, options: {} });   ◄── one call  │
│    })                                                             │
└───────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │   @hshm/vuedo (library)    │
              │   createVuedo({ ... })         │
              │   • renderHtml()  — Vue → HTML  │
              │   • generatePdf() — + Gotenberg │
              └───────────────────────────────┘
                 │             │             │
                 ▼             ▼             ▼
          Vite (dev only,  Gotenberg    Redis (measurement
          see §4.3)        (PDF render)  cache) + Browserless
                                          (pre-flight measurement)
```

The library never listens on a port and never owns routing. Gotenberg, Browserless, and Redis are the same three collaborators as before — they're just reached from inside the library's `generatePdf()` instead of from a service-specific `server.ts`.

## 3. Architectural Decisions & Justifications

### 3.1 Vue SSR + Tailwind over PDFKit/Native Libraries

Unchanged from the original spec: web technologies (flexbox, grid, reactive data binding) beat hand-computed X/Y coordinates for template authoring DX.

### 3.2 Library, Not a Service

**Decision:** Ship `@hshm/vuedo` as an npm package the consumer installs into their own backend, rather than a standalone microservice they deploy and call over HTTP.

**Justification:** The previous design forced every consumer to run a second network hop (their app → the PDF service → Gotenberg) and to duplicate auth/routing concerns across two codebases. As a library, template rendering happens in-process; only the actual PDF conversion (which genuinely needs headless Chromium) leaves the process, to Gotenberg. The consumer's own router, middleware, and auth apply naturally — `vuedo` never has an opinion about how the route is protected or shaped.

### 3.3 A Real Vite Plugin, Not a Bundled-In Dev Server

**Decision:** Move Vite integration into `@hshm/vuedo/vite`, a standard Vite plugin with `configureServer` and `config` hooks, rather than having the library spin up its own Vite instance unconditionally.

**Justification:** Many consumers already run a Vite dev server for their own frontend (a Nuxt app, a separate SPA, whatever). Forcing `vuedo` to always boot a second,独立 Vite instance wastes memory and, worse, can produce two different module graphs for the same `.vue` files if the host also imports them elsewhere. A plugin lets the host's *existing* Vite server double as the compiler `vuedo` uses — `configureServer` registers that running instance so `createVuedo()` finds it instead of creating its own. Hosts with no Vite at all still get a working dev mode: the library falls back to an internally-owned instance (§4.3), so the plugin is an optimization, not a requirement — matching "can do a Vite plugin too if necessary."

### 3.4 "Embed Everything" via Vite (unchanged)

Assets stay Base64-inlined into the SSR HTML string per the original spec — deterministic, no network fetch during Gotenberg conversion.

### 3.5 Tailwind v4, Compiled by the Vite Plugin

**Decision:** Tailwind CSS is compiled via the `@tailwindcss/vite` Vite plugin,
integrated with the host's Vite config. In dev mode, the CSS is served live
through Vite with HMR. During `vite build`, the compiled CSS is saved to
`<outDir>/vuedo.css` alongside the manifest and SSR modules. At runtime,
`createVuedo({ css: "dist/vuedo.css" })` inlines the pre-compiled CSS into
every rendered section.

**Justification:** The previous design compiled Tailwind with a custom
`@tailwindcss/node` pipeline owned by the package. This prevented consumers
from importing UI libraries whose Tailwind behaviour differs from what the
package's scanner captures, and required bundling `tailwindcss`,
`@tailwindcss/node`, and `@tailwindcss/oxide` as dependencies. Using the
standard `@tailwindcss/vite` plugin gives consumers a standard Vite CSS
pipeline — they can import UI libraries, use `@source` directives, and get
behaviour identical to their own Vite-based apps. The plugin generates CSS
during `closeBundle` by spinning up a temporary middleware-mode Vite server
with `@tailwindcss/vite` and calling `ssrLoadModule` on the user's CSS entry
with `?inline`, then writing the result.

## 4. Public API & Package Layout

### 4.0 `.vuedo` Dev Folder

The `.vuedo/` directory at the consumer's project root holds auto-generated
artifacts used **only during development**. These files are gitignored and never
shipped to production (e.g. inside a Docker image). For now it contains:

- **`vuedo.css`** — the compiled Tailwind v4 CSS produced by the
  `@tailwindcss/vite` plugin during `vite dev`. The `@hshm/vuedo/vite` plugin
  watches the CSS entry (e.g. `assets/app.css`) and templates, and on each
  change re-compiles the CSS and writes it here. `createVuedo()` reads it from
  this path in dev mode.

### 4.1 Package Layout

```
@hshm/vuedo/
├── src/
│   ├── index.ts          # createVuedo() — the only required import for consumers
│   ├── renderer.ts        # dev vs. prod render strategy (mirrors the old server.ts branch, §4.3)
│   ├── dev-registry.ts     # module-level slot the Vite plugin writes into, core reads from
│   ├── discover.ts         # file-based layout discovery (body + paired header/footer)
│   ├── manifest.ts         # reads pdf-manifest.json written by the plugin/CLI at build time
│   ├── html.ts             # wrapBody / wrapHeader / wrapFooter document shells
│   ├── types.ts            # generateTypes() — emits the inferred PdfTemplateProps
│   ├── drivers/            # pluggable PDF backends (the only thing that touches Chromium)
│   │   ├── types.ts         # PdfDriver abstract class + DriverRenderInput
│   │   ├── gotenberg.ts     # GotenbergDriver — remote Chromium service
│   │   ├── chromium.ts      # ChromiumDriver — local Puppeteer
│   │   ├── measurement.ts   # ChromiumMeasurer + resolveMargins
│   │   └── index.ts         # re-exports
│   ├── cache/               # pluggable cache backends
│   ├── inline-assets.ts     # Vite plugin for Base64 asset inlining
│   ├── render-component.ts  # shared Vue SSR (createSSRApp + renderToString)
│   ├── vite-plugin.ts      # exported as '@hshm/vuedo/vite'
│   └── cli.ts              # exported as bin `vuedo`
├── package.json             # exports map below
```

```json
// package.json (exports map)
{
  "name": "@hshm/vuedo",
  "bin": { "vuedo": "./dist/cli.js" },
  "exports": {
    ".": "./dist/index.js",
    "./vite": "./dist/vite-plugin.js"
  },
  "peerDependencies": {
    "vite": "^5.0.0"
  },
  "peerDependenciesMeta": {
    "vite": { "optional": true }
  }
}
```

`vite` is an **optional peer dependency** — a consumer using only the CLI-based build (§4.4) or running entirely in production never needs it installed at all in that deploy target.

### 4.2 Core API

```ts
// @hshm/vuedo
export interface VuedoOptions {
  templatesDir: string;           // absolute path to the folder of .vue templates
  driver: PdfDriver;              // required — the PDF backend (GotenbergDriver | ChromiumDriver)
  measurer?: ChromiumMeasurer;    // optional — pre-flight DOM measurement of header/footer heights
  mode?: 'development' | 'production';   // default: derived from NODE_ENV
  manifestPath?: string;           // default: '<templatesDir>/../dist/pdf-manifest.json'
  css?: string;                    // optional — pre-compiled CSS file path (e.g. dist/vuedo.css for prod, .vuedo/vuedo.css for dev) or raw CSS string, inlined into every section
  cssEntry?: string;               // optional — path to the Tailwind v4 CSS entry (e.g. assets/app.css) for dev-mode Vite compilation
  assetsDir?: string;              // optional — folder of static assets inlined as Base64 (default: <templatesDir>/../assets)
  cache?: Cache;                   // optional — cache backend for memoizing renders, Tailwind compilation, etc.
}

// Abstract backend. Implement this to add a new render engine.
export abstract class PdfDriver {
  abstract readonly name: string;
  abstract render(input: DriverRenderInput): Promise<ReadableStream>;
  async close(): Promise<void> {}
}

export class GotenbergDriver extends PdfDriver {        // remote Chromium service
  constructor(baseUrl: string);
}
export class ChromiumDriver extends PdfDriver {         // local or remote Puppeteer
  constructor(options?: ChromiumDriverOptions);
}
// ChromiumDriverOptions:
//   browserWSEndpoint?: string;  // ws://host:3000 — connect to remote Chromium
//   browserURL?: string;         // http://host:9222 — connect via HTTP frontend
//   executablePath?: string;     // local launch only
//   launchArgs?: string[];       // local launch only
//   reuseBrowser?: boolean;      // default true
}

export interface Vuedo<
  Props extends Record<string, { body: any; options?: any }> = Record<string, { body: any }>,
> {
  /** Vue SSR → wrapped, asset-inlined HTML string (body only). */
  renderHtml<T extends keyof Props>(template: T, data: Props[T]["body"]): Promise<string>;

  /** Body + paired header/footer composed into one HTML document. */
  renderComposite<T extends keyof Props>(template: T, data: Props[T]): Promise<string>;

  /** renderComposite() + driver.render(). Returns a ReadableStream of PDF bytes. */
  generatePdf<T extends keyof Props>(template: T, data: Props[T]): Promise<ReadableStream>;

  /** Closes any internally-owned Vite instance / driver. Call on shutdown. */
  close(): Promise<void>;
}

export function createVuedo<
  Props extends Record<string, { body: any; options?: any }> = Record<string, { body: any }>,
>(options: VuedoOptions): Vuedo<Props>;
```

### 4.3 Dev-Mode Rendering — Two Tiers, Same Live Guarantee

`renderer.ts` picks a Vite instance in priority order, every time `renderHtml()`/`generatePdf()` is called in dev mode:

```ts
// src/renderer.ts
import type { ViteDevServer } from 'vite';
import { getSharedDevServer } from './dev-registry';

let ownedVite: ViteDevServer | undefined;

export async function getDevRenderer(templatesDir: string) {
  const vite =
    getSharedDevServer() ??                // 1. the host's own Vite server, via the plugin's configureServer hook
    (ownedVite ??= await (await import('vite')).createServer({
      server: { middlewareMode: true },
      appType: 'custom',
    }));                                   // 2. fallback — vuedo spins up its own, lazily, once

  return async (template: string, data: unknown) => {
    const mod = await vite.ssrLoadModule(`${templatesDir}/${template}.vue`);
    return mod.render(data);
  };
}
```

```ts
// src/dev-registry.ts — the seam the plugin and the core meet at
import type { ViteDevServer } from 'vite';

let shared: ViteDevServer | undefined;
export function registerDevServer(server: ViteDevServer) { shared = server; }
export function getSharedDevServer() { return shared; }
```

Tier 1 (shared) is what makes the plugin worth having: a host that already runs `vite dev` for a Nuxt/Vue frontend gets `vuedo` templates hot-compiling through that *same* process — one Vite instance, one module graph, zero extra memory. Tier 2 (owned) is what makes the plugin *optional*: a plain Elysia-only backend with no Vite of its own still gets live template compilation, just via a small dedicated instance `vuedo` manages itself.

```ts
// src/index.ts (excerpt)
export function createVuedo(options: VuedoOptions): Vuedo {
  const isDev = (options.mode ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development')) === 'development';

  async function getRender() {
    if (!isDev) {
      const manifest = await loadManifest(options.manifestPath);
      return async (template: string, data: unknown) => {
        const mod = await import(manifest[template]);   // pre-compiled, from §4.4
        return mod.render(data);
      };
    }
    return getDevRenderer(options.templatesDir);
  }

  return {
    async renderHtml(template, data) {
      const render = await getRender();
      return wrapBody(await render(template, data));
    },
    async generatePdf(template, data) {
      const layout = await layoutOf(template);
      const body = await this.renderHtml(template, data.body);
      const header = layout.header ? await renderOne(layout.header, data.header) : undefined;
      const footer = layout.footer ? await renderOne(layout.footer, data.footer) : undefined;
      return options.driver.render({
        body,
        header,
        footer,
        marginTop: data.options?.marginTop,
        marginBottom: data.options?.marginBottom,
      });
    },
    async close() { /* shuts down any owned Vite instance / driver */ },
  };
}
```

Production takes none of this — `getRender()` never touches Vite at all in that branch, and `vite` need not even be installed in the prod deploy target since it's an optional peer dependency (§4.1).

### 4.3.1 File-based Layouts (header/footer by convention)

A template's layout (body + optional header/footer) is inferred from filenames
in `templatesDir` — there is no per-request `header`/`footer` field:

- `X.vue` → a **body** template named `X`.
- `XHeader.vue` / `XFooter.vue` in the **same folder** → paired with `X`
  (**legacy PascalCase**). Preferred is the lowercase kebab form:
  `x-header.vue` / `x-footer.vue` pairs with `x.vue`.
- Subdirectories are allowed and matched within their own folder:
  `Pos/PosHeader.vue` pairs with `Pos/PosOrder.vue`, and the kebab
  `pos/pos-header.vue` pairs with `pos/pos-order.vue` (the aux's base is its parent
  folder, `pos`, which matches the longest body `pos.pos-order`).
- A template name is its relative path with `/` → `.` (`pos/pos-order`).
- An aux whose base matches no body is an orphan (compiled but unused).

`generatePdf(name, data)` resolves the layout and renders body + the paired
header/footer, each from its own section of `data`
(`{ header, body, footer, options }`), sending `header.html` / `footer.html` to
Gotenberg. `renderComposite(name, data)` returns the same composition as one
HTML document. `discover.ts` implements the recursive pairing.

### 4.3.2 Inferred Template Types

On every `vite build` (and via `vuedo types`) the library writes a
`PdfTemplateProps` type mapping each template name to its inferred `generatePdf`
data shape (`{ header?, body, footer?, options? }`), using
`vue-component-type-helpers`' `ComponentProps<typeof import('./X.vue').default>`.
`header`/`footer` keys are present only when the template actually has a paired
aux, so the call is type-checked against exactly the sections that exist.
Consumers pass it to the kit for type-checked calls:

```ts
const vuedo = createVuedo<PdfTemplateProps>({ templatesDir, driver: new GotenbergDriver(url) });
vuedo.generatePdf("invoice", {
  header: { id, customerName },
  body: { id, customerName },
  footer: { id, customerName },
  options: {},
}); // data type-checked against PdfTemplateProps["invoice"]
```

Accurate props require type-checking with `vue-tsc` (Volar), not plain `tsc`.

### 4.4 Building for Production — Plugin or CLI

Two paths, same output: a `pdf-manifest.json` mapping template name → compiled SSR module path, sitting next to the compiled templates. The manifest also records the resolved `layouts` (body/header/footer pairing) so the production renderer needs no filesystem walk.

**Path A — host already has a `vite.config.ts`:**

```ts
// vite.config.ts (host app)
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { vuedo } from '@hshm/vuedo/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    vue(),
    vuedo({
      templatesDir: './templates',
      cssEntry: 'assets/app.css',   // optional — Tailwind CSS entry for dev + build CSS generation
    }),
  ],
});
```

```ts
// src/vite-plugin.ts
import type { Plugin } from 'vite';
import { registerDevServer } from './dev-registry';
import { discoverTemplates, writeManifest } from './manifest';

export function vuedo(opts: { templatesDir: string; outDir?: string }): Plugin {
  return {
    name: 'origami-vuedo',
    configureServer(server) {
      registerDevServer(server);   // §4.3 tier 1 (shared)
    },
    async config(_config, { command }) {
      if (command !== 'build') return;
      const entries = await discoverTemplates(opts.templatesDir);
      return { build: { ssr: true, rollupOptions: { input: entries } } };
    },
    async closeBundle() {
      await writeManifest(opts.templatesDir, opts.outDir ?? 'dist');
    },
  };
}
```

The host's normal `vite build` now also compiles every `.vue` file under `templatesDir` as an SSR entry and drops `pdf-manifest.json` alongside the output — no hand-written `entry-server.ts`, no separate `vite build --ssr` invocation to remember.

**Path B — host has no Vite at all (plain Node/Elysia backend, no frontend build):**

```bash
npx vuedo build --templates ./templates --out ./dist
```

```ts
// src/cli.ts
import { createServer as createViteServer, build as viteBuild } from 'vite';
import { vuedo } from './vite-plugin';

export async function runBuild(templatesDir: string, outDir: string) {
  await viteBuild({
    plugins: [vuedo({ templatesDir, outDir })],
    build: { outDir },
  });
}
```

The CLI is literally the plugin driving a throwaway, internal Vite build — Path B is Path A with `vuedo` supplying the `vite.config.ts` instead of the host writing one. A host can start on Path B and switch to Path A later (e.g. once they add their own frontend) without changing a single template file.

## 5. Consumer Integration Examples

The whole point: the consumer's router is untouched by `vuedo`. Three different frameworks, same core call.

```ts
// Elysia
import { Elysia } from 'elysia';
import { createVuedo, GotenbergDriver } from '@hshm/vuedo';

const vuedo = createVuedo({
  templatesDir: new URL('./templates', import.meta.url).pathname,
  driver: new GotenbergDriver(process.env.GOTENBERG_URL!),
  css: new URL('./dist/vuedo.css', import.meta.url).pathname,
});

new Elysia()
  .post('/invoices/:id/pdf', async ({ params, set }) => {
    const data = await getInvoiceData(params.id);
    set.headers['Content-Type'] = 'application/pdf';
    set.headers['Content-Disposition'] = `attachment; filename="invoice-${params.id}.pdf"`;
    return vuedo.generatePdf('invoice', { header: data, body: data, footer: data, options: {} });
  })
  .listen(3000);
```

```ts
// Express — same createVuedo() instance, different router
app.get('/invoices/:id/pdf', async (req, res) => {
  const data = await getInvoiceData(req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  const stream = await vuedo.generatePdf('invoice', { header: data, body: data, footer: data, options: {} });
  Readable.fromWeb(stream).pipe(res);
});
```

```ts
// Hono — same again
app.get('/invoices/:id/pdf', async (c) => {
  const data = await getInvoiceData(c.req.param('id'));
  const stream = await vuedo.generatePdf('invoice', { header: data, body: data, footer: data, options: {} });
  return new Response(stream, { headers: { 'Content-Type': 'application/pdf' } });
});
```

Live template editing (§4.3) works identically under all three — it's a property of `createVuedo()`, not of the router.

## 6. Infrastructure (Docker Compose)

Only Gotenberg, Browserless, and Redis are separate containers now — `vuedo` runs inside whatever container hosts the consumer's own app, so there's no "orchestrator" image to build or version independently of the app that uses it.

```yaml
# docker-compose.yml — infra the library talks to; the app itself is the consumer's own image
services:
  gotenberg:
    image: gotenberg/gotenberg:8
    ports: ["3000:3000"]

  browserless:
    image: browserless/chrome:latest
    ports: ["3001:3000"]

  redis:
    image: redis:alpine
    ports: ["6379:6379"]
```

A consumer's own `docker-compose.dev.yml` just bind-mounts their app source as usual — `vuedo`'s dev-mode Vite fallback (§4.3, tier 2) needs no extra container or port of its own.

## 7. End-to-End Testing Strategy

Two layers, since there are now two audiences: the library itself, and each consumer's usage of it.

- **Library tests** (in `@hshm/vuedo`'s own repo): Vitest exercises `createVuedo()` directly against a fixture `templatesDir`, in both `mode: 'development'` (asserting `ssrLoadModule` is used, tier 2 fallback) and `mode: 'production'` (asserting the manifest path is read and no `vite` import occurs — this is checked by running that test in a sandbox with `vite` uninstalled, proving the optional-peer-dependency claim in §4.1 actually holds).
- **Consumer tests**: `supertest`-style requests against the consumer's own router (Elysia/Express/Hono), asserting the route returns `Content-Type: application/pdf` and that `pdf-parse` can read the resulting buffer — no different from testing any other route in their app, since `vuedo` doesn't introduce a network hop to mock.
