import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "./time";

const NOW = new Date("2026-03-10T12:00:00Z").getTime();
const minutes = (count: number) => count * 60_000;

describe("formatRelativeTime", () => {
  it("calls the last minute 'just now'", () => {
    expect(formatRelativeTime(NOW - 30_000, NOW)).toBe("just now");
  });

  it("counts minutes, hours and days", () => {
    expect(formatRelativeTime(NOW - minutes(5), NOW)).toBe("5m ago");
    expect(formatRelativeTime(NOW - minutes(60 * 3), NOW)).toBe("3h ago");
    expect(formatRelativeTime(NOW - minutes(60 * 24 * 2), NOW)).toBe("2d ago");
  });

  it("switches to a date after a week", () => {
    expect(formatRelativeTime(NOW - minutes(60 * 24 * 30), NOW)).toMatch(/\w+ \d+/);
  });

  it("includes the year for older notes", () => {
    expect(formatRelativeTime(new Date("2024-07-04T12:00:00Z").getTime(), NOW)).toMatch(/2024/);
  });
});
