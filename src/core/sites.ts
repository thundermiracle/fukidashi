import type { Note, PageNotes, SiteNotes } from "./types";
import { pageHost } from "./url";

/** When the most recently edited note of a page was written. */
export function lastTouched(notes: Note[]): number {
  return notes.reduce((latest, note) => Math.max(latest, note.updatedAt), 0);
}

/**
 * Gathers annotated pages under the site they belong to. Sites and pages are
 * both ordered by their most recent note, so the reading the user is in the
 * middle of is the first thing the popup shows.
 */
export function groupBySite(pages: PageNotes[]): SiteNotes[] {
  const sites = new Map<string, PageNotes[]>();

  for (const page of pages) {
    const host = pageHost(page.url);
    const known = sites.get(host);
    if (known) known.push(page);
    else sites.set(host, [page]);
  }

  return [...sites]
    .map(([host, sitePages]) => ({
      host,
      pages: [...sitePages].sort((a, b) => lastTouched(b.notes) - lastTouched(a.notes)),
      noteCount: sitePages.reduce((total, page) => total + page.notes.length, 0),
      updatedAt: Math.max(...sitePages.map((page) => lastTouched(page.notes))),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
