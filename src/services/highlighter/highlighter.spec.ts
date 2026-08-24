import { beforeEach, describe, expect, it } from "vitest";
import { buildTextIndex, createAnchor, type Note, type NoteColor, offsetsToRange } from "@/core";
import { createHighlighter } from "./index";

beforeEach(() => {
  document.body.innerHTML = "";
});

/** Builds a note anchored to the given text, the way the content script does. */
function noteFor(quote: string, color: NoteColor = "yellow"): Note {
  const index = buildTextIndex(document.body);
  const start = index.text.indexOf(quote);
  if (start === -1) throw new Error(`"${quote}" is not on the page`);

  const range = offsetsToRange(index, start, start + quote.length);
  if (!range) throw new Error("could not build a range");

  const anchor = createAnchor(index, range);
  if (!anchor) throw new Error("could not build an anchor");

  return { id: quote, comment: `memo for ${quote}`, color, anchor, createdAt: 1, updatedAt: 1 };
}

describe("createHighlighter", () => {
  it("highlights the anchored text", () => {
    document.body.innerHTML = "<p>The quick brown fox jumps.</p>";
    const note = noteFor("brown fox");

    const result = createHighlighter().sync([note]);

    expect(result.rendered).toHaveLength(1);
    expect(result.missing).toHaveLength(0);
    expect(document.querySelector("mark")?.textContent).toBe("brown fox");
  });

  it("anchors a second note correctly while the first is already highlighted", () => {
    document.body.innerHTML = "<p>The quick brown fox jumps over the lazy dog.</p>";
    const first = noteFor("brown fox");
    const second = noteFor("lazy dog");

    const highlighter = createHighlighter();
    highlighter.sync([first]);
    const result = highlighter.sync([first, second]);

    expect(result.missing).toHaveLength(0);
    expect(Array.from(document.querySelectorAll("mark"), (mark) => mark.textContent)).toEqual([
      "brown fox",
      "lazy dog",
    ]);
    expect(document.body.textContent).toBe("The quick brown fox jumps over the lazy dog.");
  });

  it("removes the highlight when the note is gone", () => {
    document.body.innerHTML = "<p>The quick brown fox jumps.</p>";
    const note = noteFor("brown fox");
    const highlighter = createHighlighter();
    highlighter.sync([note]);

    highlighter.sync([]);

    expect(document.querySelectorAll("mark")).toHaveLength(0);
    expect(highlighter.renderedIds()).toEqual([]);
  });

  it("recolors a note without redrawing it", () => {
    document.body.innerHTML = "<p>The quick brown fox jumps.</p>";
    const note = noteFor("brown fox");
    const highlighter = createHighlighter();
    highlighter.sync([note]);

    highlighter.sync([{ ...note, color: "blue" }]);

    expect(document.querySelector("mark")?.className).toContain("fukidashi-highlight--blue");
    expect(document.querySelectorAll("mark")).toHaveLength(1);
  });

  it("reports notes whose text is no longer on the page", () => {
    document.body.innerHTML = "<p>The quick brown fox jumps.</p>";
    const note = noteFor("brown fox");
    document.body.innerHTML = "<p>Completely different content.</p>";

    const result = createHighlighter().sync([note]);

    expect(result.rendered).toHaveLength(0);
    expect(result.missing.map((missing) => missing.id)).toEqual(["brown fox"]);
  });

  it("finds the note id from an event target inside a highlight", () => {
    document.body.innerHTML = "<p>The quick brown fox jumps.</p>";
    const highlighter = createHighlighter();
    highlighter.sync([noteFor("brown fox")]);

    const mark = document.querySelector("mark") as HTMLElement;

    expect(highlighter.noteIdAt(mark.firstChild?.parentElement ?? null)).toBe("brown fox");
    expect(highlighter.noteIdAt(document.querySelector("p"))).toBeNull();
  });

  it("marks the active note and restores the page on destroy", () => {
    const original = "<p>The quick brown fox jumps.</p>";
    document.body.innerHTML = original;
    const highlighter = createHighlighter();
    highlighter.sync([noteFor("brown fox")]);

    highlighter.setActive("brown fox");
    expect(document.querySelector("mark")?.getAttribute("data-fukidashi-active")).toBe("true");

    highlighter.setActive(null);
    expect(document.querySelector("mark")?.hasAttribute("data-fukidashi-active")).toBe(false);

    highlighter.destroy();
    expect(document.body.innerHTML).toBe(original);
  });
});
