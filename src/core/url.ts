/** Google Translate serves a translated copy of a page from this domain. */
const TRANSLATE_HOST_SUFFIX = ".translate.goog";
/** Prefix of the query parameters that proxy adds to every translated URL. */
const TRANSLATE_PARAM_PREFIX = "_x_tr_";
/** Stands in for a dash while dashes are being read as dots. */
const DASH_PLACEHOLDER = "\u0000";

/**
 * Turns `example-com.translate.goog` back into `example.com`: the proxy encodes
 * the original host by writing every dot as a dash, and every dash the host
 * already contained as two.
 */
function decodeTranslateHost(label: string): string {
  return label
    .replaceAll("--", DASH_PLACEHOLDER)
    .replaceAll("-", ".")
    .replaceAll(DASH_PLACEHOLDER, "-");
}

/**
 * Undoes Google Translate's page proxy, so that a note taken on the translated
 * page belongs to the page it was translated from — the reader annotates one
 * page, not two.
 */
function untranslate(url: URL): URL {
  if (!url.hostname.endsWith(TRANSLATE_HOST_SUFFIX)) return url;

  const original = new URL(url);
  const scheme = url.searchParams.get(`${TRANSLATE_PARAM_PREFIX}sch`);

  original.protocol = scheme === "http" ? "http:" : "https:";
  original.hostname = decodeTranslateHost(url.hostname.slice(0, -TRANSLATE_HOST_SUFFIX.length));
  for (const name of [...original.searchParams.keys()]) {
    if (name.startsWith(TRANSLATE_PARAM_PREFIX)) original.searchParams.delete(name);
  }

  return original;
}

/**
 * Notes are stored per page. The hash is dropped so that in-page links share
 * one set of notes, while the query string is kept because it usually selects
 * which content the page shows.
 */
export function normalizePageUrl(href: string): string {
  try {
    const url = untranslate(new URL(href));
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

/** The site a page belongs to — the level notes are grouped by in the popup. */
export function pageHost(href: string): string {
  try {
    return new URL(href).host;
  } catch {
    return href;
  }
}

/** What distinguishes a page within its site: "/docs/intro?page=2". */
export function formatPagePath(href: string): string {
  try {
    const url = new URL(href);
    return `${url.pathname}${url.search}`;
  } catch {
    return href;
  }
}
