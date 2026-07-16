"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage, isStudentWorker } from "@/domain/scope";
import {
  WORKING_WEEKDAYS,
  defaultWorkingWeek,
  isExemptWorkingHours,
  normalizeWorkingDays,
  overlappingPatterns,
  validateEffectiveDates,
  validateWorkingDays,
} from "@/domain/working-hours";
import { formatTime, parseTime } from "@/domain/time";
import { humanDate } from "@/lib/ui";
import type { WorkLocation, WorkingDaySchedule, WorkingHoursPattern } from "@/domain/types";

function minutesToTimeInput(minutes: number | undefined): string {
  if (minutes == null) return "09:00";
  return formatTime(minutes);
}

const LOCATION_LABEL: Record<WorkLocation, string> = {
  on_site: "On-site",
  remote: "Remote",
};

function patternDateRange(pattern: WorkingHoursPattern): string {
  if (pattern.effectiveStart && pattern.effectiveEnd) {
    return `${humanDate(pattern.effectiveStart)} – ${humanDate(pattern.effectiveEnd)}`;
  }
  if (pattern.effectiveStart) return `From ${humanDate(pattern.effectiveStart)}`;
  return "Ongoing";
}

function patternSummary(pattern: WorkingHoursPattern): string {
  const on = normalizeWorkingDays(pattern.days).filter((d) => !d.regularDayOff);
  if (on.length === 0) return "No working days";
  const names = on
    .map((d) => WORKING_WEEKDAYS.find((w) => w.weekday === d.weekday)?.label.slice(0, 3) ?? "")
    .filter(Boolean)
    .join(", ");
  return `${on.length} working day${on.length === 1 ? "" : "s"} · ${names}`;
}

