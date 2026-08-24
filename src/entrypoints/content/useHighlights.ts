import { useEffect, useState } from "react";
import type { Note } from "@/core";
import { createHighlighter, type Highlighter } from "@/services/highlighter";

/** Pages that fill in content after load get a few more attempts. */
const RETRY_DELAYS = [800, 2000, 5000];

export interface HighlightState {
  highlighter: Highlighter;
  /** Notes whose text could not be found on the page. */
  missing: Note[];
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

    const result = highlighter.sync(notes);
    setMissing(result.missing);
    if (result.missing.length === 0) return;

    const timers = RETRY_DELAYS.map((delay) =>
      setTimeout(() => setMissing(highlighter.sync(notes).missing), delay),
    );
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [notes, enabled, highlighter]);

  useEffect(() => () => highlighter.destroy(), [highlighter]);

  return { highlighter, missing };
}
