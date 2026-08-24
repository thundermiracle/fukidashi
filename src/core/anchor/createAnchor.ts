import type { TextAnchor } from "../types";
import { rangeToOffsets, type TextIndex } from "./textIndex";

/** How much surrounding text is stored to disambiguate repeated quotes. */
export const CONTEXT_LENGTH = 48;

export function createAnchor(index: TextIndex, range: Range): TextAnchor | null {
  const offsets = rangeToOffsets(index, range);
  if (!offsets) return null;

  const { start, end } = offsets;
  const exact = index.text.slice(start, end);
  if (exact.trim().length === 0) return null;

  return {
    exact,
    prefix: index.text.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    suffix: index.text.slice(end, end + CONTEXT_LENGTH),
    start,
  };
}
