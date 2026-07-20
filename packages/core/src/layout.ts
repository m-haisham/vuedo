// ---------------------------------------------------------------------------
// Shared layout types used by framework adapters
// ---------------------------------------------------------------------------

export type TemplateKind = "body" | "header" | "footer";

export interface DiscoveredLayout {
  body: string;
  header?: string;
  footer?: string;
}

export interface Discovery {
  /** dottedName -> absolute file path (every file, used as Vite SSR input) */
  entries: Record<string, string>;
  /** body dottedName -> its paired layout */
  layouts: Record<string, DiscoveredLayout>;
}

export interface PdfManifest {
  entries: Record<string, string>;
  layouts: Discovery["layouts"];
}
