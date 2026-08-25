import { useEffect } from "react";
import type { Highlighter } from "@/services/highlighter";
import { onFocusNote } from "@/services/messages";

/**
 * Brings the note the popup asks for into view and hands it to `onFound`, so
 * that picking a note out of a list reads it as well as finds it.
 */
export function useNoteMessages(
  highlighter: Highlighter,
  onFound: (noteId: string, mark: HTMLElement) => void,
) {
  useEffect(
    () =>
      onFocusNote((noteId) => {
        const [mark] = highlighter.marksFor(noteId);
        if (!mark) return;

        mark.scrollIntoView({ behavior: "smooth", block: "center" });
        onFound(noteId, mark);
      }),
    [highlighter, onFound],
  );
}
