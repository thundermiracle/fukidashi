import type { SyncPayload } from "@/core";

/** What a backend hands back, with the version to push against next. */
export interface RemoteSnapshot {
  payload: SyncPayload;
  /** Opaque to the engine — an ETag, a revision id, whatever the store uses. */
  version: string;
}

/** Thrown by `push` when the remote moved on since `baseVersion` was read. */
export class SyncConflictError extends Error {
  constructor(message = "The remote copy changed while this device was syncing.") {
    super(message);
  }
}

/**
 * Thrown when the backend cannot go on without the user signing in again —
 * a token that could not be renewed silently, say. The scheduler then stops
 * trying until the settings page brings the user back.
 */
export class SyncSignedOutError extends Error {
  constructor(message = "Sign in again to keep syncing.") {
    super(message);
  }
}

/**
 * Somewhere a device's notes can be left for its other devices to find.
 * Deliberately small: a store that can read, write, and say whether it
 * changed underneath is enough for the engine, so Drive, a sync-code relay
 * and WebDAV can all sit behind it.
 */
export interface SyncBackend {
  /** The stored payload, or null when nothing has been pushed yet. */
  pull(): Promise<RemoteSnapshot | null>;
  /**
   * The version the remote copy has right now, without reading it — null
   * when nothing has been pushed yet. Optional: a backend without it is
   * read on every sync; one with it is only read when the version moved.
   */
  peek?(): Promise<string | null>;
  /**
   * Replaces the remote copy, but only if it still reads as `baseVersion`
   * (null meaning "nothing was there"). Throws `SyncConflictError` otherwise,
   * which is the engine's cue to pull, merge again and retry.
   *
   * Returns the version the payload now has.
   */
  push(payload: SyncPayload, baseVersion: string | null): Promise<string>;
}
