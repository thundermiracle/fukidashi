import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeChromeIdentity } from "@/testing/fakeChromeIdentity";
import { createFakeChromeStorage } from "@/testing/fakeChromeStorage";
import { loadSyncBackend } from "./configured";

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
});
