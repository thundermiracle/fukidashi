import { useEffect, useState } from "react";

export interface PageSelection {
  range: Range;
  text: string;
}

/** Selections in form fields and in the extension's own UI are not annotatable. */
function isAnnotatable(range: Range): boolean {
  const node = range.startContainer;
  if (node.getRootNode() !== node.ownerDocument) return false;

  const element = node instanceof Element ? node : node.parentElement;
  if (!element) return false;
  if (element instanceof HTMLElement && element.isContentEditable) return false;

  return !element.closest("input, textarea, select, [contenteditable]");
}

/** The current text selection on the page, or null when there is nothing to annotate. */
export function useSelection(enabled: boolean): PageSelection | null {
  const [selection, setSelection] = useState<PageSelection | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSelection(null);
      return;
    }

    const read = () => {
      const current = document.getSelection();
      if (!current || current.isCollapsed || current.rangeCount === 0) {
        setSelection(null);
        return;
      }

      const range = current.getRangeAt(0);
      const text = range.toString();
      if (text.trim().length === 0 || !isAnnotatable(range)) {
        setSelection(null);
        return;
      }

      setSelection({ range: range.cloneRange(), text });
    };

    // The selection is only final after the browser has processed the event.
    const readLater = () => setTimeout(read, 0);
    const onSelectionChange = () => {
      const current = document.getSelection();
      if (!current || current.isCollapsed) setSelection(null);
    };

    document.addEventListener("mouseup", readLater, true);
    document.addEventListener("keyup", readLater, true);
    document.addEventListener("selectionchange", onSelectionChange);

    return () => {
      document.removeEventListener("mouseup", readLater, true);
      document.removeEventListener("keyup", readLater, true);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [enabled]);

  return selection;
}

export function clearSelection(): void {
  document.getSelection()?.removeAllRanges();
}
