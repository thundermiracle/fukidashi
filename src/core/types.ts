/** Notion-style highlight colors, in the order shown in the color picker. */
export const NOTE_COLORS = ["yellow", "green", "blue", "pink", "purple"] as const;

export type NoteColor = (typeof NOTE_COLORS)[number];

export const DEFAULT_NOTE_COLOR: NoteColor = "yellow";

/**
 * Where a note is attached, expressed as a text quote plus the position it had
 * when it was created. The quote survives most page changes; the position is
 * only used to disambiguate when the same text appears several times.
 */
export interface TextAnchor {
  /** The selected text itself. */
  exact: string;
  /** Text immediately before `exact` (up to CONTEXT_LENGTH characters). */
  prefix: string;
  /** Text immediately after `exact` (up to CONTEXT_LENGTH characters). */
  suffix: string;
  /** Offset of `exact` within the page text when the note was created. */
  start: number;
}

export interface Note {
  id: string;
  /** The user's memo. May be empty — then the note is a plain highlight. */
  comment: string;
  color: NoteColor;
  anchor: TextAnchor;
  createdAt: number;
  updatedAt: number;
}

/** The notes of one page, held under the normalized URL they are stored by. */
export interface PageNotes {
  url: string;
  notes: Note[];
}

/** Every annotated page of one site, the way the popup lists them. */
export interface SiteNotes {
  host: string;
  pages: PageNotes[];
  noteCount: number;
  /** When the site's most recently edited note was written. */
  updatedAt: number;
}
