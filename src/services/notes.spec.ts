import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "@/core";
import { createFakeChromeStorage } from "@/testing/fakeChromeStorage";
import { deleteNote, loadNotes, notesKey, saveNote, watchNotes } from "./notes";

const PAGE = "https://example.com/docs?page=2#intro";

function makeNote(id: string, createdAt: number, comment = ""): Note {
  return {
    id,
    comment,
    color: "yellow",
    anchor: { exact: `quote ${id}`, prefix: "", suffix: "", start: 0 },
    createdAt,
    updatedAt: createdAt,
  };
}

let storage: ReturnType<typeof createFakeChromeStorage>;

beforeEach(() => {
  storage = createFakeChromeStorage();
  vi.stubGlobal("chrome", storage.chrome);
});

describe("notesKey", () => {
  it("ignores the hash so one page has one set of notes", () => {
    expect(notesKey(PAGE)).toBe("fukidashi:notes:https://example.com/docs?page=2");
  });
});

describe("loadNotes", () => {
  it("returns an empty list for a page without notes", async () => {
    await expect(loadNotes(PAGE)).resolves.toEqual([]);
  });

  it("returns the notes oldest first", async () => {
    await saveNote(PAGE, makeNote("b", 200));
    await saveNote(PAGE, makeNote("a", 100));

    await expect(loadNotes(PAGE)).resolves.toMatchObject([{ id: "a" }, { id: "b" }]);
  });
});

describe("saveNote", () => {
  it("replaces the stored note with the same id instead of adding one", async () => {
    await saveNote(PAGE, makeNote("a", 100, "first"));
    await saveNote(PAGE, makeNote("a", 100, "edited"));

    await expect(loadNotes(PAGE)).resolves.toMatchObject([{ id: "a", comment: "edited" }]);
  });

  it("keeps notes of different pages apart", async () => {
    await saveNote(PAGE, makeNote("a", 100));
    await saveNote("https://example.com/other", makeNote("b", 100));

    await expect(loadNotes(PAGE)).resolves.toMatchObject([{ id: "a" }]);
  });
});

describe("deleteNote", () => {
  it("removes one note", async () => {
    await saveNote(PAGE, makeNote("a", 100));
    await saveNote(PAGE, makeNote("b", 200));

    await deleteNote(PAGE, "a");

    await expect(loadNotes(PAGE)).resolves.toMatchObject([{ id: "b" }]);
  });

  it("drops the storage entry once the last note is gone", async () => {
    await saveNote(PAGE, makeNote("a", 100));

    await deleteNote(PAGE, "a");

    expect(Object.keys(storage.data)).toEqual([]);
  });
});

describe("watchNotes", () => {
  it("reports changes made elsewhere until it is unsubscribed", async () => {
    const listener = vi.fn();
    const unwatch = watchNotes(PAGE, listener);

    await saveNote(PAGE, makeNote("a", 100));
    expect(listener).toHaveBeenCalledWith([expect.objectContaining({ id: "a" })]);

    unwatch();
    await saveNote(PAGE, makeNote("b", 200));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("ignores changes to other pages", async () => {
    const listener = vi.fn();
    watchNotes(PAGE, listener);

    await saveNote("https://example.com/other", makeNote("a", 100));

    expect(listener).not.toHaveBeenCalled();
  });
});
