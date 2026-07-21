"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage, canSubmitAvailabilityException, isStudentWorker } from "@/domain/scope";
import { resolveEmployeeProfile } from "@/domain/employee-profile";
import {
  isGlobalSyncedLeave,
  visibleLeaveRecordsForEmployee,
  type ExceptionSortOrder,
} from "@/domain/global-exceptions";
import { humanDateRange } from "@/lib/ui";
import { formatTime12, parseTime } from "@/domain/time";
import type { LeaveRecord } from "@/domain/types";
import { HOLIDAY_LEAVE_TYPE_ID } from "@/domain/global-exceptions";

const UNAVAILABLE_TYPE_ID = "lt-unavailable";

type ScopeFilter = "all" | "university" | "personal";

function accountLabel(
  db: ReturnType<typeof useStore>["db"],
  accountId: string,
): string {
  const employee = db.employees.find((e) => e.id === accountId);
  if (employee?.preferredName || employee?.legalName) {
    return employee.preferredName ?? employee.legalName;
  }
  const user = db.users.find((u) => u.id === accountId);
  return user?.displayName ?? accountId;
}

export function TimeOffPanel() {
  const { db, currentUser, viewAs, submitLeave } = useStore();
  const manager = canManage(currentUser) && viewAs === "self";
  const selfProfile = resolveEmployeeProfile(db.employees, currentUser, viewAs);
  const [targetAccountId, setTargetAccountId] = useState(currentUser.id);
  const targetEmployee = db.employees.find((e) => e.id === targetAccountId)
    ?? (targetAccountId === currentUser.id ? selfProfile : undefined);
  const unavailableType = db.leaveTypes.find((t) => t.id === UNAVAILABLE_TYPE_ID && t.active);
  const [startDate, setStartDate] = useState(db.schedules[0]?.startDate ?? "");
  const [endDate, setEndDate] = useState(db.schedules[0]?.startDate ?? "");
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState("");
  const [sortOrder, setSortOrder] = useState<ExceptionSortOrder>("asc");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");

  useEffect(() => {
    setTargetAccountId(currentUser.id);
  }, [currentUser.id]);

  const forSelf = targetAccountId === currentUser.id;
  const isStudent = targetEmployee ? isStudentWorker(targetEmployee.classification) : false;
  const onBehalf = manager && !forSelf;
  const canSubmit = targetEmployee
    ? canSubmitAvailabilityException(currentUser, targetEmployee, { onBehalf })
    : false;
  const studentViewOnly = isStudent && forSelf;

  const today = new Date().toISOString().slice(0, 10);
  // Interfiled (holidays + personal), already-passed entries dropped, sorted by date.
  const visibleExceptions = visibleLeaveRecordsForEmployee(db, targetAccountId, {
    asOf: today,
    order: sortOrder,
  });
  const exceptions = visibleExceptions.filter((record) => {
    if (scopeFilter === "university") return isGlobalSyncedLeave(record);
    if (scopeFilter === "personal") return !isGlobalSyncedLeave(record);
    return true;
  });

  const activeAccounts = db.users
    .filter((u) => u.state === "active")
    .sort((a, b) => accountLabel(db, a.id).localeCompare(accountLabel(db, b.id)));

  function leaveLabel(record: LeaveRecord): string {
    if (record.globalExceptionId || record.leaveTypeId === HOLIDAY_LEAVE_TYPE_ID) {
      return record.note ?? "University holiday";
    }
    return "Unavailable";
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !targetEmployee) return;
    const errs: string[] = [];
    let parsedStart: number | undefined;
    let parsedEnd: number | undefined;

    if (!unavailableType) errs.push("Unavailable exceptions are not configured.");
    if (!startDate) errs.push("Start date is required.");
    if (!endDate) errs.push("End date is required.");
    if (startDate && endDate && endDate < startDate) errs.push("End date must be on or after the start date.");

    if (!allDay) {
      try {
        parsedStart = parseTime(startTime);
        parsedEnd = parseTime(endTime);
        if (parsedEnd <= parsedStart) errs.push("End time must be after the start time.");
      } catch {
        errs.push("Enter valid start and end times.");
      }
    }

    setErrors(errs);
    if (errs.length || !unavailableType) return;

    const record: LeaveRecord = {
      id: `leave-${Date.now()}`,
      employeeId: targetAccountId,
      leaveTypeId: unavailableType.id,
      startDate,
      endDate,
      partialDay: !allDay,
      start: allDay ? undefined : parsedStart,
      end: allDay ? undefined : parsedEnd,
      status: "recorded",
      enteredBy: currentUser.id,
      createdAt: "",
      updatedAt: "",
    };
    try {
      submitLeave(record, { onBehalf });
      setConfirmation(onBehalf ? "Employee unavailable exception saved." : "Unavailable exception saved.");
      setErrors([]);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
    }
  }

  return (
    <section className="card" aria-labelledby="exceptions-heading">
      <h2 id="exceptions-heading">
        {forSelf ? "Exceptions" : `${accountLabel(db, targetAccountId)} exceptions`}
      </h2>
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        {studentViewOnly
          ? "University holidays appear automatically. Personal exceptions outside your sign-up grid are recorded by your manager."
          : "University holidays are posted for everyone automatically. Add personal unavailable dates below."}
      </p>

      {errors.length > 0 && (
        <div className="error-summary" role="alert">
          <strong>Please fix:</strong>
          <ul>{errors.map((er) => <li key={er}>{er}</li>)}</ul>
        </div>
      )}

      {manager && (
        <div className="field" style={{ maxWidth: 420, marginBottom: "1rem" }}>
          <label htmlFor="exception-employee">Person</label>
          <select id="exception-employee" value={targetAccountId} onChange={(e) => setTargetAccountId(e.target.value)}>
            {activeAccounts.map((u) => (
              <option key={u.id} value={u.id}>{accountLabel(db, u.id)}</option>
            ))}
          </select>
        </div>
      )}

      {canSubmit ? (
        <form className="form" onSubmit={submit} style={{ maxWidth: "none" }}>
          <div className="row">
            <div className="field" style={{ flex: "1 1 130px" }}>
              <label htmlFor="ex-start">Start</label>
              <input id="ex-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="field" style={{ flex: "1 1 130px" }}>
              <label htmlFor="ex-end">End</label>
              <input id="ex-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <fieldset className="field">
            <legend>Duration</legend>
            <label className="row" style={{ justifyContent: "flex-start" }}>
              <input type="radio" name="exception-duration" checked={allDay} onChange={() => setAllDay(true)} />
              All day
            </label>
            <label className="row" style={{ justifyContent: "flex-start" }}>
              <input type="radio" name="exception-duration" checked={!allDay} onChange={() => setAllDay(false)} />
              Certain hours
            </label>
          </fieldset>
          {!allDay && (
            <div className="row">
              <div className="field" style={{ flex: "1 1 130px" }}>
                <label htmlFor="ex-start-time">Start time</label>
                <input id="ex-start-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div className="field" style={{ flex: "1 1 130px" }}>
                <label htmlFor="ex-end-time">End time</label>
                <input id="ex-end-time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
          )}
          <div className="row">
            <button type="submit" className="button primary">Save exception</button>
            {confirmation && <span role="status" className="badge ok">{confirmation}</span>}
          </div>
        </form>
      ) : studentViewOnly ? null : (
        <p className="muted">You cannot submit personal exceptions for this person.</p>
      )}

      <hr className="divider" />
      <div className="spread" style={{ flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>{forSelf ? "My exceptions" : "Exceptions list"}</h3>
        <div className="pill-toggle" role="group" aria-label="Filter exceptions by scope">
          {([
            { value: "all", label: "All" },
            { value: "university", label: "University" },
            { value: "personal", label: "Personal" },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={scopeFilter === opt.value}
              onClick={() => setScopeFilter(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <p className="hint" style={{ margin: "0.4rem 0 0" }}>
        University holidays and personal exceptions are combined by date. Past exceptions drop off automatically.
      </p>

      {exceptions.length === 0 ? (
        <p className="muted mt">
          {scopeFilter === "all"
            ? "No current or upcoming exceptions."
            : `No current or upcoming ${scopeFilter === "university" ? "university-wide" : "personal"} exceptions.`}
        </p>
      ) : (
        <div className="table-wrap mt">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Exception</th>
                <th scope="col" aria-sort={sortOrder === "asc" ? "ascending" : "descending"}>
                  <button
                    type="button"
                    className="th-sort"
                    onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
                    aria-label={`Date, sorted ${sortOrder === "asc" ? "closest first" : "furthest first"}. Click to reverse.`}
                  >
                    Date <span aria-hidden>{sortOrder === "asc" ? "↑" : "↓"}</span>
                  </button>
                </th>
                <th scope="col">Hours</th>
                <th scope="col">Scope</th>
              </tr>
            </thead>
            <tbody>
              {exceptions.map((record) => {
                const global = isGlobalSyncedLeave(record);
                return (
                  <tr key={record.id}>
                    <td>{leaveLabel(record)}</td>
                    <td>{humanDateRange(record.startDate, record.endDate)}</td>
                    <td>
                      {record.partialDay && record.start != null && record.end != null
                        ? `${formatTime12(record.start)}–${formatTime12(record.end)}`
                        : "All day"}
                    </td>
                    <td>
                      <span className={`badge ${global ? "info" : "ok"}`}>
                        {global ? "University-wide" : "Personal"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
