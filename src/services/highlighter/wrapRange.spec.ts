import { beforeEach, describe, expect, it } from "vitest";
import { findMarks, unwrapMarks, wrapRange } from "./wrapRange";

const NOTE = { id: "note-1", color: "yellow" as const };

beforeEach(() => {
  document.body.innerHTML = "";
});

function rangeOver(node: Text, start: number, end: number): Range {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  return range;
}

describe("wrapRange", () => {
  it("wraps part of a single text node", () => {
    document.body.innerHTML = "<p>Hello brave world</p>";
    const text = document.querySelector("p")?.firstChild as Text;

    const marks = wrapRange(rangeOver(text, 6, 11), NOTE);

    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe("brave");
    expect(document.body.innerHTML).toBe(
      '<p>Hello <mark class="fukidashi-highlight fukidashi-highlight--yellow" data-fukidashi-note="note-1">brave</mark> world</p>',
    );
  });

  it("wraps each text node of a range that spans elements", () => {
    document.body.innerHTML = "<p>Hello <b>brave</b> world</p>";
    const paragraph = document.querySelector("p") as HTMLElement;
    const range = document.createRange();
    range.setStart(paragraph.firstChild as Text, 6);
    range.setEnd(paragraph.lastChild as Text, 6);

    const marks = wrapRange(range, NOTE);

    expect(marks.map((mark) => mark.textContent)).toEqual(["brave", " world"]);
    expect(document.body.textContent).toBe("Hello brave world");
  });

  it("does not wrap text that only touches the range boundary", () => {
    document.body.innerHTML = "<p><span>one</span><span>two</span></p>";
    const range = document.createRange();
    range.setStart(document.querySelectorAll("span")[0].firstChild as Text, 0);
    range.setEnd(document.querySelectorAll("span")[1].firstChild as Text, 0);

    const marks = wrapRange(range, NOTE);

    expect(marks.map((mark) => mark.textContent)).toEqual(["one"]);
  });
});

describe("unwrapMarks", () => {
  it("restores the original markup", () => {
    const original = "<p>Hello <b>brave</b> world</p>";
    document.body.innerHTML = original;
    const paragraph = document.querySelector("p") as HTMLElement;
    const range = document.createRange();
    range.setStart(paragraph.firstChild as Text, 6);
    range.setEnd(paragraph.lastChild as Text, 6);
    expect(wrapRange(range, NOTE)).toHaveLength(2);

    unwrapMarks(document.body, NOTE.id);

    expect(document.body.innerHTML).toBe(original);
    expect(findMarks(document.body, NOTE.id)).toEqual([]);
  });

  it("leaves other notes alone", () => {
    document.body.innerHTML = "<p>one two</p>";
    const text = document.querySelector("p")?.firstChild as Text;
    wrapRange(rangeOver(text, 4, 7), { id: "keep", color: "green" });
    const first = document.querySelector("p")?.firstChild as Text;
    wrapRange(rangeOver(first, 0, 3), NOTE);

    unwrapMarks(document.body, NOTE.id);

    expect(findMarks(document.body, "keep")).toHaveLength(1);
    expect(document.body.textContent).toBe("one two");
  });
});
