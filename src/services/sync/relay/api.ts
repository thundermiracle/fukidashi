/**
 * The relay's few calls, as the extension makes them (relay/src/worker.ts
 * is the other side). Versions are the ETags the relay hands out, opaque
 * here; the preconditions they go into are what give the engine its
 * compare-and-swap.
 */

/** The relay's cap on a blob (relay/src/worker.ts), mirrored so a payload too large never leaves the device. */
export const MAX_BLOB_BYTES = 1_900_000;

export interface RelayOptions {
  /** Where the relay answers, without a trailing slash. */
  baseUrl: string;
}

/** Thrown when the relay answers with something other than what was asked for. */
export class RelayApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Thrown before an upload the relay would refuse for its size. */
export class BlobTooLargeError extends Error {
  constructor() {
    super("The notes are too large to sync through the relay (the cap is just under 2 MB).");
  }
}

export interface RelayApi {
  /** The blob's version, or null when there is none — without reading it. */
  head(id: string): Promise<string | null>;
  /** The blob and its version, or null when there is none. */
  get(id: string): Promise<{ version: string; body: string } | null>;
  /**
   * Writes the blob, creating it when `baseVersion` is null and otherwise
   * only over that version. Answers with the version written; a 412 comes
   * back as `RelayApiError` for the backend to read as a conflict.
   */
  put(id: string, body: string, baseVersion: string | null): Promise<string>;
  delete(id: string): Promise<void>;
}

/** The relay address this build was given, or an error saying it was not. */
export function relayOptions(): RelayOptions {
  const baseUrl = import.meta.env.WXT_SYNC_RELAY_URL;
  if (!baseUrl) {
    throw new Error("This build carries no relay address, so it cannot sync with a code.");
  }
  return { baseUrl: baseUrl.replace(/\/+$/, "") };
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

async function describeFailure(response: Response): Promise<RelayApiError> {
  let message = `The relay answered ${response.status} ${response.statusText}`.trim();
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") message = body.error;
  } catch {
    // The body was not the relay's usual JSON; the status is all there is.
  }
  return new RelayApiError(response.status, message);
}

export function createRelayApi(
  options: RelayOptions,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): RelayApi {
  const urlOf = (id: string) => `${options.baseUrl}/v1/blob/${id}`;
  const versionOf = (response: Response): string => {
    const etag = response.headers.get("ETag");
    if (!etag) throw new RelayApiError(response.status, "The relay named no version.");
    // A proxy that compresses the answer marks the tag it passes on as weak.
    // It still names the version the relay wrote, and a HEAD — with no body
    // to compress — gives the same one unmarked, so the `W/` goes: otherwise
    // one round's version would never match the next one's.
    return etag.replace(/^W\//, "");
  };

  return {
    async head(id) {
      const response = await fetchImpl(urlOf(id), { method: "HEAD" });
      if (response.status === 404) return null;
      if (!response.ok) throw await describeFailure(response);
      return versionOf(response);
    },

    async get(id) {
      const response = await fetchImpl(urlOf(id), { method: "GET" });
      if (response.status === 404) return null;
      if (!response.ok) throw await describeFailure(response);
      return { version: versionOf(response), body: await response.text() };
    },

    async put(id, body, baseVersion) {
      if (byteLength(body) > MAX_BLOB_BYTES) throw new BlobTooLargeError();
      const response = await fetchImpl(urlOf(id), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(baseVersion === null ? { "If-None-Match": "*" } : { "If-Match": baseVersion }),
        },
        body,
      });
      if (!response.ok) throw await describeFailure(response);
      return versionOf(response);
    },

    async delete(id) {
      const response = await fetchImpl(urlOf(id), { method: "DELETE" });
      if (!response.ok && response.status !== 404) throw await describeFailure(response);
    },
  };
}
