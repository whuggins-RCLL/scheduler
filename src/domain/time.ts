import type { ISODate, MinuteOfDay, TimeInterval } from "./types";

/** Parse "HH:MM" into minutes-of-day. Throws on malformed input. */
export function parseTime(hhmm: string): MinuteOfDay {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`Invalid time: ${hhmm}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Out-of-range time: ${hhmm}`);
  return h * 60 + min;
}

/** Format minutes-of-day as "HH:MM" (24h). */
export function formatTime(minutes: MinuteOfDay): string {
  const clamped = Math.max(0, Math.min(1439, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Human 12h format, e.g. "9:00 AM". */
export function formatTime12(minutes: MinuteOfDay): string {
  const clamped = Math.max(0, Math.min(1439, Math.round(minutes)));
  const h24 = Math.floor(clamped / 60);
  const m = clamped % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function durationMinutes(start: MinuteOfDay, end: MinuteOfDay): number {
  return Math.max(0, end - start);
}

/** True when two [start,end) intervals overlap by at least one minute. */
export function overlaps(a: TimeInterval, b: TimeInterval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Minutes of overlap between two intervals (0 if disjoint). */
export function overlapMinutes(a: TimeInterval, b: TimeInterval): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

/** Whether `inner` is fully contained within `outer`. */
export function contains(outer: TimeInterval, inner: TimeInterval): boolean {
  return inner.start >= outer.start && inner.end <= outer.end;
}

/** Merge overlapping/adjacent intervals into a sorted, non-overlapping set. */
export function mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out: TimeInterval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/** Subtract `holes` from `base`, returning the remaining covered sub-intervals. */
export function subtractIntervals(base: TimeInterval, holes: TimeInterval[]): TimeInterval[] {
  const merged = mergeIntervals(holes.filter((h) => overlaps(base, h)));
  const out: TimeInterval[] = [];
  let cursor = base.start;
  for (const h of merged) {
    if (h.start > cursor) out.push({ start: cursor, end: Math.min(h.start, base.end) });
    cursor = Math.max(cursor, h.end);
  }
  if (cursor < base.end) out.push({ start: cursor, end: base.end });
  return out.filter((i) => i.end > i.start);
}

/** Weekday index (0=Sun..6=Sat) for an ISO date, timezone-agnostic. */
export function weekdayOf(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number);
  // Zeller-free: use UTC to avoid local tz effects; deterministic.
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Add N days to an ISO date (deterministic, UTC-based). */
export function addDays(date: ISODate, days: number): ISODate {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Inclusive list of ISO dates from start to end. */
export function dateRange(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let cur = start;
  // guard against inverted ranges / runaway loops
  for (let i = 0; i < 366 && cur <= end; i++) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** ISO calendar date for a moment in an IANA timezone (e.g. America/Los_Angeles). */
export function todayInTimeZone(timeZone: string, at: Date = new Date()): ISODate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Current minute-of-day (0..1439) in an IANA timezone. UI-only; pass `at` in tests. */
export function nowMinutesInTimeZone(timeZone: string, at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function isWeekend(date: ISODate): boolean {
  const w = weekdayOf(date);
  return w === 0 || w === 6;
}

/**
 * Deterministic seeded PRNG (mulberry32). The scheduling engine relies on this
 * so identical inputs + seed always produce identical schedules.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable string hash -> 32-bit int, for deriving seeds from names/dates. */
export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Evening is defined as work at or after 18:00. */
export const EVENING_START: MinuteOfDay = 18 * 60;
