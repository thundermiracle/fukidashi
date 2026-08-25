import {
  buildTextIndex,
  HIGHLIGHT_ATTRIBUTE,
  type Note,
  type NoteColor,
  offsetsToRange,
  resolveAnchor,
} from "@/core";
import { ensureHighlightStyles, removeHighlightStyles } from "./styles";
import { ACTIVE_ATTRIBUTE, findMarks, markClassName, unwrapMarks, wrapRange } from "./wrapRange";

export interface SyncResult {
  /** Notes whose text was found and highlighted. */
  rendered: Note[];
  /** Notes whose text is no longer on the page. */
  missing: Note[];
}

export interface Highlighter {
  /** Brings the page's highlights in line with `notes`. */
  sync(notes: Note[]): SyncResult;
  /** Ids currently drawn on the page. */
  renderedIds(): string[];
  noteIdAt(target: EventTarget | null): string | null;
  marksFor(id: string): HTMLElement[];
  setActive(id: string | null): void;
  destroy(): void;
}

export function createHighlighter(root: HTMLElement = document.body): Highlighter {
  const doc = root.ownerDocument;
  const rendered = new Map<string, NoteColor>();
  let activeId: string | null = null;

  const applyActive = () => {
    for (const id of rendered.keys()) {
      for (const mark of findMarks(root, id)) {
        if (id === activeId) {
          mark.setAttribute(ACTIVE_ATTRIBUTE, "true");
        } else {
          mark.removeAttribute(ACTIVE_ATTRIBUTE);
        }
      }
    }
  };

  const draw = (note: Note): boolean => {
    // The index is rebuilt per note: wrapping splits text nodes, so a stale
    // index would point at nodes that no longer hold the expected text.
    const index = buildTextIndex(root);
    const offsets = resolveAnchor(index.text, note.anchor);
    if (!offsets) return false;

    const range = offsetsToRange(index, offsets.start, offsets.end);
    if (!range) return false;

    return wrapRange(range, note).length > 0;
  };

  return {
    sync(notes) {
      ensureHighlightStyles(doc);

      const incoming = new Map(notes.map((note) => [note.id, note]));

      for (const id of [...rendered.keys()]) {
        const note = incoming.get(id);
        if (!note) {
          unwrapMarks(root, id);
          rendered.delete(id);
          continue;
        }

        const marks = findMarks(root, id);
        // The page can throw a highlight away by rewriting the text it wraps —
        // a translation, or a framework replacing the node. Forgetting the note
        // here lets the pass below draw it again.
        if (marks.length === 0) {
          rendered.delete(id);
          continue;
        }

        if (rendered.get(id) !== note.color) {
          for (const mark of marks) mark.className = markClassName(note.color);
          rendered.set(id, note.color);
        }
      }

      const result: SyncResult = { rendered: [], missing: [] };

      for (const note of notes) {
        if (rendered.has(note.id)) {
          result.rendered.push(note);
          continue;
        }
        if (draw(note)) {
          rendered.set(note.id, note.color);
          result.rendered.push(note);
        } else {
          result.missing.push(note);
        }
      }

      applyActive();
      return result;
    },

    renderedIds() {
      return [...rendered.keys()];
    },

    noteIdAt(target) {
      if (!(target instanceof Element)) return null;
      const mark = target.closest<HTMLElement>(`mark[${HIGHLIGHT_ATTRIBUTE}]`);
      return mark?.getAttribute(HIGHLIGHT_ATTRIBUTE) ?? null;
    },

    marksFor(id) {
      return findMarks(root, id);
    },

    setActive(id) {
      activeId = id;
      applyActive();
    },

    destroy() {
      for (const id of [...rendered.keys()]) unwrapMarks(root, id);
      rendered.clear();
      activeId = null;
      removeHighlightStyles(doc);
    },
  };
}

export { HIGHLIGHT_BACKGROUNDS, HIGHLIGHT_HOVER_BACKGROUNDS } from "./styles";
export { HIGHLIGHT_CLASS } from "./wrapRange";
