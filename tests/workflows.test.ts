import { describe, expect, it } from "vitest";
import { buildFixture as buildSeed, SEED_WEEK_START } from "./fixtures";
import {
  acceptCoverage,
  cancelShift,
  computeCompliance,
  declineCoverage,
  deleteWorkingHours,
  expireStaleCoverage,
  overrideCompliance,
  publishSchedule,
  requestCoverage,
  requestSwap,
  runGeneration,
  saveAvailability,
  saveWorkingHours,
  submitLeave,
  toggleLock,
  upsertShift,
} from "../src/lib/store/actions";
import { addDays } from "../src/domain/time";
import { defaultWorkingWeek } from "../src/domain/working-hours";
import type { LeaveRecord, Shift, WorkingHoursPattern } from "../src/domain/types";

const NOW = "2026-07-13T12:00:00Z";

describe("end-to-end workflows on the data store", () => {
  it("saves employee availability with audit attribution", () => {
    const db = buildSeed();
    const pattern = db.availability.find((p) => p.employeeId === "emp-maya")!;
    const maya = db.users.find((u) => u.id === "emp-maya")!;
    const next = saveAvailability(db, { ...pattern, note: "Updated for exams" }, "emp-maya", NOW, maya);
    expect(next.availability.find((p) => p.id === pattern.id)?.note).toBe("Updated for exams");
    expect(next.audit[0].action).toBe("availability.save");
    expect(next.audit[0].actorId).toBe("emp-maya");
  });

  it("saves multiple working-hours schedules and removes one", () => {
    const db = buildSeed();
    const base: WorkingHoursPattern = {
      id: "workhours-emp-sam-fall", employeeId: "emp-sam",
      effectiveStart: "2026-09-01", effectiveEnd: "2026-12-31", label: "Fall",
      days: defaultWorkingWeek(), updatedBy: "emp-sam", updatedAt: "",
    };
    const spring: WorkingHoursPattern = { ...base, id: "workhours-emp-sam-spring", effectiveStart: "2027-01-01", effectiveEnd: "2027-03-31", label: "Spring" };
    let next = saveWorkingHours(db, base, "emp-sam", NOW);
    next = saveWorkingHours(next, spring, "emp-sam", NOW);
    expect(next.workingHours.filter((p) => p.employeeId === "emp-sam").length).toBe(2);

    next = deleteWorkingHours(next, "workhours-emp-sam-fall", "emp-sam", NOW);
    const remaining = next.workingHours.filter((p) => p.employeeId === "emp-sam");
    expect(remaining.map((p) => p.id)).toEqual(["workhours-emp-sam-spring"]);
    expect(next.audit[0].action).toBe("workingHours.delete");
  });

  it("runs the desk-coverage request lifecycle: request, cover, and expire-unfilled", () => {
    const db = buildSeed();
    // Maya asks for help covering her Monday desk shift.
    let next = requestCoverage(db, "shift-maya-mon", "emp-maya", NOW);
    const req = next.swaps.find((s) => s.shiftId === "shift-maya-mon" && s.kind === "give_up");
    expect(req?.status).toBe("pending");
    expect(next.shifts.find((s) => s.id === "shift-maya-mon")?.status).toBe("coverage_needed");
    expect(next.audit[0].action).toBe("coverage.requested");
    // Requesting again is idempotent (no duplicate open request).
    expect(requestCoverage(next, "shift-maya-mon", "emp-maya", NOW).swaps.filter((s) => s.shiftId === "shift-maya-mon").length).toBe(1);

    // A teammate declines — recorded in history.
    next = declineCoverage(next, req!.id, "emp-sam", NOW);
    expect(next.swaps.find((s) => s.id === req!.id)?.history.some((h) => h.action === "decline_help" && h.actor === "emp-sam")).toBe(true);

    // Another teammate covers it — the shift transfers.
    const covered = acceptCoverage(next, req!.id, "emp-avery", NOW);
    expect(covered.shifts.find((s) => s.id === "shift-maya-mon")?.employeeId).toBe("emp-avery");
    expect(covered.swaps.find((s) => s.id === req!.id)?.status).toBe("completed");
    expect(covered.audit[0].action).toBe("coverage.filled");

    // If instead nobody covers and the shift's start passes, it logs as unfilled.
    const future = addDays(SEED_WEEK_START, 7);
    const expired = expireStaleCoverage(next, { date: future, minute: 0, iso: NOW }, "admin-whuggins");
    expect(expired.swaps.find((s) => s.id === req!.id)?.status).toBe("expired");
    expect(expired.audit[0].action).toBe("coverage.unfilled");
  });

  it("records submitted leave immediately without approval", () => {
    const db = buildSeed();
    const record: LeaveRecord = {
      id: "leave-new", employeeId: "emp-sam", leaveTypeId: "lt-vacation",
      startDate: addDays(SEED_WEEK_START, 1), endDate: addDays(SEED_WEEK_START, 1),
      partialDay: false, status: "requested", enteredBy: "emp-sam", createdAt: "", updatedAt: "",
    };
    const submitted = submitLeave(db, record, "emp-sam", NOW, db.users.find((u) => u.id === "emp-sam")!);
    expect(submitted.leave.find((l) => l.id === "leave-new")?.status).toBe("recorded");
    expect(submitted.audit[0].action).toBe("leave.submit");
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
    // Maya's Mon 13:00-15:00 desk shift -> Jordan (student, available, qualified) => auto.
    const auto = requestSwap(db, { shiftId: "shift-maya-mon", toEmployeeId: "emp-jordan", actorId: "emp-maya", now: NOW });
    expect(auto.status).toBe("auto_approved");
    expect(auto.db.shifts.find((s) => s.id === "shift-maya-mon")?.employeeId).toBe("emp-jordan");

    // Same shift -> Noah (student but not qualified for desk) => review.
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
