import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./settings";

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
    storage.get.mockResolvedValue({ enabled: false });

    await expect(loadSettings()).resolves.toEqual({ enabled: false });
  });

  it("falls back to the default when the stored value is not a boolean", async () => {
    storage.get.mockResolvedValue({ enabled: "yes" });

    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });
});

describe("saveSettings", () => {
  it("writes the given settings to chrome.storage.local", async () => {
    await saveSettings({ enabled: false });

    expect(storage.set).toHaveBeenCalledWith({ enabled: false });
  });
});
