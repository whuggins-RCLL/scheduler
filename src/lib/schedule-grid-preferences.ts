import type { Task } from "@/domain/types";

export type ScheduleGridColorScheme = "cardinal" | "aurora" | "slate" | "garden" | "sunset";

export type ScheduleGridColumnKind = "desk" | "task" | "rest" | "meal";

export interface ScheduleGridColumn {
  id: string;
  kind: ScheduleGridColumnKind;
  taskId?: string;
  label: string;
  colorToken: string;
  visible: boolean;
  order: number;
}

export interface ScheduleGridPreferences {
  colorScheme: ScheduleGridColorScheme;
  columns: ScheduleGridColumn[];
  showHalfHourLines: boolean;
  compactCells: boolean;
}

export const DESK_COLUMN_ID = "col-desk";
export const REST_COLUMN_ID = "col-rest";
export const MEAL_COLUMN_ID = "col-meal";

const STORAGE_KEY = "rcll-schedule-grid-prefs";

export const COLOR_SCHEME_LABELS: Record<ScheduleGridColorScheme, string> = {
  cardinal: "Cardinal Classic",
  aurora: "Aurora",
  slate: "Slate Pro",
  garden: "Palo Alto Garden",
  sunset: "Sunset Operations",
};

/** Build default columns: desk first, then active tasks, then breaks & lunch. */
export function defaultGridColumns(tasks: Task[], deskLabel = "Borrowing Desk"): ScheduleGridColumn[] {
  const sorted = [...tasks].filter((t) => t.active).sort((a, b) => a.order - b.order);
  const cols: ScheduleGridColumn[] = [
    {
      id: DESK_COLUMN_ID,
      kind: "desk",
      label: deskLabel,
      colorToken: "position-desk",
      visible: true,
      order: 0,
    },
  ];
  sorted.forEach((t, i) => {
    cols.push({
      id: `col-task-${t.id}`,
      kind: "task",
      taskId: t.id,
      label: t.name,
      colorToken: t.colorToken || categoryTaskColor(t.category),
      visible: true,
      order: i + 1,
    });
  });
  cols.push(
    {
      id: REST_COLUMN_ID,
      kind: "rest",
      label: "Rest breaks",
      colorToken: "task-rest",
      visible: true,
      order: cols.length,
    },
    {
      id: MEAL_COLUMN_ID,
      kind: "meal",
      label: "Lunch / meal",
      colorToken: "task-meal",
      visible: true,
      order: cols.length + 1,
    },
  );
  return cols;
}

function categoryTaskColor(category: string): string {
  const c = category.toLowerCase();
  if (c.includes("collection")) return "task-collections";
  if (c.includes("facilit")) return "task-facilities";
  if (c.includes("operat")) return "task-operations";
  return "task-neutral";
}

export function defaultGridPreferences(tasks: Task[], deskLabel?: string): ScheduleGridPreferences {
  return {
    colorScheme: "cardinal",
    columns: defaultGridColumns(tasks, deskLabel),
    showHalfHourLines: true,
    compactCells: false,
  };
}

/** Merge saved columns with current tasks (add new tasks, drop removed). */
export function mergeGridColumns(saved: ScheduleGridColumn[], tasks: Task[], deskLabel?: string): ScheduleGridColumn[] {
  const fresh = defaultGridColumns(tasks, deskLabel);
  const byId = new Map(saved.map((c) => [c.id, c]));
  return fresh.map((col) => {
    const prev = byId.get(col.id);
    if (!prev) return col;
    return {
      ...col,
      visible: prev.visible,
      order: prev.order,
      label: col.kind === "task" ? col.label : prev.label,
    };
  }).sort((a, b) => a.order - b.order);
}

export function loadGridPreferences(tasks: Task[], deskLabel?: string): ScheduleGridPreferences {
  if (typeof window === "undefined") return defaultGridPreferences(tasks, deskLabel);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultGridPreferences(tasks, deskLabel);
    const parsed = JSON.parse(raw) as Partial<ScheduleGridPreferences>;
    const colorScheme = parsed.colorScheme ?? "cardinal";
    const columns = mergeGridColumns(parsed.columns ?? [], tasks, deskLabel);
    return {
      colorScheme,
      columns,
      showHalfHourLines: parsed.showHalfHourLines ?? true,
      compactCells: parsed.compactCells ?? false,
    };
  } catch {
    return defaultGridPreferences(tasks, deskLabel);
  }
}

export function saveGridPreferences(prefs: ScheduleGridPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch { /* ignore quota */ }
}

export function visibleColumns(prefs: ScheduleGridPreferences): ScheduleGridColumn[] {
  return [...prefs.columns].filter((c) => c.visible).sort((a, b) => a.order - b.order);
}
