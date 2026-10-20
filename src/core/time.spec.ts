import { describe, expect, it } from "vitest";
import { ageOf } from "./time";

const NOW = new Date("2026-03-10T12:00:00Z").getTime();
const minutes = (count: number) => count * 60_000;

describe("ageOf", () => {
  it("calls the last minute now", () => {
    expect(ageOf(NOW - 30_000, NOW)).toEqual({ unit: "now" });
  });

  it("counts minutes, hours and days", () => {
    expect(ageOf(NOW - minutes(5), NOW)).toEqual({ unit: "minutes", count: 5 });
    expect(ageOf(NOW - minutes(60 * 3), NOW)).toEqual({ unit: "hours", count: 3 });
    expect(ageOf(NOW - minutes(60 * 24 * 2), NOW)).toEqual({ unit: "days", count: 2 });
  });

  it("switches to a date after a week", () => {
    expect(ageOf(NOW - minutes(60 * 24 * 30), NOW)).toEqual({
      unit: "date",
      date: expect.stringMatching(/\w+ \d+/),
    });
  });

  it("includes the year for older notes", () => {
    expect(ageOf(new Date("2024-07-04T12:00:00Z").getTime(), NOW)).toEqual({
      unit: "date",
      date: expect.stringMatching(/2024/),
    });
  });
});
