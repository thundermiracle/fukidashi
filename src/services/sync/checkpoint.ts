/**
 * What this device knew of the remote copy when its last sync finished: the
 * version the remote had, and the digest of the pages both sides held then.
 * A sync that finds the remote still at that version, and this device's
 * pages still at that digest, has nothing to read and nothing to write. Kept
 * per device, cleared whenever the connection changes.
 */
export interface SyncCheckpoint {
  /** The remote's version token, or null when nothing had been pushed. */
  version: string | null;
  digest: string;
}

const CHECKPOINT_KEY = "fukidashi:sync:checkpoint";

export async function loadSyncCheckpoint(): Promise<SyncCheckpoint | null> {
  const stored = await chrome.storage.local.get(CHECKPOINT_KEY);
  const checkpoint = stored[CHECKPOINT_KEY] as Partial<SyncCheckpoint> | undefined;
  if (
    !checkpoint ||
    (checkpoint.version !== null && typeof checkpoint.version !== "string") ||
    typeof checkpoint.digest !== "string"
  ) {
    return null;
  }
  return { version: checkpoint.version ?? null, digest: checkpoint.digest };
}

export async function saveSyncCheckpoint(checkpoint: SyncCheckpoint): Promise<void> {
  await chrome.storage.local.set({ [CHECKPOINT_KEY]: checkpoint });
}

export async function clearSyncCheckpoint(): Promise<void> {
  await chrome.storage.local.remove(CHECKPOINT_KEY);
}
