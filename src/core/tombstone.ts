import type { Note } from "./types";

/**
 * How long a deleted note's tombstone is kept around for sync to see. After
 * this, a device that still hasn't heard of the deletion would resurrect the
 * note — 30 days is long enough that such a device has been retired.
 */
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** A note the user still has; tombstones exist only for the sync layer. */
export function isLiveNote(note: Note): boolean {
  return note.deletedAt === undefined;
}

export function liveNotes(notes: Note[]): Note[] {
  return notes.filter(isLiveNote);
}

/** Drops tombstones old enough to have done their job; live notes always stay. */
export function purgeExpiredTombstones(notes: Note[], now: number): Note[] {
  return notes.filter(
    (note) => note.deletedAt === undefined || now - note.deletedAt < TOMBSTONE_TTL_MS,
  );
}
