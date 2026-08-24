import { beforeEach, describe, expect, it } from "vitest";
import { buildTextIndex, offsetsToRange, rangeToOffsets, UI_ATTRIBUTE } from "./textIndex";

function setBody(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("buildTextIndex", () => {
  it("joins the text of every visible node", () => {
    const body = setBody("<p>Hello <b>brave</b> world</p>");

    expect(buildTextIndex(body).text).toBe("Hello brave world");
  });

  it("skips script and style content", () => {
    const body = setBody("<style>p{color:red}</style><p>Visible</p><script>alert(1)</script>");

    expect(buildTextIndex(body).text).toBe("Visible");
  });

  it("skips the extension's own UI", () => {
    const body = setBody(`<div ${UI_ATTRIBUTE}>toolbar</div><p>Page text</p>`);

    expect(buildTextIndex(body).text).toBe("Page text");
  });

  it("keeps text that is already wrapped in a highlight", () => {
    const body = setBody('<p>Before <mark data-fukidashi-note="1">inside</mark> after</p>');

    expect(buildTextIndex(body).text).toBe("Before inside after");
  });
});

describe("rangeToOffsets", () => {
  it("maps a range inside one text node", () => {
    const body = setBody("<p>Hello brave world</p>");
    const index = buildTextIndex(body);
    const text = body.querySelector("p")?.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 6);
    range.setEnd(text, 11);

    expect(rangeToOffsets(index, range)).toEqual({ start: 6, end: 11 });
  });

  it("maps a range spanning several elements", () => {
    const body = setBody("<p>Hello <b>brave</b> world</p>");
    const index = buildTextIndex(body);
    const range = document.createRange();
    range.setStart(index.chunks[0].node, 6);
    range.setEnd(index.chunks[2].node, 6);

    expect(rangeToOffsets(index, range)).toEqual({ start: 6, end: 17 });
  });

  it("returns null for a collapsed range", () => {
    const body = setBody("<p>Hello</p>");
    const index = buildTextIndex(body);
    const range = document.createRange();
    range.setStart(index.chunks[0].node, 2);
    range.collapse(true);

    expect(rangeToOffsets(index, range)).toBeNull();
  });
});

describe("offsetsToRange", () => {
  it("round-trips offsets back into the same text", () => {
    const body = setBody("<p>Hello <b>brave</b> world</p>");
    const index = buildTextIndex(body);

    expect(offsetsToRange(index, 6, 17)?.toString()).toBe("brave world");
  });

  it("returns null when the offsets are outside the page", () => {
    const body = setBody("<p>Short</p>");
    const index = buildTextIndex(body);

    expect(offsetsToRange(index, 100, 110)).toBeNull();
  });
});
