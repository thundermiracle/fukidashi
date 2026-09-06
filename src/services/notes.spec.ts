import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Note, type PageTitle, TOMBSTONE_TTL_MS } from "@/core";
import { createFakeChromeStorage } from "@/testing/fakeChromeStorage";
import {
  deleteNote,
  loadAllPageNotes,
  loadNotes,
  loadNotesWithTombstones,
  notesKey,
  saveNote,
  savePageTitle,
  titleKey,
  watchAllNotes,
  watchNotes,
} from "./notes";

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

  it("keeps the deleted note as a tombstone for the sync layer", async () => {
    await saveNote(PAGE, makeNote("a", 100));

    await deleteNote(PAGE, "a");

    await expect(loadNotes(PAGE)).resolves.toEqual([]);
    const [tombstone] = await loadNotesWithTombstones(PAGE);
    expect(tombstone.id).toBe("a");
    expect(tombstone.deletedAt).toBeGreaterThan(0);
    expect(tombstone.updatedAt).toBe(tombstone.deletedAt);
    // What was written and quoted goes with the note; only the id and the times stay.
    expect(tombstone.comment).toBe("");
    expect(tombstone.anchor).toEqual({ exact: "", prefix: "", suffix: "", start: 0 });
  });

  it("drops the title once the last live note is gone, but keeps the entry", async () => {
    await saveNote(PAGE, makeNote("a", 100));
    await savePageTitle(PAGE, "The page");

    await deleteNote(PAGE, "a");

    expect(Object.keys(storage.data)).toEqual([notesKey(PAGE)]);
  });

  it("changes nothing for an id the page does not have", async () => {
    await saveNote(PAGE, makeNote("a", 100));

    await deleteNote(PAGE, "missing");

    await expect(loadNotesWithTombstones(PAGE)).resolves.toMatchObject([{ id: "a" }]);
  });

  it("purges tombstones older than the TTL on the next write", async () => {
    const expired = Date.now() - TOMBSTONE_TTL_MS;
    await storage.chrome.storage.local.set({
      [notesKey(PAGE)]: [{ ...makeNote("dead", 100), updatedAt: expired, deletedAt: expired }],
    });

    await saveNote(PAGE, makeNote("b", 200));

    await expect(loadNotesWithTombstones(PAGE)).resolves.toMatchObject([{ id: "b" }]);
  });
});

describe("savePageTitle", () => {
  function storedTitle(): PageTitle {
    return storage.data[titleKey(PAGE)] as PageTitle;
  }

  it("stores the title under the page it belongs to, with the time it was written", async () => {
    await savePageTitle(PAGE, "Docs — page 2");

    expect(storedTitle().text).toBe("Docs — page 2");
    expect(storedTitle().updatedAt).toBeGreaterThan(0);
  });

  it("reads a title spread over several lines as one line", async () => {
    await savePageTitle(PAGE, "\n  Docs\n  page 2  \n");

    expect(storedTitle().text).toBe("Docs page 2");
  });

  it("keeps a title short enough to list", async () => {
    await savePageTitle(PAGE, "x".repeat(400));

    expect(storedTitle().text.length).toBe(300);
  });

  it("stores nothing for a page without a title", async () => {
    await savePageTitle(PAGE, "   ");

    expect(Object.keys(storage.data)).toEqual([]);
  });

  it("does not write an unchanged title again", async () => {
    await savePageTitle(PAGE, "Docs");
    const listener = vi.fn();
    storage.listeners.add(listener);

    await savePageTitle(PAGE, "Docs");

    expect(listener).not.toHaveBeenCalled();
  });

  it("rewrites a title stored before timestamps, so it picks one up", async () => {
    await storage.chrome.storage.local.set({ [titleKey(PAGE)]: "Docs" });

    await savePageTitle(PAGE, "Docs");

    expect(storedTitle().updatedAt).toBeGreaterThan(0);
  });
});

describe("loadAllPageNotes", () => {
  it("returns nothing when no page has been annotated", async () => {
    await expect(loadAllPageNotes()).resolves.toEqual([]);
  });

  it("lists every annotated page, most recently annotated first", async () => {
    await saveNote("https://old.example/a", makeNote("a", 100));
    await saveNote("https://fresh.example/b", makeNote("b", 900));

    await expect(loadAllPageNotes()).resolves.toMatchObject([
      { url: "https://fresh.example/b", notes: [{ id: "b" }] },
      { url: "https://old.example/a", notes: [{ id: "a" }] },
    ]);
  });

  it("keys pages by the URL notes are stored under, not the one visited", async () => {
    await saveNote("https://example-com.translate.goog/docs?_x_tr_tl=ja", makeNote("a", 100));

    await expect(loadAllPageNotes()).resolves.toMatchObject([{ url: "https://example.com/docs" }]);
  });

  it("ignores storage entries that are not notes", async () => {
    await storage.chrome.storage.local.set({ enabled: false });

    await expect(loadAllPageNotes()).resolves.toEqual([]);
  });

  it("does not list a page whose notes are all tombstones", async () => {
    await saveNote(PAGE, makeNote("a", 100));
    await deleteNote(PAGE, "a");

    await expect(loadAllPageNotes()).resolves.toEqual([]);
  });

  it("gives each page the title it was stored with", async () => {
    await saveNote(PAGE, makeNote("a", 100));
    await savePageTitle(PAGE, "Docs — page 2");

    await expect(loadAllPageNotes()).resolves.toMatchObject([{ title: "Docs — page 2" }]);
  });

  it("still reads a title stored before timestamps", async () => {
    await saveNote(PAGE, makeNote("a", 100));
    await storage.chrome.storage.local.set({ [titleKey(PAGE)]: "Docs" });

    await expect(loadAllPageNotes()).resolves.toMatchObject([{ title: "Docs" }]);
  });

  it("lists a page annotated before titles were kept", async () => {
    await saveNote(PAGE, makeNote("a", 100));

    const [page] = await loadAllPageNotes();
    expect(page.title).toBeUndefined();
  });

  it("does not list a page that only has a title left", async () => {
    await savePageTitle(PAGE, "Docs");

    await expect(loadAllPageNotes()).resolves.toEqual([]);
  });
});

describe("watchAllNotes", () => {
  /** The listener is called after a read of its own, so let that settle. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("reports a note written on any page until it is unsubscribed", async () => {
    const listener = vi.fn();
    const unwatch = watchAllNotes(listener);

    await saveNote(PAGE, makeNote("a", 100));
    await settle();
    expect(listener).toHaveBeenCalledWith([
      expect.objectContaining({ url: "https://example.com/docs?page=2" }),
    ]);

    unwatch();
    await saveNote("https://example.com/other", makeNote("b", 200));
    await settle();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("reports a title arriving after the note that prompted it", async () => {
    await saveNote(PAGE, makeNote("a", 100));
    const listener = vi.fn();
    watchAllNotes(listener);

    await savePageTitle(PAGE, "Docs");
    await settle();

    expect(listener).toHaveBeenCalledWith([expect.objectContaining({ title: "Docs" })]);
  });

  it("ignores changes to anything but notes", async () => {
    const listener = vi.fn();
    watchAllNotes(listener);

    await storage.chrome.storage.local.set({ enabled: false });
    await settle();

    expect(listener).not.toHaveBeenCalled();
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

  it("reports a deletion as the live notes, without the tombstone", async () => {
    await saveNote(PAGE, makeNote("a", 100));
    const listener = vi.fn();
    watchNotes(PAGE, listener);

    await deleteNote(PAGE, "a");

    expect(listener).toHaveBeenCalledWith([]);
  });
});
