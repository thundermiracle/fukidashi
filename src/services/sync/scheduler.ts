import { SyncVersionError } from "@/core";
import { onSyncNow } from "../messages";
import { NOTES_KEY_PREFIX, TITLE_KEY_PREFIX } from "../notes";
import { type SyncBackend, SyncSignedOutError } from "./backend";
import { isSyncConfigKey, loadSyncConfig, type SyncConfig } from "./config";
import { syncOnce } from "./engine";
import { DEFAULT_SYNC_STATUS, loadSyncStatus, type SyncStatus, saveSyncStatus } from "./status";

/** Long enough that a burst of edits leaves as one sync, short enough to feel live. */
const PUSH_DELAY_MS = 5_000;

/**
 * A backstop for what the watchers miss: another device pushing while this one
 * idles. Nothing here touches the alarm while `loadSyncConfig` finds nothing.
 */
export const SYNC_ALARM = "fukidashi:sync";
export const SYNC_PERIOD_MINUTES = 15;
const SYNC_PERIOD_MS = SYNC_PERIOD_MINUTES * 60_000;

/**
 * How long a failed sync is left alone before the next try, by how many have
 * failed in a row: a blip gets a quick retry, an outage stops being polled.
 */
const BACKOFF_MINUTES = [1, 5, 15, 60];

/** Builds the backend the config names, or null when there is none to sync with. */
export type BackendFactory = (config: SyncConfig) => Promise<SyncBackend | null>;

export interface SyncController {
  /** Runs a sync right away, whatever the backoff says. */
  syncNow(): Promise<void>;
  /** Stops watching; the alarm goes too. */
  stop(): void;
}

function isNoteKey(key: string): boolean {
  return key.startsWith(NOTES_KEY_PREFIX) || key.startsWith(TITLE_KEY_PREFIX);
}

function backoffMs(failures: number): number {
  return BACKOFF_MINUTES[Math.min(failures, BACKOFF_MINUTES.length) - 1] * 60_000;
}

/** The status a run leaves behind when it fails; the last success stays on record. */
function failed(before: SyncStatus, error: unknown, now: number): SyncStatus {
  const base = {
    lastSyncedAt: before.lastSyncedAt,
    error: error instanceof Error ? error.message : "Sync failed.",
  };
  if (error instanceof SyncSignedOutError) return { state: "signedOut", ...base };
  if (error instanceof SyncVersionError) return { state: "outdated", ...base };

  const failures = (before.failures ?? 0) + 1;
  return { state: "error", ...base, failures, nextAttemptAt: now + backoffMs(failures) };
}

/**
 * Whether the backend should be left alone for now: the user has to sign in
 * or update first, or a failure is being backed off.
 */
function isHeldBack(status: SyncStatus, now: number): boolean {
  if (status.state === "signedOut" || status.state === "outdated") return true;
  return status.nextAttemptAt !== undefined && now < status.nextAttemptAt;
}

/**
 * Runs syncs one at a time, so an edit made mid-sync waits for the run in
 * flight instead of racing it. Runs asked for meanwhile fold into one more,
 * which is forced if any of them was.
 */
function createRunner(run: (force: boolean) => Promise<void>) {
  let running: Promise<void> | null = null;
  let queued: boolean | null = null;

  const drain = async (force: boolean): Promise<void> => {
    await run(force);
    if (queued === null) {
      running = null;
      return;
    }
    const next = queued;
    queued = null;
    return drain(next);
  };

  return (force: boolean): Promise<void> => {
    if (running) {
      queued = queued || force;
      return running;
    }
    running = drain(force);
    return running;
  };
}

async function ensureAlarm(): Promise<void> {
  // Creating an alarm that exists resets its period, and this runs every time
  // the worker wakes — so one that is already ticking is left alone.
  if (await chrome.alarms.get(SYNC_ALARM)) return;
  await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MINUTES });
}

function report(error: unknown): void {
  console.error("Fukidashi: could not sync", error);
}

