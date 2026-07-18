/**
 * Coverage-requirement generation — the "template filling" step.
 *
 * This is the missing link between what admins configure (positions and tasks,
 * each with a `frequency` and staffing counts) and what the scheduling engine
 * consumes (`CoverageRequirement[]`). Given operating hours for a date range it
 * expands each position/task cadence into concrete, dated coverage windows that
 * `generateSchedule` then fills against employee and student availability.
 *
 * Semantics per frequency mode:
 *   - `per_operational_hour`: staffed continuously whenever the schedule type is
 *     open — one requirement spanning each open interval.
 *   - `times_per_day`: N discrete blocks spread across the open day.
 *   - `times_per_week`: a weekly total, distributed across the week's open days
 *     (evenly when the count fits, round-robin when it exceeds the open days).
 *
 * Tasks generate demand at their schedule type's positions automatically: a task
 * is hosted by the primary position of each schedule type it applies to (an
 * explicit `applicablePositionIds` list narrows the eligible hosts). A schedule
 * type with no active position to host the task is reported in `skipped`.
 *
 * Pure and deterministic: identical inputs produce identical requirements, and
 * requirement ids are derived from their contents so re-running is stable.
 */
import type {
  ISODate,
  OperatingHours,
  Position,
  SchedulingFrequency,
  Task,
  TimeInterval,
} from "./types";
import type { CoverageRequirement } from "./scheduling";
import { appliesOnDate } from "./frequency";
import { deskOpenIntervalsForDate } from "./desk-coverage";
import { addDays, mergeIntervals, weekdayOf } from "./time";

// `deskOpenIntervalsForDate` resolves a location's open intervals for a date
// (dated exception overrides weekly hours). It is schedule-type agnostic despite
// the name, so it is the single source of truth for "open windows on a date".
const openIntervalsForDate = deskOpenIntervalsForDate;

export interface CoverageGenerationInput {
  positions: Position[];
  tasks: Task[];
  operatingHours: OperatingHours[];
  /** Calendar days to generate for (typically a schedule's date range). */
  dates: ISODate[];
  /** Fallback block length for a discrete `times_per_day` occurrence. */
  defaultBlockMinutes?: number;
}

export interface CoverageGenerationResult {
  requirements: CoverageRequirement[];
  /** Human-readable notes about cadence that could not be expanded. */
  skipped: string[];
}

const DEFAULT_BLOCK_MINUTES = 60;

/** A normalized unit of demand: who/where, how many, how long, how often. */
interface DemandSource {
  locationId: string;
  positionId: string;
  count: number;
  blockMinutes: number;
  taskId?: string;
  freq: SchedulingFrequency;
  label: string;
}

/** Schedule types a position is staffed on (many-to-many, legacy fallback). */
function scheduleTypeIdsForPosition(p: Position): string[] {
  if (p.applicableLocationIds.length > 0) return p.applicableLocationIds;
  return p.locationId ? [p.locationId] : [];
}

/** Target headcount for a coverage window (never below one). */
function staffingFor(p: Position): number {
  return Math.max(1, p.preferredStaffing || p.minStaffing || 1);
}

function totalMinutes(intervals: TimeInterval[]): number {
  return intervals.reduce((sum, iv) => sum + Math.max(0, iv.end - iv.start), 0);
}

