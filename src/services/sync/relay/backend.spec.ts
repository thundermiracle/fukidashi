import { beforeEach, describe, expect, it } from "vitest";
import { createSyncPayload, type Note, SyncPayloadError } from "@/core";
import { createFakeRelay } from "@/testing/fakeRelay";
import { SyncConflictError } from "../backend";
import { toBase64 } from "../bytes";
import { createSyncCodec, encryptPayload, readEnvelopeIfAny, SyncPassphraseError } from "../codec";
import type { SyncKey } from "../key";
import { BlobTooLargeError, createRelayApi, RelayApiError } from "./api";
import { createRelayBackend } from "./backend";

const BLOB_ID = "0123456789abcdef0123456789abcdef";
const PAGE = "https://example.com/docs";

function keyOf(fill: number): SyncKey {
  return { kdf: { name: "HKDF-SHA256" }, key: toBase64(new Uint8Array(32).fill(fill)) };
}

const KEY = keyOf(7);

function makeNote(id: string, comment: string): Note {
  return {
    id,
    comment,
    color: "yellow",
    anchor: { exact: `quote ${id}`, prefix: "", suffix: "", start: 0 },
    createdAt: 100,
    updatedAt: 100,
  };
}

/** A payload that reads as `comment`, so tests can tell copies apart. */
function payload(comment: string) {
  return createSyncPayload([{ url: PAGE, notes: [makeNote("a", comment)] }], 500);
}

let relay: ReturnType<typeof createFakeRelay>;

function backend(key: SyncKey = KEY) {
  const codec = createSyncCodec(
    { read: async () => key, write: async () => key },
    { allowPlaintext: false },
  );
  return createRelayBackend(
    createRelayApi({ baseUrl: relay.baseUrl }, relay.fetch),
    BLOB_ID,
    codec,
  );
}

beforeEach(() => {
  relay = createFakeRelay();
});

describe("a relay behind a proxy that weakens its ETags", () => {
  /**
   * Cloudflare compresses a JSON answer, and marks the tag it passes on as
   * weak; a HEAD has no body to compress, so its tag comes through as the
   * relay wrote it. The two have to name the same version all the same.
   */
  function weakened() {
    const fetchImpl: typeof fetch = async (input, init) => {
      const response = await relay.fetch(input, init);
      const etag = response.headers.get("ETag");
      if (etag === null || new Request(input, init).method === "HEAD") return response;
      const headers = new Headers(response.headers);
      headers.set("ETag", `W/${etag}`);
      return new Response(response.body, { status: response.status, headers });
    };
    const codec = createSyncCodec(
      { read: async () => KEY, write: async () => KEY },
      { allowPlaintext: false },
    );
    return createRelayBackend(
      createRelayApi({ baseUrl: relay.baseUrl }, fetchImpl),
      BLOB_ID,
      codec,
    );
  }

  it("reads one version from a pull and a peek, and writes over it", async () => {
    const backend = weakened();
    await backend.push(payload("one"), null);

    const read = await backend.pull();
    expect(read?.version).toBe(await backend.peek?.());

    await expect(backend.push(payload("two"), read?.version ?? null)).resolves.toBeDefined();
    await expect(backend.pull()).resolves.toMatchObject({ payload: payload("two") });
  });

  it("still refuses to write over a version it did not read", async () => {
    const backend = weakened();
    await backend.push(payload("one"), null);
    await backend.push(payload("two"), '"1"');

    await expect(backend.push(payload("three"), '"1"')).rejects.toThrow(SyncConflictError);
  });
});

describe("createRelayBackend", () => {
  it("finds nothing on a fresh relay", async () => {
    await expect(backend().pull()).resolves.toBeNull();
    await expect(backend().peek?.()).resolves.toBeNull();
  });

  it("creates the blob on the first push and reads it back", async () => {
    await expect(backend().push(payload("one"), null)).resolves.toBe('"1"');

    await expect(backend().pull()).resolves.toEqual({
      payload: payload("one"),
      version: '"1"',
      rewrite: false,
    });
    const stored = relay.content(BLOB_ID) ?? "";
    expect(readEnvelopeIfAny(stored)).not.toBeNull();
    expect(stored).not.toContain("one");
  });

  it("asks only for the version when peeking", async () => {
    await backend().push(payload("one"), null);
    const before = relay.requests.length;

    await expect(backend().peek?.()).resolves.toBe('"1"');

    expect(relay.requests.slice(before)).toEqual([
      { method: "HEAD", url: `${relay.baseUrl}/v1/blob/${BLOB_ID}` },
    ]);
  });

  it("writes over the version it read, and the version moves on", async () => {
    await backend().push(payload("one"), null);

    await expect(backend().push(payload("two"), '"1"')).resolves.toBe('"2"');

    await expect(backend().pull()).resolves.toMatchObject({
      payload: payload("two"),
      version: '"2"',
    });
  });

  it("refuses to write over a version it did not read", async () => {
    await backend().push(payload("one"), null);
    await backend().push(payload("two"), '"1"');

    await expect(backend().push(payload("three"), '"1"')).rejects.toThrow(SyncConflictError);
    await expect(backend().push(payload("three"), null)).rejects.toThrow(SyncConflictError);
  });

  it("refuses a blob that is not encrypted", async () => {
    relay.plant(BLOB_ID, JSON.stringify(payload("plain")));

    await expect(backend().pull()).rejects.toThrow(SyncPayloadError);
  });

  it("tells a blob encrypted under another code apart from a broken one", async () => {
    relay.plant(BLOB_ID, await encryptPayload(payload("theirs"), keyOf(8)));

    await expect(backend().pull()).rejects.toThrow(SyncPassphraseError);
  });

  it("refuses to send notes the relay would not take", async () => {
    const huge = createSyncPayload(
      [{ url: PAGE, notes: [makeNote("a", "x".repeat(2 * 1024 * 1024))] }],
      500,
    );

    await expect(backend().push(huge, null)).rejects.toThrow(BlobTooLargeError);
    expect(relay.requests).toEqual([]);
  });

  it("hands on a relay that asks for a pause", async () => {
    for (let i = 0; i < 60; i++) await backend().peek?.();

    await expect(backend().pull()).rejects.toThrow(RelayApiError);
    await expect(backend().pull()).rejects.toMatchObject({ status: 429 });
  });

  it("says what a relay that answered badly said", async () => {
    const broken = createRelayApi(
      { baseUrl: relay.baseUrl },
      async () => new Response(JSON.stringify({ error: "The relay is resting." }), { status: 503 }),
    );

    await expect(broken.get(BLOB_ID)).rejects.toThrow("The relay is resting.");
    await expect(
      createRelayApi(
        { baseUrl: relay.baseUrl },
        async () => new Response("x", { status: 500 }),
      ).get(BLOB_ID),
    ).rejects.toThrow(/500/);
  });
});
