import { describe, expect, it } from "vitest";
import { formatPageUrl, normalizePageUrl } from "./url";

describe("normalizePageUrl", () => {
  it("drops the hash so in-page links share one set of notes", () => {
    expect(normalizePageUrl("https://example.com/docs?page=2#section-3")).toBe(
      "https://example.com/docs?page=2",
    );
  });

  it("keeps the query string, which usually selects the content", () => {
    expect(normalizePageUrl("https://example.com/search?q=fukidashi")).toBe(
      "https://example.com/search?q=fukidashi",
    );
  });

  it("returns the input unchanged when it is not a URL", () => {
    expect(normalizePageUrl("not a url")).toBe("not a url");
  });
});

describe("formatPageUrl", () => {
  it("shows host and path", () => {
    expect(formatPageUrl("https://example.com/docs/intro")).toBe("example.com/docs/intro");
  });

  it("omits a bare root path", () => {
    expect(formatPageUrl("https://example.com/")).toBe("example.com");
  });
});
