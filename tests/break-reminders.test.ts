import { describe, expect, it } from "vitest";
import { computeBreakReminders } from "../src/domain/break-reminders";
import { defaultCaliforniaPolicy } from "../src/domain/compliance";
import type { EmployeeProfile, Shift } from "../src/domain/types";

function employee(overrides: Partial<EmployeeProfile> = {}): EmployeeProfile {
  return {
    id: "emp-1",
    legalName: "Test Worker",
    email: "test@example.com",
    classification: "student_worker",
    eligibleLocationIds: [],
    additionalManagerIds: [],
    active: true,
    targetWeeklyHours: 10,
    minWeeklyHours: 0,
    maxWeeklyHours: 20,
    maxDailyHours: 8,
    earliestStart: 480,
    latestEnd: 1200,
    minTurnaroundMinutes: 480,
    overtimeEligible: false,
    breakPolicyId: "ca-nonexempt-v1",
    qualifiedPositionIds: [],
    qualifiedTaskIds: [],
    employmentPercentage: 0.5,
    googleCalendarConnected: false,
    notificationPrefs: { inApp: true, email: true, calendar: false, digest: false },
    ...overrides,
  };
}

function shift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: "shift-1",
    scheduleId: "sched-1",
    employeeId: "emp-1",
    positionId: "pos-desk",
    locationId: "loc-desk",
    date: "2026-07-16",
    start: 540,
    end: 1020,
    taskIds: [],
    breaks: [],
    status: "published",
    source: "manager_created",
    locked: false,
    scheduleVersion: 1,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("computeBreakReminders", () => {
  const policy = defaultCaliforniaPolicy("student_worker");

  it("returns a day-off message when there is no shift", () => {
    const state = computeBreakReminders({
      employee: employee(),
      policy,
      shifts: [],
      date: "2026-07-16",
      nowMinutes: 600,
    });
    expect(state.phase).toBe("no_shift");
    expect(state.headline).toContain("No shift");
  });

  it("marks exempt staff as exempt from break tracking", () => {
    const state = computeBreakReminders({
      employee: employee({ classification: "exempt_staff" }),
      policy,
      shifts: [shift()],
      date: "2026-07-16",
      nowMinutes: 600,
    });
    expect(state.phase).toBe("exempt");
  });

  it("treats short shifts as not needing breaks", () => {
    const state = computeBreakReminders({
      employee: employee(),
      policy,
      shifts: [shift({ start: 540, end: 720 })], // 3 h — below rest and meal thresholds
      date: "2026-07-16",
      nowMinutes: 600,
    });
    expect(state.isShortShift).toBe(true);
    expect(state.reminders).toHaveLength(0);
    expect(state.headline).toContain("Short shift");
  });

  it("includes a meal reminder for long shifts", () => {
    const state = computeBreakReminders({
      employee: employee(),
      policy,
      shifts: [shift({ start: 540, end: 1020 })], // 8 h
      date: "2026-07-16",
      nowMinutes: 780,
      mealBreakMinutes: 30,
    });
    expect(state.reminders.some((r) => r.kind === "meal")).toBe(true);
    expect(state.suggestedShiftHours).toBe("8 h");
  });

  it("flags overdue meal breaks during an active shift", () => {
    const state = computeBreakReminders({
      employee: employee(),
      policy,
      shifts: [shift({ start: 540, end: 1020 })],
      date: "2026-07-16",
      nowMinutes: 900, // 6 h into shift, past 5 h meal deadline
    });
    const meal = state.reminders.find((r) => r.kind === "meal");
    expect(meal?.urgency).toBe("overdue");
    expect(state.headline).toContain("meal");
  });

  it("shows before-shift guidance with planned hours", () => {
    const state = computeBreakReminders({
      employee: employee(),
      policy,
      shifts: [shift({ start: 600, end: 1020 })],
      date: "2026-07-16",
      nowMinutes: 540,
    });
    expect(state.phase).toBe("before");
    expect(state.subline).toContain("meal break eligible");
  });
});
