const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * How long ago something happened, in the coarsest unit still worth saying:
 * minutes, hours or days for the last week, then the date itself. The words
 * around the counts belong to the page's language, so they are left to it.
 */
export type Age =
  | { unit: "now" }
  | { unit: "minutes" | "hours" | "days"; count: number }
  | { unit: "date"; date: string };

export function ageOf(timestamp: number, now: number = Date.now()): Age {
  const elapsed = now - timestamp;

  if (elapsed < MINUTE) return { unit: "now" };
  if (elapsed < HOUR) return { unit: "minutes", count: Math.floor(elapsed / MINUTE) };
  if (elapsed < DAY) return { unit: "hours", count: Math.floor(elapsed / HOUR) };
  if (elapsed < WEEK) return { unit: "days", count: Math.floor(elapsed / DAY) };

  const date = new Date(timestamp);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();

  // The browser's own locale already writes a date its way: "Mar 4", "4 Mar", "3月4日".
  return {
    unit: "date",
    date: date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    }),
  };
}

/** A timestamp as the calendar day it fell on, in UTC: "2026-03-04". */
export function formatIsoDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}
