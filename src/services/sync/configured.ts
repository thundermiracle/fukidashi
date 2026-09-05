import type { SyncBackend } from "./backend";
import type { SyncConfig } from "./config";

/**
 * The backend the config names, once one exists. Google Drive's app folder
 * is the first to come (see `docs/sync-design.md`); a sync-code relay fits
 * behind the same interface later. Until then there is nothing to sync with,
 * and the scheduler treats null as "off".
 */
export async function loadSyncBackend(_config: SyncConfig): Promise<SyncBackend | null> {
  return null;
}
