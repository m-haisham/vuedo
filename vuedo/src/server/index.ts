import { Elysia, t } from "elysia";
import fs from "fs";
import path from "path";

type RenderFn = (template: string, data: unknown) => Promise<string>;

// Mode-agnostic app: receives a `render` fn via dependency injection so the
// same route/validation/orchestration logic works in dev and prod.
export function buildApp({ render }: { render: RenderFn }) {
  let compiledCss = "";
  const cssPath = path.resolve("./dist/assets/style.css");
  if (fs.existsSync(cssPath)) {
    compiledCss = fs.readFileSync(cssPath, "utf-8");
  }

  const wrapHtml = (content: string) => `
    <!DOCTYPE html>
    <html>
      <head><style>${compiledCss}</style></head>
      <body>${content}</body>
    </html>
  `;

  return new Elysia().post(
    "/api/v1/generate-pdf",
    async ({ body, query, set }) => {
      try {
        const rawVueHtml = await render(body.template, body.data);
        const bodyHtml = wrapHtml(rawVueHtml);

        // Optional header/footer, each rendered from its own template + data.
        const headerHtml = body.header
          ? wrapHtml(await render(body.header.template, body.header.data))
          : null;
        const footerHtml = body.footer
          ? wrapHtml(await render(body.footer.template, body.footer.data))
          : null;

        // Dev convenience: ?preview=html returns the composed HTML directly
        // instead of round-tripping through Gotenberg, for quick sanity checks.
        if (query.preview === "html") {
          const sections = [
            headerHtml ? `<div class="vuedo-header">${headerHtml}</div>` : "",
            `<div class="vuedo-body">${bodyHtml}</div>`,
            footerHtml ? `<div class="vuedo-footer">${footerHtml}</div>` : "",
          ].join("\n");
          const doc = `<!DOCTYPE html><html><head><style>${compiledCss}</style></head><body>${sections}</body></html>`;
          return new Response(doc, {
            headers: { "Content-Type": "text/html" },
          });
        }

        const form = new FormData();
        form.append(
          "files",
          new Blob([bodyHtml], { type: "text/html" }),
          "index.html",
        );
        if (headerHtml) {
          form.append(
            "files",
            new Blob([headerHtml], { type: "text/html" }),
            "header.html",
          );
        }
        if (footerHtml) {
          form.append(
            "files",
            new Blob([footerHtml], { type: "text/html" }),
            "footer.html",
          );
        }
        form.append("marginTop", "1");
        form.append("marginBottom", "1");

        const gotenbergRes = await fetch(
          process.env.GOTENBERG_URL + "/forms/chromium/convert/html",
          {
            method: "POST",
            body: form,
          },
        );

        if (!gotenbergRes.ok)
          throw new Error("Gotenberg failed to generate PDF");

        return new Response(gotenbergRes.body, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${body.template}.pdf"`,
          },
        });
      } catch (error) {
        console.error(error);
        set.status = 500;
        return { error: "PDF Generation Failed" };
      }
    },
    {
      body: t.Object({
        template: t.String(),
        data: t.Any(),
        header: t.Optional(
          t.Object({ template: t.String(), data: t.Any() }),
        ),
        footer: t.Optional(
          t.Object({ template: t.String(), data: t.Any() }),
        ),
      }),
      query: t.Object({
        preview: t.Optional(t.String()),
      }),
    },
  );
}
