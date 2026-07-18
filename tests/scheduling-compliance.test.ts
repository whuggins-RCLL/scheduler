import { describe, expect, it } from "vitest";
import { generateSchedule, planDayBreaks, type GenerationInput } from "../src/domain/scheduling";
import { defaultCaliforniaPolicy, validateWorkday } from "../src/domain/compliance";
import type { AvailabilityPattern, Break, EmployeeProfile, Position, Shift } from "../src/domain/types";

const policy = defaultCaliforniaPolicy("non_exempt_staff");

function mkShift(over: Partial<Shift> & Pick<Shift, "id" | "start" | "end">): Shift {
  return {
    scheduleId: "s",
    employeeId: "e",
    positionId: "pos-x",
    locationId: "loc-x",
    date: "2026-07-20",
    breaks: [],
    taskIds: [],
    status: "draft",
    source: "ai_generated",
    locked: false,
    scheduleVersion: 0,
    createdAt: "2026-07-13T00:00:00Z",
    updatedAt: "2026-07-13T00:00:00Z",
    ...over,
  };
}

describe("planDayBreaks (whole-day break planning)", () => {
  it("inserts a meal for two short shifts that together cross the meal threshold", () => {
    // 9–12 and 13–16 => 6h of work across two shifts, each individually under 5h.
    const s1 = mkShift({ id: "s1", start: 540, end: 720 });
    const s2 = mkShift({ id: "s2", start: 780, end: 960 });
    const planned = planDayBreaks([s1, s2], new Set(["s1", "s2"]), policy);
    const breaks = [...planned.values()].flat();
    const meals = breaks.filter((b) => b.kind === "meal");
    expect(meals).toHaveLength(1);
    expect(meals[0]!.end - meals[0]!.start).toBeGreaterThanOrEqual(policy.mealMinDurationMinutes);
    // Meal starts within the timing window (by end of hour 5 from day start).
    expect(meals[0]!.start - 540).toBeLessThanOrEqual(policy.mealMustStartByMinutesWorked);

    // The planned day passes the whole-day meal + rest checks.
    const withBreaks = [s1, s2].map((s) => ({ ...s, breaks: planned.get(s.id)! }));
    const findings = validateWorkday({
      employeeId: "e",
      classification: "non_exempt_staff",
      date: "2026-07-20",
      shifts: withBreaks,
      policy,
      positions: [],
    });
    expect(findings.some((f) => f.ruleId === "meal_required")).toBe(false);
    expect(findings.some((f) => f.ruleId === "rest_periods")).toBe(false);
  });

  it("breaks up a long public-service shift to stay within the continuous guideline", () => {
    const desk: Position = { ...position, id: "pos-desk", countsAsPublicService: true };
    const s = mkShift({ id: "d1", positionId: "pos-desk", start: 480, end: 960 }); // 8 h at a public-service post
    const hasContinuous = (breaks: Break[]) =>
      validateWorkday({
        employeeId: "e", classification: "non_exempt_staff", date: "2026-07-20",
        shifts: [{ ...s, breaks }], policy, positions: [desk],
      }).some((f) => f.ruleId === "continuous_public_service");

    // Without the public-service hint, a meal alone leaves >2 h runs -> finding.
    const noRelief = planDayBreaks([s], new Set(["d1"]), policy);
    expect(hasContinuous(noRelief.get("d1")!)).toBe(true);

    // With it, relief rests keep every run within the guideline -> no finding.
    const relief = planDayBreaks([s], new Set(["d1"]), policy, undefined, new Set(["pos-desk"]));
    expect(hasContinuous(relief.get("d1")!)).toBe(false);
  });

  it("never modifies locked shifts", () => {
    const locked = mkShift({ id: "locked", start: 540, end: 900, breaks: [] });
    const editable = mkShift({ id: "gen", start: 900, end: 960 });
    const planned = planDayBreaks([locked, editable], new Set(["gen"]), policy);
    expect(planned.has("locked")).toBe(false); // untouched
    expect(planned.has("gen")).toBe(true);
  });
});

// --- compliance-aware scoring (#1) ---

function emp(over: Partial<EmployeeProfile> & Pick<EmployeeProfile, "id">): EmployeeProfile {
  return {
    legalName: over.id,
    email: `${over.id}@ex.test`,
    classification: "non_exempt_staff",
    eligibleLocationIds: ["loc-x"],
    additionalManagerIds: [],
    active: true,
    targetWeeklyHours: 20,
    minWeeklyHours: 0,
    maxWeeklyHours: 40,
    maxDailyHours: 8,
    earliestStart: 0,
    latestEnd: 1439,
    minTurnaroundMinutes: 0,
    overtimeEligible: false,
    breakPolicyId: "ca-nonexempt-v1",
    qualifiedPositionIds: [],
    qualifiedTaskIds: [],
    employmentPercentage: 1,
    googleCalendarConnected: false,
    notificationPrefs: { inApp: true, email: false, calendar: false, digest: false },
    ...over,
  } as EmployeeProfile;
}

const position: Position = {
  id: "pos-x", name: "X", shortLabel: "X", colorToken: "x", icon: "x",
  locationId: "loc-x", applicableLocationIds: ["loc-x"],
  minStaffing: 1, preferredStaffing: 1, maxStaffing: 5, unlimitedSeating: false,
  minAssignmentMinutes: 30, maxContinuousMinutes: 480, requiresPhysicalPresence: false,
  blocksOtherAssignments: false, countsAsPublicService: false, selfClaimable: false,
  swapsAllowed: true, eligibleClassifications: [], order: 0, active: true,
};

function avail(id: string, start: number, end: number): AvailabilityPattern {
  return { id: `av-${id}`, employeeId: id, blocks: [{ weekday: 1, start, end, kind: "available" }], updatedBy: id, updatedAt: "2026-07-13T00:00:00Z" };
}

describe("compliance-aware candidate scoring", () => {
  it("prefers the candidate whose day stays compliant over one who'd be left with an unseatable meal", () => {
    // Requirement: a short 1h Monday shift both could take.
    const req = { id: "r1", date: "2026-07-20", positionId: "pos-x", locationId: "loc-x", start: 600, end: 660, count: 1 };
    // "loaded": already works 5:00–9:30 Monday (locked). Taking r1 pushes the day
    // past 5h, but r1 is only 1h — too short to seat a duty-free meal -> a
    // meal_required finding survives whole-day planning.
    const loaded = emp({ id: "loaded" });
    const loadedPre: Shift = mkShift({ id: "pre-loaded", employeeId: "loaded", start: 300, end: 570, status: "published", source: "imported", locked: true });
    // "free": a Sunday shift only (keeps Monday clean, comparable weekly load).
    const free = emp({ id: "free" });
    const freePre: Shift = mkShift({ id: "pre-free", employeeId: "free", date: "2026-07-19", start: 300, end: 600, status: "published", source: "imported", locked: true });

    const input: GenerationInput = {
      seed: 1,
      requirements: [req],
      employees: [loaded, free],
      positions: [position],
      patterns: { loaded: [avail("loaded", 300, 1080)], free: [avail("free", 480, 1080)] },
      leave: { loaded: [], free: [] },
      leaveTypes: [],
      policyByClassification: { non_exempt_staff: policy },
      lockedShifts: [loadedPre, freePre],
      scheduleId: "s",
      now: "2026-07-13T00:00:00Z",
    };

    const result = generateSchedule(input);
    const r1 = result.assignments.find((a) => a.shift.start === 600 && a.shift.end === 660);
    expect(r1?.shift.employeeId).toBe("free");
  });
});
