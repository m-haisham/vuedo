import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Used by (a) the library's own owned-Vite dev instance (§4.3 tier 3) when it
// boots inside this package during tests, and (b) the CLI/plugin SSR build of
// fixture templates. The consumer app supplies its own vue() in its config.
export default defineConfig({
  plugins: [vue()],
});
