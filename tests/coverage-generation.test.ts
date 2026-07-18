import { describe, expect, it } from "vitest";
import { buildCoverageRequirements } from "../src/domain/coverage-generation";
import { runGeneration } from "../src/lib/store/actions";
import { addDays as addDaysStr } from "../src/domain/time";
import { buildFixture } from "./fixtures";
import type { OperatingHours, Position, SchedulingFrequency, Task } from "../src/domain/types";

const OPEN_ALL_WEEK = { start: 8 * 60, end: 17 * 60 }; // 08:00–17:00, 9h
const MONDAY = "2026-07-20";
const SUNDAY = "2026-07-19";

function hours(locationId: string, openWeekdays = [0, 1, 2, 3, 4, 5, 6]): OperatingHours {
  const weekly: Record<number, { start: number; end: number }[]> = {
    0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [],
  };
  for (const d of openWeekdays) weekly[d] = [OPEN_ALL_WEEK];
  return { locationId, weekly, exceptions: [] };
}

function position(overrides: Partial<Position> & Pick<Position, "id">): Position {
  return {
    name: overrides.id,
    shortLabel: overrides.id,
    description: undefined,
    colorToken: "position-desk",
    icon: "desk",
    locationId: undefined,
    applicableLocationIds: [],
    departmentId: undefined,
    requiredQualification: undefined,
    minStaffing: 1,
    preferredStaffing: 1,
    maxStaffing: 2,
    minAssignmentMinutes: 60,
    maxContinuousMinutes: 240,
    requiresPhysicalPresence: true,
    blocksOtherAssignments: false,
    countsAsPublicService: true,
    selfClaimable: true,
    swapsAllowed: true,
    eligibleClassifications: [],
    order: 0,
    active: true,
    ...overrides,
  };
}

function task(overrides: Partial<Task> & Pick<Task, "id">): Task {
  return {
    name: overrides.id,
    description: undefined,
    category: "General",
    colorToken: "task-neutral",
    icon: "check",
    requiredQualification: undefined,
    applicableLocationIds: [],
    applicablePositionIds: [],
    estimatedMinutes: 60,
    priority: "normal",
    minAssignees: 1,
    maxAssignees: 1,
    allowedDuringPosition: true,
    requiresAcknowledgement: false,
    checklist: [],
    openingDependency: false,
    closingDependency: false,
    order: 0,
    active: true,
    ...overrides,
  };
}

const freq = (mode: SchedulingFrequency["mode"], count = 1, weekdays: number[] = []): SchedulingFrequency => ({
  mode,
  count,
  weekdays,
});

describe("buildCoverageRequirements — positions", () => {
  it("per_operational_hour spans the full open interval with target staffing", () => {
    const { requirements } = buildCoverageRequirements({
      positions: [position({ id: "pos-desk", applicableLocationIds: ["loc-desk"], preferredStaffing: 2, frequency: freq("per_operational_hour") })],
      tasks: [],
      operatingHours: [hours("loc-desk")],
      dates: [MONDAY],
    });
    expect(requirements).toHaveLength(1);
    expect(requirements[0]).toMatchObject({
      positionId: "pos-desk",
      locationId: "loc-desk",
      start: OPEN_ALL_WEEK.start,
      end: OPEN_ALL_WEEK.end,
      count: 2,
    });
    expect(requirements[0]?.taskIds).toBeUndefined();
  });

  it("times_per_day spreads N evenly-placed blocks across the open day", () => {
    const { requirements } = buildCoverageRequirements({
      positions: [position({ id: "pos-walk", applicableLocationIds: ["loc-desk"], minAssignmentMinutes: 60, frequency: freq("times_per_day", 3) })],
      tasks: [],
      operatingHours: [hours("loc-desk")],
      dates: [MONDAY],
    });
    expect(requirements.map((r) => [r.start, r.end])).toEqual([
      [480, 540],
      [720, 780],
      [960, 1020],
    ]);
  });

  it("skips closed days and reports nothing", () => {
    const { requirements } = buildCoverageRequirements({
      positions: [position({ id: "pos-desk", applicableLocationIds: ["loc-desk"], frequency: freq("per_operational_hour") })],
      tasks: [],
      operatingHours: [hours("loc-desk", [1, 2, 3, 4, 5])], // closed weekends
      dates: [SUNDAY],
    });
    expect(requirements).toHaveLength(0);
  });

  it("honors weekday filters on the frequency", () => {
    const { requirements } = buildCoverageRequirements({
      positions: [position({ id: "pos-desk", applicableLocationIds: ["loc-desk"], frequency: freq("times_per_day", 1, [3]) })], // Wednesdays only
      tasks: [],
      operatingHours: [hours("loc-desk")],
      dates: [MONDAY],
    });
    expect(requirements).toHaveLength(0);
  });

  it("distributes times_per_week across the week's open days", () => {
    // Full open week (Mon–Sun), 3×/week -> 3 distinct days, one block each.
    const dates = Array.from({ length: 7 }, (_, i) => addDaysStr(MONDAY, i));
    const { requirements } = buildCoverageRequirements({
      positions: [position({ id: "pos-desk", applicableLocationIds: ["loc-desk"], frequency: freq("times_per_week", 3) })],
      tasks: [],
      operatingHours: [hours("loc-desk")],
      dates,
    });
    expect(requirements).toHaveLength(3);
    const days = new Set(requirements.map((r) => r.date));
    expect(days.size).toBe(3); // spread across three distinct days
  });

  it("distributes times_per_week per week across a multi-week range", () => {
    const dates = Array.from({ length: 14 }, (_, i) => addDaysStr(MONDAY, i));
    const { requirements } = buildCoverageRequirements({
      positions: [position({ id: "pos-desk", applicableLocationIds: ["loc-desk"], frequency: freq("times_per_week", 2) })],
      tasks: [],
      operatingHours: [hours("loc-desk")],
      dates,
    });
    expect(requirements).toHaveLength(4); // 2 per week × 2 weeks
  });

  it("only counts open, weekday-eligible days when distributing weekly", () => {
    // Weekdays only open; frequency limited to Mon/Wed/Fri; 5×/week caps onto 3 days.
    const dates = Array.from({ length: 7 }, (_, i) => addDaysStr(MONDAY, i));
    const { requirements } = buildCoverageRequirements({
      positions: [position({ id: "pos-desk", applicableLocationIds: ["loc-desk"], frequency: freq("times_per_week", 5, [1, 3, 5]) })],
      tasks: [],
      operatingHours: [hours("loc-desk", [1, 2, 3, 4, 5])],
      dates,
    });
    const days = new Set(requirements.map((r) => r.date));
    expect(days.size).toBe(3); // only Mon/Wed/Fri are eligible
    expect(requirements).toHaveLength(5); // all 5 placed, round-robin onto the 3 days
  });
});

