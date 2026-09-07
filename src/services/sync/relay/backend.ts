import { type SyncBackend, SyncConflictError } from "../backend";
import type { PayloadCodec } from "../codec";
import { type RelayApi, RelayApiError } from "./api";

/**
 * The notes kept as one blob on the sync-code relay. The relay has the
 * If-Match that Drive lacks, so a push either lands on the version it read
 * or is refused outright — nothing to repair afterwards. The blob is always
 * an envelope: the codec handed in refuses anything else.
 */
export function createRelayBackend(
  api: RelayApi,
  blobId: string,
  codec: PayloadCodec,
): SyncBackend {
  return {
    peek: () => api.head(blobId),

    async pull() {
      const found = await api.get(blobId);
      if (!found) return null;
      const { payload, rewrite } = await codec.decode(found.body);
      return { payload, version: found.version, rewrite };
    },

    async push(payload, baseVersion) {
      try {
        return await api.put(blobId, await codec.encode(payload), baseVersion);
      } catch (error) {
        if (error instanceof RelayApiError && error.status === 412) throw new SyncConflictError();
        throw error;
      }
    },
  };
}
