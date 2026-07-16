import { describe, expect, it } from "vitest";
import {
  blocksToDaySchedules,
  defaultWorkingWeek,
  effectiveOn,
  isExemptWorkingHours,
  isRegularDayOff,
  overlappingPatterns,
  validateEffectiveDates,
  validateWorkingDays,
  workingDayCount,
} from "../src/domain/working-hours";
import type { WorkingHoursPattern } from "../src/domain/types";

describe("working-hours helpers", () => {
  it("defaults to weekdays on and weekends off", () => {
    const week = defaultWorkingWeek();
    expect(week.find((d) => d.weekday === 1)?.regularDayOff).toBe(false);
    expect(week.find((d) => d.weekday === 0)?.regularDayOff).toBe(true);
  });

  it("migrates legacy grid blocks into weekday rows", () => {
    const days = blocksToDaySchedules([
      { weekday: 1, start: 540, end: 1020 },
      { weekday: 3, start: 600, end: 960 },
    ]);
    expect(days.find((d) => d.weekday === 1)).toEqual({
      weekday: 1,
      regularDayOff: false,
      start: 540,
      end: 1020,
      workLocation: "on_site",
    });
    expect(days.find((d) => d.weekday === 2)?.regularDayOff).toBe(true);
  });

  it("detects regular weekday days off within effective dates", () => {
    const pattern: WorkingHoursPattern = {
      id: "wh-1",
      employeeId: "emp-1",
      effectiveStart: "2026-07-01",
      effectiveEnd: "2026-08-31",
      days: defaultWorkingWeek(),
      updatedBy: "emp-1",
      updatedAt: "",
    };
    expect(isRegularDayOff(pattern, "2026-07-16")).toBe(false); // Thursday
    expect(isRegularDayOff(pattern, "2026-07-19")).toBe(true); // Sunday
    expect(effectiveOn(pattern, "2026-09-01")).toBe(false);
  });

  it("validates working day rows and effective dates", () => {
    expect(validateEffectiveDates(undefined, "2026-07-01")[0]).toContain("required");
    expect(
      validateWorkingDays([{ weekday: 2, regularDayOff: false, start: 600, end: 540 }]),
    ).toHaveLength(1);
  });

  it("skips start/end validation for exempt staff", () => {
    expect(
      validateWorkingDays([{ weekday: 2, regularDayOff: false }], { exempt: true }),
    ).toHaveLength(0);
  });

  it("identifies exempt classifications for working hours", () => {
    expect(isExemptWorkingHours("exempt_staff")).toBe(true);
    expect(isExemptWorkingHours("manager")).toBe(true);
    expect(isExemptWorkingHours("non_exempt_staff")).toBe(false);
  });

  it("defaults work location to on_site", () => {
    const week = defaultWorkingWeek();
    expect(week.find((d) => d.weekday === 1)?.workLocation).toBe("on_site");
  });

  it("counts working (on-shift) days", () => {
    expect(workingDayCount(defaultWorkingWeek())).toBe(5); // Mon–Fri
    expect(workingDayCount([{ weekday: 1, regularDayOff: false, start: 540, end: 1020 }])).toBe(1);
    expect(workingDayCount([])).toBe(0);
  });

  it("detects overlapping saved schedules but allows adjacent terms", () => {
    const fall: WorkingHoursPattern = {
      id: "wh-fall", employeeId: "e1", effectiveStart: "2026-09-01", effectiveEnd: "2026-12-31",
      days: defaultWorkingWeek(), updatedBy: "e1", updatedAt: "",
    };
    // A spring term that starts the day after fall ends does not overlap.
    expect(overlappingPatterns([fall], { id: "wh-spring", effectiveStart: "2027-01-01", effectiveEnd: "2027-03-31" })).toBeNull();
    // A term that starts inside fall's range overlaps.
    expect(overlappingPatterns([fall], { id: "wh-x", effectiveStart: "2026-12-15", effectiveEnd: "2027-02-01" })).not.toBeNull();
    // Editing the same pattern never conflicts with itself.
    expect(overlappingPatterns([fall], { id: "wh-fall", effectiveStart: "2026-09-01", effectiveEnd: "2026-12-31" })).toBeNull();
    // An open-ended pattern (no end) overlaps a later dated one.
    expect(overlappingPatterns([{ ...fall, effectiveEnd: undefined }], { id: "wh-y", effectiveStart: "2027-05-01", effectiveEnd: "2027-06-01" })).not.toBeNull();
  });
});
