import { requestSyncNow } from "../../messages";
import { clearSyncCheckpoint } from "../checkpoint";
import {
  createSyncCodec,
  decryptEnvelope,
  deriveSyncKey,
  randomSalt,
  readEnvelopeIfAny,
} from "../codec";
import { syncOnce } from "../engine";
import { loadSyncKey, type SyncKey, saveSyncKey } from "../key";
import { createDriveApi } from "./api";
import { createDriveBearerSource, driveAuthOptions } from "./auth";
import { createDriveBackend, readDriveCopy } from "./backend";

function driveApi() {
  return createDriveApi(createDriveBearerSource(driveAuthOptions()));
}

/**
 * Sets the passphrase the notes are encrypted with, on this device. The
 * copy in Drive decides what that means: if it is already encrypted, the
 * key is derived the way that copy's was, and tried on it first — a wrong
 * passphrase is refused here, not reported as a state later. Otherwise the
 * key is derived afresh, and the next round writes the copy back encrypted
 * (docs/sync-design.md, 3.4). Either way the checkpoint goes, so that round
 * reads the copy rather than trusting what it recorded about the plain one.
 *
 * `iterations` only exists for tests, which cannot afford the real count.
 */
export async function setSyncPassphrase(
  passphrase: string,
  options: { iterations?: number } = {},
): Promise<void> {
  const copy = await readDriveCopy(driveApi());
  const envelope = copy === null ? null : readEnvelopeIfAny(copy);

  let key: SyncKey;
  if (envelope) {
    key = await deriveSyncKey(passphrase, envelope.kdf.salt, envelope.kdf.iterations);
    await decryptEnvelope(envelope, key);
  } else {
    key = await deriveSyncKey(passphrase, randomSalt(), options.iterations);
  }

  await saveSyncKey(key);
  await clearSyncCheckpoint();
  await requestSyncNow();
}

/**
 * Forgets the passphrase on this device and writes the copy in Drive back
 * as plaintext, so this device can go on reading it. The key goes first:
 * from then on nothing here writes an envelope, and a round that runs in
 * between fails softly and is put right by the request at the end. The
 * rewrite itself is one sync round with a codec that still opens the copy
 * with the old key but writes plaintext — merging, retrying and the
 * checkpoint come with it. The checkpoint goes before it, or a round in
 * which nothing moved would read nothing and rewrite nothing. If that round
 * fails the key is put back, and nothing has changed.
 *
 * Every other browser that still has the passphrase encrypts the copy again
 * the next time it syncs, so to stop encrypting for good the passphrase has
 * to be removed on each of them.
 */
export async function removeSyncPassphrase(): Promise<void> {
  const key = await loadSyncKey();
  if (!key) return;

  await saveSyncKey(null);
  const retiring = createSyncCodec({ read: async () => key, write: async () => null });
  try {
    await clearSyncCheckpoint();
    await syncOnce(createDriveBackend(driveApi(), retiring));
  } catch (error) {
    await saveSyncKey(key);
    throw error;
  }
  await requestSyncNow();
}
