import { describe, expect, it } from "vitest";
import { evaluateSwap } from "../src/domain/swaps";
import { defaultCaliforniaPolicy } from "../src/domain/compliance";
import { buildFixture as buildSeed } from "./fixtures";

describe("swap eligibility", () => {
  const db = buildSeed();
  const position = db.positions.find((p) => p.id === "pos-desk")!;
  const shift = db.shifts.find((s) => s.id === "shift-maya-mon")!; // Mon 13:00-15:00 desk

  it("auto-approves an available, qualified recipient", () => {
    const sam = db.employees.find((e) => e.id === "emp-sam")!;
    const ev = evaluateSwap({
      shift,
      initiatorClassification: "non_exempt_staff",
      recipient: sam,
      position,
      recipientPatterns: db.availability.filter((p) => p.employeeId === sam.id),
      recipientLeave: [],
      leaveTypes: db.leaveTypes,
      recipientShiftsThatDay: [],
      policy: defaultCaliforniaPolicy("non_exempt_staff"),
      positions: db.positions,
      cutoffOk: true,
      weeklyMinutesSoFar: 0,
    });
    expect(ev.autoApprovable).toBe(true);
    expect(ev.reasons).toEqual([]);
  });

  it("routes to review when recipient is unavailable", () => {
    const jordan = db.employees.find((e) => e.id === "emp-jordan")!;
    const morning = { ...shift, start: 540, end: 660 };
    const ev = evaluateSwap({
      shift: morning,
      initiatorClassification: "student_worker",
      recipient: jordan,
      position,
      recipientPatterns: db.availability.filter((p) => p.employeeId === jordan.id),
      recipientLeave: [],
      leaveTypes: db.leaveTypes,
      recipientShiftsThatDay: [],
      policy: defaultCaliforniaPolicy("student_worker"),
      positions: db.positions,
      cutoffOk: true,
      weeklyMinutesSoFar: 0,
    });
    expect(ev.autoApprovable).toBe(false);
    expect(ev.reasons.some((r) => /unavailable|on leave/i.test(r))).toBe(true);
  });

  it("blocks a locked shift", () => {
    const locked = db.shifts.find((s) => s.id === "shift-sam-mon")!;
    const avery = db.employees.find((e) => e.id === "emp-avery")!;
    const ev = evaluateSwap({
      shift: locked,
      initiatorClassification: "non_exempt_staff",
      recipient: avery,
      position,
      recipientPatterns: db.availability.filter((p) => p.employeeId === avery.id),
      recipientLeave: [],
      leaveTypes: db.leaveTypes,
      recipientShiftsThatDay: [],
      policy: defaultCaliforniaPolicy("non_exempt_staff"),
      positions: db.positions,
      cutoffOk: true,
      weeklyMinutesSoFar: 0,
    });
    expect(ev.autoApprovable).toBe(false);
    expect(ev.reasons.some((r) => /locked/i.test(r))).toBe(true);
  });

  it("blocks after the cutoff", () => {
    const sam = db.employees.find((e) => e.id === "emp-sam")!;
    const ev = evaluateSwap({
      shift,
      initiatorClassification: "non_exempt_staff",
      recipient: sam,
      position,
      recipientPatterns: db.availability.filter((p) => p.employeeId === sam.id),
      recipientLeave: [],
      leaveTypes: db.leaveTypes,
      recipientShiftsThatDay: [],
      policy: defaultCaliforniaPolicy("non_exempt_staff"),
      positions: db.positions,
      cutoffOk: false,
      weeklyMinutesSoFar: 0,
    });
    expect(ev.autoApprovable).toBe(false);
    expect(ev.reasons.some((r) => /cutoff/i.test(r))).toBe(true);
  });

  it("blocks student-to-staff swaps", () => {
    const sam = db.employees.find((e) => e.id === "emp-sam")!;
    const ev = evaluateSwap({
      shift,
      initiatorClassification: "student_worker",
      recipient: sam,
      position,
      recipientPatterns: db.availability.filter((p) => p.employeeId === sam.id),
      recipientLeave: [],
      leaveTypes: db.leaveTypes,
      recipientShiftsThatDay: [],
      policy: defaultCaliforniaPolicy("non_exempt_staff"),
      positions: db.positions,
      cutoffOk: true,
      weeklyMinutesSoFar: 0,
    });
    expect(ev.autoApprovable).toBe(false);
    expect(ev.reasons.some((r) => /student workers may only swap/i.test(r))).toBe(true);
  });
});
