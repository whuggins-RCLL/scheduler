import type { EmploymentClassification, ISODate, MinuteOfDay, WorkingDaySchedule, WorkingHoursPattern } from "./types";
import { weekdayOf } from "./time";

/** Classifications that use on-shift/off instead of start/end times in working hours. */
const EXEMPT_WORKING_HOURS: EmploymentClassification[] = ["exempt_staff", "manager"];

export function isExemptWorkingHours(classification: EmploymentClassification): boolean {
  return EXEMPT_WORKING_HOURS.includes(classification);
}

/** Monday-first labels for working-hours forms. */
export const WORKING_WEEKDAYS: { weekday: number; label: string }[] = [
  { weekday: 1, label: "Monday" },
  { weekday: 2, label: "Tuesday" },
  { weekday: 3, label: "Wednesday" },
  { weekday: 4, label: "Thursday" },
  { weekday: 5, label: "Friday" },
  { weekday: 6, label: "Saturday" },
  { weekday: 0, label: "Sunday" },
];

/** Legacy grid block shape kept only for Firestore migration. */
interface LegacyWorkingHoursBlock {
  weekday: number;
  start: MinuteOfDay;
  end: MinuteOfDay;
}

export function defaultWorkingWeek(): WorkingDaySchedule[] {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    regularDayOff: weekday === 0 || weekday === 6,
    start: weekday === 0 || weekday === 6 ? undefined : 9 * 60,
    end: weekday === 0 || weekday === 6 ? undefined : 17 * 60,
    workLocation: "on_site" as const,
  }));
}

/** Convert legacy half-hour grid blocks into one row per weekday. */
export function blocksToDaySchedules(blocks: LegacyWorkingHoursBlock[]): WorkingDaySchedule[] {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    const dayBlocks = blocks
      .filter((b) => b.weekday === weekday)
      .sort((a, b) => a.start - b.start);
    if (dayBlocks.length === 0) {
      return { weekday, regularDayOff: true };
    }
    return {
      weekday,
      regularDayOff: false,
      start: dayBlocks[0].start,
      end: dayBlocks[dayBlocks.length - 1].end,
      workLocation: "on_site",
    };
  });
}

export function normalizeWorkingDays(days: WorkingDaySchedule[] | undefined): WorkingDaySchedule[] {
  const byWeekday = new Map((days ?? []).map((d) => [d.weekday, d]));
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    const row = byWeekday.get(weekday);
    if (!row) return { weekday, regularDayOff: true };
    if (row.regularDayOff) return { weekday, regularDayOff: true };
    return {
      weekday,
      regularDayOff: false,
      start: row.start,
      end: row.end,
      workLocation: row.workLocation ?? "on_site",
    };
  });
}

/** Whether a pattern applies on the given calendar day. */
export function effectiveOn(pattern: WorkingHoursPattern, date: ISODate): boolean {
  if (pattern.effectiveStart && date < pattern.effectiveStart) return false;
  if (pattern.effectiveEnd && date > pattern.effectiveEnd) return false;
  return true;
}

export function scheduleForWeekday(
  pattern: WorkingHoursPattern,
  weekday: number,
): WorkingDaySchedule | undefined {
  return normalizeWorkingDays(pattern.days).find((d) => d.weekday === weekday);
}

/** True when the weekday is marked as a regular day off in the pattern. */
export function isRegularDayOff(pattern: WorkingHoursPattern, date: ISODate): boolean {
  if (!effectiveOn(pattern, date)) return false;
  const row = scheduleForWeekday(pattern, weekdayOf(date));
  return row?.regularDayOff === true;
}

export function validateWorkingDays(
  days: WorkingDaySchedule[],
  options?: { exempt?: boolean },
): string[] {
  const errors: string[] = [];
  const exempt = options?.exempt ?? false;
  for (const row of normalizeWorkingDays(days)) {
    const label = WORKING_WEEKDAYS.find((d) => d.weekday === row.weekday)?.label ?? `Day ${row.weekday}`;
    if (row.regularDayOff) continue;
    if (exempt) continue;
    if (row.start == null || row.end == null) {
      errors.push(`${label}: enter a start and end time, or mark it as a regular day off.`);
      continue;
    }
    if (row.end <= row.start) {
      errors.push(`${label}: end time must be after the start time.`);
    }
  }
  return errors;
}

export function validateEffectiveDates(
  effectiveStart?: ISODate,
  effectiveEnd?: ISODate,
): string[] {
  const errors: string[] = [];
  if (!effectiveStart) errors.push("Effective start date is required.");
  if (effectiveStart && effectiveEnd && effectiveEnd < effectiveStart) {
    errors.push("Effective end date must be on or after the start date.");
  }
  return errors;
}
