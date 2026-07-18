import { describe, expect, it } from "vitest";
import { generateSchedule, type GenerationInput } from "../src/domain/scheduling";
import { defaultCaliforniaPolicy } from "../src/domain/compliance";
import type { AvailabilityPattern, EmployeeProfile, Position, Shift } from "../src/domain/types";

/**
 * Regression guard for the fairness target fix: `scoreCandidate` must treat
 * `targetWeeklyHours` as the employee's actual weekly target and NOT multiply by
 * employmentPercentage again (which double-scaled part-time targets and made
 * part-timers look overloaded). Here a part-timer sitting well under their real
 * target should win the assignment over a full-timer at half of theirs — which
 * only holds without the double-scale.
 */

function emp(over: Partial<EmployeeProfile> & Pick<EmployeeProfile, "id" | "targetWeeklyHours" | "employmentPercentage" | "maxWeeklyHours">): EmployeeProfile {
  return {
    legalName: over.id,
    email: `${over.id}@ex.test`,
    classification: "non_exempt_staff",
    eligibleLocationIds: ["loc-x"],
    additionalManagerIds: [],
    active: true,
    minWeeklyHours: 0,
    maxDailyHours: 8,
    earliestStart: 0,
    latestEnd: 1439,
    minTurnaroundMinutes: 0,
    overtimeEligible: false,
    breakPolicyId: "ca-nonexempt-v1",
    qualifiedPositionIds: [],
    qualifiedTaskIds: [],
    googleCalendarConnected: false,
    notificationPrefs: { inApp: true, email: false, calendar: false, digest: false },
    ...over,
  } as EmployeeProfile;
}

const position: Position = {
  id: "pos-x",
  name: "X",
  shortLabel: "X",
  colorToken: "x",
  icon: "x",
  locationId: "loc-x",
  applicableLocationIds: ["loc-x"],
  minStaffing: 1,
  preferredStaffing: 1,
  maxStaffing: 5,
  unlimitedSeating: false,
  minAssignmentMinutes: 60,
  maxContinuousMinutes: 480,
  requiresPhysicalPresence: false,
  blocksOtherAssignments: false,
  countsAsPublicService: false,
  selfClaimable: false,
  swapsAllowed: true,
  eligibleClassifications: [],
  order: 0,
  active: true,
};

const MON = "2026-07-20"; // Monday
const SUN = "2026-07-19"; // Sunday (prior day, for preload)

function preload(id: string, minutes: number): Shift {
  return {
    id: `pre-${id}`,
    scheduleId: "s",
    employeeId: id,
    positionId: "pos-x",
    locationId: "loc-x",
    date: SUN,
    start: 480,
    end: 480 + minutes,
    breaks: [],
    taskIds: [],
    status: "published",
    source: "imported",
    locked: true,
    scheduleVersion: 1,
    createdAt: "2026-07-13T00:00:00Z",
    updatedAt: "2026-07-13T00:00:00Z",
  };
}

function availableMonday(id: string): AvailabilityPattern {
  return {
    id: `av-${id}`,
    employeeId: id,
    blocks: [{ weekday: 1, start: 480, end: 1080, kind: "available" }],
    updatedBy: id,
    updatedAt: "2026-07-13T00:00:00Z",
  };
}

describe("fairness scoring uses the real weekly target", () => {
  it("favors a part-timer below their target over a full-timer at half theirs", () => {
    // Full-timer: target 10h, at 5h already -> loadRatio 0.5.
    const full = emp({ id: "full", targetWeeklyHours: 10, employmentPercentage: 1, maxWeeklyHours: 40 });
    // Part-timer: real target 5h (FTE 0.5), only 110 min in -> loadRatio ~0.37.
    // With the old double-scale their target would be 2.5h and they'd read as overloaded.
    const part = emp({ id: "part", targetWeeklyHours: 5, employmentPercentage: 0.5, maxWeeklyHours: 20 });

    const input: GenerationInput = {
      seed: 1,
      requirements: [{ id: "r1", date: MON, positionId: "pos-x", locationId: "loc-x", start: 600, end: 720, count: 1 }],
      employees: [full, part],
      positions: [position],
      patterns: { full: [availableMonday("full")], part: [availableMonday("part")] },
      leave: { full: [], part: [] },
      leaveTypes: [],
      policyByClassification: { non_exempt_staff: defaultCaliforniaPolicy("non_exempt_staff") },
      lockedShifts: [preload("full", 300), preload("part", 110)],
      scheduleId: "s",
      now: "2026-07-13T00:00:00Z",
    };

    const result = generateSchedule(input);
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0]!.shift.employeeId).toBe("part");
  });
});
