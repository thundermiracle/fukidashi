import { useCallback, useState } from "react";
import { NoteComposer } from "@/components/NoteComposer";
import { SelectionToolbar } from "@/components/SelectionToolbar";
import {
  buildTextIndex,
  createAnchor,
  DEFAULT_NOTE_COLOR,
  generateId,
  type NoteColor,
  type TextAnchor,
} from "@/core";
import { saveNote } from "@/services/notes";
import {
  type AnchorSource,
  useAnchoredPosition,
  useDismissOnOutsideClick,
  useEscapeKey,
  useNotes,
  usePageUrl,
  useSettings,
} from "./hooks";
import { useHighlights } from "./useHighlights";
import { clearSelection, useSelection } from "./useSelection";

interface Draft {
  /** What the composer is positioned against: a selection or a highlight. */
  target: AnchorSource;
  anchor: TextAnchor;
  quote: string;
  color: NoteColor;
  comment: string;
  /** Set while an existing note is being edited. */
  noteId?: string;
  createdAt?: number;
}

export function ContentApp() {
  const { enabled } = useSettings();
  const url = usePageUrl();
  const notes = useNotes(url);
  useHighlights(notes, enabled);

  const selection = useSelection(enabled);
  const [draft, setDraft] = useState<Draft | null>(null);

  const toolbar = useAnchoredPosition<HTMLDivElement>(draft ? null : (selection?.range ?? null));
  const composer = useAnchoredPosition<HTMLDivElement>(draft?.target ?? null);

  const closeDraft = useCallback(() => setDraft(null), []);
  useEscapeKey(closeDraft, draft !== null);
  // An untouched composer gets out of the way; one with text waits for Save.
  useDismissOnOutsideClick(
    composer.ref,
    useCallback(() => {
      setDraft((current) => (current?.comment.trim() ? current : null));
    }, []),
    draft !== null,
  );

  const handleHighlight = useCallback(
    (color: NoteColor) => {
      if (!selection) return;
      const anchor = createAnchor(buildTextIndex(document.body), selection.range);
      if (!anchor) return;

      const now = Date.now();
      saveNote(url, {
        id: generateId(),
        comment: "",
        color,
        anchor,
        createdAt: now,
        updatedAt: now,
      });
      clearSelection();
    },
    [selection, url],
  );

  const handleAddNote = useCallback(() => {
    if (!selection) return;
    const anchor = createAnchor(buildTextIndex(document.body), selection.range);
    if (!anchor) return;

    setDraft({
      target: selection.range,
      anchor,
      quote: anchor.exact,
      color: DEFAULT_NOTE_COLOR,
      comment: "",
    });
  }, [selection]);

  const handleSave = useCallback(() => {
    if (!draft) return;

    const now = Date.now();
    saveNote(url, {
      id: draft.noteId ?? generateId(),
      comment: draft.comment.trim(),
      color: draft.color,
      anchor: draft.anchor,
      createdAt: draft.createdAt ?? now,
      updatedAt: now,
    });

    setDraft(null);
    clearSelection();
  }, [draft, url]);

  if (!enabled) return null;

  return (
    <div className="fk-root">
      {draft && (
        <NoteComposer
          panelRef={composer.ref}
          style={composer.style}
          quote={draft.quote}
          comment={draft.comment}
          color={draft.color}
          onCommentChange={(comment) => setDraft((current) => current && { ...current, comment })}
          onColorChange={(color) => setDraft((current) => current && { ...current, color })}
          onSave={handleSave}
          onCancel={closeDraft}
        />
      )}
      {!draft && selection && (
        <SelectionToolbar
          panelRef={toolbar.ref}
          style={toolbar.style}
          onHighlight={handleHighlight}
          onAddNote={handleAddNote}
        />
      )}
    </div>
  );
}
