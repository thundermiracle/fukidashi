import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeChromeStorage } from "@/testing/fakeChromeStorage";
import { clearSyncCheckpoint, loadSyncCheckpoint, saveSyncCheckpoint } from "./checkpoint";

let storage: ReturnType<typeof createFakeChromeStorage>;

beforeEach(() => {
  storage = createFakeChromeStorage();
  vi.stubGlobal("chrome", storage.chrome);
});

describe("the sync checkpoint", () => {
  it("is nothing until a sync has finished", async () => {
    await expect(loadSyncCheckpoint()).resolves.toBeNull();
  });

  it("reads back what a sync recorded, a remote with nothing on it included", async () => {
    await saveSyncCheckpoint({ version: "file-1:3", digest: "abc" });
    await expect(loadSyncCheckpoint()).resolves.toEqual({ version: "file-1:3", digest: "abc" });

    await saveSyncCheckpoint({ version: null, digest: "empty" });
    await expect(loadSyncCheckpoint()).resolves.toEqual({ version: null, digest: "empty" });
  });

  it("is nothing again once cleared, or when it cannot be read", async () => {
    await saveSyncCheckpoint({ version: "file-1:3", digest: "abc" });
    await clearSyncCheckpoint();
    await expect(loadSyncCheckpoint()).resolves.toBeNull();

    await storage.chrome.storage.local.set({ "fukidashi:sync:checkpoint": { version: 3 } });
    await expect(loadSyncCheckpoint()).resolves.toBeNull();
  });
});
