import { createElement } from "react";
import { renderToString } from "react-dom/server";

// React templates export named components: Body, Header, Footer.
// A module may export any subset — Body is required, Header/Footer optional.
// Both dev (Vite ssrLoadModule) and prod (dynamic import) paths funnel through
// here so dev and prod produce byte-identical HTML for the same input.

export type TemplateModule = {
  Body?: React.ComponentType<any>;
  Header?: React.ComponentType<any>;
  Footer?: React.ComponentType<any>;
  default?: React.ComponentType<any>;
};

export async function renderComponent(
  mod: unknown,
  data: unknown,
): Promise<string> {
  const m = mod as TemplateModule;

  // Body is the primary export (named Body, or default as fallback)
  const Component = m.Body ?? m.default;
  if (!Component) {
    throw new Error(
      "React template must export a Body component (named export) or a default export.",
    );
  }

  return renderToString(createElement(Component, (data ?? {}) as Record<string, unknown>));
}

export async function renderNamedComponent(
  mod: unknown,
  exportName: string,
  data: unknown,
): Promise<string> {
  const m = mod as TemplateModule;
  const Component = m[exportName as keyof TemplateModule] as
    | React.ComponentType<any>
    | undefined;
  if (!Component) return "";
  return renderToString(createElement(Component, (data ?? {}) as Record<string, unknown>));
}
