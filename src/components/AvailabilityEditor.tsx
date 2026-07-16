"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canEditDeskAvailability, canManage, isStudentWorker } from "@/domain/scope";
import { activeStudentAvailabilityWindow, studentAvailabilityStatus, studentAvailabilityStatusMessage } from "@/domain/student-availability";
import { WEEKDAY_LABELS, formatTime } from "@/domain/time";
import type {
  AvailabilityKind,
  AvailabilityBlock,
  AvailabilityPattern,
  MealBreakMinutes,
} from "@/domain/types";

const SLOT_MINUTES = 30;
const DAY_START = 8 * 60;
const DAY_END = 21 * 60;
const SLOTS = Array.from(
  { length: (DAY_END - DAY_START) / SLOT_MINUTES },
  (_, i) => DAY_START + i * SLOT_MINUTES,
);

const CYCLE: AvailabilityKind[] = ["unavailable", "available", "preferred"];
const KIND_LABEL: Record<AvailabilityKind, string> = {
  unavailable: "Unavailable",
  available: "Available",
  preferred: "Preferred",
};

const MEAL_OPTIONS: { value: MealBreakMinutes; label: string }[] = [
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
];

type Cell = Record<string, AvailabilityKind>;

function blocksToCells(blocks: AvailabilityBlock[]): Cell {
  const cell: Cell = {};
  for (const b of blocks) {
    for (const s of SLOTS) {
      if (s >= b.start && s < b.end) cell[`${b.weekday}-${s}`] = b.kind;
    }
  }
  return cell;
}

function cellsToBlocks(cell: Cell): AvailabilityBlock[] {
  const blocks: AvailabilityBlock[] = [];
  for (let day = 0; day < 7; day++) {
    let run: { start: number; kind: AvailabilityKind } | null = null;
    for (const s of SLOTS) {
      const raw = cell[`${day}-${s}`];
      const active = raw && raw !== "unavailable" ? raw : null;
      if (run && run.kind !== active) {
        blocks.push({ weekday: day, start: run.start, end: s, kind: run.kind });
        run = null;
      }
      if (active && !run) run = { start: s, kind: active };
    }
    if (run) blocks.push({ weekday: day, start: run.start, end: DAY_END, kind: run.kind });
  }
  return blocks;
}

