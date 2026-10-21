import { ageOf } from "@/core";
import type catalogue from "../../public/_locales/en/messages.json";

/**
 * Every message the extension shows, by the name the catalogues in
 * `public/_locales/` give it. English is the default locale, so its catalogue
 * is the list; the others translate the same names.
 */
export type MessageKey = keyof typeof catalogue;

type StemOf<Key> = Key extends `${infer Stem}_one` ? Stem : never;

/** The messages that read differently for one, by the stem their two forms share. */
type CountedKey = StemOf<MessageKey>;

type Values = Record<string, string | number>;

/**
 * A message in the browser's language, with its `{name}` slots filled in.
 * `chrome.i18n` picks the language and falls back to English for anything a
 * catalogue lacks, so this reads the same in the page, the popup and the
 * worker. Called while rendering, never at import time: the browser — or a
 * test's stand-in for it — has to be there first.
 */
export function t(key: MessageKey, values: Values = {}): string {
  return chrome.i18n
    .getMessage(key)
    .replace(/\{(\w+)\}/g, (slot, name: string) => (name in values ? String(values[name]) : slot));
}

/** A message whose wording follows a count: "1 note", "3 notes". */
export function tCount(key: CountedKey, count: number, values: Values = {}): string {
  const form = count === 1 ? "one" : "other";
  return t(`${key}_${form}` as const, { ...values, count });
}

/** How long ago something happened, in the browser's language: "just now", "3h ago", "Mar 4". */
export function formatAge(timestamp: number, now?: number): string {
  const age = ageOf(timestamp, now);
  switch (age.unit) {
    case "now":
      return t("ageJustNow");
    case "minutes":
      return t("ageMinutes", { count: age.count });
    case "hours":
      return t("ageHours", { count: age.count });
    case "days":
      return t("ageDays", { count: age.count });
    case "date":
      return age.date;
  }
}
