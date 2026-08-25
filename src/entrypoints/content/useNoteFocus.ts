import { useEffect } from "react";
import { takePendingFocus } from "@/services/focus";
import type { Highlighter } from "@/services/highlighter";
import { onFocusNote } from "@/services/messages";

/** How soon a highlight that is not drawn yet is looked for again. */
const RETRY_INTERVAL = 200;
/** By now the page has had every chance to show the note. */
const GIVE_UP_AFTER = 8000;

/** Told about the highlight of a note once there is one to show. */
export type NoteFound = (noteId: string, mark: HTMLElement) => void;

function bringIntoView(highlighter: Highlighter, noteId: string, onFound: NoteFound): boolean {
  const [mark] = highlighter.marksFor(noteId);
  if (!mark) return false;

  mark.scrollIntoView({ behavior: "smooth", block: "center" });
  onFound(noteId, mark);
  return true;
}

/**
 * Brings the note the popup asks for into view and hands it to `onFound`, so
 * that picking a note out of a list reads it as well as finds it.
 */
export function useNoteMessages(highlighter: Highlighter, onFound: NoteFound) {
  useEffect(() => {
    return onFocusNote((noteId) => {
      bringIntoView(highlighter, noteId, onFound);
    });
  }, [highlighter, onFound]);
}

/**
 * The same, for a note picked in the popup before this page was open. The
 * highlight exists only once the note has been found in the text, which a page
 * still loading has not allowed yet — so it is tried again until it can.
 */
export function usePendingFocus(url: string, highlighter: Highlighter, onFound: NoteFound) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let active = true;

    const attempt = (noteId: string, until: number) => {
      if (!active || bringIntoView(highlighter, noteId, onFound)) return;
      if (Date.now() < until) timer = setTimeout(() => attempt(noteId, until), RETRY_INTERVAL);
    };

    takePendingFocus(url).then((noteId) => {
      if (noteId && active) attempt(noteId, Date.now() + GIVE_UP_AFTER);
    });

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [url, highlighter, onFound]);
}
