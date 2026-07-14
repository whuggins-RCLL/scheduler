import { describe, expect, it } from "vitest";
import {
  blocksPublication,
  defaultCaliforniaPolicy,
  validateBreakCoverage,
  validateTurnaround,
  validateWorkday,
} from "../src/domain/compliance";
import type { Position, Shift } from "../src/domain/types";

const policy = defaultCaliforniaPolicy("non_exempt_staff");

const deskPosition: Position = {
  id: "pos-desk", name: "Borrowing Services Desk", shortLabel: "Desk", colorToken: "c", icon: "i",
  requiredQualification: "desk", minStaffing: 1, preferredStaffing: 1, maxStaffing: 2,
  minAssignmentMinutes: 60, maxContinuousMinutes: 120, requiresPhysicalPresence: true,
  blocksOtherAssignments: true, countsAsPublicService: true, selfClaimable: true, swapsAllowed: true,
  eligibleClassifications: [], order: 0, active: true,
};

function shift(over: Partial<Shift> & Pick<Shift, "id" | "start" | "end">): Shift {
  return {
    scheduleId: "s", employeeId: "e1", positionId: "pos-desk", locationId: "loc", date: "2026-07-13",
    breaks: [], taskIds: [], status: "draft", source: "manager_created", locked: false, scheduleVersion: 0,
    createdAt: "", updatedAt: "", ...over,
  };
}

describe("compliance engine", () => {
  it("requires a meal for shifts over 5 hours", () => {
    const findings = validateWorkday({
      employeeId: "e1", classification: "non_exempt_staff", date: "2026-07-13",
      shifts: [shift({ id: "a", start: 540, end: 960 })], // 9:00-16:00, 7h, no meal
      policy, positions: [deskPosition],
    });
    expect(findings.some((f) => f.ruleId === "meal_required")).toBe(true);
  });

  it("does not require a meal for a 4-hour shift", () => {
    const findings = validateWorkday({
      employeeId: "e1", classification: "non_exempt_staff", date: "2026-07-13",
      shifts: [shift({ id: "a", start: 540, end: 780 })], // 4h
      policy, positions: [deskPosition],
    });
    expect(findings.some((f) => f.ruleId === "meal_required")).toBe(false);
  });

  it("flags a meal that starts too late", () => {
    const findings = validateWorkday({
      employeeId: "e1", classification: "non_exempt_staff", date: "2026-07-13",
      shifts: [shift({ id: "a", start: 540, end: 990, breaks: [{ kind: "meal", start: 900, end: 930, paid: false }] })], // meal at 6h in
      policy, positions: [deskPosition],
    });
    expect(findings.some((f) => f.ruleId === "meal_timing")).toBe(true);
  });

  it("flags overlapping shifts as hard", () => {
    const findings = validateWorkday({
      employeeId: "e1", classification: "non_exempt_staff", date: "2026-07-13",
      shifts: [shift({ id: "a", start: 540, end: 720 }), shift({ id: "b", start: 660, end: 840 })],
      policy, positions: [deskPosition],
    });
    const overlap = findings.find((f) => f.ruleId === "overlapping_shifts");
    expect(overlap?.severity).toBe("hard");
    expect(blocksPublication(findings)).toBe(true);
  });

  it("flags excessive continuous public service", () => {
    const findings = validateWorkday({
      employeeId: "e1", classification: "non_exempt_staff", date: "2026-07-13",
      shifts: [shift({ id: "a", start: 540, end: 780 })], // 4h continuous desk, no break
      policy, positions: [deskPosition],
    });
    expect(findings.some((f) => f.ruleId === "continuous_public_service")).toBe(true);
  });

  it("exempts exempt staff from meal/rest checks", () => {
    const findings = validateWorkday({
      employeeId: "e1", classification: "exempt_staff", date: "2026-07-13",
      shifts: [shift({ id: "a", start: 540, end: 1020 })], // 8h no meal
      policy: defaultCaliforniaPolicy("exempt_staff"), positions: [deskPosition],
    });
    expect(findings.some((f) => f.ruleId === "meal_required")).toBe(false);
  });

  it("detects insufficient turnaround between days", () => {
    const prev = [shift({ id: "p", date: "2026-07-13", start: 780, end: 1320 })]; // ends 22:00
    const cur = [shift({ id: "c", date: "2026-07-14", start: 300, end: 600 })]; // starts 05:00
    const findings = validateTurnaround("e1", "2026-07-13", prev, "2026-07-14", cur, policy);
    expect(findings.some((f) => f.ruleId === "insufficient_turnaround")).toBe(true);
  });

  it("flags a solo desk staffer with no break relief", () => {
    const findings = validateBreakCoverage(
      "2026-07-13",
      [shift({ id: "a", start: 540, end: 780, breaks: [{ kind: "rest", start: 660, end: 670, paid: true }] })],
      [deskPosition],
    );
    expect(findings.some((f) => f.ruleId === "sole_coverage_break")).toBe(true);
  });

  it("does not flag break coverage when a second staffer provides relief", () => {
    const findings = validateBreakCoverage(
      "2026-07-13",
      [
        shift({ id: "a", employeeId: "e1", start: 540, end: 780, breaks: [{ kind: "rest", start: 660, end: 670, paid: true }] }),
        shift({ id: "b", employeeId: "e2", start: 540, end: 780 }),
      ],
      [deskPosition],
    );
    expect(findings.some((f) => f.ruleId === "sole_coverage_break")).toBe(false);
  });
});
