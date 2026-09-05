import type { SyncBackend } from "./backend";
import type { SyncConfig } from "./config";
import { createDriveApi } from "./drive/api";
import { createDriveBearerSource, driveAuthOptions } from "./drive/auth";
import { createDriveBackend } from "./drive/backend";

/**
 * The backend the config names. Google Drive's app folder is the one there
 * is; a sync-code relay fits behind the same interface later. The token is
 * read from storage on every request, so a sign-in on the settings page
 * reaches a backend the scheduler already holds.
 */
export async function loadSyncBackend(config: SyncConfig): Promise<SyncBackend | null> {
  if (config.backend !== "drive") return null;
  return createDriveBackend(createDriveApi(createDriveBearerSource(driveAuthOptions())));
}
