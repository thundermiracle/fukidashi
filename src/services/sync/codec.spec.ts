import { describe, expect, it } from "vitest";
import { createSyncPayload, SyncPayloadError, SyncVersionError } from "@/core";
import { jsonCodec } from "./codec";

describe("jsonCodec", () => {
  it("writes a payload out and reads it back", async () => {
    const payload = createSyncPayload([{ url: "https://example.com/docs", notes: [] }], 500);

    await expect(jsonCodec.decode(await jsonCodec.encode(payload))).resolves.toEqual(payload);
  });

  it("refuses text that is not JSON", async () => {
    await expect(jsonCodec.decode("not json")).rejects.toThrow(SyncPayloadError);
    await expect(jsonCodec.decode("not json")).rejects.not.toThrow(SyncVersionError);
  });

  it("tells a copy from a newer version apart from a broken one", async () => {
    await expect(jsonCodec.decode(JSON.stringify({ version: 99, pages: [] }))).rejects.toThrow(
      SyncVersionError,
    );
  });
});
