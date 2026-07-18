import { addDays, todayInTimeZone, weekdayOf } from "@/domain/time";
import { DEFAULT_TIMEZONE } from "@/lib/config";
import type { ISODate } from "@/domain/types";

/** Half-hour grid geometry shared by the dashboard schedule surfaces. */
export const GRID_SLOT_MINUTES = 30;
export const GRID_DAY_START = 8 * 60; // 08:00
export const GRID_DAY_END = 21 * 60; // 21:00

/** Half-hour slot start-minutes across the staffed day (08:00–20:30). */
export const GRID_SLOTS: number[] = Array.from(
  { length: (GRID_DAY_END - GRID_DAY_START) / GRID_SLOT_MINUTES },
  (_, i) => GRID_DAY_START + i * GRID_SLOT_MINUTES,
);

/** Monday (ISO) of the week containing `iso`. */
export function mondayOf(iso: ISODate): ISODate {
  const w = weekdayOf(iso);
  const diff = w === 0 ? -6 : 1 - w;
  return addDays(iso, diff);
}

/** ISO date for today in the given IANA timezone (defaults to library Pacific time). */
export function todayISO(timeZone: string = DEFAULT_TIMEZONE): ISODate {
  return todayInTimeZone(timeZone);
}

/** First-of-month, `delta` months away from the month containing `iso`. */
export function shiftMonth(iso: ISODate, delta: number): ISODate {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 10);
}

/** Full Monday-anchored weeks covering the calendar month containing `iso`. */
export function monthWeeks(iso: ISODate): ISODate[][] {
  const month = iso.slice(0, 7); // YYYY-MM
  let cur = mondayOf(`${month}-01`);
  const weeks: ISODate[][] = [];
  for (let w = 0; w < 6; w++) {
    const week = Array.from({ length: 7 }, (_, i) => addDays(cur, i));
    if (week.some((d) => d.slice(0, 7) === month)) weeks.push(week);
    cur = addDays(cur, 7);
  }
  return weeks;
}

/** "July 2026" for the month containing `iso`. */
export function monthLabel(iso: ISODate): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Mon, Jul 14" for a single ISO date. */
export function fullDayLabel(iso: ISODate): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Deterministic accent palette so each schedule type reads as its own color. */
const SCHEDULE_TYPE_PALETTE = [
  "--position-desk",
  "--position-admin",
  "--position-project",
  "--position-meetings",
  "--position-learning",
  "--task-collections",
  "--task-operations",
  "--task-meal",
] as const;

/**
 * A stable CSS color variable for a schedule type, assigned by its position in
 * the active-locations list so the same type is always the same color across
 * the tabs, the "my schedule" timeline, and the boards.
 */
export function scheduleTypeColorVar(
  locationId: string,
  activeLocations: { id: string }[],
): string {
  const idx = activeLocations.findIndex((l) => l.id === locationId);
  const token = SCHEDULE_TYPE_PALETTE[(idx < 0 ? 0 : idx) % SCHEDULE_TYPE_PALETTE.length];
  return `var(${token})`;
}

export interface LanePlacement<T> {
  item: T;
  start: number;
  end: number;
  lane: number;
  lanes: number;
}

/**
 * Greedy interval-graph lane packing for a day timeline: overlapping items are
 * split into side-by-side lanes so nothing is drawn on top of anything else.
 */
export function packLanes<T>(
  items: T[],
  getStart: (t: T) => number,
  getEnd: (t: T) => number,
): LanePlacement<T>[] {
  const sorted = [...items].sort((a, b) => getStart(a) - getStart(b) || getEnd(a) - getEnd(b));
  const out: LanePlacement<T>[] = [];
  let cluster: { item: T; start: number; end: number; lane: number }[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    const lanes = Math.max(...cluster.map((c) => c.lane)) + 1;
    for (const c of cluster) out.push({ item: c.item, start: c.start, end: c.end, lane: c.lane, lanes });
    cluster = [];
    clusterEnd = -1;
  };

  for (const it of sorted) {
    const start = getStart(it);
    const end = getEnd(it);
    if (cluster.length && start >= clusterEnd) flush();
    // Reuse the lowest lane index that has already ended by `start`.
    const usedLanes = new Set<number>();
    for (const c of cluster) if (c.end > start) usedLanes.add(c.lane);
    let lane = 0;
    while (usedLanes.has(lane)) lane++;
    cluster.push({ item: it, start, end, lane });
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return out;
}
