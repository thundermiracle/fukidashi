import {
  createSyncPayload,
  digestSyncPages,
  mergeSyncPages,
  purgeSyncPages,
  type SyncPage,
} from "@/core";
import { type SyncBackend, SyncConflictError } from "./backend";
import { loadSyncCheckpoint, saveSyncCheckpoint } from "./checkpoint";
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
 * The round that needs no reading. When the remote is still at the version
 * this device recorded after its last sync, the remote copy is what this
 * device held then — and everything written here since is newer, so the
 * merge would come out as this device's own pages. So: nothing to do if
 * they have not changed, and a push without a pull if they have.
 *
 * Returns null when the remote moved on, or the push lost a race, and the
 * full round has to happen after all.
 */
async function syncWithoutReading(
  backend: SyncBackend,
  local: SyncPage[],
  now: number,
): Promise<SyncResult | null> {
  if (!backend.peek) return null;
  const checkpoint = await loadSyncCheckpoint();
  if (!checkpoint) return null;
  if ((await backend.peek()) !== checkpoint.version) return null;
  const remoteVersion = checkpoint.version;

  const pages = purgeSyncPages(local, now);
  const digest = digestSyncPages(pages);
  if (digest === checkpoint.digest) return { changedLocally: false, pushed: false };

  const changedLocally = await applySyncPages(pages, now);
  try {
    const version = await backend.push(createSyncPayload(pages, now), remoteVersion);
    await saveSyncCheckpoint({ version, digest });
    return { changedLocally, pushed: true };
  } catch (error) {
    if (!(error instanceof SyncConflictError)) throw error;
    return null;
  }
}

/**
 * One round of syncing: read what the backend holds, merge it with what is
 * stored here, write back both ways. Tombstones that have served their time
 * are dropped on the way, so the payload does not carry every deletion ever
 * made. Nothing is written on either side when the two already agree, which
 * is what keeps a run from setting off the next one through the storage
 * watchers — and when the remote has not moved since the last round, it is
 * not even read.
 */
export async function syncOnce(
  backend: SyncBackend,
  now: number = Date.now(),
): Promise<SyncResult> {
  const local = await collectSyncPages();
  const quick = await syncWithoutReading(backend, local, now);
  if (quick) return quick;

  for (let attempt = 1; ; attempt++) {
    const [remote, current] = await Promise.all([
      backend.pull(),
      attempt === 1 ? local : collectSyncPages(),
    ]);
    const remotePages = remote?.payload.pages ?? [];
    const merged = purgeSyncPages(mergeSyncPages(current, remotePages), now);

    const changedLocally = await applySyncPages(merged, now);
    // Nothing stored on either side counts as agreeing, so a device with no
    // notes yet does not push an empty payload over what it just read.
    if (samePages(remotePages, merged)) {
      await saveSyncCheckpoint({
        version: remote?.version ?? null,
        digest: digestSyncPages(merged),
      });
      return { changedLocally, pushed: false };
    }

    try {
      const version = await backend.push(createSyncPayload(merged, now), remote?.version ?? null);
      await saveSyncCheckpoint({ version, digest: digestSyncPages(merged) });
      return { changedLocally, pushed: true };
    } catch (error) {
      // Another device pushed in between. Its notes are on the remote now, so
      // pulling again and merging is all it takes.
      if (!(error instanceof SyncConflictError) || attempt === MAX_PUSH_ATTEMPTS) throw error;
    }
  }
}