/** Monday (ISO date) of the week containing `date`. */
function mondayOf(date: ISODate): ISODate {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

/**
 * Evenly spread `count` blocks of `blockMinutes` across the open day. Blocks are
 * clamped to sit within the open span; with a single occurrence the block sits
 * at open. This is a placement heuristic — the engine still picks who works it.
 */
function spreadBlocks(open: TimeInterval[], count: number, blockMinutes: number): TimeInterval[] {
  const merged = mergeIntervals(open);
  if (count <= 0 || merged.length === 0) return [];
  const openStart = Math.min(...merged.map((iv) => iv.start));
  const openEnd = Math.max(...merged.map((iv) => iv.end));
  const span = openEnd - openStart;
  if (span <= 0) return [];
  const block = Math.min(blockMinutes, span);
  const latestStart = openEnd - block;
  const step = count > 1 ? (latestStart - openStart) / (count - 1) : 0;
  const blocks: TimeInterval[] = [];
  for (let i = 0; i < count; i++) {
    const start = Math.round(openStart + i * step);
    const clamped = Math.max(openStart, Math.min(start, latestStart));
    blocks.push({ start: clamped, end: clamped + block });
  }
  return blocks;
}

/**
 * Distribute `count` weekly occurrences across `dayCount` open days, returning
 * the per-day occurrence counts. Even when the count fits; round-robin (some
 * days carry an extra) when it exceeds the number of open days.
 */
function distributeAcrossDays(count: number, dayCount: number): number[] {
  const per = new Array<number>(dayCount).fill(0);
  if (dayCount <= 0 || count <= 0) return per;
  for (let i = 0; i < count; i++) per[Math.floor((i * dayCount) / count)] += 1;
  return per;
}

export function buildCoverageRequirements(input: CoverageGenerationInput): CoverageGenerationResult {
  const blockDefault = input.defaultBlockMinutes ?? DEFAULT_BLOCK_MINUTES;
  const hoursByLocation = new Map(input.operatingHours.map((h) => [h.locationId, h]));
  const requirements: CoverageRequirement[] = [];
  const skippedSet = new Set<string>();

  const openFor = (locationId: string, date: ISODate): TimeInterval[] =>
    openIntervalsForDate(hoursByLocation.get(locationId), date);

  const push = (
    date: ISODate,
    locationId: string,
    positionId: string,
    window: TimeInterval,
    count: number,
    taskId?: string,
  ) => {
    if (window.end <= window.start || count <= 0) return;
    requirements.push({
      id: `cov-${date}-${locationId}-${positionId}-${taskId ?? "post"}-${window.start}`,
      date,
      positionId,
      locationId,
      start: window.start,
      end: window.end,
      count,
      taskIds: taskId ? [taskId] : undefined,
    });
  };

  // Active positions available to host work at each schedule type, primary first.
  const activePositions = input.positions.filter((p) => p.active);
  const positionsByLocation = new Map<string, Position[]>();
  for (const pos of activePositions) {
    for (const loc of scheduleTypeIdsForPosition(pos)) {
      const list = positionsByLocation.get(loc) ?? [];
      list.push(pos);
      positionsByLocation.set(loc, list);
    }
  }
  for (const list of positionsByLocation.values()) list.sort((a, b) => a.order - b.order);
  const scheduleTypesWithPositions = [...positionsByLocation.keys()];

  // --- Normalize positions and tasks into demand sources ---
  const sources: DemandSource[] = [];

  for (const pos of activePositions) {
    if (!pos.frequency) continue;
    for (const locationId of scheduleTypeIdsForPosition(pos)) {
      sources.push({
        locationId,
        positionId: pos.id,
        count: staffingFor(pos),
        blockMinutes: pos.minAssignmentMinutes || blockDefault,
        freq: pos.frequency,
        label: pos.name,
      });
    }
  }

  for (const task of input.tasks) {
    if (!task.active || !task.frequency) continue;
    // Schedule types the task runs on (empty list = every type that has a post).
    const locations = task.applicableLocationIds.length > 0
      ? task.applicableLocationIds
      : scheduleTypesWithPositions;
    let placed = false;
    for (const locationId of locations) {
      const candidates = positionsByLocation.get(locationId) ?? [];
      // An explicit position list narrows the eligible hosts; otherwise the
      // schedule type's primary position hosts the task automatically.
      const host = task.applicablePositionIds.length > 0
        ? candidates.find((p) => task.applicablePositionIds.includes(p.id))
        : candidates[0];
      if (!host) continue;
      placed = true;
      sources.push({
        locationId,
        positionId: host.id,
        count: Math.max(1, task.minAssignees || 1),
        blockMinutes: task.estimatedMinutes || blockDefault,
        taskId: task.id,
        freq: task.frequency,
        label: task.name,
      });
    }
    if (!placed) {
      skippedSet.add(`${task.name}: no active position at its schedule type(s) to host the task`);
    }
  }

  // --- Expand each demand source across the requested dates ---
  for (const src of sources) {
    if (src.freq.mode === "times_per_week") {
      expandWeekly(src);
    } else {
      for (const date of input.dates) expandDaily(src, date);
    }
  }

  function expandDaily(src: DemandSource, date: ISODate) {
    if (!appliesOnDate(src.freq, date)) return;
    const open = openFor(src.locationId, date);
    if (open.length === 0) return; // closed that day
    if (src.freq.mode === "per_operational_hour") {
      for (const iv of mergeIntervals(open)) push(date, src.locationId, src.positionId, iv, src.count, src.taskId);
      return;
    }
    // times_per_day
    for (const block of spreadBlocks(open, Math.max(0, Math.round(src.freq.count)), src.blockMinutes)) {
      push(date, src.locationId, src.positionId, block, src.count, src.taskId);
    }
  }

  function expandWeekly(src: DemandSource) {
    // Group the requested dates into weeks, then spread the weekly count across
    // each week's open, weekday-eligible days.
    const byWeek = new Map<string, ISODate[]>();
    for (const date of input.dates) {
      if (!appliesOnDate(src.freq, date)) continue;
      if (openFor(src.locationId, date).length === 0) continue;
      const key = mondayOf(date);
      const list = byWeek.get(key) ?? [];
      list.push(date);
      byWeek.set(key, list);
    }
    if (byWeek.size === 0) {
      skippedSet.add(`${src.label}: ${src.freq.count}×/week — no open days in range to place it`);
      return;
    }
    for (const days of byWeek.values()) {
      const perDay = distributeAcrossDays(Math.max(0, Math.round(src.freq.count)), days.length);
      days.forEach((date, i) => {
        for (const block of spreadBlocks(openFor(src.locationId, date), perDay[i]!, src.blockMinutes)) {
          push(date, src.locationId, src.positionId, block, src.count, src.taskId);
        }
      });
    }
  }

  return { requirements, skipped: [...skippedSet] };
}
