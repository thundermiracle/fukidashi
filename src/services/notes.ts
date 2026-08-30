import {
  isLiveNote,
  lastTouched,
  liveNotes,
  type Note,
  normalizePageUrl,
  type PageNotes,
  purgeExpiredTombstones,
} from "@/core";

const NOTES_KEY_PREFIX = "fukidashi:notes:";
const TITLE_KEY_PREFIX = "fukidashi:title:";
/** The longest title worth keeping — enough for a headline, not for an essay. */
const MAX_TITLE_LENGTH = 300;

/** Storage key holding every note of one page. */
export function notesKey(url: string): string {
  return `${NOTES_KEY_PREFIX}${normalizePageUrl(url)}`;
}

/** Storage key holding the title of one page. */
export function titleKey(url: string): string {
  return `${TITLE_KEY_PREFIX}${normalizePageUrl(url)}`;
}

/** The title key belonging to a notes key, without going back through the URL. */
function titleKeyFor(notesStorageKey: string): string {
  return TITLE_KEY_PREFIX + notesStorageKey.slice(NOTES_KEY_PREFIX.length);
}

/** A title is one line of display text, however the page wrote it. */
function tidyTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LENGTH);
}

function byCreatedAt(a: Note, b: Note): number {
  return a.createdAt - b.createdAt;
}

/** Reads back what a storage entry holds — tombstones included, oldest note first. */
function toNotes(value: unknown): Note[] {
  return Array.isArray(value) ? [...(value as Note[])].sort(byCreatedAt) : [];
}

async function readNotes(key: string): Promise<Note[]> {
  const stored = await chrome.storage.local.get(key);
  return toNotes(stored[key]);
}

async function writeNotes(key: string, notes: Note[]): Promise<void> {
  const kept = purgeExpiredTombstones(notes, Date.now());

  if (kept.length === 0) {
    await chrome.storage.local.remove(key);
    await chrome.storage.local.remove(titleKeyFor(key));
    return;
  }

  await chrome.storage.local.set({ [key]: [...kept].sort(byCreatedAt) });
  // A page nobody has annotated is not listed, so its title has nothing left
  // to label. Tombstones keep the entry alive for sync, but not the title.
  if (!kept.some(isLiveNote)) {
    await chrome.storage.local.remove(titleKeyFor(key));
  }
}

export async function loadNotes(url: string): Promise<Note[]> {
  return liveNotes(await readNotes(notesKey(url)));
}

/** Everything stored for the page, tombstones included — the sync layer's view. */
export async function loadNotesWithTombstones(url: string): Promise<Note[]> {
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
  const index = notes.findIndex((note) => note.id === id);
  if (index === -1) return;

  // The note stays behind as a tombstone so a sync cannot bring it back from
  // another device's older copy.
  const now = Date.now();
  notes[index] = { ...notes[index], updatedAt: now, deletedAt: now };
  await writeNotes(key, notes);
}

/**
 * Remembers what a page calls itself, so the popup can list it by its title
 * rather than by its path. An unchanged title is not written again: every
 * visit to an annotated page offers one, and each write wakes the popup.
 */
export async function savePageTitle(url: string, title: string): Promise<void> {
  const tidied = tidyTitle(title);
  if (tidied.length === 0) return;

  const key = titleKey(url);
  const stored = await chrome.storage.local.get(key);
  if (stored[key] === tidied) return;

  await chrome.storage.local.set({ [key]: tidied });
}

/**
 * Every page that has notes, the most recently annotated first. The pages are
 * read out of the keys themselves, so nothing has to keep an index in step.
 */
export async function loadAllPageNotes(): Promise<PageNotes[]> {
  const stored = await chrome.storage.local.get(null);
  const pages: PageNotes[] = [];
  const titles = new Map<string, string>();

  for (const [key, value] of Object.entries(stored)) {
    if (key.startsWith(TITLE_KEY_PREFIX) && typeof value === "string") {
      titles.set(key.slice(TITLE_KEY_PREFIX.length), value);
      continue;
    }
    if (!key.startsWith(NOTES_KEY_PREFIX)) continue;

    const notes = liveNotes(toNotes(value));
    if (notes.length > 0) pages.push({ url: key.slice(NOTES_KEY_PREFIX.length), notes });
  }

  // A title on its own is not a page: only annotated pages are listed.
  for (const page of pages) {
    const title = titles.get(page.url);
    if (title) page.title = title;
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
    listener(liveNotes(toNotes(changes[key].newValue)));
  };

  chrome.storage.onChanged.addListener(handleChange);
  return () => chrome.storage.onChanged.removeListener(handleChange);
}

/**
 * The same, for the popup's list of every annotated page. A title counts as a
 * change: it arrives just after the note that prompted it, and the list is
 * showing it.
 */
export function watchAllNotes(listener: (pages: PageNotes[]) => void): () => void {
  const isPageKey = (key: string) =>
    key.startsWith(NOTES_KEY_PREFIX) || key.startsWith(TITLE_KEY_PREFIX);

  const handleChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local") return;
    if (!Object.keys(changes).some(isPageKey)) return;
    loadAllPageNotes().then(listener);
  };

  chrome.storage.onChanged.addListener(handleChange);
  return () => chrome.storage.onChanged.removeListener(handleChange);
}
