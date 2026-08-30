import { describe, expect, it } from "vitest";
import { toPageTitle } from "./title";

describe("toPageTitle", () => {
  it("reads the current format back as it is", () => {
    expect(toPageTitle({ text: "Docs", updatedAt: 500 })).toEqual({ text: "Docs", updatedAt: 500 });
  });

  it("reads a title stored before timestamps as never updated", () => {
    expect(toPageTitle("Docs")).toEqual({ text: "Docs", updatedAt: 0 });
  });

  it("reads anything else as no title", () => {
    expect(toPageTitle(undefined)).toBeUndefined();
    expect(toPageTitle(42)).toBeUndefined();
    expect(toPageTitle({ text: 42, updatedAt: 500 })).toBeUndefined();
    expect(toPageTitle({ text: "Docs" })).toBeUndefined();
  });
});
