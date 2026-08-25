import { type RefObject, useEffect, useRef } from "react";
import type { NoteColor } from "@/core";
import { ColorSwatches } from "./ColorSwatches";

const SAVE_HINT = navigator.userAgent.includes("Mac") ? "⌘ + Enter" : "Ctrl + Enter";

interface NoteComposerProps {
  panelRef: RefObject<HTMLDivElement | null>;
  style: React.CSSProperties;
  /** Whether the panel has been measured and placed against its anchor. */
  placed: boolean;
  quote: string;
  comment: string;
  color: NoteColor;
  onCommentChange: (comment: string) => void;
  onColorChange: (color: NoteColor) => void;
  onSave: () => void;
  onCancel: () => void;
}

/** The card used to write a memo, both for a new note and when editing one. */
export function NoteComposer({
  panelRef,
  style,
  placed,
  quote,
  comment,
  color,
  onCommentChange,
  onColorChange,
  onSave,
  onCancel,
}: NoteComposerProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Not before the panel is placed: it spends its first frame hidden so it can
  // be measured, and a hidden element both refuses focus and does not take it
  // back once it is shown. Placement happens once, so neither does this.
  useEffect(() => {
    const input = inputRef.current;
    if (!input || !placed) return;

    input.focus();
    // An edited memo is opened at its end, ready to be carried on.
    input.setSelectionRange(input.value.length, input.value.length);
  }, [placed]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSave();
    }
  };

  return (
    <div ref={panelRef} className="fk-panel fk-composer" style={style}>
      <p className={`fk-quote fk-quote--${color}`}>{quote}</p>
      <textarea
        ref={inputRef}
        className="fk-input"
        placeholder="Add a note…"
        value={comment}
        rows={3}
        onChange={(event) => onCommentChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="fk-composer__footer">
        <ColorSwatches value={color} onSelect={onColorChange} title={(name) => `Use ${name}`} />
        <div className="fk-composer__actions">
          <span className="fk-hint">{SAVE_HINT}</span>
          <button type="button" className="fk-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="fk-button fk-button--primary" onClick={onSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
