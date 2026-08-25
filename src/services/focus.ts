import { normalizePageUrl } from "@/core";

const PENDING_FOCUS_KEY = "fukidashi:pending-focus";
/** A jump belongs to the page being opened now, not to one opened tomorrow. */
const PENDING_FOCUS_TTL = 60_000;

interface PendingFocus {
  url: string;
  noteId: string;
  at: number;
}

/**
 * Records the note a page should jump to once it opens. The popup cannot talk
 * to a content script that does not exist yet, so it leaves the request here
 * and the page collects it on the way in.
 */
export async function setPendingFocus(url: string, noteId: string): Promise<void> {
  const pending: PendingFocus = { url: normalizePageUrl(url), noteId, at: Date.now() };
  await chrome.storage.local.set({ [PENDING_FOCUS_KEY]: pending });
}

/**
 * Claims the jump left for `url`, if it is this page's. Reading it clears it,
 * so returning to the page later leaves the reader where they were.
 */
export async function takePendingFocus(url: string): Promise<string | null> {
  const stored = await chrome.storage.local.get(PENDING_FOCUS_KEY);
  const pending = stored[PENDING_FOCUS_KEY] as PendingFocus | undefined;
  if (!pending || typeof pending.noteId !== "string") return null;

  // Anything this old was meant for a tab that never arrived; tidy it away.
  if (Date.now() - pending.at > PENDING_FOCUS_TTL) {
    await chrome.storage.local.remove(PENDING_FOCUS_KEY);
    return null;
  }
  // Someone else's jump — leave it for the page it was meant for.
  if (pending.url !== normalizePageUrl(url)) return null;

  await chrome.storage.local.remove(PENDING_FOCUS_KEY);
  return pending.noteId;
}
