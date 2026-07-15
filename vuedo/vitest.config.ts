import { defineConfig } from "vitest/config";

// Scope the root suite to this package's own tests; the library has its own
// suite under packages/vuedo.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
