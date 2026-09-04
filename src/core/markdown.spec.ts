import { describe, expect, it } from "vitest";
import { markdownFileName, renderMarkdown } from "./markdown";
import type { SyncPage, SyncPayload } from "./sync";
import type { Note } from "./types";

const EXPORTED_AT = Date.UTC(2026, 2, 4, 9, 30);

function makeNote(note: Partial<Note> & Pick<Note, "id">): Note {
  return {
    comment: "",
    color: "yellow",
    createdAt: 0,
    updatedAt: 0,
    ...note,
    anchor: { exact: "the quoted text", prefix: "", suffix: "", start: 0, ...note.anchor },
  };
}

function payloadOf(...pages: SyncPage[]): SyncPayload {
  return { version: 1, exportedAt: EXPORTED_AT, pages };
}

function page(notes: Note[], extra: Partial<SyncPage> = {}): SyncPage {
  return {
    url: "https://example.com/docs",
    title: { text: "Example Domain", updatedAt: 0 },
    notes,
    ...extra,
  };
}

describe("a Markdown export", () => {
  it("writes the page, its address and each note under one heading", () => {
    const markdown = renderMarkdown(
      payloadOf(page([makeNote({ id: "a", comment: "worth remembering" })])),
      "notion",
    );

    expect(markdown).toBe(
      [
        "# Fukidashi notes",
        "",
        "1 note on 1 page, exported on 2026-03-04.",
        "",
        "## Example Domain",
        "",
        "<https://example.com/docs>",
        "",
        "> the quoted text",
        "",
        "worth remembering",
        "",
      ].join("\n"),
    );
  });

  it("leaves a note with no memo as the quote on its own", () => {
    const markdown = renderMarkdown(payloadOf(page([makeNote({ id: "a" })])), "notion");

    expect(markdown.trimEnd().endsWith("> the quoted text")).toBe(true);
  });

  it("falls back to the page's address when it never gave a title", () => {
    const markdown = renderMarkdown(
      payloadOf(page([makeNote({ id: "a" })], { title: undefined })),
      "notion",
    );

    expect(markdown).toContain("## example.com/docs");
  });

  it("lists the notes in the order they are met while reading the page", () => {
    const markdown = renderMarkdown(
      payloadOf(
        page([
          makeNote({ id: "late", anchor: { exact: "second", prefix: "", suffix: "", start: 90 } }),
          makeNote({ id: "early", anchor: { exact: "first", prefix: "", suffix: "", start: 10 } }),
        ]),
      ),
      "notion",
    );

    expect(markdown.indexOf("> first")).toBeLessThan(markdown.indexOf("> second"));
  });

  it("folds the line breaks the page's markup left in a quote", () => {
    const markdown = renderMarkdown(
      payloadOf(
        page([
          makeNote({
            id: "a",
            anchor: { exact: "  wrapped\n   over lines  ", prefix: "", suffix: "", start: 0 },
          }),
        ]),
      ),
      "notion",
    );

    expect(markdown).toContain("> wrapped over lines\n");
  });

  it("keeps the line breaks the reader typed into a memo", () => {
    const markdown = renderMarkdown(
      payloadOf(page([makeNote({ id: "a", comment: "first line\n\nsecond line" })])),
      "notion",
    );

    expect(markdown).toContain("first line\n\nsecond line");
  });

  it("leaves out deleted notes, and the pages nothing is left on", () => {
    const markdown = renderMarkdown(
      payloadOf(
        page([makeNote({ id: "gone", comment: "deleted", deletedAt: 5 })]),
        page([makeNote({ id: "kept", comment: "still here" })], {
          url: "https://other.test/guide",
          title: { text: "Other", updatedAt: 0 },
        }),
      ),
      "notion",
    );

    expect(markdown).not.toContain("deleted");
    expect(markdown).not.toContain("Example Domain");
    expect(markdown).toContain("## Other");
    expect(markdown).toContain("1 note on 1 page");
  });
});

describe("the Notion flavor", () => {
  it("stays inside plain Markdown", () => {
    const markdown = renderMarkdown(
      payloadOf(page([makeNote({ id: "a", color: "green", comment: "a memo" })])),
      "notion",
    );

    expect(markdown.startsWith("# Fukidashi notes")).toBe(true);
    expect(markdown).not.toContain("==");
    expect(markdown).not.toContain("[!quote]");
  });
});

describe("the Obsidian flavor", () => {
  it("opens with properties Obsidian can read", () => {
    const markdown = renderMarkdown(payloadOf(page([makeNote({ id: "a" })])), "obsidian");

    expect(markdown.startsWith("---\n")).toBe(true);
    expect(markdown).toContain("exported: 2026-03-04");
    expect(markdown).toContain("notes: 1");
    expect(markdown).toContain("pages: 1");
    expect(markdown).toContain("tags:\n  - fukidashi");
  });

  it("writes each note as a callout named after its color, memo included", () => {
    const markdown = renderMarkdown(
      payloadOf(page([makeNote({ id: "a", color: "green", comment: "worth\nremembering" })])),
      "obsidian",
    );

    expect(markdown).toContain(
      ["> [!quote] Green", "> ==the quoted text==", ">", "> worth", "> remembering"].join("\n"),
    );
  });

  it("says nothing after the quote when the note carries no memo", () => {
    const markdown = renderMarkdown(payloadOf(page([makeNote({ id: "a" })])), "obsidian");

    expect(markdown.trimEnd().endsWith("> ==the quoted text==")).toBe(true);
  });
});

describe("what a Markdown export is called", () => {
  it("carries the day it was written and the app it was written for", () => {
    expect(markdownFileName(EXPORTED_AT, "notion")).toBe("fukidashi-notes-notion-2026-03-04.md");
    expect(markdownFileName(EXPORTED_AT, "obsidian")).toBe(
      "fukidashi-notes-obsidian-2026-03-04.md",
    );
  });
});
