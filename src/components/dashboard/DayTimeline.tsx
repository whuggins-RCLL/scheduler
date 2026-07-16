"use client";

import { formatTime12 } from "@/domain/time";
import { positionColorVar, timeRange } from "@/lib/ui";
import {
  GRID_DAY_END,
  GRID_DAY_START,
  GRID_SLOT_MINUTES,
  packLanes,
} from "@/lib/schedule-view";
import type { Position, Shift } from "@/domain/types";

const ROW_HEIGHT = 22; // px per half-hour slot

export function DayTimeline({
  shifts,
  empName,
  pos,
  onSelect,
  emptyLabel = "No shifts scheduled.",
}: {
  shifts: Shift[];
  empName: (id: string | null) => string;
  pos: (id: string) => Pick<Position, "name" | "shortLabel" | "colorToken"> | undefined;
  onSelect?: (shift: Shift) => void;
  emptyLabel?: string;
}) {
  const active = shifts.filter((s) => s.status !== "cancelled");

  // Expand the visible window if any shift falls outside the default day.
  const starts = active.map((s) => s.start);
  const ends = active.map((s) => s.end);
  const gridStart = Math.min(GRID_DAY_START, ...(starts.length ? [Math.floor(Math.min(...starts) / 60) * 60] : []));
  const gridEnd = Math.max(GRID_DAY_END, ...(ends.length ? [Math.ceil(Math.max(...ends) / 60) * 60] : []));
  const totalSlots = (gridEnd - gridStart) / GRID_SLOT_MINUTES;
  const height = totalSlots * ROW_HEIGHT;

  const hours: number[] = [];
  for (let h = gridStart; h <= gridEnd; h += 60) hours.push(h);

  const placements = packLanes(active, (s) => s.start, (s) => s.end);
  const yOf = (minute: number) => ((minute - gridStart) / GRID_SLOT_MINUTES) * ROW_HEIGHT;

  return (
    <div className="day-tl">
      <div className="day-tl-rail" style={{ height }} aria-hidden>
        {hours.map((h) => (
          <div key={h} className="day-tl-hour" style={{ top: yOf(h) }}>
            {formatTime12(h)}
          </div>
        ))}
      </div>
      <div className="day-tl-lanes" style={{ height }}>
        {hours.map((h) => (
          <div key={h} className="day-tl-line" style={{ top: yOf(h) }} aria-hidden />
        ))}
        {active.length === 0 && <div className="day-tl-empty muted">{emptyLabel}</div>}
        {placements.map(({ item: s, start, end, lane, lanes }) => {
          const p = pos(s.positionId);
          const top = yOf(start);
          const blockHeight = Math.max(ROW_HEIGHT - 2, yOf(end) - top - 2);
          const label = `${empName(s.employeeId)}, ${p?.name ?? "Position"}, ${timeRange(s.start, s.end)}`;
          const style = {
            top,
            height: blockHeight,
            left: `calc(${(lane / lanes) * 100}% + 2px)`,
            width: `calc(${100 / lanes}% - 4px)`,
            ["--pos" as string]: positionColorVar(p?.colorToken ?? ""),
          };
          const className = `tl-block${!s.employeeId ? " is-open" : ""}${s.status === "draft" ? " is-draft" : ""}`;
          return onSelect ? (
            <button key={s.id} className={className} style={style} onClick={() => onSelect(s)} aria-label={`${label}. Edit.`}>
              <TlBlockContent shift={s} name={empName(s.employeeId)} posName={p?.shortLabel ?? p?.name} />
            </button>
          ) : (
            <div key={s.id} className={className} style={style} role="group" aria-label={label}>
              <TlBlockContent shift={s} name={empName(s.employeeId)} posName={p?.shortLabel ?? p?.name} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TlBlockContent({ shift, name, posName }: { shift: Shift; name: string; posName?: string }) {
  return (
    <>
      <span className="tl-time">{timeRange(shift.start, shift.end)}</span>
      <span className="tl-name">{name}</span>
      {posName && <span className="tl-pos">{posName}</span>}
    </>
  );
}
