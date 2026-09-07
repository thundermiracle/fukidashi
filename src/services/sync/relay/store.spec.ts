import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeChromeStorage } from "@/testing/fakeChromeStorage";
import { generateSyncCode } from "./code";
import { loadRelayCode, RELAY_CODE_KEY, saveRelayCode } from "./store";

let storage: ReturnType<typeof createFakeChromeStorage>;

beforeEach(() => {
  storage = createFakeChromeStorage();
  vi.stubGlobal("chrome", storage.chrome);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the stored sync code", () => {
  it("is absent until a code is kept", async () => {
    await expect(loadRelayCode()).resolves.toBeNull();
  });

  it("comes back the way it is shown, whatever way it was kept", async () => {
    const code = generateSyncCode();

    await saveRelayCode(code.toLowerCase().replaceAll("-", ""));

    await expect(loadRelayCode()).resolves.toBe(code);
  });

  it("is forgotten on request", async () => {
    await saveRelayCode(generateSyncCode());
    await saveRelayCode(null);

    await expect(loadRelayCode()).resolves.toBeNull();
  });

  it("ignores a stored value that is not a code", async () => {
    await storage.chrome.storage.local.set({ [RELAY_CODE_KEY]: { code: "nope" } });

    await expect(loadRelayCode()).resolves.toBeNull();
  });
});
