import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSyncPayload, digestSyncPages, type Note, type SyncPayload } from "@/core";
import { SYNC_NOW } from "@/services/messages";
import { createFakeChromeIdentity } from "@/testing/fakeChromeIdentity";
import { createFakeChromeRuntime } from "@/testing/fakeChromeRuntime";
import { createFakeChromeStorage } from "@/testing/fakeChromeStorage";
import { createFakeDrive } from "@/testing/fakeDrive";
import { saveNote } from "../../notes";
import { SyncSignedOutError } from "../backend";
import { loadSyncCheckpoint, saveSyncCheckpoint } from "../checkpoint";
import {
  deriveSyncKey,
  encryptPayload,
  randomSalt,
  readEnvelopeIfAny,
  SyncPassphraseError,
} from "../codec";
import { saveSyncConfig } from "../config";
import { storedKeyCodec } from "../configured";
import { loadSyncKey, saveSyncKey } from "../key";
import { collectSyncPages } from "../storage";
import { saveDriveToken } from "./auth";
import { DRIVE_FILE_NAME } from "./backend";
import { removeSyncPassphrase, setSyncPassphrase } from "./passphrase";

/** Real enough to exercise the derivation, cheap enough for a test. */
const ITERATIONS = 1_000;
const PAGE = "https://example.com/docs";
const HOUR = 3_600_000;

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

/** What another browser left in Drive. */
const theirs = createSyncPayload(
  [{ url: PAGE, notes: [makeNote("a", "from another browser")] }],
  500,
);

let storage: ReturnType<typeof createFakeChromeStorage>;
let identity: ReturnType<typeof createFakeChromeIdentity>;
let runtime: ReturnType<typeof createFakeChromeRuntime>;
let drive: ReturnType<typeof createFakeDrive>;
let sent: unknown[];

/** A device that signed in earlier, with a token Drive still takes. */
async function connectedEarlier() {
  await saveDriveToken({
    accessToken: "tok-1",
    expiresAt: Date.now() + HOUR,
    email: "me@example.com",
  });
  await saveSyncConfig({ backend: "drive" });
  drive.accept("tok-1", "me@example.com");
}

/** Makes Google refuse the token, and the browser refuse to renew it. */
function signedOut() {
  drive.revoke("tok-1");
  identity.refuse(new Error("User interaction required."));
}

function copy(): string {
  return drive.content(DRIVE_FILE_NAME) ?? "";
}

