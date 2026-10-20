import { loadSyncBackend, startSync } from "@/services/sync";
import { greetOnInstall } from "@/services/welcome";

/**
 * Syncing is what the background worker is mostly here for. The scheduler
 * registers its listeners right away and looks the backend up lazily, so a
 * device with syncing switched off costs nothing beyond one storage read
 * each time the worker wakes.
 */
export default defineBackground(() => {
  startSync(loadSyncBackend);
  // The dev runner installs a fresh copy on every start, where a welcome tab
  // each time would only be in the way; open /welcome.html to see it there.
  if (!import.meta.env.DEV) greetOnInstall();
});