export function WorkingHoursEditor() {
  const { db, currentUser, saveWorkingHours, deleteWorkingHours } = useStore();
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

  const patterns = useMemo(
    () =>
      db.workingHours
        .filter((p) => p.employeeId === targetEmployeeId)
        .sort((a, b) => (a.effectiveStart ?? "").localeCompare(b.effectiveStart ?? "")),
    [db.workingHours, targetEmployeeId],
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [days, setDays] = useState<WorkingDaySchedule[]>(() => defaultWorkingWeek());
  const [effectiveStart, setEffectiveStart] = useState(scheduleStart);
  const [effectiveEnd, setEffectiveEnd] = useState(scheduleEnd);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function loadForm(pattern: WorkingHoursPattern | undefined) {
    setDays(normalizeWorkingDays(pattern?.days ?? defaultWorkingWeek()));
    setEffectiveStart(pattern?.effectiveStart ?? scheduleStart);
    setEffectiveEnd(pattern?.effectiveEnd ?? scheduleEnd);
    setLabel(pattern?.label ?? "");
    setNote(pattern?.note ?? "");
    setSaved(false);
    setSaveError(null);
  }

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

  // When the selected employee changes, load their most recent saved schedule
  // (or a fresh draft). We intentionally key this only on the target so typing
  // in the form is never clobbered by unrelated store updates.
  useEffect(() => {
    const list = db.workingHours
      .filter((p) => p.employeeId === targetEmployeeId)
      .sort((a, b) => (a.effectiveStart ?? "").localeCompare(b.effectiveStart ?? ""));
    const first = list[0];
    setEditingId(first?.id ?? null);
    loadForm(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetEmployeeId]);

  function updateDay(weekday: number, patch: Partial<WorkingDaySchedule>) {
    setSaved(false);
    setDays((current) =>
      current.map((row) => (row.weekday === weekday ? { ...row, ...patch } : row)),
    );
  }

  function toggleWorking(weekday: number, working: boolean) {
    updateDay(weekday, working
      ? {
          regularDayOff: false,
          start: exempt ? undefined : 9 * 60,
          end: exempt ? undefined : 17 * 60,
          workLocation: "on_site",
        }
      : { regularDayOff: true, start: undefined, end: undefined, workLocation: undefined });
  }

  function startNew() {
    setEditingId(null);
    loadForm(undefined);
    setLabel("");
    setEffectiveStart(scheduleStart);
    setEffectiveEnd(scheduleEnd);
  }

  async function save() {
    const normalized = normalizeWorkingDays(days);
    const id = editingId ?? `workhours-${targetEmployeeId}-${Date.now()}`;
    const errors = [
      ...validateEffectiveDates(effectiveStart || undefined, effectiveEnd || undefined),
      ...validateWorkingDays(normalized, { exempt }),
    ];
    const overlap = overlappingPatterns(patterns, {
      id,
      effectiveStart: effectiveStart || undefined,
      effectiveEnd: effectiveEnd || undefined,
    });
    if (overlap) {
      errors.push(`These dates overlap "${overlap}". Give each saved schedule its own date range.`);
    }
    if (errors.length) {
      setSaveError(errors[0]);
      setSaved(false);
      return;
    }

    const pattern: WorkingHoursPattern = {
      id,
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
      setEditingId(id);
      setSaved(true);
    } catch (error) {
      setSaved(false);
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function remove(pattern: WorkingHoursPattern) {
    const name = pattern.label ? `"${pattern.label}"` : "this saved schedule";
    if (!window.confirm(`Remove ${name}? This cannot be undone.`)) return;
    setSaveError(null);
    try {
      await deleteWorkingHours(pattern.id);
      if (editingId === pattern.id) startNew();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
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
            ? `Set ${forSelf ? "your" : "their"} regular weekly schedule — check each day ${forSelf ? "you work" : "they work"} and mark on-site or remote. Exempt staff do not track specific start and end times.`
            : `Set ${forSelf ? "your" : "their"} regular weekly schedule — separate from desk coverage below. Check each working day, then enter start/end times and mark on-site or remote. Unchecked days are days off.`}
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

      {patterns.length > 0 && (
        <div className="wh-templates" aria-label="Saved schedules">
          <div className="wh-templates-head">
            <strong>Saved schedules</strong>
            <button type="button" className="button sm" onClick={startNew}>+ New schedule</button>
          </div>
          <ul className="list-reset stack" style={{ gap: "0.5rem" }}>
            {patterns.map((pattern) => {
              const isEditing = pattern.id === editingId;
              return (
                <li key={pattern.id} className={`wh-template-row${isEditing ? " is-editing" : ""}`}>
                  <div>
                    <div className="wh-template-title">
                      {pattern.label || "Untitled schedule"}
                      {isEditing && <span className="badge info">Editing</span>}
                    </div>
                    <div className="muted" style={{ fontSize: "0.82rem" }}>
                      {patternDateRange(pattern)} · {patternSummary(pattern)}
                    </div>
                  </div>
                  <div className="row" style={{ flexShrink: 0, gap: "0.35rem" }}>
                    <button
                      type="button"
                      className="button sm"
                      disabled={isEditing}
                      onClick={() => { setEditingId(pattern.id); loadForm(pattern); }}
                    >
                      Edit
                    </button>
                    <button type="button" className="button sm danger" onClick={() => void remove(pattern)}>
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <h3 style={{ marginBottom: "0.5rem" }}>
        {editingId ? "Edit schedule" : patterns.length > 0 ? "New schedule" : "Schedule"}
      </h3>

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
              <th scope="col">Working</th>
              {!exempt && (
                <>
                  <th scope="col">Start</th>
                  <th scope="col">End</th>
                </>
              )}
              <th scope="col">Location</th>
            </tr>
          </thead>
          <tbody>
            {WORKING_WEEKDAYS.map(({ weekday, label: dayLabel }) => {
              const row = days.find((d) => d.weekday === weekday) ?? { weekday, regularDayOff: true };
              const working = !row.regularDayOff;
              return (
                <tr key={weekday}>
                  <th scope="row">{dayLabel}</th>
                  <td>
                    <label className="row" style={{ justifyContent: "flex-start", gap: "0.45rem" }}>
                      <input
                        type="checkbox"
                        checked={working}
                        onChange={(e) => toggleWorking(weekday, e.target.checked)}
                        aria-label={`${dayLabel} working`}
                      />
                      {working ? "Working" : "Day off"}
                    </label>
                  </td>
                  {!exempt && (
                    <>
                      <td>
                        {working ? (
                          <input
                            type="time"
                            value={minutesToTimeInput(row.start)}
                            onChange={(e) => {
                              try {
                                updateDay(weekday, { start: parseTime(e.target.value) });
                              } catch { /* ignore invalid partial input */ }
                            }}
                            aria-label={`${dayLabel} start time`}
                          />
                        ) : (
                          <span className="muted" aria-hidden>—</span>
                        )}
                      </td>
                      <td>
                        {working ? (
                          <input
                            type="time"
                            value={minutesToTimeInput(row.end)}
                            onChange={(e) => {
                              try {
                                updateDay(weekday, { end: parseTime(e.target.value) });
                              } catch { /* ignore invalid partial input */ }
                            }}
                            aria-label={`${dayLabel} end time`}
                          />
                        ) : (
                          <span className="muted" aria-hidden>—</span>
                        )}
                      </td>
                    </>
                  )}
                  <td>
                    {working ? (
                      <select
                        value={row.workLocation ?? "on_site"}
                        onChange={(e) => updateDay(weekday, { workLocation: e.target.value as WorkLocation })}
                        aria-label={`${dayLabel} work location`}
                      >
                        {(Object.keys(LOCATION_LABEL) as WorkLocation[]).map((loc) => (
                          <option key={loc} value={loc}>{LOCATION_LABEL[loc]}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="muted" aria-hidden>—</span>
                    )}
                  </td>
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

      <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
        <button className="button primary" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : editingId ? "Save schedule" : "Save new schedule"}
        </button>
        {editingId && patterns.length > 0 && (
          <button type="button" className="button" onClick={startNew} disabled={saving}>
            Add another schedule
          </button>
        )}
        {saved && <span role="status" className="badge ok">Saved</span>}
        {saveError && <span role="alert" className="badge err">{saveError}</span>}
      </div>
    </section>
  );
}
