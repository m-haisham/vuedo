// Wraps SSR body content in a complete, self-contained HTML document. Assets
// are already Base64-inlined by Vite at build time (§3.4), so the produced
// document makes no network fetches during Gotenberg conversion.
export function wrapHtml(content: string, css = ""): string {
  const style = css ? `<style>${css}</style>` : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${style}</head><body>${content}</body></html>`;
}
