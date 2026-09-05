import { NOTE_COLORS, type Note, type NoteColor, type PageTitle } from "../types";
import type { SyncPage } from "./types";

/**
 * The format every export and every sync backend carries. It is the canonical
 * reading of the user's notes: complete, tombstones included, and the only
 * thing an import reads back. Formats meant for people to read — Markdown for
 * a notes app, say — are one-way views derived from this.
 */
export const SYNC_FORMAT_VERSION = 1;

export interface SyncPayload {
  version: number;
  /** When the payload was written, for the reader's benefit. */
  exportedAt: number;
  pages: SyncPage[];
}

export function createSyncPayload(pages: SyncPage[], exportedAt: number): SyncPayload {
  return { version: SYNC_FORMAT_VERSION, exportedAt, pages };
}

/** Thrown for anything that is not a payload this version can read. */
export class SyncPayloadError extends Error {}

/**
 * Thrown for a payload written by a newer version of Fukidashi. Unlike a
 * payload that is simply broken, this one fixes itself once the extension
 * updates, so the sync layer tells the two apart.
 */
export class SyncVersionError extends SyncPayloadError {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readAnchor(value: unknown): Note["anchor"] {
  if (!isRecord(value)) throw new SyncPayloadError("a note is missing where it points");

  const { exact, prefix, suffix, start } = value;
  if (
    typeof exact !== "string" ||
    typeof prefix !== "string" ||
    typeof suffix !== "string" ||
    typeof start !== "number"
  ) {
    throw new SyncPayloadError("a note points somewhere this version cannot read");
  }

  return { exact, prefix, suffix, start };
}

function readNote(value: unknown): Note {
  if (!isRecord(value)) throw new SyncPayloadError("a note is not readable");

  const { id, comment, color, createdAt, updatedAt, deletedAt } = value;
  if (
    typeof id !== "string" ||
    typeof comment !== "string" ||
    typeof createdAt !== "number" ||
    typeof updatedAt !== "number" ||
    !NOTE_COLORS.includes(color as NoteColor) ||
    (deletedAt !== undefined && typeof deletedAt !== "number")
  ) {
    throw new SyncPayloadError("a note is not readable");
  }

  const note: Note = {
    id,
    comment,
    color: color as NoteColor,
    anchor: readAnchor(value.anchor),
    createdAt,
    updatedAt,
  };
  return deletedAt === undefined ? note : { ...note, deletedAt };
}

function readTitle(value: unknown): PageTitle | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || typeof value.text !== "string" || typeof value.updatedAt !== "number") {
    throw new SyncPayloadError("a page title is not readable");
  }
  return { text: value.text, updatedAt: value.updatedAt };
}

function readPage(value: unknown): SyncPage {
  if (!isRecord(value) || typeof value.url !== "string" || !Array.isArray(value.notes)) {
    throw new SyncPayloadError("a page is not readable");
  }

  const page: SyncPage = { url: value.url, notes: value.notes.map(readNote) };
  const title = readTitle(value.title);
  return title ? { ...page, title } : page;
}

/**
 * Reads a payload back, refusing anything it cannot vouch for rather than
 * letting half-understood notes into storage.
 */
export function parseSyncPayload(value: unknown): SyncPayload {
  if (!isRecord(value) || typeof value.version !== "number" || !Array.isArray(value.pages)) {
    throw new SyncPayloadError("This file is not a Fukidashi export.");
  }
  if (value.version > SYNC_FORMAT_VERSION) {
    throw new SyncVersionError("This file was written by a newer version of Fukidashi.");
  }

  return {
    version: value.version,
    exportedAt: typeof value.exportedAt === "number" ? value.exportedAt : 0,
    pages: value.pages.map(readPage),
  };
}
