import { createSyncPayload } from "@/core";
import { requestSyncNow } from "../../messages";
import { clearSyncCheckpoint } from "../checkpoint";
import { createSyncCodec, type PayloadCodec } from "../codec";
import { saveSyncConfig } from "../config";
import { ensureDataCollectionAllowed } from "../dataCollection";
import { createRelayApi, type RelayApi, relayOptions } from "./api";
import { deriveRelayIdentity, generateSyncCode, normalizeSyncCode, SyncCodeError } from "./code";
import { loadRelayCode, saveRelayCode } from "./store";

/**
 * The codec the relay backend uses: the key follows the code kept on this
 * device, read on every call; a blob that is not an envelope is refused,
 * since nothing on the relay was ever plain and the id is the only access
 * control there is.
 */
export const relayCodec: PayloadCodec = createSyncCodec(
  {
    read: keyFromStoredCode,
    write: keyFromStoredCode,
  },
  { allowPlaintext: false },
);

async function keyFromStoredCode() {
  const code = await loadRelayCode();
  return code === null ? null : (await deriveRelayIdentity(code)).key;
}

function relayApi(): RelayApi {
  return createRelayApi(relayOptions());
}

async function switchOn(code: string): Promise<void> {
  await saveRelayCode(code);
  await saveSyncConfig({ backend: "relay" });
  await clearSyncCheckpoint();
  await requestSyncNow();
}

/**
 * Starts syncing with a new code, and hands the code back for the user to
 * carry to their other browsers. The blob is claimed right away with an
 * empty payload: a browser with no notes yet would otherwise never push,
 * and a second browser joining would find nothing under the code and take
 * it for a typo.
 */
export async function connectWithNewCode(): Promise<string> {
  const api = relayApi();
  await ensureDataCollectionAllowed();

  const code = generateSyncCode();
  const { blobId, key } = await deriveRelayIdentity(code);
  const claim = createSyncCodec({ read: async () => key, write: async () => key });
  await api.put(blobId, await claim.encode(createSyncPayload([], Date.now())), null);

  await switchOn(code);
  return code;
}

/**
 * Joins the notes another browser syncs under `code`. The blob has to be
 * there: a code that names nothing is most likely mistyped, and syncing an
 * empty blob under it would quietly split the notes in two.
 */
export async function connectWithCode(code: string): Promise<void> {
  const api = relayApi();
  await ensureDataCollectionAllowed();

  const raw = normalizeSyncCode(code);
  if (raw === null) {
    throw new SyncCodeError(
      "That is not a sync code: one has 24 letters and digits, usually in groups of four.",
    );
  }
  const { blobId } = await deriveRelayIdentity(raw);
  if ((await api.head(blobId)) === null) {
    throw new SyncCodeError(
      "No notes are stored under this code. Check it for a typo, or create a new code on the browser that has the notes.",
    );
  }

  await switchOn(raw);
}

/**
 * Switches syncing off and forgets the code; the notes on this device stay
 * as they are. Deleting the blob, when asked for, comes after the config is
 * gone, so no new run writes it back; if the delete fails, syncing is
 * switched back on and the failure handed back.
 */
export async function disconnectRelay(options: { deleteRemoteCopy: boolean }): Promise<void> {
  await saveSyncConfig(null);
  if (options.deleteRemoteCopy) {
    try {
      const code = await loadRelayCode();
      if (code !== null) await relayApi().delete((await deriveRelayIdentity(code)).blobId);
    } catch (error) {
      await saveSyncConfig({ backend: "relay" });
      throw error;
    }
  }
  await saveRelayCode(null);
}
