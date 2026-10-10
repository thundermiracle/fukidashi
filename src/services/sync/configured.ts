import type { SyncBackend } from "./backend";
import { createSyncCodec, type PayloadCodec } from "./codec";
import type { SyncConfig } from "./config";
import { createDriveApi } from "./drive/api";
import { createDriveBearerSource, driveAuthOptions } from "./drive/auth";
import { createDriveBackend } from "./drive/backend";
import { loadSyncKey } from "./key";

/**
 * The codec Drive uses, following the key kept on this device: plaintext
 * until a passphrase is set, encrypting from then on. The key is read on
 * every call, so a passphrase set on the settings page reaches a backend
 * the scheduler already holds.
 */
export const storedKeyCodec: PayloadCodec = createSyncCodec({
  read: loadSyncKey,
  write: loadSyncKey,
});

/**
 * Google Drive's app folder. The token and key are read from storage on
 * every request, so a sign-in or a passphrase on the settings page reaches
 * a backend the scheduler already holds.
 */
export async function loadSyncBackend(config: SyncConfig): Promise<SyncBackend | null> {
  if (config.backend === "drive") {
    return createDriveBackend(
      createDriveApi(createDriveBearerSource(driveAuthOptions())),
      storedKeyCodec,
    );
  }

  return null;
}
