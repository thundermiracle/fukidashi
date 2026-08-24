import { type Note, normalizePageUrl } from "@/core";

const NOTES_KEY_PREFIX = "fukidashi:notes:";

/** Storage key holding every note of one page. */
export function notesKey(url: string): string {
  return `${NOTES_KEY_PREFIX}${normalizePageUrl(url)}`;
}

function byCreatedAt(a: Note, b: Note): number {
  return a.createdAt - b.createdAt;
}

async function readNotes(key: string): Promise<Note[]> {
  const stored = await chrome.storage.local.get(key);
  const notes = stored[key];
  return Array.isArray(notes) ? [...(notes as Note[])].sort(byCreatedAt) : [];
}

async function writeNotes(key: string, notes: Note[]): Promise<void> {
  if (notes.length === 0) {
    await chrome.storage.local.remove(key);
    return;
  }
  await chrome.storage.local.set({ [key]: [...notes].sort(byCreatedAt) });
}

export async function loadNotes(url: string): Promise<Note[]> {
  return readNotes(notesKey(url));
}

/** Adds the note, or replaces the stored one with the same id. */
export async function saveNote(url: string, note: Note): Promise<void> {
  const key = notesKey(url);
  const notes = await readNotes(key);
  const index = notes.findIndex((stored) => stored.id === note.id);

  if (index === -1) {
    notes.push(note);
  } else {
    notes[index] = note;
  }

  await writeNotes(key, notes);
}

export async function deleteNote(url: string, id: string): Promise<void> {
  const key = notesKey(url);
  const notes = await readNotes(key);

  await writeNotes(
    key,
    notes.filter((note) => note.id !== id),
  );
}

/**
 * Calls `listener` whenever this page's notes change anywhere — another tab on
 * the same page, or the popup. Returns an unsubscribe function.
 */
export function watchNotes(url: string, listener: (notes: Note[]) => void): () => void {
  const key = notesKey(url);

  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local" || !(key in changes)) return;
    const notes = changes[key].newValue;
    listener(Array.isArray(notes) ? [...(notes as Note[])].sort(byCreatedAt) : []);
  };

  chrome.storage.onChanged.addListener(handleChange);
  return () => chrome.storage.onChanged.removeListener(handleChange);
}
