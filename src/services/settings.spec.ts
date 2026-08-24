import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, SETTINGS_KEYS, saveSetting } from "./settings";

const storage = {
  get: vi.fn(),
  set: vi.fn(),
};

beforeEach(() => {
  vi.stubGlobal("chrome", { storage: { local: storage } });
  storage.get.mockReset().mockResolvedValue({});
  storage.set.mockReset().mockResolvedValue(undefined);
});

describe("loadSettings", () => {
  it("returns the defaults when storage is empty", async () => {
    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it("returns the stored value when it exists", async () => {
    storage.get.mockResolvedValue({ [SETTINGS_KEYS.ENABLED]: false });

    await expect(loadSettings()).resolves.toEqual({ enabled: false });
  });
});

describe("saveSetting", () => {
  it("writes the key/value pair to chrome.storage.local", async () => {
    await saveSetting(SETTINGS_KEYS.ENABLED, false);

    expect(storage.set).toHaveBeenCalledWith({ [SETTINGS_KEYS.ENABLED]: false });
  });
});
