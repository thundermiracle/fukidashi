import { beforeAll, describe, expect, it } from "vitest";
import { createSyncPayload, type Note, SyncPayloadError, SyncVersionError } from "@/core";
import {
  createSyncCodec,
  deriveSyncKey,
  ENVELOPE_VERSION,
  encryptPayload,
  isEnvelope,
  jsonCodec,
  type PayloadCodec,
  randomSalt,
  readEnvelopeIfAny,
  SyncPassphraseError,
} from "./codec";
import type { SyncKey } from "./key";

/** Real enough to exercise the derivation, cheap enough for a test. */
const ITERATIONS = 1_000;

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

const payload = createSyncPayload(
  [{ url: "https://example.com/docs", notes: [makeNote("a", "hello there")] }],
  500,
);

let key: SyncKey;
let wrongKey: SyncKey;

beforeAll(async () => {
  const salt = randomSalt();
  key = await deriveSyncKey("correct horse", salt, ITERATIONS);
  wrongKey = await deriveSyncKey("wrong horse", salt, ITERATIONS);
});

function encrypting(withKey: SyncKey = key): PayloadCodec {
  return createSyncCodec({ read: async () => withKey, write: async () => withKey });
}

describe("jsonCodec", () => {
  it("writes a payload out and reads it back", async () => {
    await expect(jsonCodec.decode(await jsonCodec.encode(payload))).resolves.toEqual({
      payload,
      rewrite: false,
    });
  });

  it("refuses text that is not JSON", async () => {
    await expect(jsonCodec.decode("not json")).rejects.toThrow(SyncPayloadError);
    await expect(jsonCodec.decode("not json")).rejects.not.toThrow(SyncVersionError);
  });

  it("tells a copy from a newer version apart from a broken one", async () => {
    await expect(jsonCodec.decode(JSON.stringify({ version: 99, pages: [] }))).rejects.toThrow(
      SyncVersionError,
    );
  });

  it("reports an encrypted copy rather than calling it broken", async () => {
    const text = await encryptPayload(payload, key);

    await expect(jsonCodec.decode(text)).rejects.toThrow(SyncPassphraseError);
    await expect(jsonCodec.decode(text)).rejects.not.toThrow(SyncPayloadError);
  });
});

describe("the encrypting codec", () => {
  it("writes an envelope out and reads the payload back", async () => {
    const text = await encrypting().encode(payload);

    expect(isEnvelope(JSON.parse(text))).toBe(true);
    expect(text).not.toContain("hello there");
    expect(text).not.toContain("example.com");
    await expect(encrypting().decode(text)).resolves.toEqual({ payload, rewrite: false });
  });

  it("writes the same notes out differently every time", async () => {
    const codec = encrypting();

    expect(await codec.encode(payload)).not.toBe(await codec.encode(payload));
  });

  it("reads a plaintext copy, and asks for it to be written back", async () => {
    await expect(encrypting().decode(JSON.stringify(payload))).resolves.toEqual({
      payload,
      rewrite: true,
    });
  });

  it("refuses an envelope written with another passphrase", async () => {
    const text = await encrypting().encode(payload);

    await expect(encrypting(wrongKey).decode(text)).rejects.toThrow(SyncPassphraseError);
  });

  it("refuses an envelope whose key was derived with another salt", async () => {
    const text = await encrypting().encode(payload);
    const sameWordsOtherSalt = await deriveSyncKey("correct horse", randomSalt(), ITERATIONS);

    await expect(encrypting(sameWordsOtherSalt).decode(text)).rejects.toThrow(SyncPassphraseError);
  });

  it("refuses an envelope whose key took another number of rounds", async () => {
    const text = await encrypting().encode(payload);
    const sameWordsOtherRounds = await deriveSyncKey("correct horse", key.salt, ITERATIONS + 1);

    await expect(encrypting(sameWordsOtherRounds).decode(text)).rejects.toThrow(
      SyncPassphraseError,
    );
  });

  it("refuses an envelope that was tampered with", async () => {
    const envelope = JSON.parse(await encrypting().encode(payload)) as { ciphertext: string };
    const flipped = envelope.ciphertext.startsWith("A") ? "B" : "A";
    envelope.ciphertext = flipped + envelope.ciphertext.slice(1);

    await expect(encrypting().decode(JSON.stringify(envelope))).rejects.toThrow(
      SyncPassphraseError,
    );
  });

  it("tells an envelope from a newer version apart from a broken one", async () => {
    const envelope = JSON.parse(await encrypting().encode(payload)) as Record<string, unknown>;

    await expect(
      encrypting().decode(JSON.stringify({ ...envelope, version: ENVELOPE_VERSION + 1 })),
    ).rejects.toThrow(SyncVersionError);
    await expect(
      encrypting().decode(JSON.stringify({ ...envelope, cipher: "ROT13" })),
    ).rejects.toThrow(SyncPayloadError);
  });

  it("refuses an envelope that would take forever to derive a key for", async () => {
    const envelope = JSON.parse(await encrypting().encode(payload)) as {
      kdf: { iterations: number };
    };
    envelope.kdf.iterations = 1e12;

    await expect(encrypting().decode(JSON.stringify(envelope))).rejects.toThrow(SyncPayloadError);
  });

  it("keeps the passphrase out of the envelope, but not the salt", async () => {
    const text = await encrypting().encode(payload);

    expect(text).not.toContain("correct horse");
    expect(readEnvelopeIfAny(text)).toMatchObject({
      kdf: { iterations: ITERATIONS, salt: key.salt },
    });
  });
});

describe("deriveSyncKey", () => {
  it("derives the same key from the same passphrase, however it was typed", async () => {
    const salt = randomSalt();

    // Full-width letters, as a Japanese keyboard may leave them, normalize to
    // the same characters — so the same passphrase opens the copy anywhere.
    await expect(deriveSyncKey("ｐａｓｓ", salt, ITERATIONS)).resolves.toEqual(
      await deriveSyncKey("pass", salt, ITERATIONS),
    );
  });

  it("derives different keys from different passphrases", async () => {
    const salt = randomSalt();

    expect((await deriveSyncKey("one", salt, ITERATIONS)).key).not.toBe(
      (await deriveSyncKey("two", salt, ITERATIONS)).key,
    );
  });
});

describe("readEnvelopeIfAny", () => {
  it("returns null for a plaintext copy", () => {
    expect(readEnvelopeIfAny(JSON.stringify(payload))).toBeNull();
  });

  it("refuses text that is not JSON", () => {
    expect(() => readEnvelopeIfAny("not json")).toThrow(SyncPayloadError);
  });
});

describe("a codec retiring its key", () => {
  it("still opens an envelope with it, but writes plaintext and asks for the rewrite", async () => {
    const retiring = createSyncCodec({ read: async () => key, write: async () => null });
    const text = await encrypting().encode(payload);

    await expect(retiring.decode(text)).resolves.toEqual({ payload, rewrite: true });
    await expect(retiring.decode(JSON.stringify(payload))).resolves.toEqual({
      payload,
      rewrite: false,
    });
    await expect(retiring.encode(payload)).resolves.toBe(JSON.stringify(payload));
  });
});
