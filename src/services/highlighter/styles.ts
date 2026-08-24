import { NOTE_COLORS, type NoteColor, UI_ATTRIBUTE } from "@/core";
import { ACTIVE_ATTRIBUTE, HIGHLIGHT_CLASS } from "./wrapRange";

const STYLE_ID = "fukidashi-highlight-styles";

/** Notion's highlight backgrounds. Dark text is forced so they stay readable. */
export const HIGHLIGHT_BACKGROUNDS: Record<NoteColor, string> = {
  yellow: "#fdecc8",
  green: "#dbeddb",
  blue: "#d3e5ef",
  pink: "#f5e0e9",
  purple: "#e8deee",
};

export const HIGHLIGHT_HOVER_BACKGROUNDS: Record<NoteColor, string> = {
  yellow: "#fbdba7",
  green: "#c5e0c5",
  blue: "#bcd8e8",
  pink: "#efcbdb",
  purple: "#dbcbe6",
};

function colorRules(color: NoteColor): string {
  return `
mark.${HIGHLIGHT_CLASS}--${color} {
  background-color: ${HIGHLIGHT_BACKGROUNDS[color]} !important;
}
mark.${HIGHLIGHT_CLASS}--${color}:hover,
mark.${HIGHLIGHT_CLASS}--${color}[${ACTIVE_ATTRIBUTE}="true"] {
  background-color: ${HIGHLIGHT_HOVER_BACKGROUNDS[color]} !important;
}`;
}

export function highlightStyleSheet(): string {
  return `
mark.${HIGHLIGHT_CLASS} {
  color: #37352f !important;
  padding: 0.1em 0 !important;
  margin: 0 !important;
  border-radius: 2px;
  cursor: pointer;
  text-decoration: inherit;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
  transition: background-color 120ms ease;
}
mark.${HIGHLIGHT_CLASS}[${ACTIVE_ATTRIBUTE}="true"] {
  box-shadow: 0 0 0 2px rgba(35, 131, 226, 0.4);
}
${NOTE_COLORS.map(colorRules).join("\n")}
`.trim();
}

/** Adds the highlight stylesheet to the page once. */
export function ensureHighlightStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;

  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.setAttribute(UI_ATTRIBUTE, "");
  style.textContent = highlightStyleSheet();
  (doc.head ?? doc.documentElement).append(style);
}

export function removeHighlightStyles(doc: Document = document): void {
  doc.getElementById(STYLE_ID)?.remove();
}
