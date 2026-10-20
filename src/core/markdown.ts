import { formatCount } from "./plural";
import { inPageOrder } from "./sites";
import type { SyncPage, SyncPayload } from "./sync";
import { formatIsoDay } from "./time";
import { liveNotes } from "./tombstone";
import type { Note, NoteColor } from "./types";
import { formatPageUrl } from "./url";

/**
 * The notes apps whose Markdown is different enough to be worth writing
 * twice. Notion reads plain CommonMark and shows anything beyond it as the
 * characters it was typed with, so its flavor stays inside CommonMark;
 * Obsidian adds frontmatter properties, callouts and ==highlights==, which
 * are the closest thing it has to what a highlight is here.
 *
 * Markdown is a one-way reading of the notes: it drops the tombstones and the
 * anchors an import needs, so the JSON payload stays the format that comes
 * back in.
 */
export const MARKDOWN_FLAVORS = ["notion", "obsidian"] as const;

export type MarkdownFlavor = (typeof MARKDOWN_FLAVORS)[number];

/**
 * The words an export is written in, for the page to give in the user's
 * language. The frontmatter keys and the callout type are not among them:
 * Obsidian reads those, not the user.
 */
export interface MarkdownWords {
  title: string;
  /** The callout title an Obsidian note gets, after the color it was given. */
  colors: Record<NoteColor, string>;
  /** The Notion flavor's line under the title: how much, and on which day. */
  summary: (noteCount: number, pageCount: number, day: string) => string;
}

export const ENGLISH_MARKDOWN_WORDS: MarkdownWords = {
  title: "Fukidashi notes",
  colors: {
    yellow: "Yellow",
    green: "Green",
    blue: "Blue",
    pink: "Pink",
    purple: "Purple",
  },
  summary: (noteCount, pageCount, day) =>
    `${formatCount(noteCount, "note")} on ${formatCount(pageCount, "page")}, exported on ${day}.`,
};

/** What a Markdown export is called, dated and named after the app it is for. */
export function markdownFileName(exportedAt: number, flavor: MarkdownFlavor): string {
  return `fukidashi-notes-${flavor}-${formatIsoDay(exportedAt)}.md`;
}

/**
 * Page text arrives with the line breaks and the indentation the markup had,
 * so a quote is folded back onto one line: Markdown joins those lines when it
 * renders anyway, and Obsidian's ==highlight== does not survive a break.
 */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Prefixes every line, the blank ones included, so a block stays one block. */
function prefixLines(text: string, marker: string): string[] {
  return text.split("\n").map((line) => (line.length > 0 ? `${marker} ${line}` : marker));
}

/** A memo as the user typed it, or nothing when the note is a plain highlight. */
function memo(note: Note): string {
  return note.comment.trim();
}

function notionNote(note: Note): string {
  const blocks = [`> ${oneLine(note.anchor.exact)}`];
  if (memo(note)) blocks.push(memo(note));
  return blocks.join("\n\n");
}

/** The quote and its memo as one callout, titled with the color it was given. */
function obsidianNote(note: Note, words: MarkdownWords): string {
  const lines = [`> [!quote] ${words.colors[note.color]}`, `> ==${oneLine(note.anchor.exact)}==`];
  if (memo(note)) lines.push(">", ...prefixLines(memo(note), ">"));
  return lines.join("\n");
}

function pageSection(
  page: SyncPage,
  notes: Note[],
  flavor: MarkdownFlavor,
  words: MarkdownWords,
): string {
  const heading = oneLine(page.title?.text ?? formatPageUrl(page.url));
  const write = (note: Note) =>
    flavor === "obsidian" ? obsidianNote(note, words) : notionNote(note);

  return [`## ${heading}`, `<${page.url}>`, ...notes.map(write)].join("\n\n");
}

/** Obsidian reads these as note properties, which is where it looks for them. */
function frontmatter(exportedAt: number, noteCount: number, pageCount: number): string {
  return [
    "---",
    `exported: ${formatIsoDay(exportedAt)}`,
    `notes: ${noteCount}`,
    `pages: ${pageCount}`,
    "tags:",
    "  - fukidashi",
    "---",
  ].join("\n");
}

/**
 * The notes as one Markdown file, meant to be read in a notes app rather than
 * read back in here. Deleted notes are left out — they are stored only so a
 * sync cannot resurrect them — and so are the pages nothing is left on.
 */
export function renderMarkdown(
  payload: SyncPayload,
  flavor: MarkdownFlavor,
  words: MarkdownWords = ENGLISH_MARKDOWN_WORDS,
): string {
  const pages = payload.pages
    .map((page) => ({ page, notes: inPageOrder(liveNotes(page.notes)) }))
    .filter(({ notes }) => notes.length > 0);
  const noteCount = pages.reduce((total, { notes }) => total + notes.length, 0);

  const blocks =
    flavor === "obsidian"
      ? [frontmatter(payload.exportedAt, noteCount, pages.length), `# ${words.title}`]
      : [
          `# ${words.title}`,
          words.summary(noteCount, pages.length, formatIsoDay(payload.exportedAt)),
        ];

  for (const { page, notes } of pages) blocks.push(pageSection(page, notes, flavor, words));

  return `${blocks.join("\n\n")}\n`;
}
