import { isLiveNote } from "../tombstone";
import type { Note, PageTitle } from "../types";
import type { SyncPage } from "./types";

/**
 * Orders two notes that carry the same id and the same timestamps. Which one
 * wins does not matter, only that every device picks the same one — so the
 * fields are compared in a fixed order.
 */
function compareRivalNotes(a: Note, b: Note): number {
  return (
    a.comment.localeCompare(b.comment) ||
    a.color.localeCompare(b.color) ||
    a.anchor.exact.localeCompare(b.anchor.exact) ||
    a.anchor.start - b.anchor.start ||
    a.createdAt - b.createdAt
  );
}

/** The surviving version of one note, seen on two devices. */
function pickNote(a: Note, b: Note): Note {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;

  // Written at the same instant: the deletion wins, so an edit made elsewhere
  // in that same millisecond cannot bring a deleted note back.
  const aDeleted = !isLiveNote(a);
  if (aDeleted !== !isLiveNote(b)) return aDeleted ? a : b;

  return compareRivalNotes(a, b) <= 0 ? a : b;
}

function pickTitle(a: PageTitle | undefined, b: PageTitle | undefined): PageTitle | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return a.text.localeCompare(b.text) <= 0 ? a : b;
}

/** Notes are held in the order they were written, and ties broken by id. */
function byCreatedAtThenId(a: Note, b: Note): number {
  return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}

/**
 * One page's notes from both sides, each id resolved to a single note. The
 * result is canonically ordered so that merging the same pair on two devices
 * writes byte-identical output.
 */
function mergeNotes(a: Note[], b: Note[]): Note[] {
  const merged = new Map<string, Note>();

  for (const note of [...a, ...b]) {
    const rival = merged.get(note.id);
    merged.set(note.id, rival ? pickNote(rival, note) : note);
  }

  return [...merged.values()].sort(byCreatedAtThenId);
}

function mergePage(a: SyncPage, b: SyncPage): SyncPage {
  const notes = mergeNotes(a.notes, b.notes);
  const title = pickTitle(a.title, b.title);

  // A page whose notes are all tombstones is not listed anywhere, so a title
  // would only survive as an orphan key that nothing goes back to clean up.
  return notes.some(isLiveNote) && title ? { url: a.url, notes, title } : { url: a.url, notes };
}

/**
 * Two devices' notes, resolved into the set they should both end up with.
 * Newest write wins per note; a deletion is a write, which is what keeps a
 * note deleted on one device from returning out of the other's older copy.
 *
 * The result does not depend on the argument order, and merging it with
 * itself returns it unchanged.
 */
export function mergeSyncPages(a: SyncPage[], b: SyncPage[]): SyncPage[] {
  const merged = new Map<string, SyncPage>();

  for (const page of [...a, ...b]) {
    const rival = merged.get(page.url);
    merged.set(page.url, rival ? mergePage(rival, page) : mergePage(page, page));
  }

  return [...merged.values()].sort((first, second) => first.url.localeCompare(second.url));
}

/**
 * One device's pages in the shape a merge would leave them, so that what is
 * stored can be compared against what a merge produced.
 */
export function canonicalizeSyncPages(pages: SyncPage[]): SyncPage[] {
  return mergeSyncPages(pages, []);
}
