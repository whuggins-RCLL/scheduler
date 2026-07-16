import type { Break, Shift } from "@/domain/types";
import { GRID_SLOT_MINUTES } from "@/lib/schedule-view";
import {
  DESK_COLUMN_ID,
  MEAL_COLUMN_ID,
  REST_COLUMN_ID,
  type ScheduleGridColumn,
} from "@/lib/schedule-grid-preferences";

/** True when `[start, end)` overlaps the half-hour slot starting at `slot`. */
export function slotOverlaps(start: number, end: number, slot: number, slotMinutes = GRID_SLOT_MINUTES): boolean {
  return start < slot + slotMinutes && end > slot;
}

export interface GridCellEntry {
  shift: Shift;
  breakKind?: Break["kind"];
  label: string;
  sublabel?: string;
}

function isDeskShift(shift: Shift, deskPositionId?: string, deskLocationId?: string): boolean {
  if (deskPositionId && shift.positionId === deskPositionId) return true;
  if (deskLocationId && shift.locationId === deskLocationId) return true;
  return false;
}

function breakAtSlot(shift: Shift, slot: number, kind: Break["kind"]): Break | undefined {
  return shift.breaks.find((b) => b.kind === kind && slotOverlaps(b.start, b.end, slot));
}

/**
 * Shifts and break markers that belong in a grid column for one time slot.
 * Desk column shows desk-position coverage; task columns match `taskIds`;
 * rest/meal columns show people on that break during an overlapping shift.
 */
export function entriesForCell(
  shifts: Shift[],
  column: ScheduleGridColumn,
  slot: number,
  opts: {
    deskPositionId?: string;
    deskLocationId?: string;
    empName: (id: string | null) => string;
    posName: (id: string) => string | undefined;
  },
): GridCellEntry[] {
  const dayShifts = shifts.filter((s) => slotOverlaps(s.start, s.end, slot));
  const out: GridCellEntry[] = [];

  if (column.kind === "desk" || column.id === DESK_COLUMN_ID) {
    for (const s of dayShifts) {
      if (!isDeskShift(s, opts.deskPositionId, opts.deskLocationId)) continue;
      const onBreak = s.breaks.some((b) => slotOverlaps(b.start, b.end, slot));
      if (onBreak) continue;
      out.push({
        shift: s,
        label: opts.empName(s.employeeId),
        sublabel: opts.posName(s.positionId),
      });
    }
    return out;
  }

  if (column.kind === "task" && column.taskId) {
    for (const s of dayShifts) {
      if (!s.taskIds.includes(column.taskId)) continue;
      out.push({
        shift: s,
        label: opts.empName(s.employeeId),
        sublabel: opts.posName(s.positionId),
      });
    }
    return out;
  }

  if (column.kind === "rest" || column.id === REST_COLUMN_ID) {
    for (const s of dayShifts) {
      const br = breakAtSlot(s, slot, "rest");
      if (!br) continue;
      out.push({
        shift: s,
        breakKind: "rest",
        label: opts.empName(s.employeeId),
        sublabel: "Rest break",
      });
    }
    return out;
  }

  if (column.kind === "meal" || column.id === MEAL_COLUMN_ID) {
    for (const s of dayShifts) {
      const br = breakAtSlot(s, slot, "meal");
      if (!br) continue;
      out.push({
        shift: s,
        breakKind: "meal",
        label: opts.empName(s.employeeId),
        sublabel: br.paid ? "Paid meal" : "Unpaid lunch",
      });
    }
    return out;
  }

  return out;
}

/** Coverage gap: desk column with no staffed person during a required window. */
export function deskSlotUncovered(
  shifts: Shift[],
  slot: number,
  coverage: { date: string; positionId: string; start: number; end: number; count: number }[],
  date: string,
  deskPositionId?: string,
): boolean {
  const reqs = coverage.filter(
    (c) => c.date === date && slotOverlaps(c.start, c.end, slot) && (!deskPositionId || c.positionId === deskPositionId),
  );
  if (reqs.length === 0) return false;
  const staffed = shifts.filter(
    (s) =>
      s.date === date &&
      slotOverlaps(s.start, s.end, slot) &&
      s.employeeId &&
      (!deskPositionId || s.positionId === deskPositionId) &&
      !s.breaks.some((b) => slotOverlaps(b.start, b.end, slot)),
  ).length;
  const needed = Math.max(...reqs.map((r) => r.count));
  return staffed < needed;
}
