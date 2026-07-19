"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { formatTime } from "@/domain/time";
import { GRID_SLOTS } from "@/lib/schedule-view";
import { deskSlotUncovered, entriesForCell } from "@/lib/schedule-grid";
import {
  COLOR_SCHEME_LABELS,
  type ScheduleGridColorScheme,
  type ScheduleGridColumn,
  type ScheduleGridPreferences,
  loadGridPreferences,
  saveGridPreferences,
  visibleColumns,
} from "@/lib/schedule-grid-preferences";
import { positionsForScheduleType, tasksMappedToScheduleType } from "@/lib/schedule-type-links";
import { taskColorVar, timeRange } from "@/lib/ui";
import type { Shift } from "@/domain/types";
import { ShiftDialog } from "@/components/schedule/ShiftDialog";

export interface CombinedTaskScheduleGridProps {
  date: string;
  shifts: Shift[];
  deskLocationId?: string;
  deskPositionId?: string;
  deskLabel?: string;
  /**
   * When set, the grid shows only the columns that belong to this schedule
   * type: its assigned tasks (via `applicableLocationIds`) plus a desk-coverage
   * column when the type has desk positions. Break columns are shown only in
   * the unscoped ("all schedule types") view. Omit to show every active task.
   */
  scheduleTypeId?: string;
  onSelectShift?: (shift: Shift) => void;
  embedded?: boolean;
}

