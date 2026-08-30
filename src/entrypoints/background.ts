import { loadSyncBackend, startSync } from "@/services/sync";

/**
 * Syncing is the only thing the background page is here for, and it has no
 * backend to sync with yet — so until one is configured this does nothing and
 * costs nothing.
 */
export default defineBackground(() => {
  const backend = loadSyncBackend();
  if (backend) startSync(backend);
});
