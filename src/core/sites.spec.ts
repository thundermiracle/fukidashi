import { describe, expect, it } from "vitest";
import { groupBySite, lastTouched } from "./sites";
import type { Note, PageNotes } from "./types";

function note(id: string, updatedAt: number): Note {
  return {
    id,
    comment: `memo ${id}`,
    color: "yellow",
    anchor: { exact: id, prefix: "", suffix: "", start: 0 },
    createdAt: updatedAt,
    updatedAt,
  };
}

function page(url: string, ...updatedAt: number[]): PageNotes {
  return { url, notes: updatedAt.map((at, index) => note(`${url}#${index}`, at)) };
}

describe("lastTouched", () => {
  it("is the newest note of the page", () => {
    expect(lastTouched(page("https://example.com/", 100, 300, 200).notes)).toBe(300);
  });

  it("is zero for a page without notes", () => {
    expect(lastTouched([])).toBe(0);
  });
});

describe("groupBySite", () => {
  it("puts the pages of one host together", () => {
    const sites = groupBySite([
      page("https://example.com/a", 100),
      page("https://other.com/x", 200),
      page("https://example.com/b", 300),
    ]);

    expect(sites.map((site) => site.host)).toEqual(["example.com", "other.com"]);
    expect(sites[0].pages.map((it) => it.url)).toEqual([
      "https://example.com/b",
      "https://example.com/a",
    ]);
  });

  it("counts every note of the site", () => {
    const sites = groupBySite([
      page("https://example.com/a", 100, 150),
      page("https://x.com/", 90),
    ]);

    expect(sites.find((site) => site.host === "example.com")?.noteCount).toBe(2);
  });

  it("shows the site with the most recent note first", () => {
    const sites = groupBySite([page("https://old.com/", 100), page("https://fresh.com/", 900)]);

    expect(sites.map((site) => site.host)).toEqual(["fresh.com", "old.com"]);
    expect(sites[0].updatedAt).toBe(900);
  });

  it("returns nothing when no page has notes", () => {
    expect(groupBySite([])).toEqual([]);
  });
});