describe("buildCoverageRequirements — tasks", () => {
  it("places task demand at its linked position and carries the taskId", () => {
    const { requirements } = buildCoverageRequirements({
      positions: [position({ id: "pos-stacks", applicableLocationIds: ["loc-stacks"] })],
      tasks: [task({ id: "task-shelving", applicablePositionIds: ["pos-stacks"], minAssignees: 2, estimatedMinutes: 30, frequency: freq("times_per_day", 2) })],
      operatingHours: [hours("loc-stacks")],
      dates: [MONDAY],
    });
    expect(requirements).toHaveLength(2);
    for (const r of requirements) {
      expect(r.positionId).toBe("pos-stacks");
      expect(r.locationId).toBe("loc-stacks");
      expect(r.count).toBe(2);
      expect(r.taskIds).toEqual(["task-shelving"]);
      expect(r.end - r.start).toBe(30);
    }
  });

  it("auto-hosts a task at its schedule type's primary position (no explicit link)", () => {
    const { requirements } = buildCoverageRequirements({
      positions: [
        position({ id: "pos-stacks-lead", applicableLocationIds: ["loc-stacks"], order: 0 }),
        position({ id: "pos-stacks-2", applicableLocationIds: ["loc-stacks"], order: 5 }),
      ],
      // No applicablePositionIds — the task should land on the schedule type only.
      tasks: [task({ id: "task-shelving", applicableLocationIds: ["loc-stacks"], frequency: freq("times_per_day", 1) })],
      operatingHours: [hours("loc-stacks")],
      dates: [MONDAY],
    });
    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.positionId).toBe("pos-stacks-lead"); // lowest order wins
    expect(requirements[0]?.taskIds).toEqual(["task-shelving"]);
  });

  it("skips a task with no active linked position", () => {
    const { requirements, skipped } = buildCoverageRequirements({
      positions: [position({ id: "pos-stacks", applicableLocationIds: ["loc-stacks"], active: false })],
      tasks: [task({ id: "task-shelving", name: "Shelving", applicablePositionIds: ["pos-stacks"], frequency: freq("times_per_day", 1) })],
      operatingHours: [hours("loc-stacks")],
      dates: [MONDAY],
    });
    expect(requirements).toHaveLength(0);
    expect(skipped.some((s) => s.includes("Shelving"))).toBe(true);
  });
});

describe("buildCoverageRequirements — determinism", () => {
  it("produces identical, stable requirement ids for identical inputs", () => {
    const input = {
      positions: [position({ id: "pos-desk", applicableLocationIds: ["loc-desk"], frequency: freq("per_operational_hour") })],
      tasks: [],
      operatingHours: [hours("loc-desk")],
      dates: [MONDAY],
    };
    const a = buildCoverageRequirements(input);
    const b = buildCoverageRequirements(input);
    expect(a.requirements.map((r) => r.id)).toEqual(b.requirements.map((r) => r.id));
  });
});

describe("runGeneration derives coverage when none is stored", () => {
  it("staffs a per-operational-hour position from operating hours alone", () => {
    const db = buildFixture();
    db.coverage = []; // no hand-authored coverage
    db.positions = db.positions.map((p) =>
      p.id === "pos-desk" ? { ...p, frequency: freq("per_operational_hour") } : p,
    );
    const { result } = runGeneration(db, "sched-week", {
      seed: 1,
      actorId: "admin-whuggins",
      now: "2026-07-20T00:00:00.000Z",
    });
    // Derived desk coverage was fed to the engine and produced draft shifts.
    expect(result.assignments.length).toBeGreaterThan(0);
    expect(result.shifts.some((s) => s.positionId === "pos-desk")).toBe(true);
  });
});
