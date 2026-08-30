import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Note, SyncPayloadError } from "@/core";
import { createFakeChromeStorage } from "@/testing/fakeChromeStorage";
import { deleteNote, loadNotes, notesKey, saveNote, savePageTitle, titleKey } from "./notes";
import {
  applySyncPages,
  buildSyncPayload,
  collectSyncPages,
  exportFileName,
  importSyncPayload,
  serializeSyncPayload,
} from "./sync";

const PAGE = "https://example.com/docs";
const OTHER = "https://other.test/guide";

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

describe("collectSyncPages", () => {
  it("reads nothing out of empty storage", async () => {
    await expect(collectSyncPages()).resolves.toEqual([]);
  });

  it("reads a page with its notes and its title", async () => {
    await saveNote(PAGE, makeNote("a", 100));
    await savePageTitle(PAGE, "Docs");

    await expect(collectSyncPages()).resolves.toMatchObject([
      { url: PAGE, notes: [{ id: "a" }], title: { text: "Docs" } },
    ]);
  });

  it("keeps a page whose notes are all deleted, so the deletion travels", async () => {
    await saveNote(PAGE, makeNote("a", 100));
    await deleteNote(PAGE, "a");

    const [page] = await collectSyncPages();
    expect(page.notes).toMatchObject([{ id: "a", deletedAt: expect.any(Number) }]);
  });

  it("ignores entries that are not notes", async () => {
    await storage.chrome.storage.local.set({ enabled: false });

    await expect(collectSyncPages()).resolves.toEqual([]);
  });
});

describe("applySyncPages", () => {
  it("writes a page the device did not have", async () => {
    const changed = await applySyncPages([{ url: PAGE, notes: [makeNote("a", 100)] }]);

    expect(changed).toBe(true);
    await expect(loadNotes(PAGE)).resolves.toMatchObject([{ id: "a" }]);
  });

  it("writes nothing when the page is already stored as given", async () => {
    await saveNote(PAGE, makeNote("a", 100));
    const pages = await collectSyncPages();
    const listener = vi.fn();
    storage.listeners.add(listener);

    const changed = await applySyncPages(pages);

    expect(changed).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("touches only the page that differs", async () => {
    await saveNote(PAGE, makeNote("a", 100));
    await saveNote(OTHER, makeNote("b", 100));
    const pages = await collectSyncPages();
    const written: string[] = [];
    storage.listeners.add((changes) => written.push(...Object.keys(changes)));

    await applySyncPages(
      pages.map((page) =>
        page.url === PAGE ? { ...page, notes: [makeNote("a", 100, "edited")] } : page,
      ),
    );

    expect(written).toEqual([notesKey(PAGE)]);
  });

  it("removes a title the merge dropped", async () => {
    await saveNote(PAGE, makeNote("a", 100));
    await savePageTitle(PAGE, "Docs");

    await applySyncPages([{ url: PAGE, notes: [makeNote("a", 100)] }]);

    expect(storage.data[titleKey(PAGE)]).toBeUndefined();
  });
});

describe("exportFileName", () => {
  it("dates the file it writes", () => {
    expect(exportFileName(Date.UTC(2026, 7, 30))).toBe("fukidashi-notes-2026-08-30.json");
  });
});

describe("importSyncPayload", () => {
  /** What another device would hand over. */
  async function exportedElsewhere(build: () => Promise<void>): Promise<string> {
    const elsewhere = createFakeChromeStorage();
    vi.stubGlobal("chrome", elsewhere.chrome);
    await build();
    const text = serializeSyncPayload(await buildSyncPayload(500));

    vi.stubGlobal("chrome", storage.chrome);
    return text;
  }

  it("takes in the notes of a page this device has never seen", async () => {
    const file = await exportedElsewhere(async () => {
      await saveNote(OTHER, makeNote("b", 100, "from the laptop"));
      await savePageTitle(OTHER, "The guide");
    });

    await expect(importSyncPayload(file)).resolves.toBe(1);
    await expect(loadNotes(OTHER)).resolves.toMatchObject([{ comment: "from the laptop" }]);
    expect(storage.data[titleKey(OTHER)]).toMatchObject({ text: "The guide" });
  });

  it("keeps the notes this device already had", async () => {
    await saveNote(PAGE, makeNote("a", 100, "from the desktop"));
    const file = await exportedElsewhere(() => saveNote(OTHER, makeNote("b", 100)));

    await importSyncPayload(file);

    await expect(loadNotes(PAGE)).resolves.toMatchObject([{ comment: "from the desktop" }]);
    await expect(loadNotes(OTHER)).resolves.toMatchObject([{ id: "b" }]);
  });

  it("does not bring back a note this device deleted", async () => {
    const file = await exportedElsewhere(() => saveNote(PAGE, makeNote("a", 100)));
    // The same note, deleted here after the other device wrote its export.
    await saveNote(PAGE, makeNote("a", 100));
    await deleteNote(PAGE, "a");

    await importSyncPayload(file);

    await expect(loadNotes(PAGE)).resolves.toEqual([]);
  });

  it("takes the newer version of a note both devices have", async () => {
    const file = await exportedElsewhere(async () => {
      await saveNote(PAGE, { ...makeNote("a", 100, "edited there"), updatedAt: 900 });
    });
    await saveNote(PAGE, { ...makeNote("a", 100, "edited here"), updatedAt: 500 });

    await importSyncPayload(file);

    await expect(loadNotes(PAGE)).resolves.toMatchObject([{ comment: "edited there" }]);
  });

  it("refuses a file that is not an export, leaving storage alone", async () => {
    await saveNote(PAGE, makeNote("a", 100));

    await expect(importSyncPayload('{"hello":"world"}')).rejects.toThrow(SyncPayloadError);
    await expect(importSyncPayload("not json at all")).rejects.toThrow(SyntaxError);
    await expect(loadNotes(PAGE)).resolves.toMatchObject([{ id: "a" }]);
  });
});

describe("an export read back", () => {
  it("carries every page, tombstones included", async () => {
    await saveNote(PAGE, makeNote("a", 100));
    await saveNote(PAGE, makeNote("b", 200));
    await deleteNote(PAGE, "b");
    await savePageTitle(PAGE, "Docs");

    const payload = await buildSyncPayload(500);
    const readBack = JSON.parse(serializeSyncPayload(payload));

    expect(readBack).toMatchObject({ version: 1, exportedAt: 500 });
    expect(readBack.pages[0].notes).toHaveLength(2);
  });
});
