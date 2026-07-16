import { WEEKDAY_LABELS, weekdayOf } from "@/domain/time";
import type { Severity, ShiftStatus } from "@/domain/types";
import { formatDisplayTimeRange } from "@/lib/time-format";

/** First token of a person's name for casual greetings and compact UI labels. */
export function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return trimmed;
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export function timeRange(start: number, end: number): string {
  return formatDisplayTimeRange(start, end);
}

export function humanDate(iso: string): string {
  const w = WEEKDAY_LABELS[weekdayOf(iso)];
  const [, m, d] = iso.split("-");
  return `${w} ${Number(m)}/${Number(d)}`;
}

/** Calendar date with year — used for exceptions and other year-sensitive ranges. */
export function humanDateWithYear(iso: string): string {
  const w = WEEKDAY_LABELS[weekdayOf(iso)];
  const [y, m, d] = iso.split("-");
  return `${w} ${Number(m)}/${Number(d)}/${y}`;
}

/** Format a start/end date range, including the year (once or on both ends). */
export function humanDateRange(start: string, end: string): string {
  if (end === start) return humanDateWithYear(start);
  const startY = start.slice(0, 4);
  const endY = end.slice(0, 4);
  const wStart = WEEKDAY_LABELS[weekdayOf(start)];
  const wEnd = WEEKDAY_LABELS[weekdayOf(end)];
  const [, sm, sd] = start.split("-");
  const [, em, ed] = end.split("-");
  if (startY === endY) {
    return `${wStart} ${Number(sm)}/${Number(sd)}–${wEnd} ${Number(em)}/${Number(ed)}, ${startY}`;
  }
  return `${wStart} ${Number(sm)}/${Number(sd)}/${startY}–${wEnd} ${Number(em)}/${Number(ed)}/${endY}`;
}

export function hoursLabel(minutes: number): string {
  return `${(minutes / 60).toFixed(minutes % 60 === 0 ? 0 : 1)} h`;
}

export const severityBadge: Record<Severity, { cls: string; label: string }> = {
  hard: { cls: "err", label: "Blocking" },
  overrideable: { cls: "warn", label: "Overrideable" },
  warning: { cls: "warn", label: "Warning" },
  info: { cls: "info", label: "Info" },
};

export const statusBadge: Record<ShiftStatus, { cls: string; label: string }> = {
  draft: { cls: "draft", label: "Draft" },
  proposed: { cls: "draft", label: "Proposed" },
  published: { cls: "ok", label: "Published" },
  acknowledged: { cls: "ok", label: "Acknowledged" },
  in_progress: { cls: "info", label: "In progress" },
  completed: { cls: "info", label: "Completed" },
  cancelled: { cls: "", label: "Cancelled" },
  open: { cls: "info", label: "Open" },
  swap_pending: { cls: "warn", label: "Swap pending" },
  coverage_needed: { cls: "err", label: "Coverage needed" },
};

/** Map a position color token to its CSS custom property value. */
export function positionColorVar(colorToken: string): string {
  return `var(--${colorToken}, var(--cardinal))`;
}

/** Map a task or grid-column color token to its CSS custom property value. */
export function taskColorVar(colorToken: string): string {
  return `var(--${colorToken}, var(--cardinal))`;
}
