import { describe, expect, it } from "vitest";
import { buildFixture as buildSeed, SEED_WEEK_START } from "./fixtures";
import {
  cancelShift,
  computeCompliance,
  decideLeave,
  overrideCompliance,
  publishSchedule,
  requestSwap,
  runGeneration,
  saveAvailability,
  submitLeave,
  toggleLock,
  upsertShift,
} from "../src/lib/store/actions";
import { addDays } from "../src/domain/time";
import type { LeaveRecord, Shift } from "../src/domain/types";

const NOW = "2026-07-13T12:00:00Z";

describe("end-to-end workflows on the data store", () => {
  it("saves employee availability with audit attribution", () => {
    const db = buildSeed();
    const pattern = db.availability.find((p) => p.employeeId === "emp-maya")!;
    const next = saveAvailability(db, { ...pattern, note: "Updated for exams" }, "emp-maya", NOW);
    expect(next.availability.find((p) => p.id === pattern.id)?.note).toBe("Updated for exams");
    expect(next.audit[0].action).toBe("availability.save");
    expect(next.audit[0].actorId).toBe("emp-maya");
  });

  it("submits leave requiring approval and a manager approves it", () => {
    const db = buildSeed();
    const record: LeaveRecord = {
      id: "leave-new", employeeId: "emp-sam", leaveTypeId: "lt-vacation",
      startDate: addDays(SEED_WEEK_START, 1), endDate: addDays(SEED_WEEK_START, 1),
      partialDay: false, status: "requested", enteredBy: "emp-sam", createdAt: "", updatedAt: "",
    };
    const submitted = submitLeave(db, record, "emp-sam", NOW);
    expect(submitted.leave.find((l) => l.id === "leave-new")?.status).toBe("requested");
    const approved = decideLeave(submitted, "leave-new", "approved", "admin-whuggins", NOW);
    expect(approved.leave.find((l) => l.id === "leave-new")?.status).toBe("approved");
    expect(approved.audit[0].action).toBe("leave.approved");
  });

  it("generates a draft schedule, preserving the locked seed shift", () => {
    const db = buildSeed();
    const { db: next, result } = runGeneration(db, "sched-week", { seed: 42, actorId: "admin-whuggins", now: NOW });
    expect(result.coverageScore).toBeGreaterThan(0);
    // Locked seed shift survives.
    expect(next.shifts.find((s) => s.id === "shift-sam-mon")).toBeTruthy();
    expect(next.audit[0].action).toBe("schedule.generate");
  });

  it("blocks publication on a hard compliance violation, then publishes after override or fix", () => {
    let db = buildSeed();
    // Inject an overlapping shift for Sam on Monday => hard violation.
    const bad: Shift = {
      id: "shift-bad", scheduleId: "sched-week", employeeId: "emp-sam", positionId: "pos-desk",
      locationId: "loc-desk", date: SEED_WEEK_START, start: 600, end: 780, breaks: [], taskIds: [],
      status: "draft", source: "manager_created", locked: false, scheduleVersion: 1, createdAt: "", updatedAt: "",
    };
    db = upsertShift(db, bad, "admin-whuggins", NOW);
    const findings = computeCompliance(db, "sched-week");
    expect(findings.some((f) => f.severity === "hard")).toBe(true);

    const blocked = publishSchedule(db, "sched-week", "admin-whuggins", NOW);
    expect(blocked.published).toBe(false);
    expect(blocked.blocking.length).toBeGreaterThan(0);

    // Fix by cancelling the bad shift, then publish succeeds.
    const fixed = cancelShift(db, "shift-bad", "admin-whuggins", NOW);
    const ok = publishSchedule(fixed, "sched-week", "admin-whuggins", NOW);
    expect(ok.published).toBe(true);
    expect(ok.db.schedules.find((s) => s.id === "sched-week")?.status).toBe("published");
    // Assigned employees are notified.
    expect(ok.db.notifications.some((n) => n.type === "schedule_published")).toBe(true);
  });

  it("records a compliance override that suppresses the finding", () => {
    let db = buildSeed();
    // Make a 7h desk shift with no meal => overrideable meal_required.
    const long: Shift = {
      id: "shift-long", scheduleId: "sched-week", employeeId: "emp-avery", positionId: "pos-desk",
      locationId: "loc-desk", date: SEED_WEEK_START, start: 600, end: 1020, breaks: [], taskIds: [],
      status: "draft", source: "manager_created", locked: false, scheduleVersion: 1, createdAt: "", updatedAt: "",
    };
    db = upsertShift(db, long, "admin-whuggins", NOW);
    const before = computeCompliance(db, "sched-week").filter((f) => f.employeeId === "emp-avery");
    expect(before.some((f) => f.ruleId === "meal_required")).toBe(true);

    db = overrideCompliance(db, {
      findingRuleId: "meal_required", employeeId: "emp-avery", date: SEED_WEEK_START,
      reason: "Employee signed a valid meal waiver on file.", actorId: "admin-whuggins",
    }, NOW);
    const after = computeCompliance(db, "sched-week").filter((f) => f.employeeId === "emp-avery");
    expect(after.some((f) => f.ruleId === "meal_required")).toBe(false);
  });

  it("auto-approves an eligible swap and routes an ineligible one to review", () => {
    const db = buildSeed();
    // Maya's Mon 13:00-15:00 desk shift -> Sam (available, qualified) => auto.
    const auto = requestSwap(db, { shiftId: "shift-maya-mon", toEmployeeId: "emp-sam", actorId: "emp-maya", now: NOW });
    expect(auto.status).toBe("auto_approved");
    expect(auto.db.shifts.find((s) => s.id === "shift-maya-mon")?.employeeId).toBe("emp-sam");

    // Same shift -> Noah (not qualified for desk) => review.
    const review = requestSwap(db, { shiftId: "shift-maya-mon", toEmployeeId: "emp-noah", actorId: "emp-maya", now: NOW });
    expect(review.status).toBe("manager_review");
    expect(review.reasons.length).toBeGreaterThan(0);
  });

  it("toggles a manager lock on a shift", () => {
    const db = buildSeed();
    const next = toggleLock(db, "shift-maya-mon", "admin-whuggins", NOW);
    expect(next.shifts.find((s) => s.id === "shift-maya-mon")?.locked).toBe(true);
  });
});
