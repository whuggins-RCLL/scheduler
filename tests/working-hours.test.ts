import { describe, expect, it } from "vitest";
import {
  blocksToDaySchedules,
  defaultWorkingWeek,
  effectiveOn,
  isExemptWorkingHours,
  isRegularDayOff,
  validateEffectiveDates,
  validateWorkingDays,
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
});
