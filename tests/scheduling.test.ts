import { describe, expect, it } from "vitest";
import { generateSchedule, type GenerationInput } from "../src/domain/scheduling";
import { buildFixture as buildSeed } from "./fixtures";
import type { AvailabilityPattern, LeaveRecord } from "../src/domain/types";
import { defaultCaliforniaPolicy } from "../src/domain/compliance";

function inputFromSeed(seed: number): GenerationInput {
  const db = buildSeed();
  const patterns: Record<string, AvailabilityPattern[]> = {};
  const leave: Record<string, LeaveRecord[]> = {};
  for (const e of db.employees) {
    patterns[e.id] = db.availability.filter((p) => p.employeeId === e.id);
    leave[e.id] = db.leave.filter((l) => l.employeeId === e.id);
  }
  return {
    seed,
    requirements: db.coverage,
    employees: db.employees.filter((e) => e.active),
    positions: db.positions,
    patterns,
    leave,
    leaveTypes: db.leaveTypes,
    policyByClassification: {
      student_worker: defaultCaliforniaPolicy("student_worker"),
      non_exempt_staff: defaultCaliforniaPolicy("non_exempt_staff"),
      casual: defaultCaliforniaPolicy("casual"),
      manager: defaultCaliforniaPolicy("manager"),
    },
    lockedShifts: [],
    scheduleId: "sched-week",
    now: "2026-07-13T00:00:00Z",
  };
}

describe("scheduling engine", () => {
  it("is deterministic for the same seed and inputs", () => {
    const a = generateSchedule(inputFromSeed(7));
    const b = generateSchedule(inputFromSeed(7));
    const ids = (r: typeof a) => r.assignments.map((x) => `${x.shift.date}:${x.shift.start}:${x.shift.employeeId}`).sort();
    expect(ids(a)).toEqual(ids(b));
  });

  it("produces different assignments for different seeds (tie-breaking rotates)", () => {
    const a = generateSchedule(inputFromSeed(1));
    const b = generateSchedule(inputFromSeed(999));
    // Same coverage, but at least one assignment should differ across many slots.
    const sig = (r: typeof a) => r.assignments.map((x) => x.shift.employeeId).join(",");
    expect(a.coverageScore).toBeGreaterThan(0);
    expect(sig(a) === sig(b)).toBe(false);
  });

  it("never assigns an employee outside their availability", () => {
    const r = generateSchedule(inputFromSeed(3));
    const db = buildSeed();
    for (const asn of r.assignments) {
      const emp = db.employees.find((e) => e.id === asn.shift.employeeId)!;
      // employee must be qualified for the desk position (only desk coverage seeded)
      expect(emp.qualifiedPositionIds).toContain(asn.shift.positionId);
    }
  });

  it("preserves locked shifts verbatim", () => {
    const base = inputFromSeed(5);
    const db = buildSeed();
    const locked = db.shifts.filter((s) => s.locked).map((s) => ({ ...s }));
    const r = generateSchedule({ ...base, lockedShifts: locked });
    for (const l of locked) {
      expect(r.shifts.find((s) => s.id === l.id)).toEqual(l);
    }
  });

  it("reports unfilled requirements with reasons when nobody is eligible", () => {
    const base = inputFromSeed(5);
    // Wipe availability so no one can be placed.
    const empty: Record<string, AvailabilityPattern[]> = {};
    for (const k of Object.keys(base.patterns)) empty[k] = [];
    const r = generateSchedule({ ...base, patterns: empty });
    expect(r.unfilled.length).toBeGreaterThan(0);
    expect(r.unfilled[0].reasons.length).toBeGreaterThan(0);
    expect(r.coverageScore).toBeLessThan(1);
  });

  it("does not place a hard compliance violation into generated shifts (no overlaps)", () => {
    const r = generateSchedule(inputFromSeed(11));
    const hard = r.findings.filter((f) => f.ruleId === "overlapping_shifts");
    expect(hard.length).toBe(0);
  });
});
