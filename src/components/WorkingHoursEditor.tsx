"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { WEEKDAY_LABELS, formatTime } from "@/domain/time";
import type { WorkingHoursBlock, WorkingHoursPattern } from "@/domain/types";

const SLOT_MINUTES = 30;
const DAY_START = 8 * 60;
const DAY_END = 21 * 60;
const SLOTS = Array.from(
  { length: (DAY_END - DAY_START) / SLOT_MINUTES },
  (_, i) => DAY_START + i * SLOT_MINUTES,
);

type Cell = Record<string, boolean>; // key `${day}-${slotStartMinute}` -> working

function blocksToCells(blocks: WorkingHoursBlock[]): Cell {
  const cell: Cell = {};
  for (const b of blocks) {
    for (const s of SLOTS) {
      if (s >= b.start && s < b.end) cell[`${b.weekday}-${s}`] = true;
    }
  }
  return cell;
}

function cellsToBlocks(cell: Cell): WorkingHoursBlock[] {
  const blocks: WorkingHoursBlock[] = [];
  for (let day = 0; day < 7; day++) {
    let runStart: number | null = null;
    for (const s of SLOTS) {
      const working = cell[`${day}-${s}`] === true;
      if (runStart != null && !working) {
        blocks.push({ weekday: day, start: runStart, end: s });
        runStart = null;
      }
      if (working && runStart == null) runStart = s;
    }
    if (runStart != null) blocks.push({ weekday: day, start: runStart, end: DAY_END });
  }
  return blocks;
}

export function WorkingHoursEditor() {
  const { db, currentUser, saveWorkingHours } = useStore();
  const manager = canManage(currentUser);
  const activeUserIds = useMemo(
    () => new Set(db.users.filter((user) => user.state === "active").map((user) => user.id)),
    [db.users],
  );
  const activeEmployees = useMemo(
    () => db.employees.filter((employee) => employee.active && activeUserIds.has(employee.id)),
    [activeUserIds, db.employees],
  );
  const [targetEmployeeId, setTargetEmployeeId] = useState(currentUser.id);
  const targetEmployee = db.employees.find((e) => e.id === targetEmployeeId);
  const existing = useMemo(
    () => db.workingHours.find((p) => p.employeeId === targetEmployeeId),
    [db.workingHours, targetEmployeeId],
  );
  const [cells, setCells] = useState<Cell>(() => blocksToCells(existing?.blocks ?? []));
  const [note, setNote] = useState(existing?.note ?? "");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!manager) {
      if (targetEmployeeId !== currentUser.id) setTargetEmployeeId(currentUser.id);
      return;
    }
    if (!activeEmployees.some((employee) => employee.id === targetEmployeeId)) {
      const fallback = activeEmployees.find((employee) => employee.id === currentUser.id) ?? activeEmployees[0];
      if (fallback) setTargetEmployeeId(fallback.id);
    }
  }, [activeEmployees, currentUser.id, manager, targetEmployeeId]);

  useEffect(() => {
    setCells(blocksToCells(existing?.blocks ?? []));
    setNote(existing?.note ?? "");
    setSaved(false);
    setSaveError(null);
  }, [existing, targetEmployeeId]);

  function toggle(day: number, slot: number) {
    const key = `${day}-${slot}`;
    setSaved(false);
    setCells((c) => ({ ...c, [key]: !c[key] }));
  }

  function setColumn(day: number, working: boolean) {
    setSaved(false);
    setCells((c) => {
      const next = { ...c };
      for (const s of SLOTS) next[`${day}-${s}`] = working;
      return next;
    });
  }

  async function save() {
    const pattern: WorkingHoursPattern = {
      id: existing?.id ?? `workhours-${targetEmployeeId}`,
      employeeId: targetEmployeeId,
      label: existing?.label ?? "Current term",
      blocks: cellsToBlocks(cells),
      daysOff: existing?.daysOff ?? [],
      note,
      updatedBy: currentUser.id,
      updatedAt: new Date().toISOString(),
    };
    setSaving(true);
    setSaveError(null);
    try {
      await saveWorkingHours(pattern);
      setSaved(true);
    } catch (error) {
      setSaved(false);
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  const forSelf = targetEmployeeId === currentUser.id;

  return (
    <section className="card" aria-labelledby="working-hours-heading">
      <h2 id="working-hours-heading">
        {forSelf ? "My working hours" : `${targetEmployee?.preferredName ?? targetEmployee?.legalName ?? "Employee"} working hours`}
      </h2>
      <p className="muted" style={{ fontSize: "0.88rem" }}>
        When {forSelf ? "you're" : "they're"} generally on the clock for this job — separate from desk coverage.
        This helps break reminders and hour planning stay accurate.
      </p>

      {manager && (
        <div className="field" style={{ maxWidth: 420, marginBottom: "1rem" }}>
          <label htmlFor="working-hours-employee">Employee</label>
          <select
            id="working-hours-employee"
            value={targetEmployeeId}
            onChange={(e) => setTargetEmployeeId(e.target.value)}
          >
            {activeEmployees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.preferredName ?? employee.legalName}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="row" style={{ marginBottom: "0.75rem" }}>
        <span className="badge">Legend</span>
        <span className="chip" style={{ background: "color-mix(in srgb, var(--palo-alto) 22%, var(--surface))" }}>Working</span>
        <span className="chip">Off</span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <div className="avail-grid" role="grid" aria-label="Weekly working hours">
          <div className="avail-head" role="columnheader">Time</div>
          {WEEKDAY_LABELS.map((d, i) => (
            <div className="avail-head" role="columnheader" key={d}>
              {d}
              <div>
                <button
                  className="button sm ghost"
                  style={{ fontSize: "0.65rem", padding: "0 4px", minHeight: 20 }}
                  onClick={() => setColumn(i, true)}
                  aria-label={`Mark all ${d} as working`}
                >
                  all
                </button>
                <button
                  className="button sm ghost"
                  style={{ fontSize: "0.65rem", padding: "0 4px", minHeight: 20 }}
                  onClick={() => setColumn(i, false)}
                  aria-label={`Clear all ${d}`}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          {SLOTS.map((slot) => {
            const onHour = slot % 60 === 0;
            return (
              <div key={slot} style={{ display: "contents" }}>
                <div className={`avail-rowlabel${onHour ? "" : " half"}`} role="rowheader">{formatTime(slot)}</div>
                {WEEKDAY_LABELS.map((_, day) => {
                  const working = cells[`${day}-${slot}`] === true;
                  return (
                    <button
                      key={`${day}-${slot}`}
                      role="gridcell"
                      className={`avail-cell ${working ? "preferred" : "unavailable"}${onHour ? "" : " half"}`}
                      onClick={() => toggle(day, slot)}
                      aria-label={`${WEEKDAY_LABELS[day]} ${formatTime(slot)}: ${working ? "Working" : "Off"}. Activate to toggle.`}
                      aria-pressed={working}
                    >
                      {working ? "●" : ""}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="field mt">
        <label htmlFor="workhours-note">Working hours note (optional)</label>
        <textarea
          id="workhours-note"
          value={note}
          onChange={(e) => { setNote(e.target.value); setSaved(false); }}
          placeholder="e.g. Only work Tue/Thu during midterms."
        />
      </div>

      <div className="row">
        <button className="button primary" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : `Save ${forSelf ? "working hours" : "employee working hours"}`}
        </button>
        {saved && <span role="status" className="badge ok">Saved</span>}
        {saveError && <span role="alert" className="badge err">{saveError}</span>}
      </div>
    </section>
  );
}
