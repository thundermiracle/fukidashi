import { HIGHLIGHT_ATTRIBUTE, type NoteColor } from "@/core";

export const HIGHLIGHT_CLASS = "fukidashi-highlight";
export const ACTIVE_ATTRIBUTE = "data-fukidashi-active";

/** True when the node and the range overlap over at least one character. */
function overlaps(range: Range, node: Text): boolean {
  const nodeRange = node.ownerDocument.createRange();
  nodeRange.selectNodeContents(node);

  // compareBoundaryPoints compares a point of `range` against a point of the
  // node: END_TO_START is range.start vs node.end, START_TO_END is range.end
  // vs node.start.
  const rangeStartsBeforeNodeEnds =
    range.compareBoundaryPoints(Range.END_TO_START, nodeRange) === -1;
  const rangeEndsAfterNodeStarts = range.compareBoundaryPoints(Range.START_TO_END, nodeRange) === 1;

  return rangeStartsBeforeNodeEnds && rangeEndsAfterNodeStarts;
}

function collectTextNodes(range: Range): Text[] {
  const root = range.commonAncestorContainer;

  if (root.nodeType === Node.TEXT_NODE) {
    return overlaps(range, root as Text) ? [root as Text] : [];
  }

  const walker = (root.ownerDocument ?? document).createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (text.data.length > 0 && overlaps(range, text)) nodes.push(text);
  }

  return nodes;
}

/**
 * Splits the boundary text nodes so that the returned nodes cover exactly the
 * range — no more, no less.
 */
function trimToRange(range: Range, nodes: Text[]): Text[] {
  if (nodes.length === 0) return nodes;

  // The end is split first: splitting the start would move the end offset.
  const last = nodes[nodes.length - 1];
  if (range.endContainer === last && range.endOffset < last.data.length) {
    last.splitText(range.endOffset);
  }

  const first = nodes[0];
  if (range.startContainer === first && range.startOffset > 0) {
    nodes[0] = first.splitText(range.startOffset);
  }

  return nodes.filter((node) => node.data.length > 0);
}

export function markClassName(color: NoteColor): string {
  return `${HIGHLIGHT_CLASS} ${HIGHLIGHT_CLASS}--${color}`;
}

/** Wraps every piece of text inside the range in its own `<mark>`. */
export function wrapRange(range: Range, note: { id: string; color: NoteColor }): HTMLElement[] {
  const nodes = trimToRange(range, collectTextNodes(range));

  return nodes.map((node) => {
    const mark = node.ownerDocument.createElement("mark");
    mark.className = markClassName(note.color);
    mark.setAttribute(HIGHLIGHT_ATTRIBUTE, note.id);
    node.parentNode?.insertBefore(mark, node);
    mark.appendChild(node);
    return mark;
  });
}

export function findMarks(root: ParentNode, id: string): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(`[${HIGHLIGHT_ATTRIBUTE}="${id}"]`));
}

/** Puts the highlighted text back where it was and removes the wrappers. */
export function unwrapMarks(root: ParentNode, id: string): void {
  for (const mark of findMarks(root, id)) {
    const parent = mark.parentNode;
    if (!parent) continue;

    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  }
}
