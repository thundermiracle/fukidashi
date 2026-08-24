import { describe, expect, it } from "vitest";
import { isScrollToNoteMessage, SCROLL_TO_NOTE } from "./messages";

describe("isScrollToNoteMessage", () => {
  it("accepts the message the popup sends", () => {
    expect(isScrollToNoteMessage({ type: SCROLL_TO_NOTE, noteId: "abc" })).toBe(true);
  });

  it("rejects anything else on the shared message channel", () => {
    expect(isScrollToNoteMessage({ type: "other", noteId: "abc" })).toBe(false);
    expect(isScrollToNoteMessage({ type: SCROLL_TO_NOTE })).toBe(false);
    expect(isScrollToNoteMessage(null)).toBe(false);
    expect(isScrollToNoteMessage("hello")).toBe(false);
  });
});