export function CombinedTaskScheduleGrid({
  date,
  shifts,
  deskLocationId = "loc-desk",
  deskPositionId,
  deskLabel = "Borrowing Desk",
  scheduleTypeId,
  onSelectShift,
  embedded = false,
}: CombinedTaskScheduleGridProps) {
  const { db, currentUser } = useStore();
  const manager = canManage(currentUser);
  const [prefs, setPrefs] = useState<ScheduleGridPreferences | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [editing, setEditing] = useState<Shift | null>(null);

  const deskPos = useMemo(() => {
    if (deskPositionId) return deskPositionId;
    return db.positions.find((p) => p.locationId === deskLocationId)?.id
      ?? db.positions.find((p) => /desk/i.test(p.name))?.id;
  }, [db.positions, deskLocationId, deskPositionId]);

  // Columns are scoped to the schedule type when one is given: ONLY the tasks
  // explicitly mapped to it (a task with no mapping is not shown here — it must
  // be mapped to a schedule type to appear), a desk-coverage column when it has
  // desk positions, and no break columns (breaks live on their own type).
  const scopedTasks = useMemo(
    () => (scheduleTypeId ? tasksMappedToScheduleType(db.tasks, scheduleTypeId) : db.tasks),
    [db.tasks, scheduleTypeId],
  );
  const columnOpts = useMemo(() => {
    if (!scheduleTypeId) return {};
    // Show the desk-coverage column only when this schedule type has a desk
    // position assigned; otherwise coverage is represented by task columns.
    const includeDeskColumn = Boolean(
      deskPos && positionsForScheduleType(db.positions, scheduleTypeId).some((p) => p.id === deskPos),
    );
    return { includeDeskColumn, includeBreakColumns: false };
  }, [db.positions, scheduleTypeId, deskPos]);
  const scopeKey = scheduleTypeId || "all";

  useEffect(() => {
    setPrefs(loadGridPreferences(scopedTasks, deskLabel, columnOpts, scopeKey));
  }, [scopedTasks, deskLabel, columnOpts, scopeKey]);

  const persist = useCallback((next: ScheduleGridPreferences) => {
    setPrefs(next);
    saveGridPreferences(next, scopeKey);
  }, [scopeKey]);

  const dayShifts = useMemo(
    () => shifts.filter((s) => s.date === date && s.status !== "cancelled"),
    [shifts, date],
  );

  const coverage = useMemo(() => db.coverage, [db.coverage]);

  const empName = useCallback(
    (id: string | null) => (id ? db.employees.find((e) => e.id === id)?.preferredName ?? db.employees.find((e) => e.id === id)?.legalName ?? "Unknown" : "Open"),
    [db.employees],
  );
  const posName = useCallback((id: string) => db.positions.find((p) => p.id === id)?.shortLabel, [db.positions]);

  const cols = prefs ? visibleColumns(prefs) : [];

  const handleCellClick = (shift: Shift) => {
    if (onSelectShift) {
      onSelectShift(shift);
      return;
    }
    if (manager) setEditing(shift);
  };

  if (!prefs) return null;

  return (
    <div className={`combined-sched-grid-wrap${embedded ? " is-embedded" : ""}`}>
      <div className="spread" style={{ flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.65rem" }}>
        <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
          <span className="chip" style={{ background: "color-mix(in srgb, var(--position-desk) 14%, var(--surface))", borderColor: "var(--position-desk)" }}>
            Desk coverage
          </span>
          <span className="chip" style={{ background: "color-mix(in srgb, var(--task-collections) 14%, var(--surface))", borderColor: "var(--task-collections)" }}>
            Tasks
          </span>
          <span className="chip" style={{ background: "color-mix(in srgb, var(--task-rest) 14%, var(--surface))", borderColor: "var(--task-rest)" }}>
            Breaks
          </span>
        </div>
        {manager && (
          <button
            type="button"
            className="button sm"
            aria-expanded={customizeOpen}
            onClick={() => setCustomizeOpen((o) => !o)}
          >
            {customizeOpen ? "Done customizing" : "Customize view"}
          </button>
        )}
      </div>

      {customizeOpen && manager && (
        <ScheduleGridCustomizer prefs={prefs} onChange={persist} onClose={() => setCustomizeOpen(false)} />
      )}

      <div
        className={`sched combined-sched${prefs.compactCells ? " is-compact" : ""}`}
        data-color-scheme={prefs.colorScheme}
        role="region"
        aria-label={`Combined task schedule for ${date}`}
      >
        <div
          className="sched-grid combined-sched-grid"
          style={{ gridTemplateColumns: `72px repeat(${cols.length}, minmax(110px, 1fr))` }}
          role="grid"
        >
          <div className="sched-colhead combined-sched-corner" role="columnheader">Time</div>
          {cols.map((col) => (
            <div
              key={col.id}
              className="sched-colhead combined-sched-colhead"
              role="columnheader"
              style={{ ["--col" as string]: taskColorVar(col.colorToken) }}
            >
              <span className="combined-sched-col-dot" aria-hidden />
              {col.label}
            </div>
          ))}

          {GRID_SLOTS.map((slot) => {
            const onHour = slot % 60 === 0;
            const halfLine = prefs.showHalfHourLines && !onHour;
            return (
              <div key={slot} style={{ display: "contents" }} role="row">
                <div
                  className={`sched-timecol combined-sched-time${onHour ? " is-hour" : " is-half"}${halfLine ? " half-line" : ""}`}
                  role="rowheader"
                >
                  {onHour || !prefs.compactCells ? formatTime(slot) : ""}
                </div>
                {cols.map((col) => {
                  const entries = entriesForCell(dayShifts, col, slot, {
                    deskPositionId: deskPos,
                    deskLocationId,
                    empName,
                    posName,
                  });
                  const uncovered =
                    col.kind === "desk" && deskSlotUncovered(dayShifts, slot, coverage, date, deskPos);
                  return (
                    <div
                      key={`${slot}-${col.id}`}
                      className={`sched-cell combined-sched-cell${halfLine ? " half-line" : ""}${uncovered ? " is-gap" : ""}${entries.length ? " has-entries" : ""}`}
                      role="gridcell"
                      style={{ ["--col" as string]: taskColorVar(col.colorToken) }}
                    >
                      {entries.map((e) => (
                        <button
                          key={`${e.shift.id}-${e.breakKind ?? "work"}`}
                          type="button"
                          className={`combined-sched-entry${!e.shift.employeeId ? " is-open" : ""}${e.shift.status === "draft" ? " is-draft" : ""}${e.breakKind ? ` is-${e.breakKind}` : ""}`}
                          style={{ ["--col" as string]: taskColorVar(col.colorToken) }}
                          onClick={() => handleCellClick(e.shift)}
                          disabled={!manager && !onSelectShift}
                          title={`${e.label} · ${timeRange(e.shift.start, e.shift.end)}`}
                          aria-label={`${e.label}, ${col.label}, ${timeRange(e.shift.start, e.shift.end)}`}
                        >
                          <span className="combined-sched-entry-name">{e.label}</span>
                          {e.sublabel && <span className="combined-sched-entry-sub">{e.sublabel}</span>}
                        </button>
                      ))}
                      {uncovered && entries.length === 0 && (
                        <span className="combined-sched-gap" aria-label="Coverage gap">Gap</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <ShiftDialog
          shift={editing}
          scheduleId={editing.scheduleId}
          date={editing.date}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ScheduleGridCustomizer({
  prefs,
  onChange,
  onClose,
}: {
  prefs: ScheduleGridPreferences;
  onChange: (p: ScheduleGridPreferences) => void;
  onClose: () => void;
}) {
  const sorted = [...prefs.columns].sort((a, b) => a.order - b.order);

  function toggleColumn(id: string) {
    onChange({
      ...prefs,
      columns: prefs.columns.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)),
    });
  }

  function moveColumn(id: string, dir: -1 | 1) {
    const list = [...sorted];
    const idx = list.findIndex((c) => c.id === id);
    const swap = idx + dir;
    if (swap < 0 || swap >= list.length) return;
    const next = list.map((c) => ({ ...c }));
    const a = next[idx]!;
    const b = next[swap]!;
    const tmp = a.order;
    a.order = b.order;
    b.order = tmp;
    onChange({ ...prefs, columns: next });
  }

  function setScheme(scheme: ScheduleGridColorScheme) {
    onChange({ ...prefs, colorScheme: scheme });
  }

  return (
    <div className="card combined-sched-customizer" style={{ marginBottom: "0.75rem", padding: "0.85rem 1rem" }}>
      <div className="spread" style={{ marginBottom: "0.65rem" }}>
        <h3 style={{ margin: 0, fontSize: "0.95rem" }}>Customize combined schedule</h3>
        <button type="button" className="button sm ghost" onClick={onClose}>Close</button>
      </div>

      <fieldset className="combined-sched-fieldset">
        <legend>Color scheme</legend>
        <div className="combined-sched-schemes" role="radiogroup" aria-label="Color scheme">
          {(Object.keys(COLOR_SCHEME_LABELS) as ScheduleGridColorScheme[]).map((scheme) => (
            <button
              key={scheme}
              type="button"
              role="radio"
              aria-checked={prefs.colorScheme === scheme}
              className={`combined-sched-scheme-btn${prefs.colorScheme === scheme ? " is-active" : ""}`}
              data-scheme={scheme}
              onClick={() => setScheme(scheme)}
            >
              {COLOR_SCHEME_LABELS[scheme]}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="combined-sched-fieldset">
        <legend>Columns (drag order with arrows)</legend>
        <ul className="list-reset combined-sched-col-list">
          {sorted.map((col, i) => (
            <li key={col.id} className="combined-sched-col-row">
              <label className="combined-sched-col-check">
                <input type="checkbox" checked={col.visible} onChange={() => toggleColumn(col.id)} />
                <span className="combined-sched-col-dot" style={{ ["--col" as string]: taskColorVar(col.colorToken) }} aria-hidden />
                {col.label}
              </label>
              <div className="row" style={{ gap: "0.2rem" }}>
                <button type="button" className="button sm ghost" disabled={i === 0} onClick={() => moveColumn(col.id, -1)} aria-label={`Move ${col.label} left`}>‹</button>
                <button type="button" className="button sm ghost" disabled={i === sorted.length - 1} onClick={() => moveColumn(col.id, 1)} aria-label={`Move ${col.label} right`}>›</button>
              </div>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="row" style={{ gap: "1rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
        <label className="combined-sched-col-check">
          <input
            type="checkbox"
            checked={prefs.showHalfHourLines}
            onChange={(e) => onChange({ ...prefs, showHalfHourLines: e.target.checked })}
          />
          Show half-hour guide lines
        </label>
        <label className="combined-sched-col-check">
          <input
            type="checkbox"
            checked={prefs.compactCells}
            onChange={(e) => onChange({ ...prefs, compactCells: e.target.checked })}
          />
          Compact rows
        </label>
        <button
          type="button"
          className="button sm"
          onClick={() => onChange({ ...prefs, columns: prefs.columns.map((c, i) => ({ ...c, visible: true, order: i })) })}
        >
          Reset columns
        </button>
      </div>
    </div>
  );
}
