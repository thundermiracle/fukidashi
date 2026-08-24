export const SCROLL_TO_NOTE = "fukidashi:scroll-to-note";

export interface ScrollToNoteMessage {
  type: typeof SCROLL_TO_NOTE;
  noteId: string;
}

export function isScrollToNoteMessage(message: unknown): message is ScrollToNoteMessage {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Partial<ScrollToNoteMessage>;
  return candidate.type === SCROLL_TO_NOTE && typeof candidate.noteId === "string";
}

/** Asks the content script of `tabId` to scroll one note into view. */
export async function requestScrollToNote(tabId: number, noteId: string): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: SCROLL_TO_NOTE, noteId } as ScrollToNoteMessage);
    return true;
  } catch {
    // No content script on this page (a chrome:// page, or one loaded before
    // the extension was installed).
    return false;
  }
}

export function onScrollToNote(handler: (noteId: string) => void): () => void {
  const listener = (message: unknown) => {
    if (isScrollToNoteMessage(message)) handler(message.noteId);
  };

  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
