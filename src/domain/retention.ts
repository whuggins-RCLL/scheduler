/**
 * Schedule retention. Past schedules and shifts are kept for a fixed window and
 * then purged, so the workspace only ever holds a rolling recent history plus
 * the self-generating future.
 */
import type { ISODate } from "./types";
import { addDays } from "./time";

/** Days of past schedule history to retain before purging. */
export const SCHEDULE_RETENTION_DAYS = 15;

/**
 * Oldest date still retained. Anything strictly before this is purgeable — i.e.
 * once a date ages past `SCHEDULE_RETENTION_DAYS` (reaches "day 16"), it goes.
 */
export function retentionCutoff(today: ISODate, days: number = SCHEDULE_RETENTION_DAYS): ISODate {
  return addDays(today, -days);
}

/** True when a dated record is older than the retention window and should be purged. */
export function isPurgeableDate(
  date: ISODate,
  today: ISODate,
  days: number = SCHEDULE_RETENTION_DAYS,
): boolean {
  return date < retentionCutoff(today, days);
}
