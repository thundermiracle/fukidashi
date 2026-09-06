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
  /** Plants a payload; `rewrite` marks it as one the codec would write differently. */
  put: (payload: SyncPayload, rewrite?: boolean) => void;
  /** How often the payload was read in full. */
  pulls: () => number;
  /** How often only the version was asked for. */
  peeks: () => number;
} {
  let stored: RemoteSnapshot | null = null;
  let revision = 0;
  let pulls = 0;
  let peeks = 0;

  const put = (payload: SyncPayload, rewrite = false) => {
    revision += 1;
    stored = { payload, version: `v${revision}`, ...(rewrite ? { rewrite } : {}) };
  };

  return {
    async pull() {
      pulls += 1;
      return stored;
    },
    async peek() {
      peeks += 1;
      return stored?.version ?? null;
    },
    async push(payload, baseVersion) {
      if ((stored?.version ?? null) !== baseVersion) throw new SyncConflictError();
      put(payload);
      return stored?.version ?? "";
    },
    snapshot: () => stored,
    put,
    pulls: () => pulls,
    peeks: () => peeks,
  };
}
