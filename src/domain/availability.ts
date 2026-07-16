import type {
  AvailabilityKind,
  AvailabilityPattern,
  EmploymentClassification,
  ISODate,
  LeaveRecord,
  LeaveType,
  MinuteOfDay,
  TimeInterval,
} from "./types";
import { overlaps, weekdayOf } from "./time";
import { schedulingBlocks } from "./student-availability";

export interface AvailabilityResolution {
  kind: AvailabilityKind | "unknown";
  onLeave: boolean;
  leaveBlocks: boolean; // leave is a hard block vs. warning
}

/** Choose the availability pattern effective for a given date. */
export function effectivePattern(
  patterns: AvailabilityPattern[],
  date: ISODate,
): AvailabilityPattern | undefined {
  const applicable = patterns.filter((p) => {
    if (p.effectiveStart && date < p.effectiveStart) return false;
    if (p.effectiveEnd && date > p.effectiveEnd) return false;
    return true;
  });
  // Most specific (latest effectiveStart) wins; fall back to undated pattern.
  applicable.sort((a, b) => (b.effectiveStart ?? "").localeCompare(a.effectiveStart ?? ""));
  return applicable[0];
}

/**
 * Resolve how available an employee is for a specific interval on a date,
 * combining recurring availability with approved leave.
 *
 * A window counts as "preferred" only if the whole interval is covered by
 * preferred blocks; "available" if covered by available/preferred; otherwise
 * "unavailable".
 */
export function resolveAvailability(
  patterns: AvailabilityPattern[],
  leave: LeaveRecord[],
  leaveTypes: LeaveType[],
  date: ISODate,
  interval: TimeInterval,
  classification?: EmploymentClassification,
): AvailabilityResolution {
  const leaveHit = leaveForInterval(leave, leaveTypes, date, interval);

  const pattern = effectivePattern(patterns, date);
  if (!pattern) {
    return { kind: "unknown", onLeave: !!leaveHit, leaveBlocks: leaveHit?.blocks ?? false };
  }
  const weekday = weekdayOf(date);
  const sourceBlocks = schedulingBlocks(pattern, classification ?? "non_exempt_staff");
  const blocks = sourceBlocks.filter((b) => b.weekday === weekday);

  const unavailable = blocks.filter((b) => b.kind === "unavailable");
  if (unavailable.some((b) => overlaps(b, interval))) {
    return { kind: "unavailable", onLeave: !!leaveHit, leaveBlocks: leaveHit?.blocks ?? false };
  }

  const preferred = blocks.filter((b) => b.kind === "preferred");
  const available = blocks.filter((b) => b.kind === "available" || b.kind === "preferred");

  const kind: AvailabilityKind | "unknown" = coveredBy(interval, preferred)
    ? "preferred"
    : coveredBy(interval, available)
      ? "available"
      : "unavailable";

  return { kind, onLeave: !!leaveHit, leaveBlocks: leaveHit?.blocks ?? false };
}

function coveredBy(interval: TimeInterval, blocks: TimeInterval[]): boolean {
  if (blocks.length === 0) return false;
  // Walk left-to-right ensuring continuous coverage of the interval.
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  let cursor = interval.start;
  for (const b of sorted) {
    if (b.start > cursor) break;
    cursor = Math.max(cursor, b.end);
    if (cursor >= interval.end) return true;
  }
  return cursor >= interval.end;
}

function leaveForInterval(
  leave: LeaveRecord[],
  leaveTypes: LeaveType[],
  date: ISODate,
  interval: TimeInterval,
): { blocks: boolean } | null {
  for (const l of leave) {
    if (l.status !== "approved" && l.status !== "recorded" && l.status !== "requested") continue;
    if (date < l.startDate || date > l.endDate) continue;
    const type = leaveTypes.find((t) => t.id === l.leaveTypeId);
    const blocks = type?.blocksScheduling ?? true;
    if (!l.partialDay) return { blocks };
    if (l.start != null && l.end != null && overlaps({ start: l.start, end: l.end }, interval)) {
      return { blocks };
    }
  }
  return null;
}

/** Detect overlapping availability blocks within the same weekday (validation). */
export function findAvailabilityConflicts(pattern: AvailabilityPattern): string[] {
  const errors: string[] = [];
  for (let day = 0; day < 7; day++) {
    const blocks = pattern.blocks.filter((b) => b.weekday === day);
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        if (overlaps(blocks[i], blocks[j])) {
          errors.push(`Overlapping availability on weekday ${day}`);
        }
      }
      if (blocks[i].end <= blocks[i].start) {
        errors.push(`Zero or negative-length block on weekday ${day}`);
      }
    }
  }
  return errors;
}

/** True when the employee is fully available (no unavailable, not on blocking leave). */
export function isAvailableForShift(
  patterns: AvailabilityPattern[],
  leave: LeaveRecord[],
  leaveTypes: LeaveType[],
  date: ISODate,
  interval: TimeInterval,
  classification?: EmploymentClassification,
): boolean {
  const r = resolveAvailability(patterns, leave, leaveTypes, date, interval, classification);
  if (r.onLeave && r.leaveBlocks) return false;
  return r.kind === "available" || r.kind === "preferred";
}

/** Total minutes an employee is available (preferred or available) on a date. */
export function availableMinutesOnDate(
  patterns: AvailabilityPattern[],
  date: ISODate,
): number {
  const pattern = effectivePattern(patterns, date);
  if (!pattern) return 0;
  const weekday = weekdayOf(date);
  return pattern.blocks
    .filter((b) => b.weekday === weekday && b.kind !== "unavailable")
    .reduce((sum, b) => sum + (b.end - b.start), 0);
}

export function blockKindLabel(kind: AvailabilityKind): string {
  switch (kind) {
    case "preferred":
      return "Preferred";
    case "available":
      return "Available";
    case "unavailable":
      return "Unavailable";
  }
}

export type { MinuteOfDay };
