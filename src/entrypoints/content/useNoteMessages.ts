import { useEffect } from "react";
import type { Highlighter } from "@/services/highlighter";
import { onScrollToNote } from "@/services/messages";

/** How long a note stays emphasised after the popup jumps to it. */
const EMPHASIS_DURATION = 2000;

/** Scrolls to the note the popup asks for and flashes its highlight. */
export function useNoteMessages(highlighter: Highlighter) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const unsubscribe = onScrollToNote((noteId) => {
      const [mark] = highlighter.marksFor(noteId);
      if (!mark) return;

      mark.scrollIntoView({ behavior: "smooth", block: "center" });
      highlighter.setActive(noteId);
      clearTimeout(timer);
      timer = setTimeout(() => highlighter.setActive(null), EMPHASIS_DURATION);
    });

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [highlighter]);
}
