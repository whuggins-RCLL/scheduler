"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage, canSubmitAvailabilityException, isStudentWorker } from "@/domain/scope";
import { resolveEmployeeProfile } from "@/domain/employee-profile";
import {
  globalLeaveRecordsForEmployee,
  personalLeaveRecordsForEmployee,
} from "@/domain/global-exceptions";
import { humanDate } from "@/lib/ui";
import { formatTime12, parseTime } from "@/domain/time";
import type { LeaveRecord } from "@/domain/types";
import { HOLIDAY_LEAVE_TYPE_ID } from "@/domain/global-exceptions";

const UNAVAILABLE_TYPE_ID = "lt-unavailable";

function ExceptionRow({
  record,
  readOnly,
}: {
  record: LeaveRecord;
  readOnly: boolean;
}) {
  const label = readOnly ? (record.note ?? "University holiday") : "Unavailable";
  return (
    <li className="spread">
      <span>
        {label} · {humanDate(record.startDate)}
        {record.endDate !== record.startDate ? `–${humanDate(record.endDate)}` : ""}
        {record.partialDay && record.start != null && record.end != null
          ? ` · ${formatTime12(record.start)}–${formatTime12(record.end)}`
          : " · All day"}
      </span>
      <span className={`badge ${readOnly ? "info" : "ok"}`}>
        {readOnly ? "University-wide" : "saved"}
      </span>
    </li>
  );
}

export function TimeOffPanel() {
  const { db, currentUser, viewAs, submitLeave } = useStore();
  const manager = canManage(currentUser) && viewAs === "self";
  const selfProfile = resolveEmployeeProfile(db.employees, currentUser, viewAs);
  const [targetEmployeeId, setTargetEmployeeId] = useState(currentUser.id);
  const targetEmployee = db.employees.find((e) => e.id === targetEmployeeId)
    ?? (targetEmployeeId === currentUser.id ? selfProfile : undefined);
  const unavailableType = db.leaveTypes.find((t) => t.id === UNAVAILABLE_TYPE_ID && t.active);
  const [startDate, setStartDate] = useState(db.schedules[0]?.startDate ?? "");
  const [endDate, setEndDate] = useState(db.schedules[0]?.startDate ?? "");
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    setTargetEmployeeId(currentUser.id);
  }, [currentUser.id]);

  const forSelf = targetEmployeeId === currentUser.id;
  const isStudent = targetEmployee ? isStudentWorker(targetEmployee.classification) : false;
  const onBehalf = manager && !forSelf;
  const canSubmit = targetEmployee
    ? canSubmitAvailabilityException(currentUser, targetEmployee, { onBehalf })
    : false;
  const studentViewOnly = isStudent && forSelf;

  const universityWide = globalLeaveRecordsForEmployee(db, targetEmployeeId);
  const personal = personalLeaveRecordsForEmployee(db, targetEmployeeId);

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
      employeeId: targetEmployeeId,
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
      <h2 id="exceptions-heading">{forSelf ? "Exceptions" : `${targetEmployee?.preferredName ?? targetEmployee?.legalName ?? "Employee"} exceptions`}</h2>
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        {studentViewOnly
          ? "Dates when you are unavailable outside your sign-up grid. Only managers can record exceptions on your behalf."
          : "Mark dates or hours when someone is unavailable outside their regular availability."}
      </p>

      {errors.length > 0 && (
        <div className="error-summary" role="alert">
          <strong>Please fix:</strong>
          <ul>{errors.map((er) => <li key={er}>{er}</li>)}</ul>
        </div>
      )}

      {manager && (
        <div className="field" style={{ maxWidth: 420, marginBottom: "1rem" }}>
          <label htmlFor="exception-employee">Employee</label>
          <select id="exception-employee" value={targetEmployeeId} onChange={(e) => setTargetEmployeeId(e.target.value)}>
            {db.employees.filter((e) => e.active).map((e) => <option key={e.id} value={e.id}>{e.preferredName ?? e.legalName}</option>)}
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
        <p className="muted">You cannot submit exceptions for this employee.</p>
      )}

      <hr className="divider" />
      <h3>University-wide exceptions</h3>
      <p className="muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
        Posted automatically for every employee from Admin → Global exceptions. These cannot be edited here.
      </p>
      {universityWide.length === 0 ? (
        <p className="muted">No university-wide exceptions on file.</p>
      ) : (
        <ul className="list-reset stack" style={{ gap: "0.5rem" }}>
          {universityWide.map((record) => (
            <ExceptionRow key={record.id} record={record} readOnly />
          ))}
        </ul>
      )}

      <hr className="divider" />
      <h3>{forSelf ? "My exceptions" : "Personal exceptions"}</h3>
      {personal.length === 0 ? (
        <p className="muted">No personal exceptions on file.</p>
      ) : (
        <ul className="list-reset stack" style={{ gap: "0.5rem" }}>
          {personal.map((record) => (
            <ExceptionRow key={record.id} record={record} readOnly={false} />
          ))}
        </ul>
      )}
    </section>
  );
}
