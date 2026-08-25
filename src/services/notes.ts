import { lastTouched, type Note, normalizePageUrl, type PageNotes } from "@/core";

const NOTES_KEY_PREFIX = "fukidashi:notes:";

/** Storage key holding every note of one page. */
export function notesKey(url: string): string {
  return `${NOTES_KEY_PREFIX}${normalizePageUrl(url)}`;
}

function byCreatedAt(a: Note, b: Note): number {
  return a.createdAt - b.createdAt;
}

/** Reads back what a storage entry holds, oldest note first. */
function toNotes(value: unknown): Note[] {
  return Array.isArray(value) ? [...(value as Note[])].sort(byCreatedAt) : [];
}

async function readNotes(key: string): Promise<Note[]> {
  const stored = await chrome.storage.local.get(key);
  return toNotes(stored[key]);
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
 * Every page that has notes, the most recently annotated first. The pages are
 * read out of the keys themselves, so nothing has to keep an index in step.
 */
export async function loadAllPageNotes(): Promise<PageNotes[]> {
  const stored = await chrome.storage.local.get(null);
  const pages: PageNotes[] = [];

  for (const [key, value] of Object.entries(stored)) {
    if (!key.startsWith(NOTES_KEY_PREFIX)) continue;

    const notes = toNotes(value);
    if (notes.length > 0) pages.push({ url: key.slice(NOTES_KEY_PREFIX.length), notes });
  }

  return pages.sort((a, b) => lastTouched(b.notes) - lastTouched(a.notes));
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
    listener(toNotes(changes[key].newValue));
  };

  chrome.storage.onChanged.addListener(handleChange);
  return () => chrome.storage.onChanged.removeListener(handleChange);
}

/** The same, for the popup's list of every annotated page. */
export function watchAllNotes(listener: (pages: PageNotes[]) => void): () => void {
  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local") return;
    if (!Object.keys(changes).some((key) => key.startsWith(NOTES_KEY_PREFIX))) return;
    loadAllPageNotes().then(listener);
  };

  chrome.storage.onChanged.addListener(handleChange);
  return () => chrome.storage.onChanged.removeListener(handleChange);
}
