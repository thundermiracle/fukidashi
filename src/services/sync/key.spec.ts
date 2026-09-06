import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeChromeStorage } from "@/testing/fakeChromeStorage";
import { loadSyncKey, SYNC_KEY_KEY, saveSyncKey, watchSyncKey } from "./key";

const KEY = { salt: "c2FsdA==", iterations: 1_000, key: "a2V5" };

let storage: ReturnType<typeof createFakeChromeStorage>;

beforeEach(() => {
  storage = createFakeChromeStorage();
  vi.stubGlobal("chrome", storage.chrome);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the sync key", () => {
  it("is absent until a passphrase is set", async () => {
    await expect(loadSyncKey()).resolves.toBeNull();
  });

  it("is kept on the device, and forgotten on request", async () => {
    await saveSyncKey(KEY);
    await expect(loadSyncKey()).resolves.toEqual(KEY);

    await saveSyncKey(null);
    await expect(loadSyncKey()).resolves.toBeNull();
  });

  it("ignores a stored value it cannot use", async () => {
    await storage.chrome.storage.local.set({ [SYNC_KEY_KEY]: { salt: "", key: 42 } });
    await expect(loadSyncKey()).resolves.toBeNull();

    await storage.chrome.storage.local.set({ [SYNC_KEY_KEY]: { ...KEY, iterations: 0 } });
    await expect(loadSyncKey()).resolves.toBeNull();
  });

  it("tells a watcher when it is set or forgotten", async () => {
    const seen: unknown[] = [];
    const stop = watchSyncKey((key) => seen.push(key));

    await saveSyncKey(KEY);
    await saveSyncKey(null);
    stop();
    await saveSyncKey(KEY);

    expect(seen).toEqual([KEY, null]);
  });
});
