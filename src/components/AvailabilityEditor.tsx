"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { resolveEmployeeProfile } from "@/domain/employee-profile";
import {
  AVAIL_DAY_END,
  AVAIL_SLOTS,
  approvedBlocksToSet,
  approvedSetToBlocks,
  blocksToCells,
  cellsToBlocks,
  isSlotSignedUp,
  type AvailabilityCellMap,
} from "@/domain/availability-grid";
import {
  activeStudentAvailabilityWindow,
  formatWeeklyHours,
  studentAvailabilityStatus,
  studentAvailabilityStatusMessage,
  STUDENT_MAX_WEEKLY_MINUTES,
  weeklyApprovedMinutes,
  weeklySignUpMinutes,
} from "@/domain/student-availability";
import {
  canApproveStudentAvailability,
  canEditDeskAvailability,
  canManage,
  isStudentWorker,
} from "@/domain/scope";
import { WEEKDAY_LABELS, formatTime } from "@/domain/time";
import type { AvailabilityKind, AvailabilityPattern, MealBreakMinutes } from "@/domain/types";

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

export function AvailabilityEditor() {
  const { db, currentUser, viewAs, saveAvailability, saveStudentAvailabilityApproval } = useStore();
  const manager = canManage(currentUser);
  const today = new Date().toISOString().slice(0, 10);
  const submissionWindow = useMemo(
    () => activeStudentAvailabilityWindow(db.studentAvailabilityWindows),
    [db.studentAvailabilityWindows],
  );

  const activeUserIds = useMemo(
    () => new Set(db.users.filter((user) => user.state === "active").map((user) => user.id)),
    [db.users],
  );
  const activeEmployees = useMemo(
    () => db.employees.filter((employee) => employee.active && activeUserIds.has(employee.id)),
    [activeUserIds, db.employees],
  );
  const studentEmployees = useMemo(
    () => activeEmployees.filter((e) => isStudentWorker(e.classification)),
    [activeEmployees],
  );

  const [targetEmployeeId, setTargetEmployeeId] = useState(currentUser.id);
  const targetEmployee = useMemo(
    () => db.employees.find((e) => e.id === targetEmployeeId)
      ?? (targetEmployeeId === currentUser.id ? resolveEmployeeProfile(db.employees, currentUser, viewAs) : undefined),
    [db.employees, targetEmployeeId, currentUser, viewAs],
  );

  // A student's availability is scoped to the active submission window so each
  // quarter is its own saved pattern (opening a new window never overwrites a
  // prior quarter). Staff desk availability stays a single per-employee pattern.
  const patternId = useMemo(() => {
    const student = targetEmployee ? isStudentWorker(targetEmployee.classification) : false;
    if (student && submissionWindow) return `avail-${targetEmployeeId}-${submissionWindow.id}`;
    return `avail-${targetEmployeeId}`;
  }, [targetEmployee, submissionWindow, targetEmployeeId]);

  const existing = useMemo(() => {
    const byId = db.availability.find((p) => p.id === patternId);
    if (byId) return byId;
    const student = targetEmployee ? isStudentWorker(targetEmployee.classification) : false;
    // Fresh quarter for a student: start from a blank grid rather than the
    // previous quarter's pattern.
    if (student && submissionWindow) return undefined;
    return db.availability.find((p) => p.employeeId === targetEmployeeId);
  }, [db.availability, patternId, targetEmployee, submissionWindow, targetEmployeeId]);

  const [cells, setCells] = useState<AvailabilityCellMap>(() => blocksToCells(existing?.blocks ?? []));
  const [approved, setApproved] = useState<Set<string>>(() => approvedBlocksToSet(existing?.approvedBlocks ?? []));
  const [note, setNote] = useState(existing?.note ?? "");
  const [mealBreak, setMealBreak] = useState<MealBreakMinutes | null>(existing?.mealBreakMinutes ?? null);
  const [saved, setSaved] = useState(false);
  const [approvalSaved, setApprovalSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const forSelf = targetEmployeeId === currentUser.id;
  const isStudent = targetEmployee ? isStudentWorker(targetEmployee.classification) : false;
  const onBehalf = manager && viewAs === "self" && !forSelf;
  const editable = targetEmployee
    ? canEditDeskAvailability(currentUser, targetEmployee, submissionWindow, today, { onBehalf })
    : false;
  const readOnly = !editable;
  const canApprove = targetEmployee ? canApproveStudentAvailability(currentUser, targetEmployee) && !forSelf : false;
  const showStudentWindowBanner = isStudent && (forSelf || manager);
  const signUpBlocks = useMemo(() => cellsToBlocks(cells), [cells]);
  const signUpMinutes = weeklySignUpMinutes(signUpBlocks);
  const approvedMinutes = weeklyApprovedMinutes(approvedSetToBlocks(approved));

  useEffect(() => {
    if (!manager) {
      if (targetEmployeeId !== currentUser.id) setTargetEmployeeId(currentUser.id);
      return;
    }
    if (viewAs !== "self") {
      if (targetEmployeeId !== currentUser.id) setTargetEmployeeId(currentUser.id);
      return;
    }
    if (!activeEmployees.some((employee) => employee.id === targetEmployeeId)) {
      const fallback = activeEmployees.find((employee) => employee.id === currentUser.id) ?? activeEmployees[0];
      if (fallback) setTargetEmployeeId(fallback.id);
    }
  }, [activeEmployees, currentUser.id, manager, targetEmployeeId, viewAs]);

  useEffect(() => {
    setCells(blocksToCells(existing?.blocks ?? []));
    setApproved(approvedBlocksToSet(existing?.approvedBlocks ?? []));
    setNote(existing?.note ?? "");
    setMealBreak(existing?.mealBreakMinutes ?? null);
    setSaved(false);
    setApprovalSaved(false);
    setSaveError(null);
  }, [existing, targetEmployeeId]);

  function cycle(day: number, slot: number) {
    if (readOnly) return;
    const key = `${day}-${slot}`;
    setSaved(false);
    setCells((c) => {
      const cur = c[key] ?? "unavailable";
      const nextKind = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
      const next = { ...c, [key]: nextKind };
      if (isStudent && nextKind === "unavailable") {
        setApproved((a) => {
          const copy = new Set(a);
          copy.delete(key);
          return copy;
        });
      }
      return next;
    });
  }

  // Directly set a single cell to a kind (used by drag painting, which fills a
  // whole run with one value rather than cycling each cell individually).
  function paintCell(day: number, slot: number, kind: AvailabilityKind) {
    if (readOnly) return;
    const key = `${day}-${slot}`;
    setSaved(false);
    setCells((c) => (c[key] === kind ? c : { ...c, [key]: kind }));
    if (isStudent && kind === "unavailable") {
      setApproved((a) => {
        if (!a.has(key)) return a;
        const copy = new Set(a);
        copy.delete(key);
        return copy;
      });
    }
  }

  function setApprovalState(day: number, slot: number, approve: boolean) {
    if (!canApprove) return;
    const key = `${day}-${slot}`;
    if (!isSlotSignedUp(signUpBlocks, day, slot)) return;
    setApprovalSaved(false);
    setApproved((a) => {
      if (a.has(key) === approve) return a;
      const copy = new Set(a);
      if (approve) copy.add(key);
      else copy.delete(key);
      return copy;
    });
  }

  // Drag-to-paint: press on a cell and drag across the grid to set many cells at
  // once instead of clicking each half-hour block. A press that never leaves its
  // starting cell falls through to the single-cell click handler (cycle/approve).
  const dragRef = useRef<
    | {
        mode: "edit" | "approve";
        value: AvailabilityKind;
        approve: boolean;
        startKey: string;
        moved: boolean;
      }
    | null
  >(null);
  const draggedRef = useRef(false);

  function beginDrag(day: number, slot: number) {
    const key = `${day}-${slot}`;
    const kind = cells[key] ?? "unavailable";
    const signedUp = kind === "available" || kind === "preferred";
    draggedRef.current = false;
    if (canApprove && signedUp) {
      // Painting approvals for a signed-up student: fill or clear the run.
      dragRef.current = { mode: "approve", value: kind, approve: !approved.has(key), startKey: key, moved: false };
    } else if (!readOnly) {
      // Editing own/other's grid: drag from an empty cell fills Available, drag
      // from a marked cell clears it. Cycling to Preferred stays a single click.
      dragRef.current = {
        mode: "edit",
        value: kind === "unavailable" ? "available" : "unavailable",
        approve: false,
        startKey: key,
        moved: false,
      };
    } else {
      dragRef.current = null;
    }
  }

  function applyDrag(day: number, slot: number) {
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === "approve") setApprovalState(day, slot, d.approve);
    else paintCell(day, slot, d.value);
  }

  function dragEnter(day: number, slot: number) {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved) {
      // First cell entered after press: commit the starting cell too so the
      // whole gesture (start → here) paints, not just the cells we pass over.
      d.moved = true;
      draggedRef.current = true;
      const [sDay, sSlot] = d.startKey.split("-").map(Number);
      applyDrag(sDay, sSlot);
    }
    applyDrag(day, slot);
  }

  useEffect(() => {
    function endDrag() {
      dragRef.current = null;
    }
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, []);

  function setColumn(day: number, kind: AvailabilityKind) {
    if (readOnly) return;
    setSaved(false);
    setCells((c) => {
      const next = { ...c };
      for (const s of AVAIL_SLOTS) next[`${day}-${s}`] = kind;
      return next;
    });
    if (isStudent && kind === "unavailable") {
      setApproved((a) => {
        const copy = new Set(a);
        for (const s of AVAIL_SLOTS) copy.delete(`${day}-${s}`);
        return copy;
      });
    }
  }

  function toggleApproval(day: number, slot: number) {
    if (!canApprove) return;
    const key = `${day}-${slot}`;
    if (!isSlotSignedUp(signUpBlocks, day, slot)) return;
    setApprovalSaved(false);
    setApproved((a) => {
      const copy = new Set(a);
      if (copy.has(key)) copy.delete(key);
      else copy.add(key);
      return copy;
    });
  }

  async function save() {
    if (readOnly || !targetEmployee) return;
    if (mealBreak == null) {
      setSaveError("Select an unpaid meal break preference (30 minutes or 1 hour) before saving.");
      return;
    }
    const pattern: AvailabilityPattern = {
      id: existing?.id ?? patternId,
      employeeId: targetEmployeeId,
      label: existing?.label ?? submissionWindow?.label ?? "Current term",
      effectiveStart: submissionWindow?.submissionOpens,
      effectiveEnd: submissionWindow?.submissionCloses,
      blocks: cellsToBlocks(cells),
      approvedBlocks: existing?.approvedBlocks,
      note,
      mealBreakMinutes: mealBreak,
      updatedBy: currentUser.id,
      updatedAt: new Date().toISOString(),
    };
    setSaving(true);
    setSaveError(null);
    try {
      await saveAvailability(pattern, { onBehalf });
      setSaved(true);
    } catch (error) {
      setSaved(false);
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function saveApproval() {
    if (!canApprove || !existing) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveStudentAvailabilityApproval(existing.id, approvedSetToBlocks(approved));
      setApprovalSaved(true);
    } catch (error) {
      setApprovalSaved(false);
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  const employeeList = isStudent && manager && viewAs === "self" ? studentEmployees : activeEmployees;

  return (
    <div className="stack">
      <div className="page-head">
        <h1>
          {forSelf
            ? (isStudent ? "My availability sign-up" : "Desk availability")
            : `${targetEmployee?.preferredName ?? targetEmployee?.legalName ?? "Employee"} availability`}
        </h1>
        <p className="muted">
          {isStudent
            ? "Sign up for the hours you can work at the library. Click a cell to sign up, or click and drag across cells to fill several half-hours at once. Your manager reviews and approves a subset for scheduling."
            : "When you can cover the borrowing desk. Click a cell to cycle Unavailable → Available → Preferred, or click and drag across cells to mark several half-hours available at once."}
        </p>
      </div>

      {isStudent && (
        <section className="card glass" aria-labelledby="student-hours-summary">
          <h2 id="student-hours-summary" style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>Weekly hours</h2>
          <div className="row" style={{ flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <div className="metric" style={{ fontSize: "1.5rem" }}>{formatWeeklyHours(signUpMinutes)}</div>
              <div className="metric-label">Signed up (hrs/wk)</div>
            </div>
            <div>
              <div className="metric" style={{ fontSize: "1.5rem" }}>{formatWeeklyHours(approvedMinutes)}</div>
              <div className="metric-label">Approved (hrs/wk)</div>
            </div>
            <div>
              <div className="metric" style={{ fontSize: "1.5rem" }}>{STUDENT_MAX_WEEKLY_MINUTES / 60}</div>
              <div className="metric-label">Maximum allowed</div>
            </div>
          </div>
          {forSelf && approvedMinutes < signUpMinutes && signUpMinutes > 0 && (
            <p className="muted" style={{ margin: "0.75rem 0 0", fontSize: "0.85rem" }}>
              Your manager has approved {formatWeeklyHours(approvedMinutes)} of your {formatWeeklyHours(signUpMinutes)} signed-up hours.
              Scheduling uses approved hours only.
            </p>
          )}
          {forSelf && signUpMinutes === 0 && (
            <p className="muted" style={{ margin: "0.75rem 0 0", fontSize: "0.85rem" }}>
              No hours signed up yet. Mark the grid below during the submission window.
            </p>
          )}
        </section>
      )}

      {showStudentWindowBanner && submissionWindow && (
        <section className={`card glass${readOnly && forSelf ? " warn-border" : ""}`} role="status">
          <h2 style={{ margin: "0 0 0.35rem", fontSize: "1rem" }}>
            {forSelf ? "Submission window" : "Student submission window"}
          </h2>
          <p style={{ margin: 0, fontSize: "0.9rem" }}>
            {forSelf
              ? studentAvailabilityStatusMessage(submissionWindow, today)
              : `Period: ${submissionWindow.label}. Open ${submissionWindow.submissionOpens}–${submissionWindow.submissionCloses}. Status: ${studentAvailabilityStatus(submissionWindow, today).replace(/_/g, " ")}.`}
          </p>
          {readOnly && forSelf && (
            <p className="muted" style={{ margin: "0.5rem 0 0", fontSize: "0.85rem" }}>
              Your sign-up grid is read-only. Contact a manager if you need changes.
            </p>
          )}
        </section>
      )}

      {manager && viewAs === "self" && (
        <section className="card" aria-labelledby="employee-availability-picker">
          <h2 id="employee-availability-picker">Select employee</h2>
          <div className="field" style={{ maxWidth: 420 }}>
            <label htmlFor="availability-employee">Employee</label>
            <select id="availability-employee" value={targetEmployeeId} onChange={(e) => setTargetEmployeeId(e.target.value)}>
              {employeeList.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.preferredName ?? employee.legalName}
                  {employee.setupComplete ? "" : " (setup needed)"}
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      <section className="card" aria-labelledby="meal-break-pref">
        <h2 id="meal-break-pref" style={{ marginTop: 0 }}>Unpaid meal break preference</h2>
        <fieldset style={{ border: "none", padding: 0, margin: 0 }} disabled={readOnly}>
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
        </fieldset>
      </section>

      <div className="card">
        <div className="row" style={{ marginBottom: "0.75rem", flexWrap: "wrap" }}>
          <span className="badge">Legend</span>
          {isStudent ? (
            <>
              <span className="chip" style={{ background: "color-mix(in srgb, var(--info) 15%, var(--surface))" }}>Signed up</span>
              <span className="chip" style={{ background: "color-mix(in srgb, var(--palo-alto) 30%, var(--surface))" }}>Approved</span>
            </>
          ) : (
            <>
              <span className="chip" style={{ background: "color-mix(in srgb, var(--palo-alto) 22%, var(--surface))" }}>Preferred</span>
              <span className="chip" style={{ background: "color-mix(in srgb, var(--info) 15%, var(--surface))" }}>Available</span>
            </>
          )}
          <span className="chip">Unavailable</span>
          {readOnly && <span className="badge warn">Read-only</span>}
        </div>

        <div style={{ overflowX: "auto" }}>
          <div className="avail-grid" role="grid" aria-label="Weekly availability" aria-readonly={readOnly && !canApprove}>
            <div className="avail-head" role="columnheader">Time</div>
            {WEEKDAY_LABELS.map((d, i) => (
              <div className="avail-head" role="columnheader" key={d}>
                {d}
                {!readOnly && (
                  <div>
                    <button type="button" className="button sm ghost" style={{ fontSize: "0.65rem", padding: "0 4px", minHeight: 20 }} onClick={() => setColumn(i, "available")} aria-label={`Mark all ${d} available`}>all</button>
                    <button type="button" className="button sm ghost" style={{ fontSize: "0.65rem", padding: "0 4px", minHeight: 20 }} onClick={() => setColumn(i, "unavailable")} aria-label={`Clear all ${d}`}>×</button>
                  </div>
                )}
              </div>
            ))}
            {AVAIL_SLOTS.map((slot) => {
              const onHour = slot % 60 === 0;
              return (
                <div key={slot} style={{ display: "contents" }}>
                  <div className={`avail-rowlabel${onHour ? "" : " half"}`} role="rowheader">{formatTime(slot)}</div>
                  {WEEKDAY_LABELS.map((_, day) => {
                    const key = `${day}-${slot}`;
                    const kind = cells[key] ?? "unavailable";
                    const signedUp = kind === "available" || kind === "preferred";
                    const isApproved = approved.has(key);
                    const cellClass = [
                      "avail-cell",
                      kind,
                      onHour ? "" : "half",
                      isStudent && isApproved ? "approved" : "",
                    ].filter(Boolean).join(" ");

                    const handleClick = () => {
                      // A drag already painted these cells; swallow the trailing click.
                      if (draggedRef.current) {
                        draggedRef.current = false;
                        return;
                      }
                      if (canApprove && signedUp) toggleApproval(day, slot);
                      else cycle(day, slot);
                    };

                    return (
                      <button
                        key={key}
                        type="button"
                        role="gridcell"
                        className={cellClass}
                        onClick={handleClick}
                        onPointerDown={() => beginDrag(day, slot)}
                        onPointerEnter={() => dragEnter(day, slot)}
                        disabled={readOnly && !(canApprove && signedUp)}
                        aria-disabled={readOnly && !(canApprove && signedUp)}
                        aria-label={`${WEEKDAY_LABELS[day]} ${formatTime(slot)}: ${signedUp ? "signed up" : KIND_LABEL[kind]}${isApproved ? ", approved" : ""}`}
                      >
                        {isStudent
                          ? (isApproved ? "✓" : signedUp ? "·" : "")
                          : (kind === "preferred" ? "★" : kind === "available" ? "✓" : "")}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {canApprove && (
          <p className="muted" style={{ margin: "0.75rem 0 0", fontSize: "0.85rem" }}>
            Click a signed-up cell to approve or unapprove hours, or click and drag across signed-up cells to approve several at once. Approved: {formatWeeklyHours(approvedMinutes)} / {STUDENT_MAX_WEEKLY_MINUTES / 60} hrs max.
          </p>
        )}

        <div className="field mt">
          <label htmlFor="avail-note">Note (optional)</label>
          <textarea
            id="avail-note"
            value={note}
            disabled={readOnly}
            onChange={(e) => { setNote(e.target.value); setSaved(false); }}
          />
        </div>

        <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
          {!readOnly && (
            <button type="button" className="button primary" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : `Save ${forSelf ? "sign-up" : "employee sign-up"}`}
            </button>
          )}
          {canApprove && (
            <button type="button" className="button primary" onClick={() => void saveApproval()} disabled={saving}>
              {saving ? "Saving…" : "Save approvals"}
            </button>
          )}
          {saved && <span role="status" className="badge ok">Sign-up saved</span>}
          {approvalSaved && <span role="status" className="badge ok">Approvals saved</span>}
          {saveError && <span role="alert" className="badge err">{saveError}</span>}
        </div>
      </div>
    </div>
  );
}