export function AvailabilityEditor() {
  const { db, currentUser, saveAvailability } = useStore();
  const manager = canManage(currentUser);
  const today = new Date().toISOString().slice(0, 10);
  const submissionWindow = useMemo(() => activeStudentAvailabilityWindow(db.studentAvailabilityWindows), [db.studentAvailabilityWindows]);
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
  const [mealBreak, setMealBreak] = useState<MealBreakMinutes | null>(existing?.mealBreakMinutes ?? null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const forSelf = targetEmployeeId === currentUser.id;
  const isStudent = targetEmployee ? isStudentWorker(targetEmployee.classification) : false;
  const editable = targetEmployee
    ? canEditDeskAvailability(currentUser, targetEmployee, submissionWindow, today)
    : true;
  const readOnly = !editable;
  const showStudentWindowBanner = isStudent && (forSelf || manager);
  const windowStatus = studentAvailabilityStatus(submissionWindow, today);

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
    setMealBreak(existing?.mealBreakMinutes ?? null);
    setSaved(false);
    setSaveError(null);
  }, [existing, targetEmployeeId]);

  function cycle(day: number, slot: number) {
    if (readOnly) return;
    const key = `${day}-${slot}`;
    setSaved(false);
    setCells((c) => {
      const cur = c[key] ?? "unavailable";
      const nextKind = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
      return { ...c, [key]: nextKind };
    });
  }

  function setColumn(day: number, kind: AvailabilityKind) {
    if (readOnly) return;
    setSaved(false);
    setCells((c) => {
      const next = { ...c };
      for (const s of SLOTS) next[`${day}-${s}`] = kind;
      return next;
    });
  }

  async function save() {
    if (readOnly) return;
    if (mealBreak == null) {
      setSaved(false);
      setSaveError("Select an unpaid meal break preference (30 minutes or 1 hour) before saving.");
      return;
    }
    const pattern: AvailabilityPattern = {
      id: existing?.id ?? `avail-${targetEmployeeId}`,
      employeeId: targetEmployeeId,
      label: existing?.label ?? submissionWindow?.label ?? "Current term",
      effectiveStart: submissionWindow?.submissionOpens,
      effectiveEnd: submissionWindow?.submissionCloses,
      blocks: cellsToBlocks(cells),
      note,
      mealBreakMinutes: mealBreak,
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
        <h1>{forSelf ? "Desk availability" : `${targetEmployee?.preferredName ?? targetEmployee?.legalName ?? "Employee"} desk availability`}</h1>
        <p className="muted">
          When {forSelf ? "you can" : "they can"} cover the borrowing desk. Click a cell to cycle
          Unavailable → Available → Preferred. This is separate from your quarter working schedule above.
        </p>
      </div>

      {showStudentWindowBanner && submissionWindow && (
        <section
          className={`card glass${readOnly && forSelf ? " warn-border" : ""}`}
          aria-labelledby="availability-window-status"
          role="status"
        >
          <h2 id="availability-window-status" style={{ margin: "0 0 0.35rem", fontSize: "1rem" }}>
            {forSelf ? "Availability submission window" : "Student submission window"}
          </h2>
          <p style={{ margin: 0, fontSize: "0.9rem" }}>
            {forSelf
              ? studentAvailabilityStatusMessage(submissionWindow, today)
              : `Period: ${submissionWindow.label}. Students may edit ${submissionWindow.submissionOpens} through ${submissionWindow.submissionCloses}. Status: ${windowStatus.replace(/_/g, " ")}.`}
          </p>
          {readOnly && forSelf && (
            <p className="muted" style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
              Your grid is read-only. Contact a manager if you need changes.
            </p>
          )}
        </section>
      )}

      {manager && (
        <section className="card" aria-labelledby="employee-availability-picker">
          <h2 id="employee-availability-picker">Edit employee availability</h2>
          <p className="muted" style={{ fontSize: "0.85rem" }}>Admins and managers can open an employee&apos;s availability and enter recurring changes directly.</p>
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

      <section className="card" aria-labelledby="meal-break-pref">
        <h2 id="meal-break-pref" style={{ marginTop: 0 }}>Unpaid meal break preference</h2>
        <p className="muted" style={{ margin: "0 0 0.6rem", fontSize: "0.88rem" }}>
          Required. When a shift is long enough to need an unpaid meal, how long would {forSelf ? "you" : "they"}{" "}
          prefer it to be? The scheduler uses this (never shorter than the legal minimum).
        </p>
        <fieldset style={{ border: "none", padding: 0, margin: 0 }} aria-required="true" disabled={readOnly}>
          <legend className="sr-only">Unpaid meal break preference</legend>
          <div className="row">
            {MEAL_OPTIONS.map((opt) => (
              <label key={opt.value} className="chip" style={{ cursor: readOnly ? "default" : "pointer", gap: "0.4rem" }}>
                <input
                  type="radio"
                  name="meal-break"
                  style={{ width: "auto", minHeight: 0 }}
                  checked={mealBreak === opt.value}
                  disabled={readOnly}
                  onChange={() => { setMealBreak(opt.value); setSaved(false); setSaveError(null); }}
                />
                {opt.label}
              </label>
            ))}
          </div>
          {mealBreak == null && !readOnly && (
            <p className="muted" role="note" style={{ margin: "0.5rem 0 0", fontSize: "0.82rem", color: "var(--warning)" }}>
              No preference selected yet.
            </p>
          )}
        </fieldset>
      </section>

      <div className="card">
        <div className="row" style={{ marginBottom: "0.75rem" }}>
          <span className="badge">Legend</span>
          <span className="chip" style={{ background: "color-mix(in srgb, var(--palo-alto) 22%, var(--surface))" }}>Preferred</span>
          <span className="chip" style={{ background: "color-mix(in srgb, var(--info) 15%, var(--surface))" }}>Available</span>
          <span className="chip">Unavailable</span>
          {readOnly && <span className="badge warn">Read-only</span>}
        </div>

        <div style={{ overflowX: "auto" }}>
          <div className="avail-grid" role="grid" aria-label="Weekly availability" aria-readonly={readOnly}>
            <div className="avail-head" role="columnheader">Time</div>
            {WEEKDAY_LABELS.map((d, i) => (
              <div className="avail-head" role="columnheader" key={d}>
                {d}
                {!readOnly && (
                  <div>
                    <button className="button sm ghost" style={{ fontSize: "0.65rem", padding: "0 4px", minHeight: 20 }} onClick={() => setColumn(i, "available")} aria-label={`Mark all ${d} available`}>all</button>
                    <button className="button sm ghost" style={{ fontSize: "0.65rem", padding: "0 4px", minHeight: 20 }} onClick={() => setColumn(i, "unavailable")} aria-label={`Clear all ${d}`}>×</button>
                  </div>
                )}
              </div>
            ))}
            {SLOTS.map((slot) => {
              const onHour = slot % 60 === 0;
              return (
                <div key={slot} style={{ display: "contents" }}>
                  <div className={`avail-rowlabel${onHour ? "" : " half"}`} role="rowheader">{formatTime(slot)}</div>
                  {WEEKDAY_LABELS.map((_, day) => {
                    const kind = cells[`${day}-${slot}`] ?? "unavailable";
                    return (
                      <button
                        key={`${day}-${slot}`}
                        role="gridcell"
                        className={`avail-cell ${kind}${onHour ? "" : " half"}`}
                        onClick={() => cycle(day, slot)}
                        disabled={readOnly}
                        aria-disabled={readOnly}
                        aria-label={`${WEEKDAY_LABELS[day]} ${formatTime(slot)}: ${KIND_LABEL[kind]}. ${readOnly ? "Read-only." : "Activate to change."}`}
                      >
                        {kind === "preferred" ? "★" : kind === "available" ? "✓" : ""}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <div className="field mt">
          <label htmlFor="avail-note">Availability note (optional)</label>
          <textarea
            id="avail-note"
            value={note}
            disabled={readOnly}
            onChange={(e) => { setNote(e.target.value); setSaved(false); }}
            placeholder="e.g. Prefer not to close on weekdays during finals."
          />
        </div>

        {!readOnly && (
          <div className="row">
            <button className="button primary" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : `Save ${forSelf ? "availability" : "employee availability"}`}
            </button>
            {saved && <span role="status" className="badge ok">Saved</span>}
            {saveError && <span role="alert" className="badge err">{saveError}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
