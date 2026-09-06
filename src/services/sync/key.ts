/**
 * The key the notes are encrypted with before they leave this device, once
 * the user has set a passphrase. It is derived from the passphrase and kept
 * per device, never synced: every browser is given the passphrase on its
 * own. The passphrase itself is not kept — the key stands in for it here,
 * and cannot be turned back into it.
 */
export interface SyncKey {
  /**
   * The 16 bytes the key was derived with, base64. Every envelope carries
   * them, so a browser given the same passphrase derives the same key.
   */
  salt: string;
  /**
   * How many PBKDF2 rounds the key took. Written into every envelope with
   * the salt, so another browser derives the key the same way.
   */
  iterations: number;
  /** The 256-bit AES key, base64. */
  key: string;
}

export const SYNC_KEY_KEY = "fukidashi:sync:key";

export function isSyncKeyKey(key: string): boolean {
  return key === SYNC_KEY_KEY;
}

function toSyncKey(value: unknown): SyncKey | null {
  if (typeof value !== "object" || value === null) return null;
  const { salt, iterations, key } = value as Partial<SyncKey>;
  return typeof salt === "string" &&
    salt !== "" &&
    Number.isInteger(iterations) &&
    (iterations as number) > 0 &&
    typeof key === "string" &&
    key !== ""
    ? { salt, iterations: iterations as number, key }
    : null;
}

export async function loadSyncKey(): Promise<SyncKey | null> {
  const stored = await chrome.storage.local.get(SYNC_KEY_KEY);
  return toSyncKey(stored[SYNC_KEY_KEY]);
}

/** Writes the key, or removes it when given null — after which the notes leave as they are. */
export async function saveSyncKey(key: SyncKey | null): Promise<void> {
  if (key) {
    await chrome.storage.local.set({ [SYNC_KEY_KEY]: key });
  } else {
    await chrome.storage.local.remove(SYNC_KEY_KEY);
  }
}

/** Calls `listener` whenever the key is set or forgotten. Returns an unsubscribe function. */
export function watchSyncKey(listener: (key: SyncKey | null) => void): () => void {
  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local" || !(SYNC_KEY_KEY in changes)) return;
    listener(toSyncKey(changes[SYNC_KEY_KEY].newValue));
  };

  chrome.storage.onChanged.addListener(handleChange);
  return () => chrome.storage.onChanged.removeListener(handleChange);
}
