import { describe, expect, it } from "vitest";
import { FOCUS_NOTE, isFocusNoteMessage } from "./messages";

describe("isFocusNoteMessage", () => {
  it("accepts the message the popup sends", () => {
    expect(isFocusNoteMessage({ type: FOCUS_NOTE, noteId: "abc" })).toBe(true);
  });

  it("rejects anything else on the shared message channel", () => {
    expect(isFocusNoteMessage({ type: "other", noteId: "abc" })).toBe(false);
    expect(isFocusNoteMessage({ type: FOCUS_NOTE })).toBe(false);
    expect(isFocusNoteMessage(null)).toBe(false);
    expect(isFocusNoteMessage("hello")).toBe(false);
  });
});
