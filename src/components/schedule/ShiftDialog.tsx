"use client";

import { useState } from "react";
import type { Shift } from "@/domain/types";
import { parseTime, formatTime } from "@/domain/time";
import { useStore } from "@/lib/store/StoreProvider";

export function ShiftDialog({
  shift,
  scheduleId,
  date,
  onClose,
}: {
  shift?: Shift;
  scheduleId: string;
  date: string;
  onClose: () => void;
}) {
  const { db, upsertShift, cancelShift, toggleLock, now } = useStore();
  const editing = !!shift;
  const [employeeId, setEmployeeId] = useState(shift?.employeeId ?? "");
  const [positionId, setPositionId] = useState(shift?.positionId ?? db.positions[0]?.id ?? "");
  const [start, setStart] = useState(formatTime(shift?.start ?? parseTime("09:00")));
  const [end, setEnd] = useState(formatTime(shift?.end ?? parseTime("11:00")));
  const [taskIds, setTaskIds] = useState<string[]>(shift?.taskIds ?? []);
  const [error, setError] = useState("");

  const position = db.positions.find((p) => p.id === positionId);
  const applicableTasks = db.tasks.filter(
    (t) =>
      t.active &&
      (t.applicablePositionIds.length === 0 || t.applicablePositionIds.includes(positionId)),
  );

  function onPositionChange(nextPositionId: string) {
    setPositionId(nextPositionId);
    const allowed = new Set(
      db.tasks
        .filter(
          (t) =>
            t.active &&
            (t.applicablePositionIds.length === 0 || t.applicablePositionIds.includes(nextPositionId)),
        )
        .map((t) => t.id),
    );
    setTaskIds((ids) => ids.filter((id) => allowed.has(id)));
  }

  function save() {
    const s = parseTime(start);
    const e = parseTime(end);
    if (e <= s) {
      setError("End time must be after start time.");
      return;
    }
    const next: Shift = {
      id: shift?.id ?? `shift-${date}-${positionId}-${s}-${Math.round(Math.random() * 1e6)}`,
      scheduleId,
      employeeId: employeeId || null,
      positionId,
      locationId: position?.locationId ?? shift?.locationId ?? "loc-main",
      date,
      start: s,
      end: e,
      breaks: shift?.breaks ?? [],
      taskIds,
      status: employeeId ? shift?.status ?? "draft" : "open",
      source: shift?.source ?? "manager_created",
      notes: shift?.notes,
      locked: shift?.locked ?? false,
      scheduleVersion: shift?.scheduleVersion ?? 0,
      createdAt: shift?.createdAt ?? now(),
      updatedAt: now(),
    };
    upsertShift(next);
    onClose();
  }

  return (
    <div
      className="dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shift-dialog-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="dialog">
        <h2 id="shift-dialog-title">{editing ? "Edit shift" : "Add shift"}</h2>
        {error && (
          <div className="error-summary" role="alert">
            {error}
          </div>
        )}
        <div className="form">
          <div className="field">
            <label htmlFor="sd-emp">Employee</label>
            <select id="sd-emp" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Open shift (unassigned)</option>
              {db.employees
                .filter((emp) => emp.active)
                .map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.preferredName ?? emp.legalName}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sd-pos">Position</label>
            <select id="sd-pos" value={positionId} onChange={(e) => onPositionChange(e.target.value)}>
              {db.positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="sd-start">Start</label>
              <input id="sd-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="sd-end">End</label>
              <input id="sd-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <fieldset className="field" style={{ border: "none", padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 600, fontSize: "0.88rem" }}>Tasks</legend>
            <div className="row">
              {applicableTasks.map((t) => (
                <label key={t.id} className="chip" style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    style={{ width: "auto", minHeight: 0 }}
                    checked={taskIds.includes(t.id)}
                    onChange={(e) =>
                      setTaskIds((ids) => (e.target.checked ? [...ids, t.id] : ids.filter((x) => x !== t.id)))
                    }
                  />
                  {t.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="spread">
            <div className="row">
              <button type="button" className="button primary" onClick={save}>
                {editing ? "Save changes" : "Add shift"}
              </button>
              <button type="button" className="button" onClick={onClose}>
                Cancel
              </button>
            </div>
            {editing && shift && (
              <div className="row">
                <button type="button" className="button sm" onClick={() => { toggleLock(shift.id); onClose(); }}>
                  {shift.locked ? "Unlock" : "Lock"}
                </button>
                <button type="button" className="button sm danger" onClick={() => { cancelShift(shift.id); onClose(); }}>
                  Cancel shift
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
