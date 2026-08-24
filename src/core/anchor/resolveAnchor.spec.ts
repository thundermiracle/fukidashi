import { describe, expect, it } from "vitest";
import type { TextAnchor } from "../types";
import { resolveAnchor } from "./resolveAnchor";

function anchor(partial: Partial<TextAnchor> & { exact: string }): TextAnchor {
  return { prefix: "", suffix: "", start: 0, ...partial };
}

describe("resolveAnchor", () => {
  it("finds the quote when the page is unchanged", () => {
    const text = "The quick brown fox jumps over the lazy dog.";

    expect(resolveAnchor(text, anchor({ exact: "brown fox", start: 10 }))).toEqual({
      start: 10,
      end: 19,
    });
  });

  it("finds the quote again after the text above it grew", () => {
    const text = "A new intro paragraph. The quick brown fox jumps.";

    expect(resolveAnchor(text, anchor({ exact: "brown fox", start: 10 }))).toEqual({
      start: 33,
      end: 42,
    });
  });

  it("uses the surrounding context to pick between repeated quotes", () => {
    const text = "alpha TARGET omega ... beta TARGET gamma";
    const resolved = resolveAnchor(
      text,
      anchor({ exact: "TARGET", prefix: "beta ", suffix: " gamma", start: 0 }),
    );

    expect(resolved).toEqual({ start: 28, end: 34 });
  });

  it("falls back to the closest occurrence when context is unavailable", () => {
    const text = "TARGET ... TARGET ... TARGET";

    expect(resolveAnchor(text, anchor({ exact: "TARGET", start: 22 }))).toEqual({
      start: 22,
      end: 28,
    });
  });

  it("returns null when the quote is gone", () => {
    expect(resolveAnchor("nothing to see here", anchor({ exact: "missing" }))).toBeNull();
  });

  it("returns null for an empty quote", () => {
    expect(resolveAnchor("some text", anchor({ exact: "" }))).toBeNull();
  });
});
