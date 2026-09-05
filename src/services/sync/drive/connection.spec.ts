import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYNC_NOW } from "@/services/messages";
import { createFakeChromeIdentity } from "@/testing/fakeChromeIdentity";
import { createFakeChromeRuntime } from "@/testing/fakeChromeRuntime";
import { createFakeChromeStorage } from "@/testing/fakeChromeStorage";
import { createFakeDrive } from "@/testing/fakeDrive";
import { SyncSignedOutError } from "../backend";
import { loadSyncConfig, saveSyncConfig } from "../config";
import { loadDriveToken, saveDriveToken } from "./auth";
import { DRIVE_FILE_NAME } from "./backend";
import { connectDrive, DataCollectionRefusedError, disconnectDrive } from "./connection";

const HOUR = 3_600_000;

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
  drive.plant(DRIVE_FILE_NAME, "{}");
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

describe("connectDrive", () => {
  it("signs in, switches syncing on and asks for a sync", async () => {
    identity.answerWith((state) => `access_token=tok-1&expires_in=3600&state=${state}`);
    drive.accept("tok-1", "me@example.com");

    const token = await connectDrive();

    expect(token.email).toBe("me@example.com");
    await expect(loadSyncConfig()).resolves.toEqual({ backend: "drive" });
    await expect(loadDriveToken()).resolves.toMatchObject({ accessToken: "tok-1" });
    expect(sent).toEqual([{ type: SYNC_NOW }]);
  });

  it("asks for a sync even when syncing was already on", async () => {
    await saveSyncConfig({ backend: "drive" });
    identity.answerWith((state) => `access_token=tok-2&expires_in=3600&state=${state}`);
    drive.accept("tok-2", "me@example.com");

    await connectDrive();

    expect(sent).toEqual([{ type: SYNC_NOW }]);
  });

  it("asks Firefox's permission for the data to leave, before anything else", async () => {
    vi.stubEnv("FIREFOX", "true");
    const request = vi.fn(async () => {
      // Asked before the sign-in window opens, while it still counts as the user's click.
      expect(identity.calls).toHaveLength(0);
      return true;
    });
    vi.stubGlobal("chrome", {
      ...storage.chrome,
      ...identity.chrome,
      ...runtime.chrome,
      permissions: { request },
    });
    identity.answerWith((state) => `access_token=tok-1&expires_in=3600&state=${state}`);
    drive.accept("tok-1", "me@example.com");

    await connectDrive();

    expect(request).toHaveBeenCalledWith({
      data_collection: ["browsingActivity", "websiteContent"],
    });
    expect(identity.calls).toHaveLength(1);
    await expect(loadSyncConfig()).resolves.toEqual({ backend: "drive" });
  });

  it("goes no further when Firefox's permission is refused", async () => {
    vi.stubEnv("FIREFOX", "true");
    vi.stubGlobal("chrome", {
      ...storage.chrome,
      ...identity.chrome,
      ...runtime.chrome,
      permissions: { request: async () => false },
    });

    await expect(connectDrive()).rejects.toThrow(DataCollectionRefusedError);

    expect(identity.calls).toHaveLength(0);
    await expect(loadSyncConfig()).resolves.toBeNull();
  });

  it("does not mind a Firefox that knows no such permission", async () => {
    vi.stubEnv("FIREFOX", "true");
    vi.stubGlobal("chrome", {
      ...storage.chrome,
      ...identity.chrome,
      ...runtime.chrome,
      permissions: {
        request: async () => {
          throw new TypeError("Type error for parameter permissions");
        },
      },
    });
    identity.answerWith((state) => `access_token=tok-1&expires_in=3600&state=${state}`);
    drive.accept("tok-1", "me@example.com");

    await expect(connectDrive()).resolves.toMatchObject({ email: "me@example.com" });
  });

  it("asks nothing of the kind elsewhere", async () => {
    const request = vi.fn(async () => true);
    vi.stubGlobal("chrome", {
      ...storage.chrome,
      ...identity.chrome,
      ...runtime.chrome,
      permissions: { request },
    });
    identity.answerWith((state) => `access_token=tok-1&expires_in=3600&state=${state}`);
    drive.accept("tok-1", "me@example.com");

    await connectDrive();

    expect(request).not.toHaveBeenCalled();
  });

  it("changes nothing when the sign-in did not go through", async () => {
    identity.answerWith((state) => `error=access_denied&state=${state}`);

    await expect(connectDrive()).rejects.toThrow("The sign-in was cancelled.");

    await expect(loadSyncConfig()).resolves.toBeNull();
    expect(sent).toEqual([]);
  });
});

describe("disconnectDrive", () => {
  it("switches syncing off and forgets the token, leaving the copy in Drive", async () => {
    await connectedEarlier();

    await disconnectDrive({ deleteRemoteCopy: false });

    await expect(loadSyncConfig()).resolves.toBeNull();
    await expect(loadDriveToken()).resolves.toBeNull();
    expect(drive.content(DRIVE_FILE_NAME)).toBe("{}");
    expect(drive.requests.map((request) => request.method)).toEqual(["POST"]);
  });

  it("deletes the copy in Drive when asked, before giving the token up", async () => {
    await connectedEarlier();

    await disconnectDrive({ deleteRemoteCopy: true });

    expect(drive.content(DRIVE_FILE_NAME)).toBeUndefined();
    await expect(loadSyncConfig()).resolves.toBeNull();
    await expect(loadDriveToken()).resolves.toBeNull();
    // Found, deleted, then revoked — in that order.
    expect(drive.requests.map((request) => request.method)).toEqual(["GET", "DELETE", "POST"]);
  });

  it("keeps syncing on when the copy could not be deleted", async () => {
    await connectedEarlier();
    drive.revoke("tok-1");
    identity.refuse(new Error("User interaction required."));

    await expect(disconnectDrive({ deleteRemoteCopy: true })).rejects.toThrow(SyncSignedOutError);

    await expect(loadSyncConfig()).resolves.toEqual({ backend: "drive" });
    await expect(loadDriveToken()).resolves.toMatchObject({ accessToken: "tok-1" });
    expect(drive.content(DRIVE_FILE_NAME)).toBe("{}");
  });
});
