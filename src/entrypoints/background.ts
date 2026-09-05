import { loadSyncBackend, startSync } from "@/services/sync";

/**
 * Syncing is the only thing the background worker is here for. The scheduler
 * registers its listeners right away and looks the backend up lazily, so a
 * device with syncing switched off costs nothing beyond one storage read
 * each time the worker wakes.
 */
export default defineBackground(() => {
  startSync(loadSyncBackend);
});
