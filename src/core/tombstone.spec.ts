import { describe, expect, it } from "vitest";
import { isLiveNote, liveNotes, purgeExpiredTombstones, TOMBSTONE_TTL_MS } from "./tombstone";
import type { Note } from "./types";

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

describe("isLiveNote", () => {
  it("tells live notes and tombstones apart", () => {
    expect(isLiveNote(makeNote("a"))).toBe(true);
    expect(isLiveNote(makeNote("a", 500))).toBe(false);
  });
});

describe("liveNotes", () => {
  it("keeps only the notes the user still has", () => {
    const notes = [makeNote("a"), makeNote("b", 500), makeNote("c")];

    expect(liveNotes(notes)).toMatchObject([{ id: "a" }, { id: "c" }]);
  });
});

describe("purgeExpiredTombstones", () => {
  const now = TOMBSTONE_TTL_MS * 10;

  it("keeps live notes no matter how old", () => {
    expect(purgeExpiredTombstones([makeNote("a")], now)).toMatchObject([{ id: "a" }]);
  });

  it("keeps a tombstone younger than the TTL", () => {
    const fresh = makeNote("a", now - TOMBSTONE_TTL_MS + 1);

    expect(purgeExpiredTombstones([fresh], now)).toMatchObject([{ id: "a" }]);
  });

  it("drops a tombstone that has reached the TTL", () => {
    const expired = makeNote("a", now - TOMBSTONE_TTL_MS);

    expect(purgeExpiredTombstones([expired], now)).toEqual([]);
  });
});
