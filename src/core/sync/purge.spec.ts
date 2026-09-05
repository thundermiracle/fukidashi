import { describe, expect, it } from "vitest";
import { TOMBSTONE_TTL_MS } from "../tombstone";
import type { Note } from "../types";
import { purgeSyncPages } from "./purge";

const PAGE = "https://example.com/docs";
const now = TOMBSTONE_TTL_MS * 10;

function makeNote(id: string, deletedAt?: number): Note {
  return {
    id,
    comment: "",
    color: "yellow",
    anchor: { exact: `quote ${id}`, prefix: "", suffix: "", start: 0 },
    createdAt: 100,
    updatedAt: deletedAt ?? 100,
    ...(deletedAt === undefined ? {} : { deletedAt }),
  };
}

describe("purgeSyncPages", () => {
  it("drops the tombstones that have reached the TTL and keeps everything else", () => {
    const page = {
      url: PAGE,
      notes: [makeNote("a"), makeNote("b", now - TOMBSTONE_TTL_MS), makeNote("c", now - 1)],
    };

    expect(purgeSyncPages([page], now)).toMatchObject([{ notes: [{ id: "a" }, { id: "c" }] }]);
  });

  it("drops a page left with nothing, title and all", () => {
    const page = {
      url: PAGE,
      notes: [makeNote("a", now - TOMBSTONE_TTL_MS)],
      title: { text: "Docs", updatedAt: 100 },
    };

    expect(purgeSyncPages([page], now)).toEqual([]);
  });

  it("hands back a page it had no reason to touch as it was", () => {
    const page = { url: PAGE, notes: [makeNote("a"), makeNote("b", now - 1)] };

    expect(purgeSyncPages([page], now)[0]).toBe(page);
  });
});
