import { purgeExpiredTombstones } from "../tombstone";
import type { SyncPage } from "./types";

/**
 * Drops the tombstones that have done their job (see `TOMBSTONE_TTL_MS`), and
 * the pages left with nothing once they are gone. This runs over a merge
 * result before it is stored or pushed: a tombstone purged on one device
 * would otherwise come straight back from the other's copy, and the payload
 * would only ever grow.
 */
export function purgeSyncPages(pages: SyncPage[], now: number): SyncPage[] {
  const kept: SyncPage[] = [];

  for (const page of pages) {
    const notes = purgeExpiredTombstones(page.notes, now);
    if (notes.length === 0) continue;
    kept.push(notes.length === page.notes.length ? page : { ...page, notes });
  }

  return kept;
}
