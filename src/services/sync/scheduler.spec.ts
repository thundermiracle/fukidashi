import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Note, SyncVersionError } from "@/core";
import { createFakeChromeAlarms } from "@/testing/fakeChromeAlarms";
import { createFakeChromeRuntime } from "@/testing/fakeChromeRuntime";
import { createFakeChromeStorage } from "@/testing/fakeChromeStorage";
import { createFakeSyncBackend } from "@/testing/fakeSyncBackend";
import { SYNC_NOW } from "../messages";
import { saveNote } from "../notes";
import { type SyncBackend, SyncSignedOutError } from "./backend";
import { saveSyncConfig } from "./config";
import { type BackendFactory, SYNC_ALARM, type SyncController, startSync } from "./scheduler";
import { loadSyncStatus, saveSyncStatus } from "./status";

const PAGE = "https://example.com/docs";
const MINUTE = 60_000;

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
let alarms: ReturnType<typeof createFakeChromeAlarms>;
let runtime: ReturnType<typeof createFakeChromeRuntime>;
let backend: ReturnType<typeof createFakeSyncBackend>;
let started: SyncController[] = [];

/** Starts the scheduler the way the background does, and remembers it for cleanup. */
function start(createBackend: BackendFactory = async () => backend): SyncController {
  const controller = startSync(createBackend);
  started.push(controller);
  return controller;
}

/** How often the backend was asked anything: a full read, or only its version. */
function rounds(): number {
  return backend.pulls() + backend.peeks();
}

/** Makes the backend fail every time it is asked anything, and counts the attempts. */
function failWith(error: () => Error): () => number {
  let attempts = 0;
  const fail = async () => {
    attempts += 1;
    throw error();
  };
  backend.pull = fail;
  backend.peek = fail;
  return () => attempts;
}

/** Lets the sync that a change or an alarm set off run to the end. */
async function settle() {
  await vi.runAllTimersAsync();
}

beforeEach(async () => {
  vi.useFakeTimers();
  storage = createFakeChromeStorage();
  alarms = createFakeChromeAlarms();
  runtime = createFakeChromeRuntime();
  vi.stubGlobal("chrome", { ...storage.chrome, ...alarms.chrome, ...runtime.chrome });
  backend = createFakeSyncBackend();
  vi.spyOn(console, "error").mockImplementation(() => {});

  // Most of what follows is about a device that has syncing switched on.
  await saveSyncConfig({ backend: "drive" });
});

