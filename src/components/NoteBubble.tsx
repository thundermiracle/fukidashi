import { type RefObject, useEffect } from "react";
import type { Note } from "@/core";
import { formatAge, t } from "@/services/i18n";
import { CloseIcon, PencilIcon, TrashIcon } from "./icons";

interface NoteBubbleProps {
  panelRef: RefObject<HTMLDivElement | null>;
  style: React.CSSProperties;
  placement: "above" | "below";
  tailOffset: number;
  note: Note;
  /** Pinned bubbles stay open until dismissed; hovered ones follow the pointer. */
  pinned: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

/** The speech bubble shown next to a highlight. */
export function NoteBubble({
  panelRef,
  style,
  placement,
  tailOffset,
  note,
  pinned,
  onEdit,
  onDelete,
  onClose,
  onMouseEnter,
  onMouseLeave,
}: NoteBubbleProps) {
  // Pointer handlers live on the element itself: the bubble is a container,
  // not an interactive control.
  useEffect(() => {
    const panel = panelRef.current;
    panel?.addEventListener("mouseenter", onMouseEnter);
    panel?.addEventListener("mouseleave", onMouseLeave);

    return () => {
      panel?.removeEventListener("mouseenter", onMouseEnter);
      panel?.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [panelRef, onMouseEnter, onMouseLeave]);

  return (
    <div
      ref={panelRef}
      className={`fk-panel fk-bubble fk-bubble--${placement} fk-bubble--${note.color}`}
      style={{ ...style, "--fk-tail-offset": `${tailOffset}px` } as React.CSSProperties}
    >
      {note.comment ? (
        <p className="fk-bubble__comment">{note.comment}</p>
      ) : (
        <p className="fk-bubble__comment fk-bubble__comment--empty">{t("highlightWithoutMemo")}</p>
      )}
      <div className="fk-bubble__footer">
        <span className="fk-bubble__time">{formatAge(note.updatedAt)}</span>
        <div className="fk-bubble__actions">
          <button type="button" className="fk-icon-button" title={t("editNote")} onClick={onEdit}>
            <PencilIcon />
          </button>
          <button
            type="button"
            className="fk-icon-button"
            title={t("deleteNote")}
            onClick={onDelete}
          >
            <TrashIcon />
          </button>
          {pinned && (
            <button type="button" className="fk-icon-button" title={t("close")} onClick={onClose}>
              <CloseIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
