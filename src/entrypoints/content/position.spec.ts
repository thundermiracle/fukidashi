import { describe, expect, it } from "vitest";
import { placePanel } from "./position";

const VIEWPORT = { width: 1000, height: 800 };
const PANEL = { width: 200, height: 100 };

describe("placePanel", () => {
  it("puts the panel above the anchor and centers it", () => {
    const position = placePanel({ top: 400, bottom: 420, left: 400, right: 600 }, PANEL, VIEWPORT);

    expect(position).toEqual({ left: 400, top: 292, placement: "above", tailOffset: 100 });
  });

  it("flips below when there is no room above", () => {
    const position = placePanel({ top: 20, bottom: 40, left: 400, right: 600 }, PANEL, VIEWPORT);

    expect(position.placement).toBe("below");
    expect(position.top).toBe(48);
  });

  it("keeps the panel inside the left and right edges", () => {
    const nearLeft = placePanel({ top: 400, bottom: 420, left: 0, right: 20 }, PANEL, VIEWPORT);
    const nearRight = placePanel(
      { top: 400, bottom: 420, left: 980, right: 1000 },
      PANEL,
      VIEWPORT,
    );

    expect(nearLeft.left).toBe(8);
    expect(nearRight.left).toBe(792);
  });

  it("keeps the tail pointing at the anchor when the panel is shifted", () => {
    const position = placePanel({ top: 400, bottom: 420, left: 0, right: 20 }, PANEL, VIEWPORT);

    expect(position.tailOffset).toBe(16);
  });

  it("keeps a panel that fits nowhere inside the viewport", () => {
    const position = placePanel(
      { top: 10, bottom: 790, left: 400, right: 600 },
      { width: 200, height: 400 },
      VIEWPORT,
    );

    expect(position.top).toBe(392);
    expect(position.placement).toBe("below");
  });
});