afterEach(() => {
  for (const controller of started) controller.stop();
  started = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("startSync", () => {
  it("handles an edit that arrives while the backend is still being looked up", async () => {
    let release: (backend: SyncBackend) => void = () => {};
    start(() => new Promise((resolve) => (release = resolve)));

    // The listeners are in place by the time startSync returns: a start that
    // awaited anything first would have nothing registered yet.
    expect(storage.listeners.size).toBe(1);
    expect(alarms.listeners.size).toBe(1);
    expect(runtime.listeners.onStartup.size).toBe(1);
    expect(runtime.listeners.onInstalled.size).toBe(1);

    // The edit is heard while the backend is still pending …
    await saveNote(PAGE, makeNote("a", 100));
    await settle();
    expect(rounds()).toBe(0);

    // … and leaves as soon as the backend is there.
    release(backend);
    await settle();
    expect(backend.snapshot()?.payload.pages).toMatchObject([{ url: PAGE }]);
  });

  it("catches up as it starts when it has never synced", async () => {
    await saveNote(PAGE, makeNote("a", 100));

    start();
    await settle();

    expect(backend.snapshot()?.payload.pages).toMatchObject([{ url: PAGE }]);
    expect(alarms.alarms.get(SYNC_ALARM)).toMatchObject({ periodInMinutes: 15 });
    const status = await loadSyncStatus();
    expect(status.state).toBe("idle");
    expect(status.lastSyncedAt).toBeGreaterThan(0);
  });

  it("leaves the backend alone as it starts when the last sync was recent", async () => {
    await saveSyncStatus({ state: "idle", lastSyncedAt: Date.now() });

    start();
    await settle();

    expect(rounds()).toBe(0);
    expect(alarms.alarms.has(SYNC_ALARM)).toBe(true);
  });

  it("syncs when the browser starts, however recent the last sync", async () => {
    await saveSyncStatus({ state: "idle", lastSyncedAt: Date.now() });
    start();
    await settle();

    runtime.startup();
    await settle();

    expect(rounds()).toBe(1);
  });

  it("leaves a ticking alarm alone when the worker starts again", async () => {
    const create = vi.spyOn(alarms.chrome.alarms, "create");
    start();
    await settle();

    // The worker was restarted: its listeners are gone, the alarm is not.
    start();
    await settle();

    expect(create).toHaveBeenCalledTimes(1);
  });

  it("pushes an edit once the burst it belongs to has settled", async () => {
    start();
    await settle();

    await saveNote(PAGE, makeNote("a", 100));
    await saveNote(PAGE, makeNote("b", 200));
    await settle();

    expect(backend.snapshot()?.payload.pages[0].notes).toHaveLength(2);
    // The two edits left as one sync.
    expect(backend.snapshot()?.version).toBe("v1");
  });

  it("syncs when the alarm goes off", async () => {
    start();
    await settle();
    const before = rounds();

    alarms.fire(SYNC_ALARM);
    await settle();

    expect(rounds()).toBe(before + 1);
  });

  it("ignores an alarm meant for something else", async () => {
    start();
    await settle();
    const before = rounds();

    alarms.fire("other");
    await settle();

    expect(rounds()).toBe(before);
  });

  it("does not set off another sync by writing what it merged", async () => {
    await saveNote(PAGE, makeNote("a", 100));

    start();
    await settle();
    const after = rounds();

    await settle();

    expect(rounds()).toBe(after);
  });

  it("keeps the last success on record when a sync fails", async () => {
    start();
    await settle();
    const { lastSyncedAt } = await loadSyncStatus();
    expect(lastSyncedAt).toBeGreaterThan(0);

    failWith(() => new Error("the network is out"));
    const now = Date.now();
    alarms.fire(SYNC_ALARM);
    await settle();

    expect(await loadSyncStatus()).toEqual({
      state: "error",
      lastSyncedAt,
      error: "the network is out",
      failures: 1,
      nextAttemptAt: now + MINUTE,
    });
  });

  it("waits longer after each failure, and tries again once the wait is over", async () => {
    const attempts = failWith(() => new Error("down"));
    start();
    await settle();
    expect(attempts()).toBe(1);

    // Too soon: the alarm is ignored.
    alarms.fire(SYNC_ALARM);
    await settle();
    expect(attempts()).toBe(1);

    vi.advanceTimersByTime(MINUTE);
    alarms.fire(SYNC_ALARM);
    await settle();
    expect(attempts()).toBe(2);
    expect(await loadSyncStatus()).toMatchObject({
      failures: 2,
      nextAttemptAt: Date.now() + 5 * MINUTE,
    });

    // An edit is held back the same way.
    await saveNote(PAGE, makeNote("a", 100));
    await settle();
    expect(attempts()).toBe(2);
  });

  it("runs right away when asked, whatever the backoff says", async () => {
    const attempts = failWith(() => new Error("down"));
    const controller = start();
    await settle();
    expect(attempts()).toBe(1);

    await controller.syncNow();

    expect(attempts()).toBe(2);
  });

  it("runs right away when the settings page asks, even while signed out", async () => {
    const attempts = failWith(() => new SyncSignedOutError());
    start();
    await settle();
    expect(attempts()).toBe(1);

    runtime.send({ type: SYNC_NOW });
    await settle();

    expect(attempts()).toBe(2);
  });

  it("stops trying once the backend needs a sign-in", async () => {
    const attempts = failWith(() => new SyncSignedOutError());
    const controller = start();
    await settle();
    expect(await loadSyncStatus()).toMatchObject({ state: "signedOut" });

    alarms.fire(SYNC_ALARM);
    await saveNote(PAGE, makeNote("a", 100));
    vi.advanceTimersByTime(60 * MINUTE);
    await settle();
    expect(attempts()).toBe(1);

    // Only the user brings it back, from the settings page.
    await controller.syncNow();
    expect(attempts()).toBe(2);
  });

  it("stops trying when the remote needs a newer version, until one is installed", async () => {
    const attempts = failWith(() => new SyncVersionError("written by a newer version"));
    start();
    await settle();
    expect(await loadSyncStatus()).toMatchObject({
      state: "outdated",
      error: "written by a newer version",
    });

    alarms.fire(SYNC_ALARM);
    await settle();
    expect(attempts()).toBe(1);

    runtime.installed("update");
    await settle();
    expect(attempts()).toBe(2);
  });

  it("starts when syncing is switched on, and stops when it is switched off", async () => {
    await saveSyncConfig(null);
    start();
    await settle();
    expect(rounds()).toBe(0);
    expect(alarms.alarms.has(SYNC_ALARM)).toBe(false);

    await saveSyncConfig({ backend: "drive" });
    await settle();
    expect(rounds()).toBe(1);
    expect(alarms.alarms.has(SYNC_ALARM)).toBe(true);

    await saveSyncConfig(null);
    await settle();
    expect(alarms.alarms.has(SYNC_ALARM)).toBe(false);
    expect(await loadSyncStatus()).toEqual({ state: "off", lastSyncedAt: 0 });
    await saveNote(PAGE, makeNote("a", 100));
    await settle();
    expect(rounds()).toBe(1);

    await saveSyncConfig({ backend: "drive" });
    await settle();
    expect(rounds()).toBe(2);
  });

  it("stops watching once it is told to", async () => {
    const controller = start();
    await settle();
    const before = rounds();

    controller.stop();
    await saveNote(PAGE, makeNote("a", 100));
    alarms.fire(SYNC_ALARM);
    runtime.send({ type: SYNC_NOW });
    await settle();

    expect(rounds()).toBe(before);
    expect(alarms.alarms.has(SYNC_ALARM)).toBe(false);
  });
});
