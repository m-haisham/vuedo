import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { inlineCssAssets, inlineCssImports } from "../src/inline-assets.js";

const dir = mkdtempSync(path.join(os.tmpdir(), "vuedo-inline-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function write(name: string, contents: string): string {
  const p = path.join(dir, name);
  writeFileSync(p, contents);
  return p;
}

describe("inlineCssAssets", () => {
  it("inlines local url() references as data URIs", async () => {
    write("pixel.png", Buffer.from([1, 2, 3, 4]));
    const css = `.x { background: url(./pixel.png); }`;
    const out = await inlineCssAssets(css, dir);
    expect(out).toContain('url("data:image/png;base64,AQIDBA==")');
  });

  it("leaves remote url() alone unless fetchRemote is set", async () => {
    const css = `.x { background: url(https://example.com/a.png); }`;
    expect(await inlineCssAssets(css, dir)).toContain("https://example.com/a.png");
  });
});

describe("inlineCssImports", () => {
  it("inlines a local @import and its nested url() fonts", async () => {
    write("MyFont.woff2", Buffer.from([0, 1, 2, 3, 4, 5]));
    write(
      "imported.css",
      `@font-face { font-family: "MyFont"; src: url(./MyFont.woff2) format("woff2"); }`,
    );
    const css = `@import "./imported.css";\nbody { font-family: "MyFont"; }`;
    const out = await inlineCssImports(css, dir);
    expect(out).not.toContain("@import");
    expect(out).toContain('url("data:font/woff2;base64,AAECAwQF")');
  });

  it("inlines a quoted-string @import form", async () => {
    write("q.css", `.a { color: red; }`);
    const css = `@import "q.css";`;
    const out = await inlineCssImports(css, dir);
    expect(out).not.toContain("@import");
    expect(out).toContain("color: red");
  });

  it("inlines a remote @import (web font) when network is reachable", async () => {
    const css = `@import url('https://fonts.googleapis.com/css2?family=Roboto&display=swap');`;
    let out = css;
    try {
      out = await inlineCssImports(css, dir);
    } catch {
      return; // skip when offline
    }
    if (out.includes("@import")) return; // skip if fetch failed silently
    expect(out).toContain("@font-face");
    expect(out).toContain("data:");
  });
});
