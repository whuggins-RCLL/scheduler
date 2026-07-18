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
 *   - `times_per_week`: a weekly total, not a per-day count — deferred here (the
 *     weekly distributor is future work) and reported in `skipped`.
 *
 * Pure and deterministic: identical inputs produce identical requirements, and
 * requirement ids are derived from their contents so re-running is stable.
 */
import type {
  ISODate,
  OperatingHours,
  Position,
  Task,
  TimeInterval,
} from "./types";
import type { CoverageRequirement } from "./scheduling";
import { appliesOnDate, occurrencesOnDate } from "./frequency";
import { deskOpenIntervalsForDate } from "./desk-coverage";
import { mergeIntervals } from "./time";

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
 * Expand position and task cadences into dated coverage requirements the
 * scheduling engine can fill.
 */
export function buildCoverageRequirements(input: CoverageGenerationInput): CoverageGenerationResult {
  const blockDefault = input.defaultBlockMinutes ?? DEFAULT_BLOCK_MINUTES;
  const hoursByLocation = new Map(input.operatingHours.map((h) => [h.locationId, h]));
  const positionById = new Map(input.positions.map((p) => [p.id, p]));
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

  const expand = (
    date: ISODate,
    locationId: string,
    positionId: string,
    freq: Position["frequency"],
    count: number,
    blockMinutes: number,
    taskId: string | undefined,
    label: string,
  ) => {
    const open = openFor(locationId, date);
    if (open.length === 0) return; // closed that day
    switch (freq!.mode) {
      case "per_operational_hour":
        for (const iv of mergeIntervals(open)) push(date, locationId, positionId, iv, count, taskId);
        break;
      case "times_per_day": {
        const occ = occurrencesOnDate(freq, date, totalMinutes(open) / 60);
        for (const block of spreadBlocks(open, occ, blockMinutes)) {
          push(date, locationId, positionId, block, count, taskId);
        }
        break;
      }
      case "times_per_week":
        skippedSet.add(`${label}: ${freq!.count}×/week not yet distributed across the week`);
        break;
    }
  };

  for (const date of input.dates) {
    // Position coverage — staff a post per its cadence.
    for (const pos of input.positions) {
      if (!pos.active || !pos.frequency || !appliesOnDate(pos.frequency, date)) continue;
      const count = staffingFor(pos);
      for (const locationId of scheduleTypeIdsForPosition(pos)) {
        expand(date, locationId, pos.id, pos.frequency, count, pos.minAssignmentMinutes || blockDefault, undefined, pos.name);
      }
    }

    // Task demand — parallel work performed at a resolved position.
    for (const task of input.tasks) {
      if (!task.active || !task.frequency || !appliesOnDate(task.frequency, date)) continue;
      const position = task.applicablePositionIds
        .map((id) => positionById.get(id))
        .find((p): p is Position => Boolean(p && p.active));
      if (!position) {
        skippedSet.add(`${task.name}: no active position linked, cannot place task coverage`);
        continue;
      }
      const positionLocations = scheduleTypeIdsForPosition(position);
      const locations = task.applicableLocationIds.length > 0
        ? positionLocations.filter((l) => task.applicableLocationIds.includes(l))
        : positionLocations;
      const count = Math.max(1, task.minAssignees || 1);
      const block = task.estimatedMinutes || blockDefault;
      for (const locationId of locations) {
        expand(date, locationId, position.id, task.frequency, count, block, task.id, task.name);
      }
    }
  }

  return { requirements, skipped: [...skippedSet] };
}
