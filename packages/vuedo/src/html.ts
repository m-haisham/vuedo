// Wraps SSR section content in a complete, self-contained HTML document.
// Assets are already Base64-inlined by Vite at build time (§3.4), so the
// produced document makes no network fetches during Gotenberg conversion.
//
// Body, header, and footer each need different wrapper tuning (per the
// pdf-test experiment): headers/footers are sent to Gotenberg as *separate*
// documents (header.html / footer.html) rendered in their own page box, while
// the body drives the main page. Headers in particular require a negative
// margin pull and `!important` overrides to defeat Chromium's default header
// box sizing — see `wrapHeader` for details.

/** Body: the main page document. */
export function wrapBody(content: string, css = ""): string {
  const style = css ? `<style>${css}</style>` : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${style}</head><body>${content}</body></html>`;
}

/**
 * Header: wrapped as its own standalone Gotenberg header document.
 *
 * Gotenberg renders the header HTML in a narrow page-box above the body and
 * applies its own default margins (the body's `marginTop` is reserved for it).
 * The pdf-test experiment showed two tuning needs:
 *
 *  1. A negative margin is required to pull header content up flush against
 *     the top of the reserved header band, since Chromium otherwise leaves a
 *     gap between the header box and the page content.
 *  2. `!important` overrides are needed to neutralize inherited/reset styles
 *     (e.g. a `<p>` default margin, box-sizing) that would otherwise push the
 *     header out of the visible band.
 *
 * The values below are conservative starting points; revisit after measuring
 * against a real Gotenberg run (see .context/todos.md).
 */
export function wrapHeader(content: string, css = ""): string {
  const reset = `
    <style>
      * { box-sizing: border-box !important; }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
      }
      body {
        margin-top: -8mm !important; /* pull flush into the reserved header band */
      }
      p, h1, h2, h3, h4, h5, h6 { margin: 0 !important; }
    </style>`;
  const style = css ? `<style>${css}</style>` : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${reset}${style}</head><body>${content}</body></html>`;
}

/**
 * Footer: wrapped as its own standalone Gotenberg footer document.
 *
 * Mirrors `wrapHeader`'s pull-down tuning (negative margin into the reserved
 * footer band) without the extra top-gap handling the header needs.
 */
export function wrapFooter(content: string, css = ""): string {
  const reset = `
    <style>
      * { box-sizing: border-box !important; }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
      }
      body {
        margin-top: -4mm !important; /* pull flush into the reserved footer band */
      }
      p, h1, h2, h3, h4, h5, h6 { margin: 0 !important; }
    </style>`;
  const style = css ? `<style>${css}</style>` : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${reset}${style}</head><body>${content}</body></html>`;
}

/** @deprecated use `wrapBody` (body-only) or `wrapHeader`/`wrapFooter`. */
export function wrapHtml(content: string, css = ""): string {
  return wrapBody(content, css);
}
