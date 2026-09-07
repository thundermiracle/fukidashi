import type { SyncBackend } from "./backend";
import { createSyncCodec, type PayloadCodec } from "./codec";
import type { SyncConfig } from "./config";
import { createDriveApi } from "./drive/api";
import { createDriveBearerSource, driveAuthOptions } from "./drive/auth";
import { createDriveBackend } from "./drive/backend";
import { loadSyncKey } from "./key";
import { createRelayApi, relayOptions } from "./relay/api";
import { createRelayBackend } from "./relay/backend";
import { deriveRelayIdentity } from "./relay/code";
import { relayCodec } from "./relay/connection";
import { loadRelayCode } from "./relay/store";

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
 * The backend the config names: Google Drive's app folder, or the sync-code
 * relay. Tokens and codes are read from storage on every request, so a
 * sign-in or a passphrase on the settings page reaches a backend the
 * scheduler already holds. A relay config with no code behind it — the
 * code was forgotten some other way — yields nothing to sync with.
 */
export async function loadSyncBackend(config: SyncConfig): Promise<SyncBackend | null> {
  if (config.backend === "drive") {
    return createDriveBackend(
      createDriveApi(createDriveBearerSource(driveAuthOptions())),
      storedKeyCodec,
    );
  }

  const code = await loadRelayCode();
  if (code === null) return null;
  const { blobId } = await deriveRelayIdentity(code);
  return createRelayBackend(createRelayApi(relayOptions()), blobId, relayCodec);
}
