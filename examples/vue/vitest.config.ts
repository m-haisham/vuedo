import { defineConfig } from "vitest/config";

// Scope the root suite to this package's own tests; the library has its own
// suite under packages/vue.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // The PDF E2E files each run a real `pnpm build` in beforeAll to produce
    // dist/ + the manifest. Disable file-level parallelism so those builds
    // never write to dist/ at the same time.
    fileParallelism: false,
  },
});