/**
 * Keeps this device in step with its backend: after its own edits settle, on
 * a timer for everyone else's, when the browser starts, the moment the user
 * switches syncing on, and whenever the settings page asks.
 *
 * Every listener is added before anything is awaited. In MV3 the worker is
 * woken for an event it has a listener for, and a listener added after an
 * `await` misses the very event that woke it — so the backend is looked up
 * lazily, inside the handlers, rather than before they are registered.
 */
export function startSync(createBackend: BackendFactory): SyncController {
  let resolved: Promise<SyncBackend | null> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const resolve = (): Promise<SyncBackend | null> => {
    resolved ??= loadSyncConfig()
      .then((config) => (config ? createBackend(config) : null))
      .catch((error) => {
        console.error("Fukidashi: could not set up sync", error);
        resolved = null;
        return null;
      });
    return resolved;
  };

  const run = async (force: boolean): Promise<void> => {
    const ticket = resolve();
    const backend = await ticket;
    if (!backend) return;

    const before = await loadSyncStatus();
    if (!force && isHeldBack(before, Date.now())) return;

    await saveSyncStatus({ ...before, state: "syncing" });
    let after: SyncStatus;
    try {
      await syncOnce(backend);
      after = { state: "idle", lastSyncedAt: Date.now() };
    } catch (error) {
      report(error);
      after = failed(before, error, Date.now());
    }
    // Syncing was switched off, or over to another backend, while this ran:
    // whatever that wrote about the status stands.
    if (resolved === ticket) await saveSyncStatus(after);
  };
  const sync = createRunner(run);
  const kick = (force: boolean) => {
    sync(force).catch(report);
  };

  const configChanged = async (): Promise<void> => {
    if (await resolve()) {
      await ensureAlarm();
      kick(true);
      return;
    }
    await chrome.alarms.clear(SYNC_ALARM);
    await saveSyncStatus(DEFAULT_SYNC_STATUS);
  };

  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local") return;
    const keys = Object.keys(changes);

    if (keys.some(isSyncConfigKey)) {
      resolved = null;
      configChanged().catch(report);
      return;
    }
    // Only the notes are synced; a sync that wrote nothing changes nothing,
    // so applying a merge cannot set off the next run.
    if (!keys.some(isNoteKey)) return;
    clearTimeout(timer);
    timer = setTimeout(() => kick(false), PUSH_DELAY_MS);
  };

  const handleAlarm = (alarm: chrome.alarms.Alarm) => {
    if (alarm.name === SYNC_ALARM) kick(false);
  };

  const handleStartup = () => kick(false);

  // An update is the one thing that gets a device out of `outdated`, and
  // onInstalled is how the worker hears of one — so this run is not held back.
  const handleInstalled = () => kick(true);

  chrome.storage.onChanged.addListener(handleChange);
  chrome.alarms.onAlarm.addListener(handleAlarm);
  chrome.runtime.onStartup.addListener(handleStartup);
  chrome.runtime.onInstalled.addListener(handleInstalled);
  // The settings page asks after a sign-in, which is what ends `signedOut`.
  const stopListeningForRequests = onSyncNow(() => kick(true));

  // The worker wakes for every event above, not only when the browser
  // starts, and a sync on each wake would double every debounced one.
  // Catching up here is only for a device that has been quiet longer than
  // the alarm's period — a browser that was closed, say.
  resolve()
    .then(async (backend) => {
      if (!backend) return;
      await ensureAlarm();
      const status = await loadSyncStatus();
      if (Date.now() - status.lastSyncedAt >= SYNC_PERIOD_MS) kick(false);
    })
    .catch(report);

  return {
    syncNow: () => sync(true),
    stop: () => {
      clearTimeout(timer);
      chrome.storage.onChanged.removeListener(handleChange);
      chrome.alarms.onAlarm.removeListener(handleAlarm);
      chrome.runtime.onStartup.removeListener(handleStartup);
      chrome.runtime.onInstalled.removeListener(handleInstalled);
      stopListeningForRequests();
      chrome.alarms.clear(SYNC_ALARM);
    },
  };
}
