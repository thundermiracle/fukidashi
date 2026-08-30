import type { SyncPayload } from "@/core";
import { type RemoteSnapshot, type SyncBackend, SyncConflictError } from "@/services/sync";

/**
 * An in-memory stand-in for a sync backend, with the optimistic locking a
 * real one provides: every push bumps the version, and pushing against a
 * stale one is refused the way an ETag mismatch would be.
 */
export function createFakeSyncBackend(): SyncBackend & {
  /** What the remote holds, for a test to read or plant directly. */
  snapshot: () => RemoteSnapshot | null;
  put: (payload: SyncPayload) => void;
  pulls: () => number;
} {
  let stored: RemoteSnapshot | null = null;
  let revision = 0;
  let pulls = 0;

  const put = (payload: SyncPayload) => {
    revision += 1;
    stored = { payload, version: `v${revision}` };
  };

  return {
    async pull() {
      pulls += 1;
      return stored;
    },
    async push(payload, baseVersion) {
      if ((stored?.version ?? null) !== baseVersion) throw new SyncConflictError();
      put(payload);
      return stored?.version ?? "";
    },
    snapshot: () => stored,
    put,
    pulls: () => pulls,
  };
}
