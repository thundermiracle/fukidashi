import { beforeEach, describe, expect, it } from "vitest";
import { createAnchor } from "./createAnchor";
import { resolveAnchor } from "./resolveAnchor";
import { buildTextIndex } from "./textIndex";

beforeEach(() => {
  document.body.innerHTML = "";
});

function selectOffsets(start: number, end: number) {
  const index = buildTextIndex(document.body);
  const range = document.createRange();
  const from = index.chunks.find((chunk) => start >= chunk.start && start < chunk.end);
  const to = index.chunks.find((chunk) => end > chunk.start && end <= chunk.end);
  if (!from || !to) throw new Error("offsets outside the document");
  range.setStart(from.node, start - from.start);
  range.setEnd(to.node, end - to.start);
  return { index, range };
}

describe("createAnchor", () => {
  it("stores the quote with its surrounding context", () => {
    document.body.innerHTML = "<p>The quick brown fox jumps over the lazy dog.</p>";
    const { index, range } = selectOffsets(10, 19);

    expect(createAnchor(index, range)).toEqual({
      exact: "brown fox",
      prefix: "The quick ",
      suffix: " jumps over the lazy dog.",
      start: 10,
    });
  });

  it("ignores a selection that is only whitespace", () => {
    document.body.innerHTML = "<p>a   b</p>";
    const { index, range } = selectOffsets(1, 4);

    expect(createAnchor(index, range)).toBeNull();
  });

  it("produces an anchor that resolves back to the same text", () => {
    document.body.innerHTML = "<p>Notes on <b>anchoring</b> text in a page.</p>";
    const { index, range } = selectOffsets(9, 18);
    const anchor = createAnchor(index, range);
    if (!anchor) throw new Error("expected an anchor");

    document.body.innerHTML = `<h1>New heading</h1>${document.body.innerHTML}`;
    const reloaded = buildTextIndex(document.body);
    const resolved = resolveAnchor(reloaded.text, anchor);
    if (!resolved) throw new Error("expected the anchor to resolve");

    expect(reloaded.text.slice(resolved.start, resolved.end)).toBe("anchoring");
  });
});
