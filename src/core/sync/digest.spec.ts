import { describe, expect, it } from "vitest";
import type { Note } from "../types";
import { digestSyncPages } from "./digest";

function makeNote(id: string, comment = ""): Note {
  return {
    id,
    comment,
    color: "yellow",
    anchor: { exact: `quote ${id}`, prefix: "", suffix: "", start: 0 },
    createdAt: 100,
    updatedAt: 100,
  };
}

const PAGE = "https://example.com/docs";

describe("digestSyncPages", () => {
  it("gives the same pages the same digest", () => {
    const pages = [{ url: PAGE, notes: [makeNote("a")] }];

    expect(digestSyncPages(pages)).toBe(digestSyncPages(structuredClone(pages)));
    expect(digestSyncPages(pages)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("changes with the smallest edit", () => {
    const before = digestSyncPages([{ url: PAGE, notes: [makeNote("a", "first")] }]);
    const after = digestSyncPages([{ url: PAGE, notes: [makeNote("a", "first!")] }]);

    expect(after).not.toBe(before);
  });

  it("has a digest for nothing at all", () => {
    expect(digestSyncPages([])).toMatch(/^[0-9a-f]{16}$/);
  });
});
