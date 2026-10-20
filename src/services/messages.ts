export const FOCUS_NOTE = "fukidashi:focus-note";
export const SYNC_NOW = "fukidashi:sync-now";
export const PING = "fukidashi:ping";

export interface FocusNoteMessage {
  type: typeof FOCUS_NOTE;
  noteId: string;
}

/** The settings page asking the background to sync right away. */
export interface SyncNowMessage {
  type: typeof SYNC_NOW;
}

/** The popup asking whether the page in front of the user has a content script. */
export interface PingMessage {
  type: typeof PING;
}

export function isFocusNoteMessage(message: unknown): message is FocusNoteMessage {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Partial<FocusNoteMessage>;
  return candidate.type === FOCUS_NOTE && typeof candidate.noteId === "string";
}

export function isSyncNowMessage(message: unknown): message is SyncNowMessage {
  if (typeof message !== "object" || message === null) return false;
  return (message as Partial<SyncNowMessage>).type === SYNC_NOW;
}

export function isPingMessage(message: unknown): message is PingMessage {
  if (typeof message !== "object" || message === null) return false;
  return (message as Partial<PingMessage>).type === PING;
}

/** Asks the content script of `tabId` to bring one note into view and open it. */
export async function requestFocusNote(tabId: number, noteId: string): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: FOCUS_NOTE, noteId } as FocusNoteMessage);
    return true;
  } catch {
    // No content script on this page (a chrome:// page, or one loaded before
    // the extension was installed).
    return false;
  }
}

/**
 * Whether the content script of `tabId` is there to answer. A tab that was
 * open before the extension was installed or updated has none until it is
 * reloaded, and the browser's own pages never get one.
 */
export async function pingPage(tabId: number): Promise<boolean> {
  try {
    return (await chrome.tabs.sendMessage(tabId, { type: PING } as PingMessage)) === true;
  } catch {
    return false;
  }
}

/** Answers the popup's ping, out loud: a page that says nothing reads as one without us. */
export function answerPings(): () => void {
  const listener = (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (answer: boolean) => void,
  ) => {
    if (isPingMessage(message)) sendResponse(true);
  };

  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

export function onFocusNote(handler: (noteId: string) => void): () => void {
  const listener = (message: unknown) => {
    if (isFocusNoteMessage(message)) handler(message.noteId);
  };

  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

/**
 * Asks the background to sync now, whatever its backoff says. The answer is
 * not waited for: the page watches the sync status instead, which is where
 * the outcome lands anyway.
 */
export async function requestSyncNow(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: SYNC_NOW } as SyncNowMessage);
  } catch {
    // No background listening, which only happens in a build without one.
  }
}

/**
 * Calls `handler` for each request to sync now. The listener answers nothing,
 * on purpose: a listener that promises an answer and never sends one leaves
 * the asking page with a rejected promise.
 */
export function onSyncNow(handler: () => void): () => void {
  const listener = (message: unknown) => {
    if (isSyncNowMessage(message)) handler();
  };

  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
