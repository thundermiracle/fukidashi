import {
  canonicalizeSyncPages,
  createSyncPayload,
  mergeSyncPages,
  parseSyncPayload,
  type SyncPage,
  type SyncPayload,
  toPageTitle,
} from "@/core";
import { NOTES_KEY_PREFIX, notesKey, TITLE_KEY_PREFIX, titleKey, toNotes } from "./notes";

/**
 * Everything stored, as the sync layer reads it: tombstones included, and
 * pages whose notes are all deleted kept, because their tombstones are what
 * hold the deletion in place.
 */
export async function collectSyncPages(): Promise<SyncPage[]> {
  const stored = await chrome.storage.local.get(null);
  const pages = new Map<string, SyncPage>();
  const at = (url: string) => {
    const known = pages.get(url);
    if (known) return known;
    const page: SyncPage = { url, notes: [] };
    pages.set(url, page);
    return page;
  };

  for (const [key, value] of Object.entries(stored)) {
    if (key.startsWith(NOTES_KEY_PREFIX)) {
      at(key.slice(NOTES_KEY_PREFIX.length)).notes = toNotes(value);
      continue;
    }
    if (!key.startsWith(TITLE_KEY_PREFIX)) continue;

    const title = toPageTitle(value);
    if (title) at(key.slice(TITLE_KEY_PREFIX.length)).title = title;
  }

  // A title on its own is not a page, and canonicalizing drops it.
  return canonicalizeSyncPages([...pages.values()].filter((page) => page.notes.length > 0));
}

function same(stored: unknown, wanted: unknown): boolean {
  return JSON.stringify(stored) === JSON.stringify(wanted);
}

/**
 * Writes the given pages, touching only the entries whose contents actually
 * differ. Leaving unchanged entries alone is what keeps a sync from waking
 * the watchers — and so the next sync — over notes nobody edited.
 *
 * Returns whether anything was written.
 */
export async function applySyncPages(pages: SyncPage[]): Promise<boolean> {
  const local = new Map((await collectSyncPages()).map((page) => [page.url, page]));
  const set: Record<string, unknown> = {};
  const remove: string[] = [];

  for (const page of canonicalizeSyncPages(pages)) {
    const stored = local.get(page.url);
    const notesEntry = notesKey(page.url);
    const titleEntry = titleKey(page.url);

    if (page.notes.length === 0) {
      if (stored) remove.push(notesEntry);
    } else if (!same(stored?.notes, page.notes)) {
      set[notesEntry] = page.notes;
    }

    if (!page.title) {
      if (stored?.title) remove.push(titleEntry);
    } else if (!same(stored?.title, page.title)) {
      set[titleEntry] = page.title;
    }
  }

  if (Object.keys(set).length > 0) await chrome.storage.local.set(set);
  for (const key of remove) await chrome.storage.local.remove(key);

  return Object.keys(set).length > 0 || remove.length > 0;
}

/**
 * Everything stored, in the format an export writes and an import reads. The
 * payload is built apart from the JSON it is serialized to, so that a view
 * meant for people — Markdown for a notes app — can be derived from the same
 * reading.
 */
export async function buildSyncPayload(exportedAt: number = Date.now()): Promise<SyncPayload> {
  return createSyncPayload(await collectSyncPages(), exportedAt);
}

export function serializeSyncPayload(payload: SyncPayload): string {
  return JSON.stringify(payload, null, 2);
}

/** What an export is called, dated so a folder of them stays readable. */
export function exportFileName(exportedAt: number): string {
  return `fukidashi-notes-${new Date(exportedAt).toISOString().slice(0, 10)}.json`;
}

/**
 * Takes in an exported file, merged with what is already stored rather than
 * replacing it — so importing on a device that has its own notes keeps both,
 * and cannot bring back what either device deleted.
 *
 * Returns how many pages the file carried.
 */
export async function importSyncPayload(text: string): Promise<number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SyntaxError("This file is not readable JSON.");
  }

  const payload = parseSyncPayload(parsed);
  await applySyncPages(mergeSyncPages(await collectSyncPages(), payload.pages));
  return payload.pages.length;
}
