/**
 * Notes are stored per page. The hash is dropped so that in-page links share
 * one set of notes, while the query string is kept because it usually selects
 * which content the page shows.
 */
export function normalizePageUrl(href: string): string {
  try {
    const url = new URL(href);
    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return href;
  }
}

/** Short, human-readable form of a page URL, for lists in the popup. */
export function formatPageUrl(href: string): string {
  try {
    const url = new URL(href);
    const path = url.pathname === "/" ? "" : url.pathname;
    return `${url.host}${path}`;
  } catch {
    return href;
  }
}
