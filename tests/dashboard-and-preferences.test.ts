import { describe, expect, it } from "vitest";
import { canViewStudentAvailability } from "../src/domain/scope";
import { resolveEmployeeProfile } from "../src/domain/employee-profile";
import { generateSchedule, type GenerationInput } from "../src/domain/scheduling";
import { defaultCaliforniaPolicy } from "../src/domain/compliance";
import { weekdayOf } from "../src/domain/time";
import { mondayOf, monthWeeks, packLanes } from "../src/lib/schedule-view";
import type { AvailabilityPattern, EmployeeProfile, Position, UserAccount } from "../src/domain/types";

function roles(...r: UserAccount["roles"][number]["role"][]): Pick<UserAccount, "roles"> {
  return { roles: r.map((role) => ({ role })) };
}

describe("canViewStudentAvailability", () => {
  it("allows schedulers, managers, and admins regardless of classification", () => {
    expect(canViewStudentAvailability(roles("SUPER_ADMIN"))).toBe(true);
    expect(canViewStudentAvailability(roles("MANAGER"))).toBe(true);
    expect(canViewStudentAvailability(roles("SCHEDULER"))).toBe(true);
  });

  it("allows staff-level employees and auditors", () => {
    expect(canViewStudentAvailability(roles("EMPLOYEE"), "non_exempt_staff")).toBe(true);
    expect(canViewStudentAvailability(roles("EMPLOYEE"), "exempt_staff")).toBe(true);
    expect(canViewStudentAvailability(roles("EMPLOYEE"), "manager")).toBe(true);
    expect(canViewStudentAvailability(roles("AUDITOR"))).toBe(true);
  });

  it("hides the grid from student workers, viewers, and unknown classifications", () => {
    expect(canViewStudentAvailability(roles("EMPLOYEE"), "student_worker")).toBe(false);
    expect(canViewStudentAvailability(roles("EMPLOYEE"))).toBe(false);
    expect(canViewStudentAvailability(roles("VIEWER"))).toBe(false);
    // A student worker who somehow also holds a viewer role is still hidden.
    expect(canViewStudentAvailability(roles("EMPLOYEE", "VIEWER"), "student_worker")).toBe(false);
  });

  it("hides the grid when sampling the student experience without a stored profile", () => {
    const student = resolveEmployeeProfile([], { id: "view-student", displayName: "Sample student", email: "s@example.test", state: "active", roles: [{ role: "EMPLOYEE" }], createdAt: "", updatedAt: "" }, "student");
    expect(canViewStudentAvailability({ roles: [{ role: "EMPLOYEE" }] }, student.classification)).toBe(false);
  });
});

describe("schedule-view helpers", () => {
  it("mondayOf always returns a Monday", () => {
    for (const d of ["2026-07-16", "2026-07-01", "2026-12-31", "2026-01-04"]) {
      expect(weekdayOf(mondayOf(d))).toBe(1);
    }
  });

  it("monthWeeks covers the whole month in Monday-anchored weeks", () => {
    const weeks = monthWeeks("2026-07-16");
    for (const w of weeks) {
      expect(w).toHaveLength(7);
      expect(weekdayOf(w[0])).toBe(1); // starts Monday
      expect(w.some((d) => d.slice(0, 7) === "2026-07")).toBe(true);
    }
    const all = weeks.flat();
    expect(all).toContain("2026-07-01");
    expect(all).toContain("2026-07-31");
  });

  it("packLanes puts non-overlapping items in one lane", () => {
    const placed = packLanes(
      [{ s: 0, e: 60 }, { s: 60, e: 120 }],
      (x) => x.s,
      (x) => x.e,
    );
    expect(placed.every((p) => p.lanes === 1 && p.lane === 0)).toBe(true);
  });

  it("packLanes splits overlapping items into side-by-side lanes", () => {
    const placed = packLanes(
      [{ s: 0, e: 120 }, { s: 30, e: 90 }],
      (x) => x.s,
      (x) => x.e,
    );
    expect(placed.every((p) => p.lanes === 2)).toBe(true);
    expect(new Set(placed.map((p) => p.lane))).toEqual(new Set([0, 1]));
  });
});

describe("meal-break preference in generation", () => {
  const position: Position = {
    id: "pos-desk", name: "Borrowing Services Desk", shortLabel: "Desk", colorToken: "position-desk", icon: "desk",
    locationId: "loc-desk", minStaffing: 1, preferredStaffing: 1, maxStaffing: 2, minAssignmentMinutes: 60,
    maxContinuousMinutes: 600, requiresPhysicalPresence: true, blocksOtherAssignments: false,
    countsAsPublicService: false, selfClaimable: true, swapsAllowed: true, eligibleClassifications: [],
    applicableLocationIds: [], order: 0, active: true,
  };
  const employee: EmployeeProfile = {
    id: "emp-1", legalName: "Casey", email: "casey@example.test", classification: "non_exempt_staff",
    eligibleLocationIds: ["loc-desk"], additionalManagerIds: [], active: true, targetWeeklyHours: 40,
    minWeeklyHours: 0, maxWeeklyHours: 40, maxDailyHours: 10, earliestStart: 0, latestEnd: 1439,
    minTurnaroundMinutes: 480, overtimeEligible: true, breakPolicyId: "ca-nonexempt-v1",
    qualifiedPositionIds: ["pos-desk"], qualifiedTaskIds: [], employmentPercentage: 1,
    googleCalendarConnected: false, notificationPrefs: { inApp: true, email: true, calendar: false, digest: false },
  };

  function build(mealBreakMinutes?: 30 | 60): GenerationInput {
    const pattern: AvailabilityPattern = {
      id: "avail-1", employeeId: "emp-1", label: "term",
      blocks: [{ weekday: weekdayOf("2026-07-13"), start: 8 * 60, end: 20 * 60, kind: "available" }],
      mealBreakMinutes,
      updatedBy: "emp-1", updatedAt: "2026-07-13T00:00:00Z",
    };
    return {
      seed: 1,
      requirements: [{ id: "cov-1", date: "2026-07-13", positionId: "pos-desk", locationId: "loc-desk", start: 9 * 60, end: 18 * 60, count: 1 }],
      employees: [employee],
      positions: [position],
      patterns: { "emp-1": [pattern] },
      leave: { "emp-1": [] },
      leaveTypes: [],
      policyByClassification: { non_exempt_staff: defaultCaliforniaPolicy("non_exempt_staff") },
      lockedShifts: [],
      scheduleId: "sched-week",
      now: "2026-07-13T00:00:00Z",
    };
  }

  it("schedules a 60-minute unpaid meal when the person prefers one hour", () => {
    const r = generateSchedule(build(60));
    const meal = r.shifts[0].breaks.find((b) => b.kind === "meal");
    expect(meal).toBeDefined();
    expect(meal!.end - meal!.start).toBe(60);
    expect(meal!.paid).toBe(false);
  });

  it("falls back to the legal minimum (30 min) when no preference is set", () => {
    const r = generateSchedule(build(undefined));
    const meal = r.shifts[0].breaks.find((b) => b.kind === "meal");
    expect(meal).toBeDefined();
    expect(meal!.end - meal!.start).toBe(30);
  });
});
