import { describe, expect, it } from "vitest";
import { formatCount } from "./plural";

describe("formatCount", () => {
  it("keeps the singular for exactly one", () => {
    expect(formatCount(1, "note")).toBe("1 note");
  });

  it("adds an s for anything else", () => {
    expect(formatCount(0, "note")).toBe("0 notes");
    expect(formatCount(3, "note")).toBe("3 notes");
  });

  it("takes an irregular plural", () => {
    expect(formatCount(2, "entry", "entries")).toBe("2 entries");
  });
});
