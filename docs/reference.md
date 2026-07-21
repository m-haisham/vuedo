# Architecture & Technical Specification: `@pandaf/core` + `@pandaf/vue`

## 1. Executive Summary

This document specifies the `@pandaf` packages — a set of libraries, not a service. Consumers keep their own HTTP server (Elysia, Express, Fastify, Hono, whatever) and their own routes. The packages handle the nitty-gritty — framework-level SSR compilation of print templates, dev-mode live compilation via the consumer's Vite dev server, Gotenberg orchestration, layout-measurement caching — behind three exports:

- **`@pandaf/core`** — framework-agnostic primitives: PDF drivers (Gotenberg, Chromium), HTML document-shell wrappers, asset-inlining utilities, live-preview page builder, pluggable cache backends, and measurement with caching. Designed to be reused by framework adapters.
- **`@pandaf/vue`** — the Vue adapter built on `@pandaf/core`: `createPandaf()`, returns `renderHtml()` / `generatePdf()`. Re-exports everything from `@pandaf/core` for convenience.
- **`@pandaf/vue/vite`** — a Vite plugin. Handles SSR build configuration (auto-discovers template entries), dev-mode preview middleware, type generation, and `closeBundle` manifest emission.

There is no CLI. The Vite plugin is the sole build path — every consumer runs `vite build` (their own, with the plugin in their config). Dev mode follows the standard Vite SSR pattern: `devServer` is optional — when omitted, the library lazy-creates a Vite server from the consumer's `vite.config.ts` and closes it on `pandaf.close()`.

## 2. System Architecture

```
┌───────────────────────────────────────────────────────────────┐
│  Consumer's own app (Elysia / Express / Fastify / anything)    │
│                                                                   │
│    app.post('/invoices/:id/pdf', async (ctx) => {                │
│      const data = await getInvoiceData(ctx.params.id);           │
│      return pandaf.generatePdf('invoice', { header: data,        │
│        body: data, footer: data, options: {} });   ◄── one call  │
│    })                                                             │
└───────────────────────────────────────────────────────────────┘
                               │
                               ▼
               ┌───────────────────────────────┐
               │   @pandaf/vue (library)    │
               │   createPandaf({ ... })         │
               │   • renderHtml()  — Vue → HTML  │
               │   • generatePdf() — + Gotenberg │
               └───────────────────────────────┘
                  │             │             │
                  ▼             ▼             ▼
       Vite dev server     Gotenberg    Redis (measurement
       (consumer-owned,  (PDF render)  cache) + Browserless
       passed in dev mode)              (pre-flight measurement)
```

The library never listens on a port and never owns routing. The consumer is responsible for creating the Vite dev server (in dev mode) and passing it to `createPandaf()`. In production, Vite is not involved at all — the library reads a manifest and imports pre-compiled SSR modules.

## 3. Architectural Decisions & Justifications

### 3.1 Vue SSR + Tailwind over PDFKit/Native Libraries

Unchanged from the original spec: web technologies (flexbox, grid, reactive data binding) beat hand-computed X/Y coordinates for template authoring DX.

### 3.2 Library, Not a Service

**Decision:** Ship `@pandaf/vue` as an npm package the consumer installs into their own backend, rather than a standalone microservice they deploy and call over HTTP.

**Justification:** The previous design forced every consumer to run a second network hop (their app → the PDF service → Gotenberg) and to duplicate auth/routing concerns across two codebases. As a library, template rendering happens in-process; only the actual PDF conversion (which genuinely needs headless Chromium) leaves the process, to Gotenberg. The consumer's own router, middleware, and auth apply naturally — `pandaf` never has an opinion about how the route is protected or shaped.

### 3.3 Standard Vite SSR Pattern

**Decision:** Follow the standard Vite SSR pattern: the consumer creates a Vite dev server in middleware mode and passes it to `createPandaf()`. In dev mode the library calls `vite.ssrLoadModule()` for live template compilation with HMR. In production, pre-compiled SSR modules are imported directly — no Vite at all.

