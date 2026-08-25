/** The class page translators look for, next to the standard attribute. */
export const NO_TRANSLATE_CLASS = "notranslate";

/**
 * Tells a page translator to leave an element alone. Google Translate walks
 * into shadow roots, so the extension's own panels have to say so: a memo
 * must read the way it was typed, not the way it comes back translated.
 */
export function keepUntranslated(element: Element): void {
  element.setAttribute("translate", "no");
  element.classList.add(NO_TRANSLATE_CLASS);
}
