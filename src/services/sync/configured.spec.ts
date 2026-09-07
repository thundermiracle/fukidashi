import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeChromeIdentity } from "@/testing/fakeChromeIdentity";
import { createFakeChromeStorage } from "@/testing/fakeChromeStorage";
import { loadSyncBackend } from "./configured";
import { generateSyncCode } from "./relay/code";
import { saveRelayCode } from "./relay/store";

beforeEach(() => {
  vi.stubGlobal("chrome", {
    ...createFakeChromeStorage().chrome,
    ...createFakeChromeIdentity().chrome,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("loadSyncBackend", () => {
  it("builds the Drive backend the config names", async () => {
    vi.stubEnv("WXT_GOOGLE_CLIENT_ID", "client-1");

    await expect(loadSyncBackend({ backend: "drive" })).resolves.toMatchObject({
      pull: expect.any(Function),
      push: expect.any(Function),
    });
  });

  it("cannot build one in a build without a client id", async () => {
    vi.stubEnv("WXT_GOOGLE_CLIENT_ID", "");

    await expect(loadSyncBackend({ backend: "drive" })).rejects.toThrow(/client id/);
  });

  it("builds the relay backend from the code kept on the device", async () => {
    vi.stubEnv("WXT_SYNC_RELAY_URL", "https://relay.test");
    await saveRelayCode(generateSyncCode());

    await expect(loadSyncBackend({ backend: "relay" })).resolves.toMatchObject({
      pull: expect.any(Function),
      peek: expect.any(Function),
      push: expect.any(Function),
    });
  });

  it("has nothing to sync with while no code is kept", async () => {
    vi.stubEnv("WXT_SYNC_RELAY_URL", "https://relay.test");

    await expect(loadSyncBackend({ backend: "relay" })).resolves.toBeNull();
  });

  it("cannot build the relay backend in a build without a relay address", async () => {
    vi.stubEnv("WXT_SYNC_RELAY_URL", "");
    await saveRelayCode(generateSyncCode());

    await expect(loadSyncBackend({ backend: "relay" })).rejects.toThrow(/relay address/);
  });
});
