const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Short, human-readable age of a note: "just now", "3h ago", "Mar 4". */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const elapsed = now - timestamp;

  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)}d ago`;

  const date = new Date(timestamp);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** A timestamp as the calendar day it fell on, in UTC: "2026-03-04". */
export function formatIsoDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}
