/**
 * Consolidate one person's day into a single time-ordered timeline: every
 * assignment across every schedule type, plus each break, as its own entry.
 * So a desk shift, a stacks shift, and a lunch break all list together in order.
 */
import type { Shift } from "@/domain/types";

export interface MyScheduleEntry {
  key: string;
  start: number;
  end: number;
  kind: "work" | "break";
  typeName: string;
  colorVar: string;
  title: string;
  tasks: string[];
}

export interface MyScheduleResolvers {
  scheduleTypeName: (locationId: string) => string;
  positionName: (positionId: string) => string | undefined;
  taskName: (taskId: string) => string;
  colorVar: (locationId: string) => string;
}

export function consolidateMyDay(shifts: Shift[], r: MyScheduleResolvers): MyScheduleEntry[] {
  const out: MyScheduleEntry[] = [];
  for (const s of shifts) {
    const tasks = s.taskIds.map(r.taskName);
    const posName = r.positionName(s.positionId);
    out.push({
      key: s.id,
      start: s.start,
      end: s.end,
      kind: "work",
      typeName: r.scheduleTypeName(s.locationId),
      colorVar: r.colorVar(s.locationId),
      title: posName ?? tasks[0] ?? "Shift",
      tasks: posName ? tasks : tasks.slice(1),
    });
    for (const b of s.breaks) {
      out.push({
        key: `${s.id}-${b.kind}-${b.start}`,
        start: b.start,
        end: b.end,
        kind: "break",
        typeName: b.kind === "meal" ? (b.paid ? "Paid meal" : "Lunch / meal") : "Rest break",
        colorVar: b.kind === "meal" ? "var(--task-meal)" : "var(--task-rest)",
        title: b.kind === "meal" ? (b.paid ? "Paid meal" : "Unpaid lunch") : "Rest break",
        tasks: [],
      });
    }
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}
