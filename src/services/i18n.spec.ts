import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeChromeI18n } from "@/testing/fakeChromeI18n";
import en from "../../public/_locales/en/messages.json";
import ja from "../../public/_locales/ja/messages.json";
import { formatAge, t, tCount } from "./i18n";

const NOW = new Date("2026-03-10T12:00:00Z").getTime();
const minutes = (count: number) => count * 60_000;

type Catalogue = Record<string, { message: string }>;

function slotsOf(message: string): string[] {
  return [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

describe("the catalogues", () => {
  const catalogues: Record<string, Catalogue> = { en, ja };

  it("translate the same messages", () => {
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
  });

  it.each(Object.keys(catalogues))("give %s every slot English fills in", (language) => {
    for (const [name, { message }] of Object.entries(catalogues[language])) {
      expect({ name, slots: slotsOf(message) }).toEqual({
        name,
        slots: slotsOf((en as Catalogue)[name].message),
      });
    }
  });

  it.each(Object.keys(catalogues))("leave no %s message empty", (language) => {
    for (const [name, { message }] of Object.entries(catalogues[language])) {
      expect({ name, message: message.trim() }).not.toEqual({ name, message: "" });
    }
  });

  it("name messages the way the browsers accept", () => {
    for (const name of Object.keys(en)) expect(name).toMatch(/^[A-Za-z0-9_]+$/);
  });

  it.each(Object.keys(catalogues))("fit the %s store listing", (language) => {
    const catalogue = catalogues[language];
    // The Chrome Web Store's limits for the name and the summary.
    expect(catalogue.extName.message.length).toBeLessThanOrEqual(75);
    expect(catalogue.extDescription.message.length).toBeLessThanOrEqual(132);
  });
});

describe("t", () => {
  beforeEach(() => vi.stubGlobal("chrome", createFakeChromeI18n().chrome));
  afterEach(() => vi.unstubAllGlobals());

  it("fills the message's slots in", () => {
    expect(t("openUrl", { url: "https://example.com/" })).toBe("Open https://example.com/");
  });

  it("leaves a slot it was given nothing for as it is", () => {
    expect(t("openUrl")).toBe("Open {url}");
  });

  it("speaks the browser's language", () => {
    vi.stubGlobal("chrome", createFakeChromeI18n("ja").chrome);

    expect(t("openUrl", { url: "https://example.com/" })).toBe("https://example.com/ を開く");
  });
});

describe("tCount", () => {
  beforeEach(() => vi.stubGlobal("chrome", createFakeChromeI18n().chrome));
  afterEach(() => vi.unstubAllGlobals());

  it("words one apart from the rest", () => {
    expect(tCount("noteCount", 0)).toBe("0 notes");
    expect(tCount("noteCount", 1)).toBe("1 note");
    expect(tCount("noteCount", 3)).toBe("3 notes");
  });

  it("words them alike in a language without plurals", () => {
    vi.stubGlobal("chrome", createFakeChromeI18n("ja").chrome);

    expect(tCount("noteCount", 1)).toBe("メモ1件");
    expect(tCount("noteCount", 3)).toBe("メモ3件");
  });
});

describe("formatAge", () => {
  beforeEach(() => vi.stubGlobal("chrome", createFakeChromeI18n().chrome));
  afterEach(() => vi.unstubAllGlobals());

  it("says how long ago, the short way", () => {
    expect(formatAge(NOW - 30_000, NOW)).toBe("just now");
    expect(formatAge(NOW - minutes(5), NOW)).toBe("5m ago");
    expect(formatAge(NOW - minutes(60 * 3), NOW)).toBe("3h ago");
    expect(formatAge(NOW - minutes(60 * 24 * 2), NOW)).toBe("2d ago");
  });

  it("says it in the browser's language", () => {
    vi.stubGlobal("chrome", createFakeChromeI18n("ja").chrome);

    expect(formatAge(NOW - 30_000, NOW)).toBe("たった今");
    expect(formatAge(NOW - minutes(5), NOW)).toBe("5分前");
    expect(formatAge(NOW - minutes(60 * 3), NOW)).toBe("3時間前");
    expect(formatAge(NOW - minutes(60 * 24 * 2), NOW)).toBe("2日前");
  });

  it("gives the date once it is more than a week old", () => {
    expect(formatAge(new Date("2024-07-04T12:00:00Z").getTime(), NOW)).toMatch(/2024/);
  });
});
