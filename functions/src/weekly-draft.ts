/**
 * Pure planning logic for the automated weekly draft.
 *
 * `planWeeklyDraft` is the server-side twin of the app's `runGeneration`
 * (`src/lib/store/actions.ts`): it maps a tenant snapshot into the deterministic
 * scheduling engine's input, runs the *same* `generateSchedule` engine that the
 * browser and the tests use, and returns the writes to persist. Keeping it here
 * as a pure function (no Firestore, no `firebase-functions`) lets it be unit
 * tested directly and keeps `index.ts` a thin Firestore I/O shell.
 *
 * Invariants:
 *   - It only ever produces a **draft** schedule for manager review — it never
 *     publishes, and it never touches locked, published, or human-authored
 *     shifts. Those are handed to the engine as fixed context to fill around.
 *   - Only a prior automated run's still-draft AI shifts are replaceable, so a
 *     re-run cleanly supersedes the previous machine draft without clobbering
 *     anything a person has locked or edited.
 *   - The seed is derived from the target week, so the same inputs produce the
 *     same schedule (the engine's core determinism guarantee).
 */
import {
  DEFAULT_WEIGHTS,
  generateSchedule,
  type GenerationResult,
} from "../../src/domain/scheduling";
import { leaveRecordsForEmployee } from "../../src/domain/global-exceptions";
import { addDays, hashString, weekdayOf } from "../../src/domain/time";
import type {
  AvailabilityPattern,
  BreakPolicy,
  ISODate,
  ISODateTime,
  LeaveRecord,
  Schedule,
  Shift,
  StructuredRule,
} from "../../src/domain/types";
import type { AuditEvent } from "../../src/domain/types";
import type { Database } from "../../src/lib/store/types";

/** Attributed actor for automated writes (audit trail + schedule.createdBy). */
export const SCHEDULER_ACTOR_ID = "system:scheduled-generation";

/** Monday (ISO) of the week containing `date`. Mirrors `sample.ts`/`seed.ts`. */
export function mondayOf(dateISO: ISODate): ISODate {
  const w = weekdayOf(dateISO);
  const diff = w === 0 ? -6 : 1 - w;
  return addDays(dateISO, diff);
}

/** Monday of the week *after* the one containing `todayISO` — the period the
 * weekly job drafts ahead of time. */
export function nextWeekStart(todayISO: ISODate): ISODate {
  return addDays(mondayOf(todayISO), 7);
}

/** Deterministic per-week seed so the same week always yields the same draft. */
export function seedForWeek(weekStart: ISODate): number {
  return hashString(weekStart);
}

export interface WeeklyDraftParams {
  scheduleId: string;
  weekStart: ISODate;
  weekEnd: ISODate;
  seed: number;
  now: ISODateTime;
}

export interface WeeklyDraftPlan {
  /** Schedule document to upsert (always `draft`). */
  schedule: Schedule;
  /** Newly generated draft shifts to write. */
  shiftsToWrite: Shift[];
  /** Superseded automated-draft shift ids to delete before writing the new set. */
  shiftIdsToDelete: string[];
  /** Audit event recording the automated run. */
  audit: AuditEvent;
  /** Engine result, surfaced for logging (coverage, unfilled, findings). */
  result: GenerationResult;
}

/** Break policy for a classification, mirroring `actions.ts#policyFor`. */
function policyFor(db: Database, classification: string): BreakPolicy | undefined {
  return (
    db.breakPolicies.find((p) => p.classification === classification) ??
    db.breakPolicies.find((p) => p.id === "ca-nonexempt-v1")
  );
}

/**
 * Build the engine input from a tenant snapshot and produce the draft writes.
 * `existingSchedule` is the schedule already covering the target week (if any);
 * pass `null` to mint a fresh draft. The caller is responsible for skipping
 * weeks whose schedule is already published.
 */
export function planWeeklyDraft(
  db: Database,
  existingSchedule: Schedule | null,
  params: WeeklyDraftParams,
): WeeklyDraftPlan {
  const { scheduleId, weekStart, weekEnd, seed, now } = params;

  const requirements = db.coverage.filter((c) => c.date >= weekStart && c.date <= weekEnd);

  const patterns: Record<string, AvailabilityPattern[]> = {};
  const leave: Record<string, LeaveRecord[]> = {};
  for (const e of db.employees) {
    patterns[e.id] = db.availability.filter((p) => p.employeeId === e.id);
    leave[e.id] = leaveRecordsForEmployee(db, e.id);
  }

  const policyByClassification: Record<string, BreakPolicy> = {};
  for (const e of db.employees) {
    const policy = policyFor(db, e.classification);
    if (policy) policyByClassification[e.classification] = policy;
  }

  // Everything already on this schedule that isn't a replaceable automated draft
  // is preserved verbatim and treated as fixed context the engine fills around.
  const scheduleShifts = db.shifts.filter(
    (s) => s.scheduleId === scheduleId && s.status !== "cancelled",
  );
  const replaceable = scheduleShifts.filter(
    (s) => s.source === "ai_generated" && s.status === "draft" && !s.locked,
  );
  const replaceableIds = new Set(replaceable.map((s) => s.id));
  const preserved = scheduleShifts.filter((s) => !replaceableIds.has(s.id));
  const preservedIds = new Set(preserved.map((s) => s.id));

  const rules: StructuredRule[] = db.notes
    .filter((n) => n.usableByEngine && n.structuredRule?.confirmed)
    .map((n) => n.structuredRule as StructuredRule);

  const result = generateSchedule({
    seed,
    requirements,
    employees: db.employees.filter((e) => e.active),
    positions: db.positions,
    patterns,
    leave,
    leaveTypes: db.leaveTypes,
    policyByClassification,
    lockedShifts: preserved,
    rules,
    weights: DEFAULT_WEIGHTS,
    mode: "full",
    scheduleId,
    now,
  });

  // `result.shifts` = preserved (verbatim) + newly generated; keep only the new.
  const shiftsToWrite = result.shifts.filter((s) => !preservedIds.has(s.id));

  const schedule: Schedule = existingSchedule
    ? { ...existingSchedule, status: "draft", updatedAt: now }
    : {
        id: scheduleId,
        name: `Week of ${weekStart}`,
        startDate: weekStart,
        endDate: weekEnd,
        status: "draft",
        version: 1,
        createdBy: SCHEDULER_ACTOR_ID,
        createdAt: now,
        updatedAt: now,
      };

  const audit: AuditEvent = {
    id: `audit-auto-${scheduleId}-${now}`,
    actorId: SCHEDULER_ACTOR_ID,
    action: "schedule.generate",
    targetType: "schedule",
    targetId: scheduleId,
    after: {
      automated: true,
      seed,
      weekStart,
      weekEnd,
      coverageScore: result.coverageScore,
      generated: result.assignments.length,
      unfilled: result.unfilled.length,
      preserved: preserved.length,
      replaced: replaceable.length,
      hardFindings: result.findings.filter((f) => f.severity === "hard").length,
    },
    source: "scheduled_function",
    createdAt: now,
  };

  return {
    schedule,
    shiftsToWrite,
    shiftIdsToDelete: [...replaceableIds],
    audit,
    result,
  };
}
