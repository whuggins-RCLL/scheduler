"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { formatTime12 } from "@/domain/time";
import { timeRange } from "@/lib/ui";
import {
  GRID_DAY_END,
  GRID_DAY_START,
  GRID_SLOT_MINUTES,
  packLanes,
  scheduleTypeColorVar,
} from "@/lib/schedule-view";
import { tasksMappedToScheduleType } from "@/lib/schedule-type-links";
import { slotOverlaps } from "@/lib/schedule-grid";
import type { Shift } from "@/domain/types";

const ROW_HEIGHT = 26; // px per half-hour slot

export interface ConcurrencyScheduleBoardProps {
  date: string;
  /** Shifts already filtered to this schedule type (and day-agnostic). */
  shifts: Shift[];
  /** Schedule type this board is scoped to; drives color + task scoping. */
  scheduleTypeId?: string;
  onSelectShift?: (shift: Shift) => void;
  emptyLabel?: string;
}

/**
 * A day board that starts as a single column and only grows extra columns where
 * shifts actually overlap in time. Non-overlapping shifts render full width;
 * whenever two or more are scheduled in the same window they split into
 * side-by-side lanes (column 2, 3, …) for just that window. Column count is
 * therefore driven by real concurrency, not by a fixed slot per task.
 */
export function ConcurrencyScheduleBoard({
  date,
  shifts,
  scheduleTypeId,
  onSelectShift,
  emptyLabel = "No shifts scheduled.",
}: ConcurrencyScheduleBoardProps) {
  const { db, currentUser } = useStore();
  const manager = canManage(currentUser);

  const activeLocations = useMemo(() => db.locations.filter((l) => l.active), [db.locations]);
  const colorVar = scheduleTypeId
    ? scheduleTypeColorVar(scheduleTypeId, activeLocations)
    : "var(--cardinal)";

  // Tasks that count as "belonging" to this board — used to label each block.
  const mappedTaskNames = useMemo(() => {
    const source = scheduleTypeId ? tasksMappedToScheduleType(db.tasks, scheduleTypeId) : db.tasks;
    return new Map(source.map((t) => [t.id, t.name] as const));
  }, [db.tasks, scheduleTypeId]);

  const empName = (id: string | null) =>
    id
      ? db.employees.find((e) => e.id === id)?.preferredName ??
        db.employees.find((e) => e.id === id)?.legalName ??
        "Unknown"
      : "Open shift";
  const posLabel = (id: string) => db.positions.find((p) => p.id === id)?.shortLabel;

  const day = useMemo(
    () => shifts.filter((s) => s.date === date && s.status !== "cancelled"),
    [shifts, date],
  );

  // Expand the visible window if any shift falls outside the default day.
  const starts = day.map((s) => s.start);
  const ends = day.map((s) => s.end);
  const gridStart = Math.min(GRID_DAY_START, ...(starts.length ? [Math.floor(Math.min(...starts) / 60) * 60] : []));
  const gridEnd = Math.max(GRID_DAY_END, ...(ends.length ? [Math.ceil(Math.max(...ends) / 60) * 60] : []));
  const height = ((gridEnd - gridStart) / GRID_SLOT_MINUTES) * ROW_HEIGHT;
  const yOf = (minute: number) => ((minute - gridStart) / GRID_SLOT_MINUTES) * ROW_HEIGHT;

  const hours: number[] = [];
  for (let h = gridStart; h <= gridEnd; h += 60) hours.push(h);

  const placements = useMemo(() => packLanes(day, (s) => s.start, (s) => s.end), [day]);
  const maxLanes = placements.reduce((m, p) => Math.max(m, p.lanes), day.length ? 1 : 0);

  // Coverage gaps for this schedule type: any hour where required coverage for
  // one of its positions is not met by a staffed (non-break) person.
  const gapBands = useMemo(() => {
    if (!scheduleTypeId) return [];
    const bands: { top: number; height: number }[] = [];
    for (let slot = gridStart; slot < gridEnd; slot += GRID_SLOT_MINUTES) {
      const reqs = db.coverage.filter((c) => c.date === date && slotOverlaps(c.start, c.end, slot));
      if (reqs.length === 0) continue;
      const short = reqs.some((r) => {
        const staffed = day.filter(
          (s) =>
            s.positionId === r.positionId &&
            s.employeeId &&
            slotOverlaps(s.start, s.end, slot) &&
            !s.breaks.some((b) => slotOverlaps(b.start, b.end, slot)),
        ).length;
        return staffed < r.count;
      });
      if (short) bands.push({ top: yOf(slot), height: ROW_HEIGHT });
    }
    return bands;
  }, [db.coverage, day, date, scheduleTypeId, gridStart, gridEnd]);

  return (
    <div className="cboard">
      <p className="cboard-hint muted">
        {maxLanes <= 1
          ? "One column — nothing overlaps this day."
          : `Up to ${maxLanes} columns where shifts overlap.`}
      </p>
      <div className="cboard-grid">
        <div className="cboard-rail" style={{ height }} aria-hidden>
          {hours.map((h) => (
            <div key={h} className="cboard-hour" style={{ top: yOf(h) }}>
              {formatTime12(h)}
            </div>
          ))}
        </div>
        <div className="cboard-lanes" style={{ height, ["--type" as string]: colorVar }}>
          {hours.map((h) => (
            <div key={h} className="cboard-line" style={{ top: yOf(h) }} aria-hidden />
          ))}
          {gapBands.map((g, i) => (
            <div
              key={`gap-${i}`}
              className="cboard-gap"
              style={{ top: g.top, height: g.height }}
              aria-hidden
            />
          ))}
          {day.length === 0 && <div className="cboard-empty muted">{emptyLabel}</div>}
          {placements.map(({ item: s, start, end, lane, lanes }) => {
            const top = yOf(start);
            const blockHeight = Math.max(ROW_HEIGHT - 2, yOf(end) - top - 2);
            const tasks = s.taskIds.map((id) => mappedTaskNames.get(id)).filter(Boolean) as string[];
            const position = posLabel(s.positionId);
            const name = empName(s.employeeId);
            const label = `${name}${position ? `, ${position}` : ""}, ${timeRange(s.start, s.end)}`;
            const style = {
              top,
              height: blockHeight,
              left: `calc(${(lane / lanes) * 100}% + 2px)`,
              width: `calc(${100 / lanes}% - 4px)`,
            };
            const className = `cboard-block${!s.employeeId ? " is-open" : ""}${s.status === "draft" ? " is-draft" : ""}`;
            const body = (
              <>
                <span className="cboard-time">{timeRange(s.start, s.end)}</span>
                <span className="cboard-name">{name}</span>
                {position && <span className="cboard-pos">{position}</span>}
                {tasks.length > 0 && (
                  <span className="cboard-tasks">{tasks.join(" · ")}</span>
                )}
              </>
            );
            return onSelectShift && manager ? (
              <button
                key={s.id}
                type="button"
                className={className}
                style={style}
                onClick={() => onSelectShift(s)}
                aria-label={`${label}. Edit.`}
              >
                {body}
              </button>
            ) : (
              <div key={s.id} className={className} style={style} role="group" aria-label={label}>
                {body}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
