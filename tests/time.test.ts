import { describe, expect, it } from "vitest";
import {
  addDays,
  dateRange,
  formatTime,
  formatTime12,
  mergeIntervals,
  overlapMinutes,
  overlaps,
  parseTime,
  seededRandom,
  subtractIntervals,
  todayInTimeZone,
  weekdayOf,
} from "../src/domain/time";

describe("time helpers", () => {
  it("parses and formats times", () => {
    expect(parseTime("09:30")).toBe(570);
    expect(formatTime(570)).toBe("09:30");
    expect(formatTime12(570)).toBe("9:30 AM");
    expect(formatTime12(13 * 60)).toBe("1:00 PM");
  });

  it("rejects malformed times", () => {
    expect(() => parseTime("25:00")).toThrow();
    expect(() => parseTime("noon")).toThrow();
  });

  it("detects overlap correctly", () => {
    expect(overlaps({ start: 0, end: 60 }, { start: 30, end: 90 })).toBe(true);
    expect(overlaps({ start: 0, end: 60 }, { start: 60, end: 90 })).toBe(false); // touching, not overlapping
    expect(overlapMinutes({ start: 0, end: 60 }, { start: 30, end: 90 })).toBe(30);
  });

  it("merges and subtracts intervals", () => {
    expect(mergeIntervals([{ start: 0, end: 30 }, { start: 20, end: 60 }])).toEqual([{ start: 0, end: 60 }]);
    expect(subtractIntervals({ start: 0, end: 120 }, [{ start: 60, end: 90 }])).toEqual([
      { start: 0, end: 60 },
      { start: 90, end: 120 },
    ]);
  });

  it("computes weekdays and date ranges deterministically", () => {
    expect(weekdayOf("2026-07-13")).toBe(1); // Monday
    expect(weekdayOf("2026-07-19")).toBe(0); // Sunday
    expect(addDays("2026-07-13", 6)).toBe("2026-07-19");
    expect(dateRange("2026-07-13", "2026-07-15")).toEqual(["2026-07-13", "2026-07-14", "2026-07-15"]);
  });

  it("resolves today in Pacific time independently of UTC midnight", () => {
    const utcEvening = new Date("2026-07-17T04:30:00.000Z"); // still Jul 16 evening in Pacific (PDT)
    const pacific = todayInTimeZone("America/Los_Angeles", utcEvening);
    const utc = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(utcEvening);
    expect(pacific).toBe("2026-07-16");
    expect(utc).toBe("2026-07-17");
  });

  it("seeded RNG is deterministic", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
    expect(seededRandom(43)()).not.toEqual(seededRandom(42)());
  });
});
