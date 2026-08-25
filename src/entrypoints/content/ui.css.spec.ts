import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Vitest stubs stylesheet imports, so the file is read from disk instead;
// paths resolve against the project root, which is where Vitest runs.
const stylesheet = readFileSync(resolve("src/entrypoints/content/ui.css"), "utf8");
// Comments mention `:host` too, and only the rule is under test here.
const withoutComments = stylesheet.replace(/\/\*[\s\S]*?\*\//g, "");
const hostRule = withoutComments.match(/:host\s*{([^}]*)}/)?.[1] ?? "";

/**
 * jsdom has neither a cascade nor a layout engine, so the stylesheet itself is
 * the only place this can be guarded. WXT opens the shadow root's stylesheet
 * with `:host { all: initial !important }`, which no inline style can outrank.
 * Without these declarations the host is a static inline box, the absolutely
 * positioned panels resolve against the document rather than the viewport, and
 * every panel drifts away from its anchor by the scroll offset.
 */
describe("ui.css", () => {
  it("re-declares the host as a full-viewport overlay", () => {
    expect(hostRule).toMatch(/position:\s*fixed\s*!important/);
    expect(hostRule).toMatch(/inset:\s*0\s*!important/);
  });

  it("lets clicks fall through the host to the page", () => {
    expect(hostRule).toMatch(/pointer-events:\s*none\s*!important/);
    expect(withoutComments).toMatch(/\.fk-panel\s*{[^}]*pointer-events:\s*auto/);
  });

  it("keeps the panels above the page", () => {
    expect(hostRule).toMatch(/z-index:\s*2147483646\s*!important/);
  });
});
