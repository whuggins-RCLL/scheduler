"use client";

import { useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { humanDate } from "@/lib/ui";
import { formatTime12, parseTime } from "@/domain/time";
import type { LeaveRecord } from "@/domain/types";

const UNAVAILABLE_TYPE_ID = "lt-unavailable";

/**
 * Employee-facing availability exceptions, shown alongside the recurring
 * availability editor so staff can flag dates or hours that differ from their
 * usual availability. This is not a time-off request flow; it only records a
 * generic unavailable exception for scheduling visibility.
 */
export function TimeOffPanel() {
  const { db, currentUser, submitLeave } = useStore();
  const unavailableType = db.leaveTypes.find((t) => t.id === UNAVAILABLE_TYPE_ID && t.active);
  const [startDate, setStartDate] = useState(db.schedules[0]?.startDate ?? "");
  const [endDate, setEndDate] = useState(db.schedules[0]?.startDate ?? "");
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState("");

  const mine = db.leave
    .filter((l) => l.employeeId === currentUser.id && l.status !== "cancelled")
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  function submit(e: React.FormEvent) {
    e.preventDefault();
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
      employeeId: currentUser.id,
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
    submitLeave(record);
    setConfirmation("Unavailable exception saved.");
    setErrors([]);
  }

  return (
    <section className="card" aria-labelledby="exceptions-heading">
      <h2 id="exceptions-heading">Exceptions</h2>
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        Mark dates or hours when you are unavailable outside your regular availability grid. This is not a
        time-off request; it only alerts scheduling AI and managers that these times are exceptions.
      </p>

      {errors.length > 0 && (
        <div className="error-summary" role="alert">
          <strong>Please fix:</strong>
          <ul>{errors.map((er) => <li key={er}>{er}</li>)}</ul>
        </div>
      )}

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
          <legend>When are you unavailable?</legend>
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

      <hr className="divider" />
      <h3>My exceptions</h3>
      {mine.length === 0 ? (
        <p className="muted">No exceptions on file.</p>
      ) : (
        <ul className="list-reset stack" style={{ gap: "0.5rem" }}>
          {mine.map((l) => (
            <li key={l.id} className="spread">
              <span>
                Unavailable · {humanDate(l.startDate)}
                {l.endDate !== l.startDate ? `–${humanDate(l.endDate)}` : ""}
                {l.partialDay && l.start != null && l.end != null ? ` · ${formatTime12(l.start)}–${formatTime12(l.end)}` : " · All day"}
              </span>
              <span className="badge ok">saved</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
