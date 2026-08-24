import type { TextAnchor } from "../types";

/** Stop after this many occurrences of the same quote — pages can repeat a lot. */
const MAX_CANDIDATES = 200;
/** Weight of "the quote is still roughly where it was" relative to context matching. */
const MAX_PROXIMITY_SCORE = 10;
/** How far the quote may drift before proximity stops counting at all. */
const PROXIMITY_RANGE = 20000;

function commonSuffixLength(a: string, b: string): number {
  let count = 0;
  while (
    count < a.length &&
    count < b.length &&
    a[a.length - 1 - count] === b[b.length - 1 - count]
  ) {
    count++;
  }
  return count;
}

function commonPrefixLength(a: string, b: string): number {
  let count = 0;
  while (count < a.length && count < b.length && a[count] === b[count]) {
    count++;
  }
  return count;
}

function scoreCandidate(text: string, anchor: TextAnchor, at: number): number {
  const before = text.slice(Math.max(0, at - anchor.prefix.length), at);
  const after = text.slice(
    at + anchor.exact.length,
    at + anchor.exact.length + anchor.suffix.length,
  );

  const context =
    commonSuffixLength(anchor.prefix, before) + commonPrefixLength(anchor.suffix, after);
  const drift = Math.abs(at - anchor.start);
  const proximity = MAX_PROXIMITY_SCORE * Math.max(0, 1 - drift / PROXIMITY_RANGE);

  return context + proximity;
}

/**
 * Finds the anchored quote in the page text again. The quote is matched
 * exactly; when it occurs more than once, the surrounding context and the
 * original position decide which occurrence wins.
 */
export function resolveAnchor(
  text: string,
  anchor: TextAnchor,
): { start: number; end: number } | null {
  if (anchor.exact.length === 0) return null;

  // Fast path: nothing moved.
  if (text.startsWith(anchor.exact, anchor.start)) {
    const only =
      text.indexOf(anchor.exact, anchor.start + 1) === -1 &&
      text.indexOf(anchor.exact) === anchor.start;
    if (only) return { start: anchor.start, end: anchor.start + anchor.exact.length };
  }

  let best: { start: number; score: number } | null = null;
  let found = 0;

  for (let at = text.indexOf(anchor.exact); at !== -1; at = text.indexOf(anchor.exact, at + 1)) {
    const score = scoreCandidate(text, anchor, at);
    if (!best || score > best.score) best = { start: at, score };
    if (++found >= MAX_CANDIDATES) break;
  }

  if (!best) return null;
  return { start: best.start, end: best.start + anchor.exact.length };
}
