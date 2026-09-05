import { describe, expect, it } from "vitest";
import { loadSyncBackend } from "./configured";

describe("loadSyncBackend", () => {
  it("has nothing to sync with yet, whatever the config names", async () => {
    await expect(loadSyncBackend({ backend: "drive" })).resolves.toBeNull();
  });
});