**Justification:** This is the canonical Vite SSR approach (see [Vite SSR guide](https://vite.dev/guide/ssr)). The consumer controls the Vite config via `vite.config.ts` — the library picks it up automatically in dev mode. `devServer` remains an optional escape hatch for advanced use (testing, custom lifecycle). For the common case, `createPandaf()` requires no Vite wiring at all.

### 3.4 "Embed Everything" via Vite (unchanged)

Assets stay Base64-inlined into the SSR HTML string per the original spec — deterministic, no network fetch during Gotenberg conversion.

### 3.5 Tailwind v4 via `@tailwindcss/vite`

**Decision:** Tailwind CSS is compiled via the `@tailwindcss/vite` Vite plugin, included in the consumer's Vite config. During `vite dev`, the `@pandaf/vue/vite` plugin's `configureServer` watch compiles CSS on file changes and writes it to `.pandaf/pandaf.css`. During `vite build`, the `closeBundle` hook compiles the final CSS to `<outDir>/pandaf.css`. At runtime, `createPandaf()` reads the pre-compiled CSS and inlines it into every rendered section.

**Justification:** Using the standard `@tailwindcss/vite` plugin gives consumers a standard Vite CSS pipeline — they can import UI libraries, use `@source` directives, and get behaviour identical to their own Vite-based apps.

## 4. Public API & Package Layout

### 4.0 `.pandaf` Dev Folder

The `.pandaf/` directory at the consumer's project root holds auto-generated artifacts used **only during development**. These files are gitignored and never shipped to production.

- **`pandaf.css`** — the compiled Tailwind v4 CSS, written by the `@pandaf/vue/vite` plugin's `configureServer` watch. `createPandaf()` reads it from this path in dev mode.

### 4.1 Package Layout

```
@pandaf/core/                          @pandaf/vue/
├── src/                              ├── src/
│   ├── index.ts      # re-exports    │   ├── index.ts      # createPandaf()
│   ├── cache/        # Cache etc.    │   ├── renderer.ts    # dev vs. prod
│   ├── drivers/      # PdfDriver etc.│   ├── discover.ts    # .vue discovery
│   │   ├── types.ts                  │   ├── manifest.ts    # manifest I/O
│   │   ├── gotenberg.ts              │   ├── render-component.ts
│   │   ├── chromium.ts               │   ├── types.ts       # type generation
│   │   └── measurement.ts            │   └── vite-plugin.ts # @pandaf/vue/vite
│   ├── html.ts                       ├── package.json
│   ├── inline-assets.ts              └── tsconfig.json
│   └── preview.ts
├── package.json
└── tsconfig.json
```

```json
// @pandaf/core — framework-agnostic primitives (no exports map needed for inner dep)
{
  "name": "@pandaf/core"
}

// @pandaf/vue — the Vue adapter, re-exports core + adds createPandaf()
{
  "name": "@pandaf/vue",
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

`vite` is an **optional peer dependency** — a consumer running entirely in production never needs it installed.

### 4.2 Core API

```ts
// @pandaf/vue — the main consumer-facing import
// (re-exports everything from @pandaf/core + adds createPandaf)
export interface PandafOptions {
  templatesDir?: string;         // absolute path to the folder of .vue templates
  driver?: PdfDriver;            // required — the PDF backend
  measurer?: ChromiumMeasurer;   // optional — pre-flight DOM measurement
  mode?: 'development' | 'production';  // default: derived from NODE_ENV
  manifestPath?: string;         // default: '<templatesDir>/../dist/pdf-manifest.json'
  css?: string;                  // optional — pre-compiled CSS file path or raw string
  devServer?: ViteDevServer;     // optional — consumer's Vite server. When omitted in dev
                                 // mode, the library lazy-creates one from vite.config.ts
                                 // and closes it on pandaf.close(). Pass your own to control
                                 // the lifecycle.
  assetsDir?: string;            // optional — folder of static assets
  cache?: Cache;                 // optional — cache backend
}

export interface Pandaf<Props> {
  renderHtml<T>(template: T, data: Props[T]['body']): Promise<string>;
  renderComposite<T>(template: T, data: Props[T]): Promise<string>;
  generatePdf<T>(template: T, data: Props[T]): Promise<ReadableStream>;
  previewHtml<T>(template: T, data: Props[T], options?: PreviewHtmlOptions): Promise<string>;
  close(): Promise<void>;
}

export function createPandaf<Props>(options: PandafOptions): Pandaf<Props>;
```

### 4.3 Dev-Mode Rendering

The consumer can either:
1. Pass their own Vite dev server (`devServer`) — for full lifecycle control,
   or
2. Let the library create one lazily from `vite.config.ts` — for zero-config DX.

When `devServer` is not provided, the library calls `createServer()` (which
auto-discovers `vite.config.ts`), uses it for `ssrLoadModule`, and closes it
on `pandaf.close()`. When `devServer` is provided, the consumer owns the
lifecycle — `pandaf.close()` will NOT close it.

```ts
// src/renderer.ts — dev renderer
export function createDevRenderer(
  templatesDir: string,
  devServer?: ViteDevServer,   // optional — lazy-created from vite.config.ts
  cssOutput?: string,
): PandafRenderer {
  let ownedServer: ViteDevServer | undefined;
  let discovery: Discovery | undefined;

  async function getServer() {
    if (devServer) return devServer;
    if (!ownedServer) {
      const { createServer } = await import("vite");
      ownedServer = await createServer({
        server: { middlewareMode: true },
        appType: "custom",
      });
    }
    return ownedServer;
  }

  async function ensure() {
    if (!discovery) discovery = await discoverLayouts(templatesDir);
    const server = await getServer();
    function urlFor(name: string): string {
      return "/" + path.relative(server.config.root, file).split(path.sep).join("/");
    }
    return {
      async render(name, data) {
        const mod = await server.ssrLoadModule(urlFor(name));
        return renderComponent(mod, data);
      },
    };
  }

  // close() shuts down ownedServer (if any) but NOT a consumer-provided devServer
  async close() {
    discovery = undefined;
    if (ownedServer) { await ownedServer.close(); ownedServer = undefined; }
  }
}

  async function resolveCss(): Promise<string> {
    if (cssOutput) {
      try { return await fs.readFile(cssOutput, 'utf-8'); } catch {}
    }
    return '';
  }

  // ...
}
```

Production takes none of this — `createProdRenderer` reads the manifest and imports pre-compiled SSR modules without touching Vite.

### 4.3.1 File-based Layouts (header/footer by convention)

A template's layout (body + optional header/footer) is inferred from filenames in `templatesDir`:

- `X.vue` → a **body** template named `X`.
- `x-header.vue` / `x-footer.vue` → paired header/footer (preferred lowercase kebab).
- `XHeader.vue` / `XFooter.vue` → paired header/footer (legacy PascalCase).
- Subdirectories are allowed: `pos/pos-header.vue` pairs with `pos/pos-order.vue`.
- A template name is its relative path with `/` → `.` (`pos/pos-order`).
- **views/ convention**: when a `views/` subdirectory exists inside
  `templatesDir`, discovery scans only that directory for templates. Reusable
  components belong in `templates/components/` — they are imported by views and
  are not discovered as template entries. Template names stay clean:
  `views/invoice.vue` becomes `invoice`, not `views.invoice`.

### 4.3.2 Inferred Template Types

On every `vite build`, the plugin writes a `PandafProps` type mapping each template name to its inferred `generatePdf` data shape. Consumers pass it to `createPandaf` for type-checked calls:

```ts
const pandaf = createPandaf<PandafProps>({ templatesDir, driver, devServer });
pandaf.generatePdf("invoice", { header, body, footer, options }); // fully type-checked
```

### 4.4 Building for Production

The consumer adds the pandaf plugin to their `vite.config.ts`:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { pandaf } from '@pandaf/vue/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    vue(),
    pandaf({ templatesDir: './templates', cssEntry: 'assets/app.css' }),
  ],
});
```

```ts
// src/vite-plugin.ts
export function pandaf(opts: PandafPluginOptions): Plugin {
  return {
    name: 'pandaf',
    configureServer(server) {
      // Watch templates → regenerate types + compile CSS.
      // Serve preview middleware at /__pandaf/preview/:template.
    },
    async config(_userConfig, { command }) {
      if (command !== 'build') return;
      const disc = await discoverLayouts(opts.templatesDir);
      return {
        plugins: [inlineAssetsPlugin()],
        build: { ssr: true, rollupOptions: { input: disc.entries } },
      };
    },
    async closeBundle() {
      await writeManifest(opts.templatesDir, outDir);
      await generateTypes(opts.templatesDir, typesOut);
      if (cssEntry) await compileAndSaveCss(cssEntry, outDir);
    },
  };
}
```

`vite build` compiles every template as an SSR entry and drops `pdf-manifest.json` + `pandaf.css` alongside the output.

## 5. Consumer Integration Example

```ts
// Elysia — devServer is optional; library auto-creates from vite.config.ts
import { createPandaf, GotenbergDriver } from '@pandaf/vue';

const isDev = process.env.NODE_ENV !== 'production';

const pandaf = createPandaf({
  templatesDir: new URL('./templates', import.meta.url).pathname,
  driver: new GotenbergDriver(process.env.GOTENBERG_URL!),
  mode: isDev ? 'development' : 'production',
  manifestPath: new URL('./dist/pdf-manifest.json', import.meta.url).pathname,
  css: isDev ? undefined : new URL('./dist/pandaf.css', import.meta.url).pathname,
});

const app = new Elysia({ adapter: node() });

app
  .post('/invoices/:id/pdf', async ({ params, set }) => {
    const data = await getInvoiceData(params.id);
    set.headers['Content-Type'] = 'application/pdf';
    return pandaf.generatePdf('invoice', { header: data, body: data, footer: data, options: {} });
  })
  .listen(3000);
```

Live template editing works through the Vite dev server's HMR — edit a `.vue` template and the next `generatePdf()` call picks it up instantly via `vite.ssrLoadModule()`.

## 6. Infrastructure (Docker Compose)

Only Gotenberg, Browserless, and Redis are separate containers — `pandaf` runs inside whatever container hosts the consumer's own app.

```yaml
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

## 7. End-to-End Testing Strategy

Two layers:

- **Core library tests** (in `@pandaf/core`'s repo): Vitest exercises cache backends, driver abstractions, ChromiumDriver with mocked Puppeteer, and measurement/caching primitives.
- **Vue adapter tests** (in `@pandaf/vue`'s repo): Vitest exercises `createPandaf()` directly against fixture templates, in `mode: 'development'` (creating an explicit Vite server and asserting `ssrLoadModule` is used) and `mode: 'production'` (asserting the manifest path is read with no Vite involved).
- **Consumer tests**: `supertest`-style requests against the consumer's own router, asserting the route returns `Content-Type: application/pdf` and that `pdf-parse` can read the resulting buffer.
- **Consumer tests**: `supertest`-style requests against the consumer's own router, asserting the route returns `Content-Type: application/pdf` and that `pdf-parse` can read the resulting buffer.
