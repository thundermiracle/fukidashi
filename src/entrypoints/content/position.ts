export interface Size {
  width: number;
  height: number;
}

export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface PanelPosition {
  left: number;
  top: number;
  /** Which side of the anchor the panel ended up on. */
  placement: "above" | "below";
  /** Where the speech-bubble tail should sit, relative to the panel's left edge. */
  tailOffset: number;
}

const EDGE_GAP = 8;
const TAIL_INSET = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Places a floating panel next to the anchor: above it when there is room,
 * below it otherwise, always kept inside the viewport.
 */
export function placePanel(
  anchor: AnchorRect,
  panel: Size,
  viewport: Size,
  gap = EDGE_GAP,
): PanelPosition {
  const fitsAbove = anchor.top - panel.height - gap >= EDGE_GAP;
  const placement = fitsAbove ? "above" : "below";
  const top = fitsAbove
    ? anchor.top - panel.height - gap
    : clamp(
        anchor.bottom + gap,
        EDGE_GAP,
        Math.max(EDGE_GAP, viewport.height - panel.height - EDGE_GAP),
      );

  const anchorCenter = (anchor.left + anchor.right) / 2;
  const left = clamp(
    anchorCenter - panel.width / 2,
    EDGE_GAP,
    Math.max(EDGE_GAP, viewport.width - panel.width - EDGE_GAP),
  );

  const tailOffset = clamp(
    anchorCenter - left,
    TAIL_INSET,
    Math.max(TAIL_INSET, panel.width - TAIL_INSET),
  );

  return { left, top, placement, tailOffset };
}
