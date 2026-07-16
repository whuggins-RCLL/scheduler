/**
 * Scheduling frequency — how often a position must be staffed or a task
 * performed. These are the cadence inputs automated scheduling will consume;
 * for now they are captured per position/task and summarized for admins.
 */
import type { FrequencyMode, ISODate, SchedulingFrequency } from "./types";
import { weekdayOf } from "./time";

export const FREQUENCY_MODES: { value: FrequencyMode; label: string }[] = [
  { value: "per_operational_hour", label: "Every operational hour" },
  { value: "times_per_day", label: "Times per day" },
  { value: "times_per_week", label: "Times per week" },
];

/** A sensible starting frequency for a new position/task. */
export function defaultFrequency(mode: FrequencyMode = "times_per_day"): SchedulingFrequency {
  return { mode, count: 1, weekdays: [] };
}

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];

/** "Mon, Wed, Fri" for a weekday set (Monday-first); "every day" when empty. */
export function weekdaysLabel(weekdays: number[]): string {
  if (weekdays.length === 0) return "every day";
  return MON_FIRST.filter((d) => weekdays.includes(d)).map((d) => DAY_ABBR[d]).join(", ");
}

/** Plain-language summary, e.g. "2×/day (Mon, Wed, Fri)" or "Every operational hour". */
export function describeFrequency(freq: SchedulingFrequency | undefined): string {
  if (!freq) return "Not set";
  const days = freq.weekdays.length > 0 ? ` (${weekdaysLabel(freq.weekdays)})` : "";
  switch (freq.mode) {
    case "per_operational_hour":
      return `Every operational hour${days}`;
    case "times_per_day":
      return `${freq.count}×/day${days}`;
    case "times_per_week":
      return `${freq.count}×/week${days}`;
  }
}

/** Whether the frequency applies on the given date (weekday filter). */
export function appliesOnDate(freq: SchedulingFrequency | undefined, date: ISODate): boolean {
  if (!freq) return false;
  if (freq.weekdays.length === 0) return true;
  return freq.weekdays.includes(weekdayOf(date));
}

/**
 * Occurrences required on a specific date. `per_operational_hour` scales with
 * the day's open-hours; `times_per_day` is a flat count. `times_per_week` is a
 * weekly total (not a per-day count) so it returns 0 here — the weekly
 * distributor that spreads it across the week is future automation work.
 */
export function occurrencesOnDate(
  freq: SchedulingFrequency | undefined,
  date: ISODate,
  openHours = 0,
): number {
  if (!appliesOnDate(freq, date)) return 0;
  switch (freq!.mode) {
    case "per_operational_hour":
      return Math.max(0, Math.round(openHours));
    case "times_per_day":
      return Math.max(0, Math.round(freq!.count));
    case "times_per_week":
      return 0;
  }
}

/** Normalize possibly-partial stored data into a valid frequency (or undefined). */
export function normalizeFrequency(value: unknown): SchedulingFrequency | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Partial<SchedulingFrequency>;
  const mode = FREQUENCY_MODES.some((m) => m.value === v.mode) ? (v.mode as FrequencyMode) : undefined;
  if (!mode) return undefined;
  const count = typeof v.count === "number" && Number.isFinite(v.count) ? Math.max(1, Math.round(v.count)) : 1;
  const weekdays = Array.isArray(v.weekdays)
    ? [...new Set(v.weekdays.filter((d): d is number => typeof d === "number" && d >= 0 && d <= 6))].sort()
    : [];
  return { mode, count, weekdays };
}
