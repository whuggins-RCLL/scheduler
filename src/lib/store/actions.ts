import type {
  AvailabilityPattern,
  AvailabilityBlock,
  ComplianceFinding,
  ComplianceOverride,
  DailyNote,
  EmployeeProfile,
  FairnessSnapshot,
  GlobalException,
  LeaveRecord,
  Position,
  Shift,
  StudentAvailabilityWindow,
  SwapRequest,
  Task,
  UserAccount,
  WorkingHoursPattern,
} from "@/domain/types";
import { applySampleData, mondayOf } from "./sample";
import {
  computeFairness,
  evaluateSwap,
  generateSchedule,
  validateBreakCoverage,
  validateTurnaround,
  validateWorkday,
  type GenerationMode,
  type GenerationResult,
  type ScheduleWeights,
} from "@/domain";
import { canApproveStudentAvailability, canEditDeskAvailability, canSubmitAvailabilityException } from "@/domain/scope";
import { coverageDeadlinePassed } from "@/domain/desk-coverage";
import { syncGlobalExceptionsToLeave, HOLIDAY_LEAVE_TYPE_ID, leaveRecordsForEmployee } from "@/domain/global-exceptions";
import {
  activeStudentAvailabilityWindow as pickWindow,
  isStudentWorker,
  pruneApprovedBlocks,
  validateStudentWeeklyCap,
  weeklyApprovedMinutes,
  weeklySignUpMinutes,
} from "@/domain/student-availability";
import { addDays } from "@/domain/time";
import type { Database } from "./types";

/** Deep clone a snapshot so actions stay immutable and React re-renders. */
function clone(db: Database): Database {
  return structuredClone(db);
}

function audit(
  db: Database,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  extra: { before?: unknown; after?: unknown; reason?: string; now: string },
): void {
  db.audit.unshift({
    id: `audit-${db.audit.length + 1}-${targetId}`,
    actorId,
    action,
    targetType,
    targetId,
    before: extra.before,
    after: extra.after,
    reason: extra.reason,
    source: "app",
    createdAt: extra.now,
  });
}

function policyFor(db: Database, classification: string) {
  return (
    db.breakPolicies.find((p) => p.classification === classification) ??
    db.breakPolicies.find((p) => p.id === "ca-nonexempt-v1")!
  );
}

// ---------------------------------------------------------------------------
// Read-model helpers (pure derivations used by UI + tests)
// ---------------------------------------------------------------------------

export function shiftsForSchedule(db: Database, scheduleId: string): Shift[] {
  return db.shifts.filter((s) => s.scheduleId === scheduleId);
}

export function computeCompliance(
  db: Database,
  scheduleId: string,
): ComplianceFinding[] {
  const shifts = shiftsForSchedule(db, scheduleId).filter((s) => s.status !== "cancelled");
  const findings: ComplianceFinding[] = [];
  const byEmpDay = new Map<string, Shift[]>();
  const dates = new Set<string>();
  for (const s of shifts) {
    dates.add(s.date);
    if (!s.employeeId) continue;
    const key = `${s.employeeId}:${s.date}`;
    const arr = byEmpDay.get(key) ?? [];
    arr.push(s);
    byEmpDay.set(key, arr);
  }
  for (const [key, list] of byEmpDay) {
    const [empId, date] = key.split(":");
    const emp = db.employees.find((e) => e.id === empId);
    if (!emp) continue;
    const policy = policyFor(db, emp.classification);
    findings.push(
      ...validateWorkday({
        employeeId: empId,
        classification: emp.classification,
        date,
        shifts: list,
        policy,
        positions: db.positions,
        patterns: db.availability.filter((p) => p.employeeId === empId),
        leave: leaveRecordsForEmployee(db, empId),
        leaveTypes: db.leaveTypes,
      }),
    );
    // Turnaround vs the previous day.
    const prevDate = addDays(date, -1);
    const prev = byEmpDay.get(`${empId}:${prevDate}`);
    if (prev) findings.push(...validateTurnaround(empId, prevDate, prev, date, list, policy));
  }
  for (const date of dates) {
    findings.push(...validateBreakCoverage(date, shifts.filter((s) => s.date === date), db.positions));
  }
  // Suppress findings that have an accepted override.
  return findings.filter(
    (f) =>
      !db.overrides.some(
        (o) => o.findingRuleId === f.ruleId && o.employeeId === f.employeeId && o.date === f.date,
      ),
  );
}

