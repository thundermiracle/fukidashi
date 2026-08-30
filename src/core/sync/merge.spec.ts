import { describe, expect, it } from "vitest";
import type { Note } from "../types";
import { mergeSyncPages } from "./merge";
import type { SyncPage } from "./types";

const PAGE = "https://example.com/docs";

function note(id: string, updatedAt: number, overrides: Partial<Note> = {}): Note {
  return {
    id,
    comment: `note ${id}`,
    color: "yellow",
    anchor: { exact: `quote ${id}`, prefix: "", suffix: "", start: 0 },
    createdAt: 100,
    updatedAt,
    ...overrides,
  };
}

function tombstone(id: string, deletedAt: number): Note {
  return note(id, deletedAt, { deletedAt });
}

function page(notes: Note[], title?: SyncPage["title"], url = PAGE): SyncPage {
  return title ? { url, notes, title } : { url, notes };
}

/** The notes of the one merged page, by id. */
function idsOf(merged: SyncPage[], url = PAGE): string[] {
  return (merged.find((p) => p.url === url)?.notes ?? []).map((n) => n.id);
}

describe("mergeSyncPages", () => {
  it("keeps the newer version of a note the two devices both have", () => {
    const local = page([note("a", 200, { comment: "older" })]);
    const remote = page([note("a", 300, { comment: "newer" })]);

    expect(mergeSyncPages([local], [remote])[0].notes).toMatchObject([{ comment: "newer" }]);
  });

  it("takes a note only one device has", () => {
    const merged = mergeSyncPages([page([note("a", 200)])], [page([note("b", 200)])]);

    expect(idsOf(merged)).toEqual(["a", "b"]);
  });

  it("gathers pages only one device has", () => {
    const local = page([note("a", 200)], undefined, "https://a.example/");
    const remote = page([note("b", 200)], undefined, "https://b.example/");

    expect(mergeSyncPages([local], [remote]).map((p) => p.url)).toEqual([
      "https://a.example/",
      "https://b.example/",
    ]);
  });

  describe("deletion", () => {
    it("does not bring back a note deleted after the other device last saw it", () => {
      const deletedHere = page([tombstone("a", 300)]);
      const stillThere = page([note("a", 200)]);

      const merged = mergeSyncPages([deletedHere], [stillThere]);

      expect(merged[0].notes).toMatchObject([{ id: "a", deletedAt: 300 }]);
    });

    it("keeps a note edited after it was deleted elsewhere", () => {
      const deletedHere = page([tombstone("a", 200)]);
      const editedThere = page([note("a", 300, { comment: "second thoughts" })]);

      const merged = mergeSyncPages([deletedHere], [editedThere]);

      expect(merged[0].notes).toMatchObject([{ id: "a", comment: "second thoughts" }]);
      expect(merged[0].notes[0].deletedAt).toBeUndefined();
    });

    it("lets the deletion win when both were written in the same instant", () => {
      const merged = mergeSyncPages([page([tombstone("a", 200)])], [page([note("a", 200)])]);

      expect(merged[0].notes).toMatchObject([{ deletedAt: 200 }]);
    });
  });

  describe("titles", () => {
    it("keeps the title written last", () => {
      const local = page([note("a", 200)], { text: "Old name", updatedAt: 100 });
      const remote = page([note("a", 200)], { text: "New name", updatedAt: 300 });

      expect(mergeSyncPages([local], [remote])[0].title).toEqual({
        text: "New name",
        updatedAt: 300,
      });
    });

    it("takes the title from the device that has one", () => {
      const local = page([note("a", 200)]);
      const remote = page([note("a", 200)], { text: "Named", updatedAt: 100 });

      expect(mergeSyncPages([local], [remote])[0].title).toMatchObject({ text: "Named" });
    });

    it("drops the title of a page whose notes are all deleted", () => {
      const local = page([tombstone("a", 300)], { text: "Gone", updatedAt: 100 });
      const remote = page([note("a", 200)], { text: "Gone", updatedAt: 100 });

      const merged = mergeSyncPages([local], [remote]);

      expect(merged[0].notes).toHaveLength(1);
      expect(merged[0].title).toBeUndefined();
    });
  });

  describe("as a merge function", () => {
    const local = [
      page([note("a", 300), tombstone("b", 400)], { text: "Docs", updatedAt: 300 }),
      page([note("c", 100)], undefined, "https://other.example/"),
    ];
    const remote = [
      page([note("a", 200), note("b", 100), note("d", 500)], { text: "Documents", updatedAt: 100 }),
    ];

    it("gives the same answer whichever device asks", () => {
      expect(mergeSyncPages(local, remote)).toEqual(mergeSyncPages(remote, local));
    });

    it("leaves an already merged set alone", () => {
      const merged = mergeSyncPages(local, remote);

      expect(mergeSyncPages(merged, merged)).toEqual(merged);
    });

    it("orders pages and notes the same way every time", () => {
      const shuffled = mergeSyncPages(
        [page([note("c", 100), note("a", 100)])],
        [page([note("b", 100)])],
      );

      expect(idsOf(shuffled)).toEqual(["a", "b", "c"]);
    });

    it("settles a note whose rival was written at the same instant", () => {
      const first = page([note("a", 200, { comment: "one" })]);
      const second = page([note("a", 200, { comment: "two" })]);

      expect(mergeSyncPages([first], [second])).toEqual(mergeSyncPages([second], [first]));
    });

    it("orders by code point, not by whatever language the device is set to", () => {
      // These sort differently under a locale-aware collation, which would
      // leave two devices disagreeing about an order neither can settle.
      const pages = [
        page([note("x", 100)], undefined, "https://example.com/Zebra"),
        page([note("y", 100)], undefined, "https://example.com/apple"),
        page([note("z", 100)], undefined, "https://example.com/Ápple"),
      ];

      expect(mergeSyncPages(pages, []).map((p) => p.url)).toEqual([
        "https://example.com/Zebra",
        "https://example.com/apple",
        "https://example.com/Ápple",
      ]);
    });
  });
});
