import { createSyncPayload, mergeSyncPages, purgeSyncPages, type SyncPage } from "@/core";
import { type SyncBackend, SyncConflictError } from "./backend";
import { applySyncPages, collectSyncPages } from "./storage";

/**
 * How many times a push is retried after the remote turned out to have moved
 * on. Each retry merges what arrived in the meantime, so a couple of rounds
 * covers a device that pushed while this one was working.
 */
const MAX_PUSH_ATTEMPTS = 3;

export interface SyncResult {
  /** Whether the merge brought anything new to this device. */
  changedLocally: boolean;
  /** Whether this device had anything the remote did not. */
  pushed: boolean;
}

function samePages(a: SyncPage[], b: SyncPage[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * One round of syncing: read what the backend holds, merge it with what is
 * stored here, write back both ways. Tombstones that have served their time
 * are dropped on the way, so the payload does not carry every deletion ever
 * made. Nothing is written on either side when the two already agree, which
 * is what keeps a run from setting off the next one through the storage
 * watchers.
 */
export async function syncOnce(
  backend: SyncBackend,
  now: number = Date.now(),
): Promise<SyncResult> {
  for (let attempt = 1; ; attempt++) {
    const [remote, local] = await Promise.all([backend.pull(), collectSyncPages()]);
    const remotePages = remote?.payload.pages ?? [];
    const merged = purgeSyncPages(mergeSyncPages(local, remotePages), now);

    const changedLocally = await applySyncPages(merged, now);
    // Nothing stored on either side counts as agreeing, so a device with no
    // notes yet does not push an empty payload over what it just read.
    if (samePages(remotePages, merged)) {
      return { changedLocally, pushed: false };
    }

    try {
      await backend.push(createSyncPayload(merged, now), remote?.version ?? null);
      return { changedLocally, pushed: true };
    } catch (error) {
      // Another device pushed in between. Its notes are on the remote now, so
      // pulling again and merging is all it takes.
      if (!(error instanceof SyncConflictError) || attempt === MAX_PUSH_ATTEMPTS) throw error;
    }
  }
}
