"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { WEEKDAY_LABELS, formatTime } from "@/domain/time";
import type { AvailabilityKind, AvailabilityBlock, AvailabilityPattern } from "@/domain/types";

const HOURS = Array.from({ length: 13 }, (_, i) => 8 + i); // 08:00 .. 20:00
const CYCLE: AvailabilityKind[] = ["unavailable", "available", "preferred"];
const KIND_LABEL: Record<AvailabilityKind, string> = {
  unavailable: "Unavailable",
  available: "Available",
  preferred: "Preferred",
};

type Cell = Record<string, AvailabilityKind>; // key `${day}-${hour}`

function blocksToCells(blocks: AvailabilityBlock[]): Cell {
  const cell: Cell = {};
  for (const b of blocks) {
    for (let h = Math.floor(b.start / 60); h < Math.ceil(b.end / 60); h++) {
      if (h >= 8 && h < 21) cell[`${b.weekday}-${h}`] = b.kind;
    }
  }
  return cell;
}

function cellsToBlocks(cell: Cell): AvailabilityBlock[] {
  const blocks: AvailabilityBlock[] = [];
  for (let day = 0; day < 7; day++) {
    let run: { start: number; kind: AvailabilityKind } | null = null;
    for (const h of [...HOURS, 21]) {
      const kind = cell[`${day}-${h}`];
      if (run && (kind !== run.kind || h === 21)) {
        blocks.push({ weekday: day, start: run.start * 60, end: h * 60, kind: run.kind });
        run = null;
      }
      if (kind && kind !== "unavailable" && !run) run = { start: h, kind };
      else if (kind && run && kind === run.kind) {
        /* continue run */
      }
    }
  }
  return blocks;
}

export function AvailabilityEditor() {
  const { db, currentUser, saveAvailability } = useStore();
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
    () => db.availability.find((p) => p.employeeId === targetEmployeeId),
    [db.availability, targetEmployeeId],
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

  // Resync when the employee changes or the live Firestore record arrives.
  useEffect(() => {
    setCells(blocksToCells(existing?.blocks ?? []));
    setNote(existing?.note ?? "");
    setSaved(false);
    setSaveError(null);
  }, [existing, targetEmployeeId]);

  function cycle(day: number, hour: number) {
    const key = `${day}-${hour}`;
    setSaved(false);
    setCells((c) => {
      const cur = c[key] ?? "unavailable";
      const nextKind = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
      return { ...c, [key]: nextKind };
    });
  }

  function setColumn(day: number, kind: AvailabilityKind) {
    setSaved(false);
    setCells((c) => {
      const next = { ...c };
      for (const h of HOURS) next[`${day}-${h}`] = kind;
      return next;
    });
  }

  async function save() {
    const pattern: AvailabilityPattern = {
      id: existing?.id ?? `avail-${targetEmployeeId}`,
      employeeId: targetEmployeeId,
      label: existing?.label ?? "Current term",
      blocks: cellsToBlocks(cells),
      note,
      updatedBy: currentUser.id,
      updatedAt: new Date().toISOString(),
    };
    setSaving(true);
    setSaveError(null);
    try {
      await saveAvailability(pattern);
      setSaved(true);
    } catch (error) {
      setSaved(false);
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>{targetEmployeeId === currentUser.id ? "My availability" : `${targetEmployee?.preferredName ?? targetEmployee?.legalName ?? "Employee"} availability`}</h1>
        <p className="muted">
          Click a cell to cycle Unavailable → Available → Preferred. Every action is keyboard-operable —
          no dragging required. Managers schedule around these windows.
        </p>
      </div>

      {manager && (
        <section className="card" aria-labelledby="employee-availability-picker">
          <h2 id="employee-availability-picker">Edit employee availability</h2>
          <p className="muted" style={{ fontSize: "0.85rem" }}>Admins and managers can open an employee's availability and enter recurring changes or exceptions directly.</p>
          <div className="field" style={{ maxWidth: 420 }}>
            <label htmlFor="availability-employee">Employee</label>
            <select id="availability-employee" value={targetEmployeeId} onChange={(e) => setTargetEmployeeId(e.target.value)}>
              {activeEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.preferredName ?? employee.legalName}{employee.setupComplete ? "" : " (setup needed)"}
                  </option>
                ))}
            </select>
          </div>
        </section>
      )}

      <div className="card">
        <div className="row" style={{ marginBottom: "0.75rem" }}>
          <span className="badge">Legend</span>
          <span className="chip" style={{ background: "color-mix(in srgb, var(--palo-alto) 22%, var(--surface))" }}>Preferred</span>
          <span className="chip" style={{ background: "color-mix(in srgb, var(--info) 15%, var(--surface))" }}>Available</span>
          <span className="chip">Unavailable</span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <div className="avail-grid" role="grid" aria-label="Weekly availability">
            <div className="avail-head" role="columnheader">Time</div>
            {WEEKDAY_LABELS.map((d, i) => (
              <div className="avail-head" role="columnheader" key={d}>
                {d}
                <div>
                  <button className="button sm ghost" style={{ fontSize: "0.65rem", padding: "0 4px", minHeight: 20 }} onClick={() => setColumn(i, "available")} aria-label={`Mark all ${d} available`}>all</button>
                  <button className="button sm ghost" style={{ fontSize: "0.65rem", padding: "0 4px", minHeight: 20 }} onClick={() => setColumn(i, "unavailable")} aria-label={`Clear all ${d}`}>×</button>
                </div>
              </div>
            ))}
            {HOURS.map((h) => (
              <div key={h} style={{ display: "contents" }}>
                <div className="avail-rowlabel" role="rowheader">{formatTime(h * 60)}</div>
                {WEEKDAY_LABELS.map((_, day) => {
                  const kind = cells[`${day}-${h}`] ?? "unavailable";
                  return (
                    <button
                      key={`${day}-${h}`}
                      role="gridcell"
                      className={`avail-cell ${kind}`}
                      onClick={() => cycle(day, h)}
                      aria-label={`${WEEKDAY_LABELS[day]} ${formatTime(h * 60)}: ${KIND_LABEL[kind]}. Activate to change.`}
                    >
                      {kind === "preferred" ? "★" : kind === "available" ? "✓" : ""}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="field mt">
          <label htmlFor="avail-note">Availability note (optional)</label>
          <textarea id="avail-note" value={note} onChange={(e) => { setNote(e.target.value); setSaved(false); }} placeholder="e.g. Prefer not to close on weekdays during finals." />
        </div>

        <div className="row">
          <button className="button primary" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : `Save ${targetEmployeeId === currentUser.id ? "availability" : "employee availability"}`}
          </button>
          {saved && <span role="status" className="badge ok">Saved</span>}
          {saveError && <span role="alert" className="badge err">Save failed: {saveError}</span>}
        </div>
      </div>
    </div>
  );
}
