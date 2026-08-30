/**
 * What the last sync did, for the popup to show. Kept per device — it says
 * something about this browser, not about the notes, so it is never synced.
 */
export interface SyncStatus {
  /** When a sync last finished without an error, or 0 if none ever has. */
  lastSyncedAt: number;
  /** What went wrong last time, if it did. */
  error?: string;
}

const STATUS_KEY = "fukidashi:sync-status";

export const DEFAULT_SYNC_STATUS: SyncStatus = { lastSyncedAt: 0 };

export async function loadSyncStatus(): Promise<SyncStatus> {
  const stored = await chrome.storage.local.get(STATUS_KEY);
  const status = stored[STATUS_KEY] as Partial<SyncStatus> | undefined;

  return {
    lastSyncedAt: typeof status?.lastSyncedAt === "number" ? status.lastSyncedAt : 0,
    ...(typeof status?.error === "string" ? { error: status.error } : {}),
  };
}

export async function saveSyncStatus(status: SyncStatus): Promise<void> {
  await chrome.storage.local.set({ [STATUS_KEY]: status });
}

/** Calls `listener` whenever a sync finishes. Returns an unsubscribe function. */
export function watchSyncStatus(listener: (status: SyncStatus) => void): () => void {
  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local" || !(STATUS_KEY in changes)) return;
    loadSyncStatus().then(listener);
  };

  chrome.storage.onChanged.addListener(handleChange);
  return () => chrome.storage.onChanged.removeListener(handleChange);
}