export function computeScheduleFairness(
  db: Database,
  scheduleId: string,
  now: string,
): FairnessSnapshot {
  const shifts = shiftsForSchedule(db, scheduleId);
  const schedule = db.schedules.find((s) => s.id === scheduleId);
  const dates: string[] = [];
  if (schedule) {
    for (let d = schedule.startDate; d <= schedule.endDate; d = addDays(d, 1)) dates.push(d);
  }
  const patterns: Record<string, AvailabilityPattern[]> = {};
  for (const e of db.employees) patterns[e.id] = db.availability.filter((p) => p.employeeId === e.id);
  return computeFairness({
    scheduleId,
    employees: db.employees.filter((e) => e.active),
    shifts,
    positions: db.positions,
    patterns,
    dates,
    now,
  });
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export function saveAvailability(
  db: Database,
  pattern: AvailabilityPattern,
  actorId: string,
  now: string,
  permissionUser: UserAccount,
  options?: { onBehalf?: boolean },
): Database {
  const employee = db.employees.find((e) => e.id === pattern.employeeId);
  if (employee) {
    const window = activeStudentAvailabilityWindow(db);
    const today = now.slice(0, 10);
    if (!canEditDeskAvailability(permissionUser, employee, window, today, options)) {
      throw new Error("Student availability is locked. Contact a manager to make changes.");
    }
    if (isStudentWorker(employee.classification)) {
      const signUpMinutes = weeklySignUpMinutes(pattern.blocks);
      const capError = validateStudentWeeklyCap(signUpMinutes, "sign-up");
      if (capError) throw new Error(capError);
    }
  }
  const next = clone(db);
  const idx = next.availability.findIndex((p) => p.id === pattern.id);
  const before = idx >= 0 ? next.availability[idx] : undefined;
  const existing = before;
  let approvedBlocks = pattern.approvedBlocks ?? existing?.approvedBlocks;
  if (employee && isStudentWorker(employee.classification) && approvedBlocks?.length) {
    approvedBlocks = pruneApprovedBlocks(pattern.blocks, approvedBlocks);
  }
  const updated = {
    ...pattern,
    approvedBlocks,
    updatedBy: actorId,
    updatedAt: now,
  };
  if (idx >= 0) next.availability[idx] = updated;
  else next.availability.push(updated);
  audit(next, actorId, "availability.save", "availability", pattern.id, { before, after: updated, now });
  return next;
}

export function saveStudentAvailabilityApproval(
  db: Database,
  patternId: string,
  approvedBlocks: AvailabilityBlock[],
  actorId: string,
  now: string,
  permissionUser: UserAccount,
): Database {
  const idx = db.availability.findIndex((p) => p.id === patternId);
  if (idx < 0) throw new Error("Availability pattern not found.");
  const existing = db.availability[idx];
  const employee = db.employees.find((e) => e.id === existing.employeeId);
  if (!employee || !isStudentWorker(employee.classification)) {
    throw new Error("Approvals apply only to student workers.");
  }
  if (!canApproveStudentAvailability(permissionUser, employee)) {
    throw new Error("Only managers and admins may approve student availability.");
  }
  const pruned = pruneApprovedBlocks(existing.blocks, approvedBlocks);
  const approvedMinutes = weeklyApprovedMinutes(pruned);
  const capError = validateStudentWeeklyCap(approvedMinutes, "approved");
  if (capError) throw new Error(capError);

  const next = clone(db);
  const before = next.availability[idx];
  const updated = {
    ...before,
    approvedBlocks: pruned,
    approvedBy: actorId,
    approvedAt: now,
    updatedAt: now,
  };
  next.availability[idx] = updated;
  audit(next, actorId, "availability.approve", "availability", patternId, { before, after: updated, now });
  return next;
}

export function saveWorkingHours(
  db: Database,
  pattern: WorkingHoursPattern,
  actorId: string,
  now: string,
): Database {
  const next = clone(db);
  const idx = next.workingHours.findIndex((p) => p.id === pattern.id);
  const before = idx >= 0 ? next.workingHours[idx] : undefined;
  const updated = { ...pattern, updatedBy: actorId, updatedAt: now };
  if (idx >= 0) next.workingHours[idx] = updated;
  else next.workingHours.push(updated);
  audit(next, actorId, "workingHours.save", "workingHours", pattern.id, { before, after: updated, now });
  return next;
}

export function deleteWorkingHours(
  db: Database,
  patternId: string,
  actorId: string,
  now: string,
): Database {
  const idx = db.workingHours.findIndex((p) => p.id === patternId);
  if (idx < 0) return db;
  const next = clone(db);
  const [removed] = next.workingHours.splice(idx, 1);
  audit(next, actorId, "workingHours.delete", "workingHours", patternId, { before: removed, now });
  return next;
}

/** The active student submission window (first enabled window, or most recently updated). */
export function activeStudentAvailabilityWindow(db: Database): StudentAvailabilityWindow | undefined {
  return pickWindow(db.studentAvailabilityWindows);
}

export function saveStudentAvailabilityWindow(
  db: Database,
  window: StudentAvailabilityWindow,
  actorId: string,
  now: string,
): Database {
  const next = clone(db);
  const idx = next.studentAvailabilityWindows.findIndex((w) => w.id === window.id);
  const before = idx >= 0 ? next.studentAvailabilityWindows[idx] : undefined;
  const updated = { ...window, updatedBy: actorId, updatedAt: now };
  if (idx >= 0) next.studentAvailabilityWindows[idx] = updated;
  else next.studentAvailabilityWindows.push(updated);
  audit(next, actorId, "studentAvailabilityWindow.save", "studentAvailabilityWindow", window.id, {
    before,
    after: updated,
    now,
  });
  return next;
}

// ---------------------------------------------------------------------------
// Leave
// ---------------------------------------------------------------------------

export function submitLeave(
  db: Database,
  record: LeaveRecord,
  actorId: string,
  now: string,
  permissionUser: UserAccount,
  options?: { onBehalf?: boolean },
): Database {
  if (record.globalExceptionId || record.leaveTypeId === HOLIDAY_LEAVE_TYPE_ID) {
    throw new Error("University-wide exceptions can only be changed from Admin → Global exceptions.");
  }
  const target = db.employees.find((e) => e.id === record.employeeId);
  if (target && !canSubmitAvailabilityException(permissionUser, target, options)) {
    throw new Error("Only managers and admins may submit availability exceptions for student workers.");
  }
  const next = clone(db);
  const rec = { ...record, status: "recorded" as const, enteredBy: actorId, createdAt: now, updatedAt: now };
  next.leave.push(rec);
  audit(next, actorId, "leave.submit", "leave", rec.id, { after: rec, now });
  return next;
}

export function cancelLeave(db: Database, leaveId: string, actorId: string, now: string): Database {
  const next = clone(db);
  const rec = next.leave.find((l) => l.id === leaveId);
  if (!rec) return db;
  if (rec.globalExceptionId) {
    throw new Error("University-wide exceptions can only be changed from Admin → Global exceptions.");
  }
  const before = { ...rec };
  rec.status = "cancelled";
  rec.updatedAt = now;
  audit(next, actorId, "leave.cancel", "leave", leaveId, { before, after: { ...rec }, now });
  return next;
}

// ---------------------------------------------------------------------------
// Global exceptions (organization-wide holidays / closures)
// ---------------------------------------------------------------------------

export function upsertGlobalException(
  db: Database,
  exception: GlobalException,
  actorId: string,
  now: string,
): Database {
  const next = clone(db);
  const idx = next.globalExceptions.findIndex((g) => g.id === exception.id);
  const before = idx >= 0 ? next.globalExceptions[idx] : undefined;
  const updated = {
    ...exception,
    createdAt: before?.createdAt ?? now,
    createdBy: before?.createdBy ?? actorId,
    updatedAt: now,
  };
  if (idx >= 0) next.globalExceptions[idx] = updated;
  else next.globalExceptions.push(updated);
  audit(next, actorId, idx >= 0 ? "globalException.update" : "globalException.create", "globalException", exception.id, {
    before,
    after: updated,
    now,
  });
  return syncGlobalExceptionsToLeave(next, actorId, now);
}

export function deleteGlobalException(db: Database, exceptionId: string, actorId: string, now: string): Database {
  const next = clone(db);
  const idx = next.globalExceptions.findIndex((g) => g.id === exceptionId);
  if (idx < 0) return db;
  const [removed] = next.globalExceptions.splice(idx, 1);
  audit(next, actorId, "globalException.delete", "globalException", exceptionId, { before: removed, now });
  return syncGlobalExceptionsToLeave(next, actorId, now);
}

export function syncAllGlobalExceptions(db: Database, actorId: string, now: string): Database {
  return syncGlobalExceptionsToLeave(clone(db), actorId, now);
}

// ---------------------------------------------------------------------------
// Daily notes (dashboard feed)
// ---------------------------------------------------------------------------

export function upsertDailyNote(db: Database, note: DailyNote, actorId: string, now: string): Database {
  const next = clone(db);
  const idx = next.dailyNotes.findIndex((n) => n.id === note.id);
  const before = idx >= 0 ? next.dailyNotes[idx] : undefined;
  const updated = { ...note, updatedAt: now, createdAt: before?.createdAt ?? now };
  if (idx >= 0) next.dailyNotes[idx] = updated;
  else next.dailyNotes.unshift(updated);
  audit(next, actorId, idx >= 0 ? "dailyNote.update" : "dailyNote.create", "dailyNote", note.id, { before, after: updated, now });
  return next;
}

export function setDailyNotePublished(db: Database, noteId: string, published: boolean, actorId: string, now: string): Database {
  const next = clone(db);
  const n = next.dailyNotes.find((x) => x.id === noteId);
  if (!n) return db;
  n.published = published;
  n.updatedAt = now;
  audit(next, actorId, published ? "dailyNote.publish" : "dailyNote.unpublish", "dailyNote", noteId, { after: { published }, now });
  return next;
}

export function deleteDailyNote(db: Database, noteId: string, actorId: string, now: string): Database {
  const next = clone(db);
  const idx = next.dailyNotes.findIndex((x) => x.id === noteId);
  if (idx < 0) return db;
  const [removed] = next.dailyNotes.splice(idx, 1);
  audit(next, actorId, "dailyNote.delete", "dailyNote", noteId, { before: removed, now });
  return next;
}

// ---------------------------------------------------------------------------
// Sample data (admin demo)
// ---------------------------------------------------------------------------

export function loadSampleData(db: Database, actorId: string, now: string): Database {
  const weekStart = mondayOf(now.slice(0, 10));
  const next = applySampleData(db, weekStart, now);
  if (next === db) return db; // already loaded
  audit(next, actorId, "sample.load", "database", "sample", { now });
  return syncGlobalExceptionsToLeave(next, actorId, now);
}

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------

export function upsertShift(db: Database, shift: Shift, actorId: string, now: string): Database {
  const next = clone(db);
  const idx = next.shifts.findIndex((s) => s.id === shift.id);
  const before = idx >= 0 ? next.shifts[idx] : undefined;
  const updated = { ...shift, updatedAt: now };
  if (idx >= 0) next.shifts[idx] = updated;
  else next.shifts.push({ ...updated, createdAt: now });
  audit(next, actorId, idx >= 0 ? "shift.update" : "shift.create", "shift", shift.id, { before, after: updated, now });
  return next;
}

export function cancelShift(db: Database, shiftId: string, actorId: string, now: string): Database {
  const next = clone(db);
  const s = next.shifts.find((x) => x.id === shiftId);
  if (!s) return db;
  const before = { ...s };
  s.status = "cancelled";
  s.updatedAt = now;
  audit(next, actorId, "shift.cancel", "shift", shiftId, { before, after: { ...s }, now });
  return next;
}

export function toggleLock(db: Database, shiftId: string, actorId: string, now: string): Database {
  const next = clone(db);
  const s = next.shifts.find((x) => x.id === shiftId);
  if (!s) return db;
  s.locked = !s.locked;
  s.updatedAt = now;
  audit(next, actorId, s.locked ? "shift.lock" : "shift.unlock", "shift", shiftId, { after: { locked: s.locked }, now });
  return next;
}

// ---------------------------------------------------------------------------
// Generation + publication
// ---------------------------------------------------------------------------

export function runGeneration(
  db: Database,
  scheduleId: string,
  opts: { seed: number; weights?: ScheduleWeights; mode?: GenerationMode; actorId: string; now: string },
): { db: Database; result: GenerationResult } {
  const next = clone(db);
  const coverage = next.coverage.filter((c) => {
    const sched = next.schedules.find((s) => s.id === scheduleId);
    return sched ? c.date >= sched.startDate && c.date <= sched.endDate : true;
  });
  const patterns: Record<string, AvailabilityPattern[]> = {};
  const leave: Record<string, LeaveRecord[]> = {};
  for (const e of next.employees) {
    patterns[e.id] = next.availability.filter((p) => p.employeeId === e.id);
    leave[e.id] = leaveRecordsForEmployee(next, e.id);
  }
  const policyByClassification: Record<string, ReturnType<typeof policyFor>> = {};
  for (const e of next.employees) policyByClassification[e.classification] = policyFor(next, e.classification);

  const locked = next.shifts.filter((s) => s.scheduleId === scheduleId && (s.locked || s.status === "published"));
  const rules = next.notes.filter((n) => n.usableByEngine && n.structuredRule?.confirmed).map((n) => n.structuredRule!);

  const result = generateSchedule({
    seed: opts.seed,
    requirements: coverage,
    employees: next.employees.filter((e) => e.active),
    positions: next.positions,
    patterns,
    leave,
    leaveTypes: next.leaveTypes,
    policyByClassification,
    lockedShifts: locked,
    rules,
    weights: opts.weights,
    mode: opts.mode,
    scheduleId,
    now: opts.now,
  });

  // Replace generated (non-locked) shifts with the new draft.
  next.shifts = next.shifts.filter((s) => s.scheduleId !== scheduleId || s.locked || s.status === "published");
  const lockedIds = new Set(next.shifts.map((s) => s.id));
  for (const s of result.shifts) if (!lockedIds.has(s.id)) next.shifts.push(s);

  audit(next, opts.actorId, "schedule.generate", "schedule", scheduleId, {
    after: { coverageScore: result.coverageScore, generated: result.assignments.length, unfilled: result.unfilled.length, seed: opts.seed },
    now: opts.now,
  });
  return { db: next, result };
}

export interface PublishResult {
  db: Database;
  published: boolean;
  blocking: ComplianceFinding[];
}

export function publishSchedule(
  db: Database,
  scheduleId: string,
  actorId: string,
  now: string,
): PublishResult {
  const blocking = computeCompliance(db, scheduleId).filter((f) => f.severity === "hard");
  if (blocking.length > 0) return { db, published: false, blocking };
  const next = clone(db);
  const sched = next.schedules.find((s) => s.id === scheduleId);
  if (!sched) return { db, published: false, blocking: [] };
  sched.status = "published";
  sched.publishedVersion = sched.version;
  sched.updatedAt = now;
  for (const s of next.shifts) {
    if (s.scheduleId === scheduleId && (s.status === "draft" || s.status === "proposed")) {
      s.status = "published";
      s.scheduleVersion = sched.version;
      s.updatedAt = now;
    }
  }
  // Notify assigned employees.
  const notified = new Set<string>();
  for (const s of next.shifts) {
    if (s.scheduleId === scheduleId && s.employeeId && !notified.has(s.employeeId)) {
      notified.add(s.employeeId);
      next.notifications.unshift({
        id: `notif-${next.notifications.length + 1}-${s.employeeId}`,
        userId: s.employeeId,
        type: "schedule_published",
        title: "Schedule published",
        body: `${sched.name} has been published.`,
        read: false,
        createdAt: now,
      });
    }
  }
  audit(next, actorId, "schedule.publish", "schedule", scheduleId, { after: { version: sched.version }, now });
  return { db: next, published: true, blocking: [] };
}

export function overrideCompliance(
  db: Database,
  override: Omit<ComplianceOverride, "id" | "createdAt">,
  now: string,
): Database {
  const next = clone(db);
  const rec: ComplianceOverride = {
    ...override,
    id: `override-${next.overrides.length + 1}`,
    createdAt: now,
  };
  next.overrides.push(rec);
  audit(next, override.actorId, "compliance.override", "compliance", override.findingRuleId, {
    reason: override.reason,
    after: rec,
    now,
  });
  return next;
}

// ---------------------------------------------------------------------------
// Swaps
// ---------------------------------------------------------------------------

export interface SwapOutcome {
  db: Database;
  status: "auto_approved" | "manager_review";
  reasons: string[];
}

export function requestSwap(
  db: Database,
  input: { shiftId: string; toEmployeeId: string; reason?: string; actorId: string; now: string },
): SwapOutcome {
  const shift = db.shifts.find((s) => s.id === input.shiftId);
  const recipient = db.employees.find((e) => e.id === input.toEmployeeId);
  const position = shift && db.positions.find((p) => p.id === shift.positionId);
  if (!shift || !recipient || !position) {
    return { db, status: "manager_review", reasons: ["Shift, recipient, or position not found."] };
  }
  const initiator = shift.employeeId ? db.employees.find((e) => e.id === shift.employeeId) : undefined;
  if (!initiator) {
    return { db, status: "manager_review", reasons: ["Shift owner not found."] };
  }
  const weekMinutes = db.shifts
    .filter((s) => s.employeeId === recipient.id && s.status !== "cancelled")
    .reduce((m, s) => m + (s.end - s.start), 0);
  const evaluation = evaluateSwap({
    shift,
    initiatorClassification: initiator.classification,
    recipient,
    position,
    recipientPatterns: db.availability.filter((p) => p.employeeId === recipient.id),
    recipientLeave: leaveRecordsForEmployee(db, recipient.id),
    leaveTypes: db.leaveTypes,
    recipientShiftsThatDay: db.shifts.filter((s) => s.employeeId === recipient.id && s.date === shift.date),
    policy: policyFor(db, recipient.classification),
    positions: db.positions,
    cutoffOk: true,
    weeklyMinutesSoFar: weekMinutes,
  });

  const next = clone(db);
  const status: SwapRequest["status"] = evaluation.autoApprovable ? "auto_approved" : "manager_review";
  const req: SwapRequest = {
    id: `swap-${next.swaps.length + 1}`,
    kind: "direct",
    shiftId: input.shiftId,
    fromEmployeeId: shift.employeeId,
    toEmployeeId: input.toEmployeeId,
    status,
    reason: input.reason,
    createdAt: input.now,
    history: [
      { at: input.now, actor: input.actorId, action: "requested" },
      { at: input.now, actor: "system", action: status, detail: evaluation.reasons.join("; ") || "All policy gates passed." },
    ],
    decidedBy: evaluation.autoApprovable ? "system" : undefined,
  };
  next.swaps.unshift(req);

  if (evaluation.autoApprovable) {
    const s = next.shifts.find((x) => x.id === input.shiftId)!;
    s.employeeId = input.toEmployeeId;
    s.source = "shift_swap";
    s.updatedAt = input.now;
    audit(next, input.actorId, "swap.auto_approved", "swap", req.id, { after: req, now: input.now });
  } else {
    audit(next, input.actorId, "swap.manager_review", "swap", req.id, { after: req, reason: evaluation.reasons.join("; "), now: input.now });
  }
  return { db: next, status, reasons: evaluation.reasons };
}

// ---------------------------------------------------------------------------
// Desk coverage requests ("I need help covering this shift")
// ---------------------------------------------------------------------------

/** Raise an open request for help covering a shift the actor owns. Idempotent per shift. */
export function requestCoverage(db: Database, shiftId: string, actorId: string, now: string): Database {
  const shift = db.shifts.find((s) => s.id === shiftId);
  if (!shift) return db;
  if (db.swaps.some((s) => s.shiftId === shiftId && s.kind === "give_up" && s.status === "pending")) {
    return db; // already seeking coverage
  }
  const next = clone(db);
  const req: SwapRequest = {
    id: `cover-${next.swaps.length + 1}-${shiftId}`,
    kind: "give_up",
    shiftId,
    fromEmployeeId: shift.employeeId,
    toEmployeeId: null,
    status: "pending",
    reason: "Coverage requested",
    createdAt: now,
    history: [{ at: now, actor: actorId, action: "coverage_requested" }],
  };
  next.swaps.unshift(req);
  const target = next.shifts.find((s) => s.id === shiftId);
  if (target) {
    target.status = "coverage_needed";
    target.updatedAt = now;
  }
  audit(next, actorId, "coverage.requested", "shift", shiftId, { after: { swap: req.id }, now });
  return next;
}

/** Record that a teammate cannot help with a coverage request (removes it from their feed). */
export function declineCoverage(db: Database, swapId: string, actorId: string, now: string): Database {
  const exists = db.swaps.find((s) => s.id === swapId);
  if (!exists) return db;
  const next = clone(db);
  const swap = next.swaps.find((s) => s.id === swapId)!;
  if (!swap.history.some((h) => h.action === "decline_help" && h.actor === actorId)) {
    swap.history.push({ at: now, actor: actorId, action: "decline_help" });
  }
  return next;
}

/** A teammate picks up an open coverage request; the shift transfers to them. */
export function acceptCoverage(db: Database, swapId: string, actorId: string, now: string): Database {
  const req = db.swaps.find((s) => s.id === swapId && s.kind === "give_up" && s.status === "pending");
  if (!req) return db;
  const next = clone(db);
  const swap = next.swaps.find((s) => s.id === swapId)!;
  const shift = next.shifts.find((s) => s.id === swap.shiftId);
  if (!shift) return db;
  const before = { ...shift };
  shift.employeeId = actorId;
  shift.source = "shift_swap";
  shift.status = "published";
  shift.updatedAt = now;
  swap.status = "completed";
  swap.toEmployeeId = actorId;
  swap.decidedBy = actorId;
  swap.history.push({ at: now, actor: actorId, action: "coverage_filled" });
  audit(next, actorId, "coverage.filled", "shift", shift.id, { before, after: { ...shift }, now });
  return next;
}

/**
 * Expire coverage requests whose shift has already started with no taker, logging
 * each as unfilled in the audit trail. Called with the current library-time clock.
 */
export function expireStaleCoverage(
  db: Database,
  now: { date: string; minute: number; iso: string },
  actorId: string,
): Database {
  const clock = { date: now.date, minute: now.minute };
  const stale = db.swaps.filter((s) => {
    if (s.kind !== "give_up" || s.status !== "pending") return false;
    const shift = db.shifts.find((x) => x.id === s.shiftId);
    return shift ? coverageDeadlinePassed(shift, clock) : true;
  });
  if (stale.length === 0) return db;
  const staleIds = new Set(stale.map((s) => s.id));
  const next = clone(db);
  for (const swap of next.swaps) {
    if (!staleIds.has(swap.id)) continue;
    swap.status = "expired";
    swap.history.push({ at: now.iso, actor: "system", action: "coverage_unfilled" });
    const shift = next.shifts.find((x) => x.id === swap.shiftId);
    audit(next, actorId, "coverage.unfilled", "shift", swap.shiftId, {
      after: {
        swap: swap.id,
        employeeId: shift?.employeeId ?? swap.fromEmployeeId,
        date: shift?.date,
        start: shift?.start,
        end: shift?.end,
      },
      now: now.iso,
    });
  }
  return next;
}

// ---------------------------------------------------------------------------
// Positions & Tasks (admin/manager CRUD — not hard-coded)
// ---------------------------------------------------------------------------

export function upsertPosition(db: Database, position: Position, actorId: string, now: string): Database {
  const next = clone(db);
  const idx = next.positions.findIndex((p) => p.id === position.id);
  const before = idx >= 0 ? next.positions[idx] : undefined;
  if (idx >= 0) next.positions[idx] = position;
  else next.positions.push(position);
  audit(next, actorId, idx >= 0 ? "position.update" : "position.create", "position", position.id, { before, after: position, now });
  return next;
}

export function archivePosition(db: Database, positionId: string, actorId: string, now: string): Database {
  const next = clone(db);
  const p = next.positions.find((x) => x.id === positionId);
  if (!p) return db;
  p.active = false;
  audit(next, actorId, "position.archive", "position", positionId, { after: { active: false }, now });
  return next;
}

export function upsertTask(db: Database, task: Task, actorId: string, now: string): Database {
  const next = clone(db);
  const idx = next.tasks.findIndex((t) => t.id === task.id);
  const before = idx >= 0 ? next.tasks[idx] : undefined;
  if (idx >= 0) next.tasks[idx] = task;
  else next.tasks.push(task);
  audit(next, actorId, idx >= 0 ? "task.update" : "task.create", "task", task.id, { before, after: task, now });
  return next;
}

export function archiveTask(db: Database, taskId: string, actorId: string, now: string): Database {
  const next = clone(db);
  const t = next.tasks.find((x) => x.id === taskId);
  if (!t) return db;
  t.active = false;
  audit(next, actorId, "task.archive", "task", taskId, { after: { active: false }, now });
  return next;
}

// ---------------------------------------------------------------------------
// User management
// ---------------------------------------------------------------------------

export function setUserState(
  db: Database,
  userId: string,
  state: Database["users"][number]["state"],
  actorId: string,
  now: string,
): Database {
  const next = clone(db);
  const u = next.users.find((x) => x.id === userId);
  if (!u) return db;
  const before = u.state;
  u.state = state;
  u.updatedAt = now;
  const emp = next.employees.find((e) => e.id === userId);
  if (emp) emp.active = state === "active";
  audit(next, actorId, "user.state", "user", userId, { before, after: state, now });
  return next;
}

export function setUserRoles(
  db: Database,
  userId: string,
  roles: Database["users"][number]["roles"],
  actorId: string,
  now: string,
): Database {
  const next = clone(db);
  const u = next.users.find((x) => x.id === userId);
  if (!u) return db;
  const before = u.roles;
  u.roles = roles;
  u.updatedAt = now;
  audit(next, actorId, "user.roles", "user", userId, { before, after: roles, now });
  return next;
}
