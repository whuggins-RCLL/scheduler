"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage, isStudentWorker } from "@/domain/scope";
import {
  WORKING_WEEKDAYS,
  defaultWorkingWeek,
  isExemptWorkingHours,
  normalizeWorkingDays,
  validateEffectiveDates,
  validateWorkingDays,
} from "@/domain/working-hours";
import { formatTime, parseTime } from "@/domain/time";
import type { WorkingDaySchedule, WorkingHoursPattern } from "@/domain/types";

function minutesToTimeInput(minutes: number | undefined): string {
  if (minutes == null) return "09:00";
  return formatTime(minutes);
}

export function WorkingHoursEditor() {
  const { db, currentUser, saveWorkingHours } = useStore();
  const manager = canManage(currentUser);
  const scheduleStart = db.schedules[0]?.startDate ?? "";
  const scheduleEnd = db.schedules[0]?.endDate ?? "";
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
  const exempt = targetEmployee ? isExemptWorkingHours(targetEmployee.classification) : false;
  const existing = useMemo(
    () => db.workingHours.find((p) => p.employeeId === targetEmployeeId),
    [db.workingHours, targetEmployeeId],
  );
  const [days, setDays] = useState<WorkingDaySchedule[]>(() =>
    normalizeWorkingDays(existing?.days ?? defaultWorkingWeek()),
  );
  const [effectiveStart, setEffectiveStart] = useState(existing?.effectiveStart ?? scheduleStart);
  const [effectiveEnd, setEffectiveEnd] = useState(existing?.effectiveEnd ?? scheduleEnd);
  const [label, setLabel] = useState(existing?.label ?? "");
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
    setDays(normalizeWorkingDays(existing?.days ?? defaultWorkingWeek()));
    setEffectiveStart(existing?.effectiveStart ?? scheduleStart);
    setEffectiveEnd(existing?.effectiveEnd ?? scheduleEnd);
    setLabel(existing?.label ?? "");
    setNote(existing?.note ?? "");
    setSaved(false);
    setSaveError(null);
  }, [existing, targetEmployeeId, scheduleStart, scheduleEnd]);

  function updateDay(weekday: number, patch: Partial<WorkingDaySchedule>) {
    setSaved(false);
    setDays((current) =>
      current.map((row) => (row.weekday === weekday ? { ...row, ...patch } : row)),
    );
  }

  function toggleDayOff(weekday: number, off: boolean) {
    updateDay(weekday, {
      regularDayOff: off,
      start: off ? undefined : 9 * 60,
      end: off ? undefined : 17 * 60,
    });
  }

  function toggleOnShift(weekday: number, onShift: boolean) {
    updateDay(weekday, { regularDayOff: !onShift });
  }

  async function save() {
    const normalized = normalizeWorkingDays(days);
    const errors = [
      ...validateEffectiveDates(effectiveStart || undefined, effectiveEnd || undefined),
      ...validateWorkingDays(normalized, { exempt }),
    ];
    if (errors.length) {
      setSaveError(errors[0]);
      setSaved(false);
      return;
    }

    const pattern: WorkingHoursPattern = {
      id: existing?.id ?? `workhours-${targetEmployeeId}`,
      employeeId: targetEmployeeId,
      effectiveStart: effectiveStart || undefined,
      effectiveEnd: effectiveEnd || undefined,
      label: label.trim() || undefined,
      days: normalized,
      note: note.trim() || undefined,
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
  const editingStudent = targetEmployee ? isStudentWorker(targetEmployee.classification) : false;
  const studentViewOnly = forSelf && editingStudent;

  if (studentViewOnly) {
    return null;
  }

  const heading = editingStudent
    ? (forSelf ? "My quarter schedule" : `${targetEmployee?.preferredName ?? targetEmployee?.legalName ?? "Student"} quarter schedule`)
    : (forSelf ? "My working hours" : `${targetEmployee?.preferredName ?? targetEmployee?.legalName ?? "Employee"} working hours`);

  return (
    <section className="card" aria-labelledby="working-hours-heading">
      <h2 id="working-hours-heading">{heading}</h2>
      <p className="muted" style={{ fontSize: "0.88rem" }}>
        {editingStudent
          ? `Set the student's final working hours for the quarter. Students see this schedule as view-only.`
          : exempt
            ? `Set ${forSelf ? "your" : "their"} regular weekly schedule — mark each day as on shift or off. Exempt staff do not track specific start and end times.`
            : `Set ${forSelf ? "your" : "their"} regular weekly schedule — separate from desk coverage below. Mark a weekday as a regular day off, or enter start and end times.`}
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

      <div className="row" style={{ marginBottom: "1rem" }}>
        <div className="field" style={{ flex: "1 1 180px" }}>
          <label htmlFor="workhours-effective-start">Effective from</label>
          <input
            id="workhours-effective-start"
            type="date"
            value={effectiveStart}
            onChange={(e) => { setEffectiveStart(e.target.value); setSaved(false); }}
            required
          />
        </div>
        <div className="field" style={{ flex: "1 1 180px" }}>
          <label htmlFor="workhours-effective-end">Effective through (optional)</label>
          <input
            id="workhours-effective-end"
            type="date"
            value={effectiveEnd}
            onChange={(e) => { setEffectiveEnd(e.target.value); setSaved(false); }}
          />
        </div>
        <div className="field" style={{ flex: "2 1 220px" }}>
          <label htmlFor="workhours-label">Label (optional)</label>
          <input
            id="workhours-label"
            type="text"
            value={label}
            onChange={(e) => { setLabel(e.target.value); setSaved(false); }}
            placeholder="e.g. Fall term"
          />
        </div>
      </div>

      <div className="table-wrap">
        <table className="data working-hours-table">
          <thead>
            <tr>
              <th scope="col">Day</th>
              {exempt ? (
                <th scope="col">On shift</th>
              ) : (
                <>
                  <th scope="col">Regular day off</th>
                  <th scope="col">Start</th>
                  <th scope="col">End</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {WORKING_WEEKDAYS.map(({ weekday, label: dayLabel }) => {
              const row = days.find((d) => d.weekday === weekday) ?? { weekday, regularDayOff: true };
              return (
                <tr key={weekday}>
                  <th scope="row">{dayLabel}</th>
                  {exempt ? (
                    <td>
                      <label className="row" style={{ justifyContent: "flex-start", gap: "0.45rem" }}>
                        <input
                          type="checkbox"
                          checked={!row.regularDayOff}
                          onChange={(e) => toggleOnShift(weekday, e.target.checked)}
                          aria-label={`${dayLabel} on shift`}
                        />
                        On shift
                      </label>
                    </td>
                  ) : (
                    <>
                      <td>
                        <label className="row" style={{ justifyContent: "flex-start", gap: "0.45rem" }}>
                          <input
                            type="checkbox"
                            checked={row.regularDayOff}
                            onChange={(e) => toggleDayOff(weekday, e.target.checked)}
                            aria-label={`${dayLabel} regular day off`}
                          />
                          Day off
                        </label>
                      </td>
                      <td>
                        <input
                          type="time"
                          value={minutesToTimeInput(row.start)}
                          disabled={row.regularDayOff}
                          onChange={(e) => {
                            try {
                              updateDay(weekday, { start: parseTime(e.target.value) });
                            } catch { /* ignore invalid partial input */ }
                          }}
                          aria-label={`${dayLabel} start time`}
                        />
                      </td>
                      <td>
                        <input
                          type="time"
                          value={minutesToTimeInput(row.end)}
                          disabled={row.regularDayOff}
                          onChange={(e) => {
                            try {
                              updateDay(weekday, { end: parseTime(e.target.value) });
                            } catch { /* ignore invalid partial input */ }
                          }}
                          aria-label={`${dayLabel} end time`}
                        />
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="field mt">
        <label htmlFor="workhours-note">Note (optional)</label>
        <textarea
          id="workhours-note"
          value={note}
          onChange={(e) => { setNote(e.target.value); setSaved(false); }}
          placeholder="e.g. Hours may shift during finals week."
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
