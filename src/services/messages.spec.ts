import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeChromeRuntime } from "@/testing/fakeChromeRuntime";
import {
  FOCUS_NOTE,
  isFocusNoteMessage,
  isSyncNowMessage,
  onSyncNow,
  requestSyncNow,
  SYNC_NOW,
} from "./messages";

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

describe("isSyncNowMessage", () => {
  it("accepts the message the settings page sends", () => {
    expect(isSyncNowMessage({ type: SYNC_NOW })).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isSyncNowMessage({ type: FOCUS_NOTE, noteId: "abc" })).toBe(false);
    expect(isSyncNowMessage(null)).toBe(false);
  });
});

describe("sync now", () => {
  let runtime: ReturnType<typeof createFakeChromeRuntime>;

  beforeEach(() => {
    runtime = createFakeChromeRuntime();
    vi.stubGlobal("chrome", runtime.chrome);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reaches the background's handler, and nothing else does", async () => {
    const handler = vi.fn();
    onSyncNow(handler);

    await requestSyncNow();
    runtime.send({ type: FOCUS_NOTE, noteId: "abc" });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("stops reaching a handler that unsubscribed", async () => {
    const handler = vi.fn();
    onSyncNow(handler)();

    await requestSyncNow();

    expect(handler).not.toHaveBeenCalled();
  });

  it("does not mind when nothing is listening", async () => {
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: async () => {
          throw new Error("Could not establish connection. Receiving end does not exist.");
        },
      },
    });

    await expect(requestSyncNow()).resolves.toBeUndefined();
  });
});
