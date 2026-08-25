import { describe, expect, it } from "vitest";
import { keepUntranslated } from "./translate";

describe("keepUntranslated", () => {
  it("marks the element both ways a page translator recognises", () => {
    const element = document.createElement("div");

    keepUntranslated(element);

    expect(element.getAttribute("translate")).toBe("no");
    expect(element.classList.contains("notranslate")).toBe(true);
  });

  it("keeps the classes the element already had", () => {
    const element = document.createElement("div");
    element.className = "fk-root";

    keepUntranslated(element);

    expect(element.className).toBe("fk-root notranslate");
  });
});
