/**
 * Where syncing stands on this device, for the popup and the settings page
 * to show. Kept per device — it says something about this browser, not
 * about the notes, so it is never synced.
 */
export type SyncState =
  /** No backend is configured. */
  | "off"
  /** The last run finished; the next waits for an edit or the alarm. */
  | "idle"
  | "syncing"
  /** The backend needs the user to sign in again before anything moves. */
  | "signedOut"
  /** The last run failed; the scheduler tries again after `nextAttemptAt`. */
  | "error"
  /** The remote copy was written by a newer version; updating fixes it. */
  | "outdated";

export interface SyncStatus {
  state: SyncState;
  /** When a sync last finished without an error, or 0 if none ever has. */
  lastSyncedAt: number;
  /** What went wrong last time, if it did. */
  error?: string;
  /** Failures in a row, which set how long the next wait is. */
  failures?: number;
  /** Until when the scheduler holds off after those failures. */
  nextAttemptAt?: number;
}

const STATUS_KEY = "fukidashi:sync-status";
const STATES: readonly SyncState[] = ["off", "idle", "syncing", "signedOut", "error", "outdated"];

export const DEFAULT_SYNC_STATUS: SyncStatus = { state: "off", lastSyncedAt: 0 };

function isSyncState(value: unknown): value is SyncState {
  return STATES.includes(value as SyncState);
}

export async function loadSyncStatus(): Promise<SyncStatus> {
  const stored = await chrome.storage.local.get(STATUS_KEY);
  const status = stored[STATUS_KEY] as Partial<SyncStatus> | undefined;

  return {
    state: isSyncState(status?.state) ? status.state : DEFAULT_SYNC_STATUS.state,
    lastSyncedAt: typeof status?.lastSyncedAt === "number" ? status.lastSyncedAt : 0,
    ...(typeof status?.error === "string" ? { error: status.error } : {}),
    ...(typeof status?.failures === "number" ? { failures: status.failures } : {}),
    ...(typeof status?.nextAttemptAt === "number" ? { nextAttemptAt: status.nextAttemptAt } : {}),
  };
}

export async function saveSyncStatus(status: SyncStatus): Promise<void> {
  await chrome.storage.local.set({ [STATUS_KEY]: status });
}

/** Calls `listener` whenever the status changes. Returns an unsubscribe function. */
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
