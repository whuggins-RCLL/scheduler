import { describe, expect, it } from "vitest";
import { buildSchedulerHelper, generateSchedule, type GenerationInput } from "../src/domain/scheduling";
import { canManage } from "../src/domain/scope";
import { defaultCaliforniaPolicy } from "../src/domain/compliance";
import { buildFixture } from "./fixtures";
import type { AvailabilityPattern, LeaveRecord } from "../src/domain/types";

function generationInput(seed = 42): GenerationInput {
  const db = buildFixture();
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

describe("AI scheduler helper", () => {
  it("recommends generation when coverage is empty", () => {
    const db = buildFixture();
    const schedule = db.schedules.find((s) => s.id === "sched-week")!;
    const suggestions = buildSchedulerHelper({
      schedule,
      shifts: [],
      requirements: db.coverage,
      findings: [],
    });

    expect(suggestions[0]).toMatchObject({ kind: "generate", priority: "high" });
  });

  it("recommends manager publication only after generated coverage has no hard blockers", () => {
    const db = buildFixture();
    const schedule = db.schedules.find((s) => s.id === "sched-week")!;
    const generated = generateSchedule(generationInput());
    const suggestions = buildSchedulerHelper({
      schedule,
      shifts: generated.shifts,
      requirements: db.coverage,
      findings: generated.findings,
      coverageScore: generated.coverageScore,
    });

    expect(suggestions.some((s) => s.kind === "publish")).toBe(true);
    expect(suggestions.some((s) => s.kind === "fairness")).toBe(true);
  });

  it("keeps AI scheduling tools scoped to management roles", () => {
    const db = buildFixture();
    const employee = db.users.find((u) => u.roles.some((r) => r.role === "LIBRARY_STAFF"))!;
    const manager = db.users.find((u) => u.roles.some((r) => r.role === "MANAGER"))!;

    expect(canManage(employee)).toBe(false);
    expect(canManage(manager)).toBe(true);
  });
});
