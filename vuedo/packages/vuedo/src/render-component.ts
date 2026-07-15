import { createSSRApp } from "vue";
import { renderToString } from "@vue/server-renderer";

// A template's compiled SSR module (dev via ssrLoadModule, prod via import())
// exposes the Vue component as its default export. Both render paths funnel
// through here so dev and prod produce byte-identical HTML for the same input.
export async function renderComponent(
  mod: unknown,
  data: unknown,
): Promise<string> {
  const component =
    (mod as { default?: unknown })?.default ?? (mod as unknown);
  const app = createSSRApp(
    component as Parameters<typeof createSSRApp>[0],
    (data ?? {}) as Record<string, unknown>,
  );
  return renderToString(app);
}
