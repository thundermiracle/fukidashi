import { NOTES_KEY_PREFIX, TITLE_KEY_PREFIX } from "../notes";
import type { SyncBackend } from "./backend";
import { syncOnce } from "./engine";
import { saveSyncStatus } from "./status";

/** Long enough that a burst of edits leaves as one sync, short enough to feel live. */
const PUSH_DELAY_MS = 5_000;

/** A backstop for what the watchers miss: another device pushing while this one idles. */
export const SYNC_ALARM = "fukidashi:sync";
export const SYNC_PERIOD_MINUTES = 15;

function isNoteKey(key: string): boolean {
  return key.startsWith(NOTES_KEY_PREFIX) || key.startsWith(TITLE_KEY_PREFIX);
}

/**
 * Runs syncs one at a time, so an edit made mid-sync waits for the run in
 * flight instead of racing it.
 */
function createRunner(backend: SyncBackend) {
  let running: Promise<void> | null = null;
  let again = false;

  const run = async (): Promise<void> => {
    try {
      await syncOnce(backend);
      await saveSyncStatus({ lastSyncedAt: Date.now() });
    } catch (error) {
      console.error("Fukidashi: could not sync", error);
      await saveSyncStatus({
        lastSyncedAt: 0,
        error: error instanceof Error ? error.message : "Sync failed.",
      });
    }
  };

  const drain = async (): Promise<void> => {
    await run();
    if (!again) {
      running = null;
      return;
    }
    again = false;
    return drain();
  };

  return () => {
    if (running) {
      again = true;
      return running;
    }
    running = drain();
    return running;
  };
}

/**
 * Keeps this device in step with the backend: after its own edits settle, on
 * a timer for everyone else's, and once at startup. Returns a function that
 * stops watching.
 */
export function startSync(backend: SyncBackend): () => void {
  const sync = createRunner(backend);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    // Only the notes are synced; a sync that wrote nothing changes nothing,
    // so applying a merge cannot set off the next run.
    if (areaName !== "local" || !Object.keys(changes).some(isNoteKey)) return;
    clearTimeout(timer);
    timer = setTimeout(sync, PUSH_DELAY_MS);
  };

  const handleAlarm = (alarm: chrome.alarms.Alarm) => {
    if (alarm.name === SYNC_ALARM) sync();
  };

  chrome.storage.onChanged.addListener(handleChange);
  chrome.alarms.onAlarm.addListener(handleAlarm);
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MINUTES });
  sync();

  return () => {
    clearTimeout(timer);
    chrome.storage.onChanged.removeListener(handleChange);
    chrome.alarms.onAlarm.removeListener(handleAlarm);
    chrome.alarms.clear(SYNC_ALARM);
  };
}
