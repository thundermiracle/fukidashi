import { type RefObject, useEffect } from "react";
import type { NoteColor } from "@/core";
import { ColorSwatches } from "./ColorSwatches";
import { BubbleIcon } from "./icons";

interface SelectionToolbarProps {
  panelRef: RefObject<HTMLDivElement | null>;
  style: React.CSSProperties;
  onHighlight: (color: NoteColor) => void;
  onAddNote: () => void;
}

/**
 * The bar that appears next to a selection: one click highlights, the button
 * opens the composer for a memo.
 */
export function SelectionToolbar({
  panelRef,
  style,
  onHighlight,
  onAddNote,
}: SelectionToolbarProps) {
  // Pressing the mouse inside the toolbar would otherwise drop the page
  // selection before the click handler runs.
  useEffect(() => {
    const panel = panelRef.current;
    const keepSelection = (event: MouseEvent) => event.preventDefault();

    panel?.addEventListener("mousedown", keepSelection);
    return () => panel?.removeEventListener("mousedown", keepSelection);
  }, [panelRef]);

  return (
    <div ref={panelRef} className="fk-panel fk-toolbar" style={style}>
      <ColorSwatches onSelect={onHighlight} title={(color) => `Highlight ${color}`} />
      <span className="fk-divider" />
      <button type="button" className="fk-action" onClick={onAddNote}>
        <BubbleIcon />
        Add note
      </button>
    </div>
  );
}
