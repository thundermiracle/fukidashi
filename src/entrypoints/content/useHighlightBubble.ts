import { useCallback, useEffect, useRef, useState } from "react";
import { HIGHLIGHT_ATTRIBUTE } from "@/core";

/** Short enough to feel instant, long enough not to flash while reading. */
const SHOW_DELAY = 120;
/** Time to move the pointer from the highlight onto the bubble. */
const HIDE_DELAY = 220;

export interface BubbleTarget {
  id: string;
  element: HTMLElement;
  /** Hovering peeks at a note; clicking pins the bubble open. */
  pinned: boolean;
}

function markAt(node: EventTarget | null): HTMLElement | null {
  return node instanceof Element ? node.closest<HTMLElement>(`mark[${HIGHLIGHT_ATTRIBUTE}]`) : null;
}

/** Tracks which highlight the note bubble should be shown for. */
export function useHighlightBubble(enabled: boolean) {
  const [target, setTarget] = useState<BubbleTarget | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const close = useCallback(() => {
    clearTimeout(showTimer.current);
    clearTimeout(hideTimer.current);
    setTarget(null);
  }, []);

  /** Keeps the bubble open while the pointer is on it. */
  const hold = useCallback(() => clearTimeout(hideTimer.current), []);

  /** Opens the bubble of one highlight and leaves it open until dismissed. */
  const open = useCallback((id: string, element: HTMLElement) => {
    clearTimeout(showTimer.current);
    clearTimeout(hideTimer.current);
    setTarget({ id, element, pinned: true });
  }, []);

  const release = useCallback(() => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(
      () => setTarget((current) => (current?.pinned ? current : null)),
      HIDE_DELAY,
    );
  }, []);

  useEffect(() => {
    if (!enabled) {
      close();
      return;
    }

    const onMouseOver = (event: MouseEvent) => {
      const mark = markAt(event.target);
      const id = mark?.getAttribute(HIGHLIGHT_ATTRIBUTE);
      if (!mark || !id) return;

      hold();
      clearTimeout(showTimer.current);
      showTimer.current = setTimeout(() => {
        setTarget((current) => (current?.pinned ? current : { id, element: mark, pinned: false }));
      }, SHOW_DELAY);
    };

    const onMouseOut = (event: MouseEvent) => {
      if (!markAt(event.target)) return;
      clearTimeout(showTimer.current);
      release();
    };

    const onClick = (event: MouseEvent) => {
      const mark = markAt(event.target);
      const id = mark?.getAttribute(HIGHLIGHT_ATTRIBUTE);
      if (mark && id) open(id, mark);
    };

    document.addEventListener("mouseover", onMouseOver, true);
    document.addEventListener("mouseout", onMouseOut, true);
    document.addEventListener("click", onClick, true);

    return () => {
      document.removeEventListener("mouseover", onMouseOver, true);
      document.removeEventListener("mouseout", onMouseOut, true);
      document.removeEventListener("click", onClick, true);
      clearTimeout(showTimer.current);
      clearTimeout(hideTimer.current);
    };
  }, [enabled, close, hold, open, release]);

  return { target, open, hold, release, close };
}
