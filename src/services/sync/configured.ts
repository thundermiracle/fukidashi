import type { SyncBackend } from "./backend";
import { createSyncCodec, type PayloadCodec } from "./codec";
import type { SyncConfig } from "./config";
import { createDriveApi } from "./drive/api";
import { createDriveBearerSource, driveAuthOptions } from "./drive/auth";
import { createDriveBackend } from "./drive/backend";
import { loadSyncKey } from "./key";

/**
 * The codec that follows the key kept on this device: plaintext until a
 * passphrase is set, encrypting from then on. The key is read on every call,
 * so a passphrase set on the settings page reaches a backend the scheduler
 * already holds.
 */
export const storedKeyCodec: PayloadCodec = createSyncCodec({
  read: loadSyncKey,
  write: loadSyncKey,
});

/**
 * The backend the config names. Google Drive's app folder is the one there
 * is; a sync-code relay fits behind the same interface later. The token is
 * read from storage on every request, so a sign-in on the settings page
 * reaches a backend the scheduler already holds — and so is the key.
 */
export async function loadSyncBackend(config: SyncConfig): Promise<SyncBackend | null> {
  if (config.backend !== "drive") return null;
  return createDriveBackend(
    createDriveApi(createDriveBearerSource(driveAuthOptions())),
    storedKeyCodec,
  );
}
