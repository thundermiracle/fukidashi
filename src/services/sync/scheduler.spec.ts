import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "@/core";
import { createFakeChromeStorage } from "@/testing/fakeChromeStorage";
import { createFakeSyncBackend } from "@/testing/fakeSyncBackend";
import { saveNote } from "../notes";
import { SYNC_ALARM, startSync } from "./scheduler";
import { loadSyncStatus } from "./status";

const PAGE = "https://example.com/docs";

function makeNote(id: string, createdAt: number): Note {
  return {
    id,
    comment: "",
    color: "yellow",
    anchor: { exact: `quote ${id}`, prefix: "", suffix: "", start: 0 },
    createdAt,
    updatedAt: createdAt,
  };
}

let storage: ReturnType<typeof createFakeChromeStorage>;
let alarmListeners: Set<(alarm: chrome.alarms.Alarm) => void>;
let createAlarm: ReturnType<typeof vi.fn>;

/** Lets the sync that a change or an alarm set off run to the end. */
async function settle() {
  await vi.runAllTimersAsync();
}

beforeEach(() => {
  vi.useFakeTimers();
  storage = createFakeChromeStorage();
  alarmListeners = new Set();
  createAlarm = vi.fn();

  vi.stubGlobal("chrome", {
    ...storage.chrome,
    alarms: {
      create: createAlarm,
      clear: vi.fn(),
      onAlarm: {
        addListener: (listener: (alarm: chrome.alarms.Alarm) => void) =>
          alarmListeners.add(listener),
        removeListener: (listener: (alarm: chrome.alarms.Alarm) => void) =>
          alarmListeners.delete(listener),
      },
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("startSync", () => {
  it("syncs once as it starts, and sets the timer for everyone else's edits", async () => {
    const backend = createFakeSyncBackend();
    await saveNote(PAGE, makeNote("a", 100));

    const stop = startSync(backend);
    await settle();

    expect(backend.snapshot()?.payload.pages).toMatchObject([{ url: PAGE }]);
    expect(createAlarm).toHaveBeenCalledWith(SYNC_ALARM, expect.objectContaining({}));
    expect((await loadSyncStatus()).lastSyncedAt).toBeGreaterThan(0);
    stop();
  });

  it("pushes an edit once the burst it belongs to has settled", async () => {
    const backend = createFakeSyncBackend();
    const stop = startSync(backend);
    await settle();

    await saveNote(PAGE, makeNote("a", 100));
    await saveNote(PAGE, makeNote("b", 200));
    await settle();

    expect(backend.snapshot()?.payload.pages[0].notes).toHaveLength(2);
    // The two edits left as one sync, on top of the one at startup.
    expect(backend.snapshot()?.version).toBe("v1");
    stop();
  });

  it("syncs when the alarm goes off", async () => {
    const backend = createFakeSyncBackend();
    const stop = startSync(backend);
    await settle();
    const before = backend.pulls();

    for (const listener of alarmListeners) listener({ name: SYNC_ALARM } as chrome.alarms.Alarm);
    await settle();

    expect(backend.pulls()).toBeGreaterThan(before);
    stop();
  });

  it("ignores an alarm meant for something else", async () => {
    const backend = createFakeSyncBackend();
    const stop = startSync(backend);
    await settle();
    const before = backend.pulls();

    for (const listener of alarmListeners) listener({ name: "other" } as chrome.alarms.Alarm);
    await settle();

    expect(backend.pulls()).toBe(before);
    stop();
  });

  it("does not set off another sync by writing what it merged", async () => {
    const backend = createFakeSyncBackend();
    await saveNote(PAGE, makeNote("a", 100));

    const stop = startSync(backend);
    await settle();
    const after = backend.pulls();

    await settle();

    expect(backend.pulls()).toBe(after);
    stop();
  });

  it("remembers what went wrong when a sync fails", async () => {
    const backend = createFakeSyncBackend();
    backend.pull = async () => {
      throw new Error("the network is out");
    };
    vi.spyOn(console, "error").mockImplementation(() => {});

    const stop = startSync(backend);
    await settle();

    expect(await loadSyncStatus()).toMatchObject({ error: "the network is out" });
    stop();
  });

  it("stops watching once it is told to", async () => {
    const backend = createFakeSyncBackend();
    const stop = startSync(backend);
    await settle();
    const before = backend.pulls();

    stop();
    await saveNote(PAGE, makeNote("a", 100));
    await settle();

    expect(backend.pulls()).toBe(before);
  });
});
