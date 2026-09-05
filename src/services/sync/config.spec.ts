import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeChromeStorage } from "@/testing/fakeChromeStorage";
import {
  isSyncConfigKey,
  loadSyncConfig,
  SYNC_CONFIG_KEY,
  saveSyncConfig,
  watchSyncConfig,
} from "./config";

let storage: ReturnType<typeof createFakeChromeStorage>;

beforeEach(() => {
  storage = createFakeChromeStorage();
  vi.stubGlobal("chrome", storage.chrome);
});

describe("loadSyncConfig", () => {
  it("finds nothing until syncing has been set up", async () => {
    await expect(loadSyncConfig()).resolves.toBeNull();
  });

  it("reads back what was saved", async () => {
    await saveSyncConfig({ backend: "drive" });

    await expect(loadSyncConfig()).resolves.toEqual({ backend: "drive" });
  });

  it("treats a config it cannot use as none", async () => {
    await storage.chrome.storage.local.set({ [SYNC_CONFIG_KEY]: { backend: "floppy" } });
    await expect(loadSyncConfig()).resolves.toBeNull();

    await storage.chrome.storage.local.set({ [SYNC_CONFIG_KEY]: "drive" });
    await expect(loadSyncConfig()).resolves.toBeNull();
  });
});

describe("saveSyncConfig", () => {
  it("removes the entry when given null, switching syncing off", async () => {
    await saveSyncConfig({ backend: "drive" });
    await saveSyncConfig(null);

    expect(storage.data[SYNC_CONFIG_KEY]).toBeUndefined();
    await expect(loadSyncConfig()).resolves.toBeNull();
  });
});

describe("watchSyncConfig", () => {
  it("reports the config as syncing is switched on and off", async () => {
    const listener = vi.fn();
    watchSyncConfig(listener);

    await saveSyncConfig({ backend: "drive" });
    await saveSyncConfig(null);

    expect(listener.mock.calls).toEqual([[{ backend: "drive" }], [null]]);
  });

  it("ignores other entries", async () => {
    const listener = vi.fn();
    watchSyncConfig(listener);

    await storage.chrome.storage.local.set({ enabled: false });

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops once unsubscribed", async () => {
    const listener = vi.fn();
    const unsubscribe = watchSyncConfig(listener);

    unsubscribe();
    await saveSyncConfig({ backend: "drive" });

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("isSyncConfigKey", () => {
  it("picks out the config entry alone", () => {
    expect(isSyncConfigKey(SYNC_CONFIG_KEY)).toBe(true);
    expect(isSyncConfigKey("fukidashi:sync-status")).toBe(false);
    expect(isSyncConfigKey("fukidashi:notes:https://example.com/")).toBe(false);
  });
});