beforeEach(() => {
  storage = createFakeChromeStorage();
  identity = createFakeChromeIdentity();
  runtime = createFakeChromeRuntime();
  drive = createFakeDrive();
  sent = [];
  runtime.listeners.onMessage.add((message) => sent.push(message));
  vi.stubGlobal("chrome", { ...storage.chrome, ...identity.chrome, ...runtime.chrome });
  vi.stubGlobal("fetch", drive.fetch);
  vi.stubEnv("WXT_GOOGLE_CLIENT_ID", "client-1");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("setSyncPassphrase", () => {
  it("derives a fresh key over a plaintext copy, forgets the checkpoint and asks for a sync", async () => {
    await connectedEarlier();
    drive.plant(DRIVE_FILE_NAME, JSON.stringify(theirs));
    await saveSyncCheckpoint({ version: "file-1:1", digest: "digest" });

    await setSyncPassphrase("correct horse", { iterations: ITERATIONS });

    await expect(loadSyncKey()).resolves.not.toBeNull();
    // The copy is left to the round asked for, which reads it and writes it back.
    expect(copy()).toBe(JSON.stringify(theirs));
    await expect(loadSyncCheckpoint()).resolves.toBeNull();
    expect(sent).toEqual([{ type: SYNC_NOW }]);
  });

  it("derives a fresh key when there is no copy at all", async () => {
    await connectedEarlier();

    await setSyncPassphrase("correct horse", { iterations: ITERATIONS });

    await expect(loadSyncKey()).resolves.not.toBeNull();
    expect(sent).toEqual([{ type: SYNC_NOW }]);
  });

  it("derives the key the way an encrypted copy was, and checks that it opens", async () => {
    await connectedEarlier();
    const key = await deriveSyncKey("correct horse", randomSalt(), ITERATIONS);
    drive.plant(DRIVE_FILE_NAME, await encryptPayload(theirs, key));

    await setSyncPassphrase("correct horse");

    await expect(loadSyncKey()).resolves.toEqual(key);
    expect(sent).toEqual([{ type: SYNC_NOW }]);
  });

  it("keeps deriving the way the copy was, so a third browser can follow", async () => {
    await connectedEarlier();
    const key = await deriveSyncKey("correct horse", randomSalt(), ITERATIONS);
    drive.plant(DRIVE_FILE_NAME, await encryptPayload(theirs, key));

    await setSyncPassphrase("correct horse");

    const written = await storedKeyCodec.encode(theirs);
    expect(readEnvelopeIfAny(written)).toMatchObject({
      kdf: { iterations: ITERATIONS, salt: key.salt },
    });
  });

  it("refuses a passphrase that does not open the copy, and keeps nothing", async () => {
    await connectedEarlier();
    const key = await deriveSyncKey("correct horse", randomSalt(), ITERATIONS);
    drive.plant(DRIVE_FILE_NAME, await encryptPayload(theirs, key));

    await expect(setSyncPassphrase("wrong horse")).rejects.toThrow(SyncPassphraseError);

    await expect(loadSyncKey()).resolves.toBeNull();
    expect(sent).toEqual([]);
  });

  it("replaces a key that was derived apart from the copy's", async () => {
    await connectedEarlier();
    await saveSyncKey(await deriveSyncKey("correct horse", randomSalt(), ITERATIONS));
    const key = await deriveSyncKey("correct horse", randomSalt(), ITERATIONS);
    drive.plant(DRIVE_FILE_NAME, await encryptPayload(theirs, key));

    await setSyncPassphrase("correct horse");

    await expect(loadSyncKey()).resolves.toEqual(key);
  });

  it("cannot be set while signed out", async () => {
    await connectedEarlier();
    drive.plant(DRIVE_FILE_NAME, JSON.stringify(theirs));
    signedOut();

    await expect(setSyncPassphrase("correct horse", { iterations: ITERATIONS })).rejects.toThrow(
      SyncSignedOutError,
    );

    await expect(loadSyncKey()).resolves.toBeNull();
    expect(sent).toEqual([]);
  });
});

describe("removeSyncPassphrase", () => {
  it("forgets the key and writes the copy back as plaintext, with this device's notes taken in", async () => {
    await connectedEarlier();
    const key = await deriveSyncKey("correct horse", randomSalt(), ITERATIONS);
    await saveSyncKey(key);
    drive.plant(DRIVE_FILE_NAME, await encryptPayload(theirs, key));
    await saveNote(PAGE, makeNote("b", "from this browser"));

    await removeSyncPassphrase();

    await expect(loadSyncKey()).resolves.toBeNull();
    expect(readEnvelopeIfAny(copy())).toBeNull();
    const written = JSON.parse(copy()) as SyncPayload;
    expect(written.pages[0].notes.map((note) => note.id)).toEqual(["a", "b"]);
    expect(sent).toEqual([{ type: SYNC_NOW }]);
  });

  it("rewrites the copy even when the last round found nothing to do", async () => {
    await connectedEarlier();
    const key = await deriveSyncKey("correct horse", randomSalt(), ITERATIONS);
    await saveSyncKey(key);
    await saveNote(PAGE, makeNote("a", "from another browser"));
    const planted = drive.plant(DRIVE_FILE_NAME, await encryptPayload(theirs, key));
    // What the last round recorded: the copy at this version holds these very notes.
    await saveSyncCheckpoint({
      version: `${planted.id}:${planted.version}`,
      digest: digestSyncPages(await collectSyncPages()),
    });

    await removeSyncPassphrase();

    expect(readEnvelopeIfAny(copy())).toBeNull();
    expect((JSON.parse(copy()) as SyncPayload).pages[0].notes.map((note) => note.id)).toEqual([
      "a",
    ]);
  });

  it("does nothing while there is no passphrase", async () => {
    await connectedEarlier();
    drive.plant(DRIVE_FILE_NAME, JSON.stringify(theirs));

    await removeSyncPassphrase();

    expect(drive.requests).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("keeps the key when the copy could not be rewritten", async () => {
    await connectedEarlier();
    const key = await deriveSyncKey("correct horse", randomSalt(), ITERATIONS);
    await saveSyncKey(key);
    drive.plant(DRIVE_FILE_NAME, await encryptPayload(theirs, key));
    signedOut();

    await expect(removeSyncPassphrase()).rejects.toThrow(SyncSignedOutError);

    await expect(loadSyncKey()).resolves.toEqual(key);
    expect(readEnvelopeIfAny(copy())).not.toBeNull();
    expect(sent).toEqual([]);
  });

  it("keeps the key when the copy was encrypted with another passphrase since", async () => {
    await connectedEarlier();
    const key = await deriveSyncKey("correct horse", randomSalt(), ITERATIONS);
    await saveSyncKey(key);
    const other = await deriveSyncKey("other words", randomSalt(), ITERATIONS);
    drive.plant(DRIVE_FILE_NAME, await encryptPayload(theirs, other));

    await expect(removeSyncPassphrase()).rejects.toThrow(SyncPassphraseError);

    await expect(loadSyncKey()).resolves.toEqual(key);
  });
});
