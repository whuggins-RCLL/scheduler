/**
 * Borrowing Services Desk coverage.
 *
 * The desk must have a minimum of one person (student OR staff) whenever it is
 * open. Other positions (stacks, projects, tasks) are not must-cover. These pure
 * helpers derive the uncovered desk windows directly from operating hours minus
 * assigned desk shifts — so with no schedule yet, the whole open day reads as a
 * gap. They also model "give up a shift" coverage requests and their deadlines.
 */
import type { ISODate, OperatingHours, Shift, SwapRequest, TimeInterval } from "./types";
import { mergeIntervals, subtractIntervals, weekdayOf } from "./time";

export const DESK_LOCATION_ID = "loc-desk";

/** The swap kind used when someone asks for help covering a shift they own. */
export const COVERAGE_REQUEST_KIND = "give_up" as const;

/** Desk open intervals for a date — a dated exception overrides the weekly hours. */
export function deskOpenIntervalsForDate(
  hours: OperatingHours | undefined,
  date: ISODate,
): TimeInterval[] {
  if (!hours) return [];
  const exception = hours.exceptions.find((e) => e.date === date);
  if (exception) return exception.closed ? [] : mergeIntervals(exception.intervals);
  return mergeIntervals(hours.weekly[weekdayOf(date)] ?? []);
}

/** Whether a shift counts toward desk coverage (desk location or a desk position). */
export function isDeskShift(
  shift: Shift,
  deskLocationId: string = DESK_LOCATION_ID,
  deskPositionIds: string[] = [],
): boolean {
  return shift.locationId === deskLocationId || deskPositionIds.includes(shift.positionId);
}

/** Intervals actually staffed by an assigned desk person (breaks removed). */
export function coveredDeskIntervals(
  shifts: Shift[],
  date: ISODate,
  opts: { deskLocationId?: string; deskPositionIds?: string[] } = {},
): TimeInterval[] {
  const covered: TimeInterval[] = [];
  for (const s of shifts) {
    if (s.date !== date || s.status === "cancelled" || !s.employeeId) continue;
    if (!isDeskShift(s, opts.deskLocationId, opts.deskPositionIds)) continue;
    const breaks = s.breaks.map((b) => ({ start: b.start, end: b.end }));
    covered.push(...subtractIntervals({ start: s.start, end: s.end }, breaks));
  }
  return mergeIntervals(covered);
}

/** Open desk windows with no assigned coverage (minimum one person required). */
export function deskCoverageGaps(open: TimeInterval[], covered: TimeInterval[]): TimeInterval[] {
  return mergeIntervals(open).flatMap((iv) => subtractIntervals(iv, covered));
}

export interface DayDeskCoverage {
  date: ISODate;
  open: TimeInterval[];
  gaps: TimeInterval[];
  openMinutes: number;
  gapMinutes: number;
}

const sumMinutes = (intervals: TimeInterval[]): number =>
  intervals.reduce((total, iv) => total + Math.max(0, iv.end - iv.start), 0);

/** Full desk-coverage picture for one date. */
export function deskCoverageForDate(
  hours: OperatingHours | undefined,
  shifts: Shift[],
  date: ISODate,
  opts: { deskLocationId?: string; deskPositionIds?: string[] } = {},
): DayDeskCoverage {
  const open = deskOpenIntervalsForDate(hours, date);
  const covered = coveredDeskIntervals(shifts, date, opts);
  const gaps = deskCoverageGaps(open, covered);
  return { date, open, gaps, openMinutes: sumMinutes(open), gapMinutes: sumMinutes(gaps) };
}

// ---------------------------------------------------------------------------
// Coverage requests ("I need help covering this shift")
// ---------------------------------------------------------------------------

/** A wall-clock instant expressed for deadline comparisons. */
export interface CoverageClock {
  date: ISODate;
  minute: number; // minute-of-day in the library timezone
}

/**
 * A coverage request is past its deadline once the shift it covers has started —
 * that is the last moment help is useful. Stale requests are dropped from the
 * dashboard and logged as unfilled.
 */
export function coverageDeadlinePassed(shift: Shift, now: CoverageClock): boolean {
  if (shift.date < now.date) return true;
  if (shift.date > now.date) return false;
  return shift.start <= now.minute;
}

/** An active, still-open request for help covering a shift. */
export function isOpenCoverageRequest(swap: SwapRequest): boolean {
  return swap.kind === COVERAGE_REQUEST_KIND && swap.status === "pending";
}

/** Whether `userId` has opted out of helping with this request. */
export function hasDeclinedCoverage(swap: SwapRequest, userId: string): boolean {
  return swap.history.some((h) => h.action === "decline_help" && h.actor === userId);
}

export interface CoverageRequestView {
  swap: SwapRequest;
  shift: Shift;
}

/**
 * Open coverage requests a given viewer should see on their dashboard: not their
 * own, not ones they've declined, still open, and not past the deadline.
 */
export function visibleCoverageRequests(
  swaps: SwapRequest[],
  shifts: Shift[],
  viewerId: string,
  now: CoverageClock,
): CoverageRequestView[] {
  const byId = new Map(shifts.map((s) => [s.id, s]));
  const out: CoverageRequestView[] = [];
  for (const swap of swaps) {
    if (!isOpenCoverageRequest(swap)) continue;
    if (swap.fromEmployeeId === viewerId) continue;
    if (hasDeclinedCoverage(swap, viewerId)) continue;
    const shift = byId.get(swap.shiftId);
    if (!shift || shift.status === "cancelled") continue;
    if (coverageDeadlinePassed(shift, now)) continue;
    out.push({ swap, shift });
  }
  return out.sort((a, b) => (a.shift.date + a.shift.start).localeCompare(b.shift.date + String(b.shift.start)));
}
