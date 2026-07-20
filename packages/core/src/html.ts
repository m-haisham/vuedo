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
 * applies Chromium's default header styling. Chromium's own header/footer
 * template reserves a `padding-top: 15pt` on the `#header` box and a
 * `padding-bottom: 15pt` on `#footer` (see the linked `print_header_footer_
 * template_page.html`). That default padding pushes the user's header content
 * down from the top of the reserved band (and footer content up from the
 * bottom). We neutralize it with `padding-top: 0` on the header so content
 * sits flush against the top, and likewise `padding-bottom: 0` on the footer.
 *
 * The base reset below additionally:
 *  - Forces `box-sizing: border-box` + zeroed margin/padding on every element
 *    so Tailwind's layout utilities (padding, borders, width) compute against
 *    the full header box instead of the UA default content box.
 *  - Pins a 16px base font-size so Tailwind `rem` units resolve to the expected
 *    pixel values (Gotenberg/Chromium may otherwise report a different root
 *    font-size, corrupting spacing/scale).
 *  - Sets `-webkit-print-color-adjust/print-color-adjust: exact` so Tailwind
 *    background/border colors survive headless-Chromium's print color stripping.
 *  - Forces `header { width: 100% }` so the top-level container spans the full
 *    page width rather than shrinking to its content.
 */
export function wrapHeader(content: string, css = ""): string {
  const reset = `
    <style>
      * {
        box-sizing: border-box !important;
        font-size: 16px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      header {
        width: 100% !important;
      }
      #header {
        padding-top: 0 !important;
      }
    </style>`;
  const style = css ? `<style>${css}</style>` : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${reset}${style}</head><body>${content}</body></html>`;
}

/**
 * Footer: wrapped as its own standalone Gotenberg footer document.
 *
 * Mirrors `wrapHeader`'s tuning: neutralizes Chromium's default
 * `padding-bottom: 15pt` on the footer box so user content sits flush against
 * the bottom of the reserved footer band, plus the same base reset (predictable
 * box model + 16px root font-size for correct `rem` resolution, and
 * print-color-adjust to keep background/border colors from being stripped by
 * headless Chromium). `footer { width: 100% }` ensures the container spans the
 * full page width.
 */
export function wrapFooter(content: string, css = ""): string {
  const reset = `
    <style>
      * {
        box-sizing: border-box !important;
        font-size: 16px !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      footer {
        width: 100% !important;
      }
      #footer {
        padding-bottom: 0 !important;
      }
    </style>`;
  const style = css ? `<style>${css}</style>` : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${reset}${style}</head><body>${content}</body></html>`;
}
