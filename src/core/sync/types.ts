import type { Note, PageTitle } from "../types";

/**
 * One page as the sync layer sees it: tombstones included, and the title with
 * the time it was written. `PageNotes` is the reading the UI gets instead —
 * live notes and a plain title string.
 */
export interface SyncPage {
  url: string;
  notes: Note[];
  title?: PageTitle;
}
