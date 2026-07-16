import { describe, expect, it } from "vitest";
import {
  appliesOnDate,
  defaultFrequency,
  describeFrequency,
  normalizeFrequency,
  occurrencesOnDate,
  weekdaysLabel,
} from "../src/domain/frequency";
import type { SchedulingFrequency } from "../src/domain/types";

const MON = "2026-07-13"; // Monday
const THU = "2026-07-16"; // Thursday

describe("frequency descriptions", () => {
  it("summarizes each cadence", () => {
    expect(describeFrequency(undefined)).toBe("Not set");
    expect(describeFrequency({ mode: "per_operational_hour", count: 1, weekdays: [] })).toBe("Every operational hour");
    expect(describeFrequency({ mode: "times_per_day", count: 1, weekdays: [] })).toBe("1×/day");
    expect(describeFrequency({ mode: "times_per_day", count: 2, weekdays: [1, 3, 5] })).toBe("2×/day (Mon, Wed, Fri)");
    expect(describeFrequency({ mode: "times_per_week", count: 3, weekdays: [] })).toBe("3×/week");
  });

  it("orders weekday labels Monday-first", () => {
    expect(weekdaysLabel([0, 1, 5])).toBe("Mon, Fri, Sun");
    expect(weekdaysLabel([])).toBe("every day");
  });

  it("defaults to once per day", () => {
    expect(defaultFrequency()).toEqual({ mode: "times_per_day", count: 1, weekdays: [] });
    expect(defaultFrequency("per_operational_hour").mode).toBe("per_operational_hour");
  });
});

describe("occurrences on a date", () => {
  it("scales per-operational-hour with the day's open hours", () => {
    const freq: SchedulingFrequency = { mode: "per_operational_hour", count: 1, weekdays: [] };
    expect(occurrencesOnDate(freq, MON, 8)).toBe(8);
    expect(occurrencesOnDate(freq, MON, 0)).toBe(0);
  });

  it("returns a flat count for times-per-day and respects weekday limits", () => {
    const twicePerDay: SchedulingFrequency = { mode: "times_per_day", count: 2, weekdays: [] };
    expect(occurrencesOnDate(twicePerDay, MON)).toBe(2);

    // "None on Thursdays" — every weekday except Thursday.
    const notThursday: SchedulingFrequency = { mode: "times_per_day", count: 1, weekdays: [1, 2, 3, 5] };
    expect(occurrencesOnDate(notThursday, MON)).toBe(1);
    expect(occurrencesOnDate(notThursday, THU)).toBe(0);
    expect(appliesOnDate(notThursday, THU)).toBe(false);
  });

  it("treats weekly totals as not-a-daily-count (0 per day for now)", () => {
    expect(occurrencesOnDate({ mode: "times_per_week", count: 3, weekdays: [] }, MON)).toBe(0);
  });
});

describe("normalizeFrequency", () => {
  it("rejects non-objects and unknown modes", () => {
    expect(normalizeFrequency(undefined)).toBeUndefined();
    expect(normalizeFrequency("nope")).toBeUndefined();
    expect(normalizeFrequency({ mode: "bogus" })).toBeUndefined();
  });

  it("fills defaults and sanitizes fields", () => {
    expect(normalizeFrequency({ mode: "times_per_day" })).toEqual({ mode: "times_per_day", count: 1, weekdays: [] });
    expect(normalizeFrequency({ mode: "times_per_day", count: 0 })).toEqual({ mode: "times_per_day", count: 1, weekdays: [] });
    expect(normalizeFrequency({ mode: "times_per_day", count: 3.7, weekdays: [1, 1, 9, 4, -2] })).toEqual({
      mode: "times_per_day",
      count: 4,
      weekdays: [1, 4],
    });
  });
});
