export const PAPER_SIZES = {
  a4: { width: 210, height: 297, label: "A4" },
  a3: { width: 297, height: 420, label: "A3" },
  letter: { width: 216, height: 279, label: "Letter" },
  legal: { width: 216, height: 356, label: "Legal" },
  a5: { width: 148, height: 210, label: "A5" },
} as const;

export type PaperSize = keyof typeof PAPER_SIZES;

const LS = "\n";

export interface PreviewHtmlOptions {
  paperSize?: PaperSize;
  /**
   * Pre-compiled CSS string to inline as a `<style>` tag (e.g. the Tailwind
   * output from `ssrLoadModule(cssEntry + "?inline")`). Accepts a raw CSS
   * string or a `Promise<string>` for convenience.
   */
  css?: string | Promise<string>;
  /**
   * Port of the running Vite dev server. When set, the preview page includes
   * a WebSocket client that connects to Vite's HMR WebSocket and reloads the
   * page on `vuedo:reload` events. Omit when the preview is served from the
   * same origin as Vite (the Vite middleware path).
   */
  vitePort?: number;
  /**
   * URL for a "Download PDF" button in the toolbar.
   * Typically the consumer's PDF-generation endpoint so the developer can
   * download the result directly from the preview page.
   */
  downloadUrl?: string;
}

const SIZES_DATA = JSON.stringify(PAPER_SIZES);

function hmrClient(vitePort?: number): string {
  if (!vitePort) return "";
  const code = [
    "(function(){",
    '  var host = location.hostname;',
    '  var ws = new WebSocket("ws://"+host+":"+' + vitePort + ");",
    "  ws.onmessage = function(e) {",
    "    try {",
    '      var d = JSON.parse(e.data);',
    '      if (d.type === "custom" && d.event === "vuedo:reload") location.reload();',
    "    } catch(e) {}",
    "  };",
    "  ws.onclose = function() { setTimeout(function() { location.reload(); }, 3000); };",
    "})();",
  ].join(LS);
  return "<script>" + code + "\x3c/script>";
}

export async function buildPreviewHtml(
  content: string,
  options: PreviewHtmlOptions = {},
): Promise<string> {
  const paperSize = options.paperSize ?? "a4";
  const size = PAPER_SIZES[paperSize];

  // Resolve the compiled CSS string (accepts raw string or Promise).
  let cssStyle = "";
  if (options.css) {
    const cssText = await Promise.resolve(options.css);
    if (cssText) {
      cssStyle = "<style>" + cssText + "</style>";
    }
  }

  const optionsHtml = Object.entries(PAPER_SIZES)
    .map(
      ([k, v]) =>
        '<option value="' +
        k +
        '"' +
        (k === paperSize ? " selected" : "") +
        ">" +
        v.label +
        "</option>",
    )
    .join(LS);

  const script = [
    "(function(){",
    '  var page = document.getElementById("vuedo-page");',
    '  var sel = document.getElementById("vuedo-paper");',
    '  var dim = document.getElementById("vuedo-dim");',
    "  var sizes = " + SIZES_DATA + ";",
    "  var PX_PER_MM = 3.7795;",
    "",
    "  function update() {",
    "    var s = sizes[sel.value];",
    "    var vw = window.innerWidth;",
    "    var maxW = Math.min(vw - 64, 1200);",
    "    var scale = Math.min(maxW / (s.width * PX_PER_MM), 1.2);",
    '    page.style.width = Math.round(s.width * PX_PER_MM * scale) + "px";',
    '    dim.textContent = s.width + " \\u00d7 " + s.height + " mm";',
    "  }",
    "",
    "  update();",
    '  sel.addEventListener("change", update);',
    '  window.addEventListener("resize", update);',
    "})();",
  ].join(LS);

  return [
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    "<title>vuedo Preview</title>",
    cssStyle,
    "<style>",
    "  body { background: #e5e7eb; margin: 0; display: flex; flex-direction: column; align-items: center; padding: 72px 16px 48px; }",
    "  .vuedo-toolbar {",
    "    position: fixed; top: 0; left: 0; right: 0; z-index: 100;",
    "    height: 48px; background: #1f2937; color: #f9fafb;",
    "    display: flex; align-items: center; gap: 12px;",
    "    padding: 0 16px; font-size: 14px;",
    "  }",
    "  .vuedo-toolbar label { color: #9ca3af; }",
    "  .vuedo-toolbar select {",
    "    background: #374151; color: #f9fafb;",
    "    border: 1px solid #4b5563; border-radius: 4px;",
    "    padding: 4px 8px; font-size: 13px;",
    "  }",
    "  .vuedo-toolbar .vuedo-dim { color: #6b7280; font-size: 12px; }",
    "  .vuedo-toolbar .vuedo-spacer { flex: 1; }",
    "  .vuedo-toolbar .vuedo-download {",
    "    background: #059669; color: #fff;",
    "    border: none; border-radius: 4px;",
    "    padding: 5px 12px; font-size: 13px; cursor: pointer;",
    "    text-decoration: none; line-height: normal;",
    "  }",
    "  .vuedo-toolbar .vuedo-download:hover { background: #047857; }",
    "  .vuedo-page {",
    "    background: #fff; box-shadow: 0 4px 12px rgba(0,0,0,.15);",
    "    transition: width .2s; min-height: 200px;",
    "  }",
    "  .vuedo-page :is(header,.vuedo-header) { page-break-after: avoid; break-after: avoid; }",
    "  .vuedo-page :is(footer,.vuedo-footer) { page-break-before: avoid; break-before: avoid; }",
    "</style>",
    "</head>",
    "<body>",
    '<div class="vuedo-toolbar">',
    '  <label for="vuedo-paper">Paper:</label>',
    '  <select id="vuedo-paper">',
    optionsHtml,
    "  </select>",
    '  <span class="vuedo-dim" id="vuedo-dim">' +
      size.width +
      " &times; " +
      size.height +
      " mm</span>",
    '  <span class="vuedo-spacer"></span>',
    (options.downloadUrl
      ? '<a class="vuedo-download" href="' +
        options.downloadUrl +
        '">Download PDF</a>'
      : ""),
    "</div>",
    '<div class="vuedo-page" id="vuedo-page">',
    "    " + content,
    "  </div>",
    "</div>",
    "<script>" + script + "\x3c/script>",
    hmrClient(options.vitePort),
    "</body>",
    "</html>",
  ].join(LS);
}
