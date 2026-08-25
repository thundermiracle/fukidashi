export const FOCUS_NOTE = "fukidashi:focus-note";

export interface FocusNoteMessage {
  type: typeof FOCUS_NOTE;
  noteId: string;
}

export function isFocusNoteMessage(message: unknown): message is FocusNoteMessage {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Partial<FocusNoteMessage>;
  return candidate.type === FOCUS_NOTE && typeof candidate.noteId === "string";
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

export function onFocusNote(handler: (noteId: string) => void): () => void {
  const listener = (message: unknown) => {
    if (isFocusNoteMessage(message)) handler(message.noteId);
  };

  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
