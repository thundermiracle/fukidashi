import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeChromeStorage } from "@/testing/fakeChromeStorage";
import { loadSyncStatus, saveSyncStatus, watchSyncStatus } from "./status";

const STATUS_KEY = "fukidashi:sync-status";

let storage: ReturnType<typeof createFakeChromeStorage>;

beforeEach(() => {
  storage = createFakeChromeStorage();
  vi.stubGlobal("chrome", storage.chrome);
});

describe("loadSyncStatus", () => {
  it("starts out off, never synced", async () => {
    await expect(loadSyncStatus()).resolves.toEqual({ state: "off", lastSyncedAt: 0 });
  });

  it("reads back everything a run wrote", async () => {
    const status = {
      state: "error" as const,
      lastSyncedAt: 100,
      error: "the network is out",
      failures: 2,
      nextAttemptAt: 900,
    };
    await saveSyncStatus(status);

    await expect(loadSyncStatus()).resolves.toEqual(status);
  });

  it("falls back for values it cannot read", async () => {
    await storage.chrome.storage.local.set({
      [STATUS_KEY]: { state: "bogus", lastSyncedAt: "soon", error: 5, failures: "many" },
    });

    await expect(loadSyncStatus()).resolves.toEqual({ state: "off", lastSyncedAt: 0 });
  });
});

describe("watchSyncStatus", () => {
  it("reports each status written", async () => {
    const listener = vi.fn();
    watchSyncStatus(listener);

    await saveSyncStatus({ state: "syncing", lastSyncedAt: 0 });
    await saveSyncStatus({ state: "idle", lastSyncedAt: 100 });
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));

    expect(listener).toHaveBeenLastCalledWith({ state: "idle", lastSyncedAt: 100 });
  });

  it("ignores other entries", async () => {
    const listener = vi.fn();
    watchSyncStatus(listener);

    await storage.chrome.storage.local.set({ enabled: false });
    await Promise.resolve();

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops once unsubscribed", async () => {
    const listener = vi.fn();
    const unsubscribe = watchSyncStatus(listener);

    unsubscribe();
    await saveSyncStatus({ state: "idle", lastSyncedAt: 100 });
    await Promise.resolve();

    expect(listener).not.toHaveBeenCalled();
  });
});
