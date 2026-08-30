import { describe, expect, it } from "vitest";
import type { Note } from "../types";
import {
  createSyncPayload,
  parseSyncPayload,
  SYNC_FORMAT_VERSION,
  SyncPayloadError,
} from "./payload";
import type { SyncPage } from "./types";

const note: Note = {
  id: "a",
  comment: "a thought",
  color: "green",
  anchor: { exact: "quote", prefix: "before ", suffix: " after", start: 12 },
  createdAt: 100,
  updatedAt: 200,
};

const page: SyncPage = { url: "https://example.com/docs", notes: [note] };

describe("createSyncPayload", () => {
  it("stamps the format it was written in", () => {
    expect(createSyncPayload([page], 500)).toMatchObject({
      version: SYNC_FORMAT_VERSION,
      exportedAt: 500,
    });
  });
});

describe("parseSyncPayload", () => {
  const roundTrip = (payload: unknown) => parseSyncPayload(JSON.parse(JSON.stringify(payload)));

  it("reads back everything an export wrote", () => {
    const payload = createSyncPayload([page], 500);

    expect(roundTrip(payload)).toEqual(payload);
  });

  it("keeps tombstones and titles", () => {
    const deleted: Note = { ...note, deletedAt: 300 };
    const titled: SyncPage = { ...page, notes: [deleted], title: { text: "Docs", updatedAt: 400 } };

    expect(roundTrip(createSyncPayload([titled], 500)).pages).toEqual([titled]);
  });

  it("refuses a file that is not an export", () => {
    expect(() => parseSyncPayload({ hello: "world" })).toThrow(SyncPayloadError);
    expect(() => parseSyncPayload("nonsense")).toThrow(SyncPayloadError);
  });

  it("refuses a payload written by a newer version", () => {
    expect(() => parseSyncPayload({ version: SYNC_FORMAT_VERSION + 1, pages: [] })).toThrow(
      /newer version/,
    );
  });

  it("refuses a note it cannot vouch for rather than storing half of it", () => {
    const badColor = { ...page, notes: [{ ...note, color: "chartreuse" }] };
    const noAnchor = { ...page, notes: [{ ...note, anchor: undefined }] };

    expect(() => parseSyncPayload({ version: 1, pages: [badColor] })).toThrow(SyncPayloadError);
    expect(() => parseSyncPayload({ version: 1, pages: [noAnchor] })).toThrow(SyncPayloadError);
  });

  it("reads an export with no pages", () => {
    expect(parseSyncPayload({ version: 1, exportedAt: 0, pages: [] }).pages).toEqual([]);
  });
});
