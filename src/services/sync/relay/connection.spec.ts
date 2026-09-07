import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSyncPayload, type Note } from "@/core";
import { SYNC_NOW } from "@/services/messages";
import { createFakeChromeRuntime } from "@/testing/fakeChromeRuntime";
import { createFakeChromeStorage } from "@/testing/fakeChromeStorage";
import { createFakeRelay } from "@/testing/fakeRelay";
import { loadSyncCheckpoint, saveSyncCheckpoint } from "../checkpoint";
import { decryptEnvelope, encryptPayload, readEnvelope } from "../codec";
import { loadSyncConfig, saveSyncConfig } from "../config";
import { DataCollectionRefusedError } from "../dataCollection";
import { RelayApiError } from "./api";
import { deriveRelayIdentity, generateSyncCode, SyncCodeError } from "./code";
import { connectWithCode, connectWithNewCode, disconnectRelay } from "./connection";
import { loadRelayCode, saveRelayCode } from "./store";

const PAGE = "https://example.com/docs";

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

const theirs = createSyncPayload(
  [{ url: PAGE, notes: [makeNote("a", "from another browser")] }],
  500,
);

let storage: ReturnType<typeof createFakeChromeStorage>;
let runtime: ReturnType<typeof createFakeChromeRuntime>;
let relay: ReturnType<typeof createFakeRelay>;
let sent: unknown[];

/** A code another browser created, with its blob on the relay. */
async function codeInUse(): Promise<string> {
  const code = generateSyncCode();
  const { blobId, key } = await deriveRelayIdentity(code);
  relay.plant(blobId, await encryptPayload(theirs, key));
  return code;
}

async function contentUnder(code: string) {
  const { blobId, key } = await deriveRelayIdentity(code);
  const text = relay.content(blobId);
  if (text === undefined) return undefined;
  return decryptEnvelope(readEnvelope(JSON.parse(text)), key);
}

beforeEach(() => {
  storage = createFakeChromeStorage();
  runtime = createFakeChromeRuntime();
  relay = createFakeRelay();
  sent = [];
  runtime.listeners.onMessage.add((message) => sent.push(message));
  vi.stubGlobal("chrome", { ...storage.chrome, ...runtime.chrome });
  vi.stubGlobal("fetch", relay.fetch);
  vi.stubEnv("WXT_SYNC_RELAY_URL", `${relay.baseUrl}/`);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("connectWithNewCode", () => {
  it("claims a blob under a new code, keeps the code, switches syncing on and asks for a sync", async () => {
    const code = await connectWithNewCode();

    await expect(loadRelayCode()).resolves.toBe(code);
    await expect(loadSyncConfig()).resolves.toEqual({ backend: "relay" });
    await expect(contentUnder(code)).resolves.toMatchObject({ pages: [] });
    expect(sent).toEqual([{ type: SYNC_NOW }]);
  });

  it("cannot connect from a build without a relay address", async () => {
    vi.stubEnv("WXT_SYNC_RELAY_URL", "");

    await expect(connectWithNewCode()).rejects.toThrow(/relay address/);

    await expect(loadSyncConfig()).resolves.toBeNull();
    expect(relay.requests).toEqual([]);
  });

  it("asks Firefox's permission for the data to leave, before anything else", async () => {
    vi.stubEnv("FIREFOX", "true");
    const request = vi.fn(async () => true);
    vi.stubGlobal("chrome", { ...storage.chrome, ...runtime.chrome, permissions: { request } });

    await connectWithNewCode();

    expect(request).toHaveBeenCalledWith({
      data_collection: ["browsingActivity", "websiteContent"],
    });
    await expect(loadSyncConfig()).resolves.toEqual({ backend: "relay" });
  });

  it("goes no further when Firefox's permission is refused", async () => {
    vi.stubEnv("FIREFOX", "true");
    const request = vi.fn(async () => false);
    vi.stubGlobal("chrome", { ...storage.chrome, ...runtime.chrome, permissions: { request } });

    await expect(connectWithNewCode()).rejects.toThrow(DataCollectionRefusedError);

    await expect(loadSyncConfig()).resolves.toBeNull();
    await expect(loadRelayCode()).resolves.toBeNull();
    expect(relay.requests).toEqual([]);
  });
});

describe("connectWithCode", () => {
  it("joins the notes another browser syncs under the code, however it was typed", async () => {
    const code = await codeInUse();
    await saveSyncCheckpoint({ version: '"9"', digest: "old" });

    await connectWithCode(code.toLowerCase().replaceAll("-", " "));

    await expect(loadRelayCode()).resolves.toBe(code);
    await expect(loadSyncConfig()).resolves.toEqual({ backend: "relay" });
    await expect(loadSyncCheckpoint()).resolves.toBeNull();
    expect(sent).toEqual([{ type: SYNC_NOW }]);
    // The blob is left for the round asked for.
    await expect(contentUnder(code)).resolves.toEqual(theirs);
  });

  it("refuses text that is not a code", async () => {
    await expect(connectWithCode("not a code")).rejects.toThrow(SyncCodeError);

    await expect(loadSyncConfig()).resolves.toBeNull();
    expect(relay.requests).toEqual([]);
  });

  it("refuses a code that names nothing, as a likely typo", async () => {
    await expect(connectWithCode(generateSyncCode())).rejects.toThrow(/No notes are stored/);

    await expect(loadSyncConfig()).resolves.toBeNull();
    await expect(loadRelayCode()).resolves.toBeNull();
    expect(sent).toEqual([]);
  });

  it("asks Firefox's permission for the data to leave", async () => {
    vi.stubEnv("FIREFOX", "true");
    const request = vi.fn(async () => false);
    vi.stubGlobal("chrome", { ...storage.chrome, ...runtime.chrome, permissions: { request } });

    await expect(connectWithCode(await codeInUse())).rejects.toThrow(DataCollectionRefusedError);

    await expect(loadSyncConfig()).resolves.toBeNull();
  });
});

describe("disconnectRelay", () => {
  async function connectedEarlier(): Promise<string> {
    const code = await codeInUse();
    await saveRelayCode(code);
    await saveSyncConfig({ backend: "relay" });
    return code;
  }

  it("switches syncing off and forgets the code, leaving the blob", async () => {
    const code = await connectedEarlier();

    await disconnectRelay({ deleteRemoteCopy: false });

    await expect(loadSyncConfig()).resolves.toBeNull();
    await expect(loadRelayCode()).resolves.toBeNull();
    await expect(contentUnder(code)).resolves.toEqual(theirs);
    expect(relay.requests).toEqual([]);
  });

  it("deletes the blob when asked", async () => {
    const code = await connectedEarlier();

    await disconnectRelay({ deleteRemoteCopy: true });

    await expect(contentUnder(code)).resolves.toBeUndefined();
    await expect(loadSyncConfig()).resolves.toBeNull();
    await expect(loadRelayCode()).resolves.toBeNull();
    expect(relay.requests.map((request) => request.method)).toEqual(["DELETE"]);
  });

  it("keeps syncing on when the blob could not be deleted", async () => {
    const code = await connectedEarlier();
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "DELETE"
        ? new Response(JSON.stringify({ error: "The relay is resting." }), { status: 503 })
        : relay.fetch(input, init),
    );

    await expect(disconnectRelay({ deleteRemoteCopy: true })).rejects.toThrow(RelayApiError);

    await expect(loadSyncConfig()).resolves.toEqual({ backend: "relay" });
    await expect(loadRelayCode()).resolves.toBe(code);
    await expect(contentUnder(code)).resolves.toEqual(theirs);
  });
});
