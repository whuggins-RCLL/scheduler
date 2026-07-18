/**
 * Summarize the flat, per-day coverage requirements that generation will fill
 * into a compact, manager-readable preview. Requirements that recur across the
 * range (same schedule type, host, window, and headcount) collapse into a
 * single row with a day count, so a week of desk coverage reads as one line.
 */
import type { CoverageRequirement } from "@/domain/scheduling";

export interface CoverageSummaryRow {
  key: string;
  locationId: string;
  locationLabel: string;
  label: string; // task name, or the position/post name
  kind: "task" | "position";
  start: number;
  end: number;
  count: number; // people needed per window
  days: number; // distinct dates this window recurs on
}

export interface CoverageSummary {
  rows: CoverageSummaryRow[];
  totalWindows: number; // total dated requirement records
  totalSlots: number; // sum of headcount across all dated records
}

export interface CoverageNameResolvers {
  locationLabel: (id: string) => string;
  positionLabel: (id: string) => string;
  taskLabel: (id: string) => string;
}

export function summarizeCoverage(
  requirements: CoverageRequirement[],
  names: CoverageNameResolvers,
): CoverageSummary {
  const groups = new Map<string, Omit<CoverageSummaryRow, "days"> & { dates: Set<string> }>();
  let totalSlots = 0;

  for (const req of requirements) {
    totalSlots += req.count;
    const taskId = req.taskIds && req.taskIds.length > 0 ? req.taskIds[0]! : undefined;
    const key = `${req.locationId}|${req.positionId}|${taskId ?? ""}|${req.start}|${req.end}|${req.count}`;
    const existing = groups.get(key);
    if (existing) {
      existing.dates.add(req.date);
      continue;
    }
    groups.set(key, {
      key,
      locationId: req.locationId,
      locationLabel: names.locationLabel(req.locationId),
      label: taskId ? names.taskLabel(taskId) : names.positionLabel(req.positionId),
      kind: taskId ? "task" : "position",
      start: req.start,
      end: req.end,
      count: req.count,
      dates: new Set([req.date]),
    });
  }

  const rows = [...groups.values()]
    .map(({ dates, ...row }) => ({ ...row, days: dates.size }))
    .sort((a, b) =>
      a.locationLabel.localeCompare(b.locationLabel)
      || a.start - b.start
      || a.label.localeCompare(b.label),
    );

  return { rows, totalWindows: requirements.length, totalSlots };
}
