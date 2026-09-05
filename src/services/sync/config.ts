/**
 * How this device syncs, once the user has set it up. Absent until then,
 * which is what keeps the background idle. Kept per device, never synced:
 * each browser is connected on its own.
 */
export interface SyncConfig {
  backend: "drive";
}

export const SYNC_CONFIG_KEY = "fukidashi:sync:config";

export function isSyncConfigKey(key: string): boolean {
  return key === SYNC_CONFIG_KEY;
}

/** Reads a stored value back, or null for anything this version cannot use. */
function toSyncConfig(value: unknown): SyncConfig | null {
  if (typeof value !== "object" || value === null) return null;
  const { backend } = value as Partial<SyncConfig>;
  return backend === "drive" ? { backend } : null;
}

export async function loadSyncConfig(): Promise<SyncConfig | null> {
  const stored = await chrome.storage.local.get(SYNC_CONFIG_KEY);
  return toSyncConfig(stored[SYNC_CONFIG_KEY]);
}

/** Writes the config, or removes it when given null — which switches syncing off. */
export async function saveSyncConfig(config: SyncConfig | null): Promise<void> {
  if (config) {
    await chrome.storage.local.set({ [SYNC_CONFIG_KEY]: config });
  } else {
    await chrome.storage.local.remove(SYNC_CONFIG_KEY);
  }
}

/** Calls `listener` whenever syncing is switched on, off or over. Returns an unsubscribe function. */
export function watchSyncConfig(listener: (config: SyncConfig | null) => void): () => void {
  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local" || !(SYNC_CONFIG_KEY in changes)) return;
    listener(toSyncConfig(changes[SYNC_CONFIG_KEY].newValue));
  };

  chrome.storage.onChanged.addListener(handleChange);
  return () => chrome.storage.onChanged.removeListener(handleChange);
}
