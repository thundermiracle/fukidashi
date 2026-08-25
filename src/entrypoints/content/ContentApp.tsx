import { useCallback, useEffect, useState } from "react";
import { NoteBubble } from "@/components/NoteBubble";
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
import { deleteNote, saveNote } from "@/services/notes";
import {
  type AnchorSource,
  useAnchoredPosition,
  useDismissOnOutsideClick,
  useEscapeKey,
  useNotes,
  usePageUrl,
  useSettings,
} from "./hooks";
import { useHighlightBubble } from "./useHighlightBubble";
import { useHighlights } from "./useHighlights";
import { useNoteMessages } from "./useNoteMessages";
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
  const { highlighter } = useHighlights(notes, enabled);

  const selection = useSelection(enabled);
  const [draft, setDraft] = useState<Draft | null>(null);
  const bubble = useHighlightBubble(enabled && draft === null);
  const bubbleNote = notes.find((note) => note.id === bubble.target?.id) ?? null;

  // Picking a note in the popup jumps to it and opens its bubble, which is
  // also what emphasises the highlight underneath.
  useNoteMessages(highlighter, bubble.open);

  const toolbar = useAnchoredPosition<HTMLDivElement>(draft ? null : (selection?.range ?? null));
  const composer = useAnchoredPosition<HTMLDivElement>(draft?.target ?? null);
  const bubblePanel = useAnchoredPosition<HTMLDivElement>(
    bubbleNote ? (bubble.target?.element ?? null) : null,
  );

  // The highlight under the open bubble is emphasised.
  useEffect(() => {
    highlighter.setActive(bubbleNote ? (bubble.target?.id ?? null) : null);
  }, [highlighter, bubbleNote, bubble.target?.id]);

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

  const handleEditNote = useCallback(() => {
    const target = bubble.target;
    const note = notes.find((candidate) => candidate.id === target?.id);
    if (!target || !note) return;

    bubble.close();
    setDraft({
      target: target.element,
      anchor: note.anchor,
      quote: note.anchor.exact,
      color: note.color,
      comment: note.comment,
      noteId: note.id,
      createdAt: note.createdAt,
    });
  }, [bubble, notes]);

  const handleDeleteNote = useCallback(() => {
    const id = bubble.target?.id;
    if (!id) return;

    bubble.close();
    deleteNote(url, id);
  }, [bubble, url]);

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
      {!draft && bubbleNote && bubble.target && (
        <NoteBubble
          panelRef={bubblePanel.ref}
          style={bubblePanel.style}
          placement={bubblePanel.position?.placement ?? "above"}
          tailOffset={bubblePanel.position?.tailOffset ?? 16}
          note={bubbleNote}
          pinned={bubble.target.pinned}
          onEdit={handleEditNote}
          onDelete={handleDeleteNote}
          onClose={bubble.close}
          onMouseEnter={bubble.hold}
          onMouseLeave={bubble.release}
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
