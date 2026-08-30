import type { SyncBackend } from "./backend";

/**
 * The backend this device syncs through, once one exists. Google Drive's app
 * folder and a sync-code relay are the two being weighed; both fit behind
 * `SyncBackend`, so choosing between them is a matter of returning one here.
 *
 * Until then there is nothing to sync with, and the background page stays
 * idle rather than doing half a job.
 */
export function loadSyncBackend(): SyncBackend | null {
  return null;
}
