/**
 * A flat view of the page's visible text: one string, plus the text nodes it
 * was built from. Anchors are stored as offsets into that string, which keeps
 * them independent of the surrounding markup.
 */

/** Marks DOM injected by the extension itself, which never belongs in the text. */
export const UI_ATTRIBUTE = "data-fukidashi-ui";
/** Marks a highlight wrapper. Its text IS page text, so it stays in the index. */
export const HIGHLIGHT_ATTRIBUTE = "data-fukidashi-note";

const SKIPPED_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEMPLATE",
  "TEXTAREA",
  "INPUT",
  "SELECT",
  "OPTION",
  "IFRAME",
  "SVG",
  "CANVAS",
  "HEAD",
]);

export interface TextChunk {
  node: Text;
  /** Inclusive offset of the node's first character in `TextIndex.text`. */
  start: number;
  /** Exclusive offset of the node's last character in `TextIndex.text`. */
  end: number;
}

export interface TextIndex {
  text: string;
  chunks: TextChunk[];
}

function isIndexable(node: Text): boolean {
  if (node.data.length === 0) return false;

  const parent = node.parentElement;
  if (!parent) return false;
  if (SKIPPED_TAGS.has(parent.tagName)) return false;
  if (parent.closest(`[${UI_ATTRIBUTE}]`)) return false;
  if (parent.isContentEditable) return false;

  return true;
}

export function buildTextIndex(root: Node): TextIndex {
  const document = root.ownerDocument ?? (root as Document);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      isIndexable(node as Text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  });

  const chunks: TextChunk[] = [];
  const parts: string[] = [];
  let offset = 0;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node as Text).data;
    chunks.push({ node: node as Text, start: offset, end: offset + text.length });
    parts.push(text);
    offset += text.length;
  }

  return { text: parts.join(""), chunks };
}

/** Index of the chunk containing `offset`, or -1. Chunks are sorted, so bisect. */
function findChunkIndex(chunks: TextChunk[], offset: number): number {
  let low = 0;
  let high = chunks.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const chunk = chunks[mid];
    if (offset < chunk.start) {
      high = mid - 1;
    } else if (offset >= chunk.end) {
      low = mid + 1;
    } else {
      return mid;
    }
  }

  return -1;
}

/** Turns a text offset range back into a DOM range. */
export function offsetsToRange(index: TextIndex, start: number, end: number): Range | null {
  if (start >= end) return null;

  const startIndex = findChunkIndex(index.chunks, start);
  // `end` is exclusive, so the last included character is at end - 1.
  const endIndex = findChunkIndex(index.chunks, end - 1);
  if (startIndex === -1 || endIndex === -1) return null;

  const startChunk = index.chunks[startIndex];
  const endChunk = index.chunks[endIndex];
  const range = startChunk.node.ownerDocument.createRange();
  range.setStart(startChunk.node, start - startChunk.start);
  range.setEnd(endChunk.node, end - endChunk.start);

  return range;
}

/** Turns a DOM range (as produced by a selection) into text offsets. */
export function rangeToOffsets(
  index: TextIndex,
  range: Range,
): { start: number; end: number } | null {
  const container = range.commonAncestorContainer;
  const touched = index.chunks.filter(
    (chunk) => container.contains(chunk.node) && range.intersectsNode(chunk.node),
  );
  if (touched.length === 0) return null;

  const first = touched[0];
  const last = touched[touched.length - 1];
  const start = first.start + (range.startContainer === first.node ? range.startOffset : 0);
  const end = last.start + (range.endContainer === last.node ? range.endOffset : last.node.length);

  return start < end ? { start, end } : null;
}
