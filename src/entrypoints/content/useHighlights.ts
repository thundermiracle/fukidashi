import { useEffect, useState } from "react";
import type { Note } from "@/core";
import { createHighlighter, type Highlighter } from "@/services/highlighter";

/** Long enough for a page to finish rewriting itself before we look again. */
const RESYNC_DELAY = 400;

/** Attributes are left out: emphasising a highlight would wake the observer. */
const WATCHED: MutationObserverInit = { childList: true, characterData: true, subtree: true };

export interface HighlightState {
  highlighter: Highlighter;
  /** Notes whose text could not be found on the page. */
  missing: Note[];
}

function sameNotes(a: Note[], b: Note[]): boolean {
  return a.length === b.length && a.every((note, index) => note.id === b[index].id);
}

/** Keeps the highlights on the page in step with the stored notes. */
export function useHighlights(notes: Note[], enabled: boolean): HighlightState {
  const [highlighter] = useState<Highlighter>(() => createHighlighter(document.body));
  const [missing, setMissing] = useState<Note[]>([]);

  useEffect(() => {
    if (!enabled) {
      highlighter.sync([]);
      setMissing([]);
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    // Pages fill in content late, and translating one replaces the text the
    // highlights wrap — both are mutations, so both bring the notes back.
    // Drawing is a mutation too, hence the observer is off while it happens;
    // a pass that draws nothing changes nothing, and the cycle ends there.
    const resync = () => {
      observer.disconnect();
      const result = highlighter.sync(notes);
      setMissing((current) => (sameNotes(current, result.missing) ? current : result.missing));
      observer.observe(document.body, WATCHED);
    };

    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(resync, RESYNC_DELAY);
    });

    resync();

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [notes, enabled, highlighter]);

  useEffect(() => () => highlighter.destroy(), [highlighter]);

  return { highlighter, missing };
}
