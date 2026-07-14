"use client";

import { useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { humanDate, timeRange } from "@/lib/ui";
import { parseTime } from "@/domain/time";
import type { LeaveRecord } from "@/domain/types";

const UNAVAILABLE_TYPE_ID = "lt-unavailable";

/**
 * Availability exceptions. These are NOT requests — they are recorded
 * immediately and simply flag that specific dates or hours deviate from the
 * employee's recurring availability grid, so the scheduling engine and the
 * manager know not to place work then. The only reason is a generic
 * "Unavailable"; employees choose all day or specific hours.
 *
 * Formal time off that needs a decision (vacation, PTO, floating holiday) is a
 * separate request below and routes to the manager's Leave approvals queue.
 */
export function TimeOffPanel() {
  const { db, currentUser, submitLeave, decideLeave } = useStore();
  const typeName = (id: string) => db.leaveTypes.find((t) => t.id === id)?.name ?? id;

  const mine = db.leave.filter((l) => l.employeeId === currentUser.id && l.status !== "cancelled");
  const exceptions = mine
    .filter((l) => l.leaveTypeId === UNAVAILABLE_TYPE_ID)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const requests = mine
    .filter((l) => l.leaveTypeId !== UNAVAILABLE_TYPE_ID)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  return (
    <div className="stack">
      <ExceptionsSection
        exceptions={exceptions}
        hasType={db.leaveTypes.some((t) => t.id === UNAVAILABLE_TYPE_ID)}
        onAdd={(rec) => submitLeave(rec)}
        onRemove={(id) => decideLeave(id, "cancelled")}
        currentUserId={currentUser.id}
      />
      <TimeOffRequestSection
        requests={requests}
        typeName={typeName}
        onSubmit={(rec) => submitLeave(rec)}
        currentUserId={currentUser.id}
        leaveTypes={db.leaveTypes.filter((t) => t.active && t.employeeSelectable && t.approvalRequired)}
        defaultDate={db.schedules[0]?.startDate ?? ""}
      />
    </div>
  );
}

function ExceptionsSection({
  exceptions,
  hasType,
  onAdd,
  onRemove,
  currentUserId,
}: {
  exceptions: LeaveRecord[];
  hasType: boolean;
  onAdd: (rec: LeaveRecord) => void;
  onRemove: (id: string) => void;
  currentUserId: string;
}) {
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [allDay, setAllDay] = useState(true);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("12:00");
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState("");

  function add(e: React.FormEvent) {
    e.preventDefault();
    const errs: string[] = [];
    if (!date) errs.push("Pick a date.");
    if (allDay && endDate && endDate < date) errs.push("End date must be on or after the start date.");
    if (!allDay && parseTime(end) <= parseTime(start)) errs.push("End time must be after the start time.");
    setErrors(errs);
    if (errs.length) return;

    const rec: LeaveRecord = {
      id: `exc-${Date.now()}`,
      employeeId: currentUserId,
      leaveTypeId: UNAVAILABLE_TYPE_ID,
      startDate: date,
      endDate: allDay ? endDate || date : date,
      partialDay: !allDay,
      start: allDay ? undefined : parseTime(start),
      end: allDay ? undefined : parseTime(end),
      status: "recorded",
      note: undefined,
      enteredBy: currentUserId,
      createdAt: "",
      updatedAt: "",
    };
    onAdd(rec);
    setConfirmation(allDay ? "All-day exception added." : "Hourly exception added.");
    setDate("");
    setEndDate("");
    setErrors([]);
  }

  return (
    <section className="card" aria-labelledby="exceptions-heading">
      <h2 id="exceptions-heading">Exceptions</h2>
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        Mark specific dates or hours when you&apos;re <strong>unavailable</strong> — one-off deviations
        from your recurring availability above. This isn&apos;t a request; it just alerts the scheduler
        and your manager not to place you at those times.
      </p>

      {!hasType ? (
        <div className="empty-state">Exceptions are unavailable until an admin configures the leave types.</div>
      ) : (
        <>
          {errors.length > 0 && (
            <div className="error-summary" role="alert">
              <strong>Please fix:</strong>
              <ul>{errors.map((er) => <li key={er}>{er}</li>)}</ul>
            </div>
          )}
          <form className="form" onSubmit={add} style={{ maxWidth: "none" }}>
            <div className="row" style={{ alignItems: "flex-end" }}>
              <div className="field" style={{ flex: "1 1 150px" }}>
                <label htmlFor="exc-date">Date</label>
                <input id="exc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              {allDay && (
                <div className="field" style={{ flex: "1 1 150px" }}>
                  <label htmlFor="exc-enddate">Through (optional)</label>
                  <input id="exc-enddate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              )}
            </div>

            <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
              <legend style={{ fontWeight: 600, fontSize: "0.88rem" }}>When</legend>
              <div className="row">
                <label className="row" style={{ gap: "0.4rem" }}>
                  <input type="radio" name="exc-scope" style={{ width: "auto", minHeight: 0 }} checked={allDay} onChange={() => setAllDay(true)} />
                  All day
                </label>
                <label className="row" style={{ gap: "0.4rem" }}>
                  <input type="radio" name="exc-scope" style={{ width: "auto", minHeight: 0 }} checked={!allDay} onChange={() => setAllDay(false)} />
                  Specific hours
                </label>
              </div>
            </fieldset>

            {!allDay && (
              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="exc-start">Start</label>
                  <input id="exc-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="exc-end">End</label>
                  <input id="exc-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
                </div>
              </div>
            )}

            <div className="row">
              <button type="submit" className="button primary">Add exception</button>
              {confirmation && <span role="status" className="badge ok">{confirmation}</span>}
            </div>
          </form>

          <hr className="divider" />
          <h3>My exceptions</h3>
          {exceptions.length === 0 ? (
            <p className="muted">No exceptions on file — your recurring availability applies.</p>
          ) : (
            <ul className="list-reset stack" style={{ gap: "0.5rem" }}>
              {exceptions.map((l) => (
                <li key={l.id} className="spread">
                  <span>
                    <span className="badge">Unavailable</span>{" "}
                    {humanDate(l.startDate)}
                    {l.partialDay && l.start != null && l.end != null
                      ? ` · ${timeRange(l.start, l.end)}`
                      : l.endDate !== l.startDate
                        ? `–${humanDate(l.endDate)} · all day`
                        : " · all day"}
                  </span>
                  <button className="button sm" onClick={() => onRemove(l.id)} aria-label={`Remove exception on ${humanDate(l.startDate)}`}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function TimeOffRequestSection({
  requests,
  typeName,
  onSubmit,
  currentUserId,
  leaveTypes,
  defaultDate,
}: {
  requests: LeaveRecord[];
  typeName: (id: string) => string;
  onSubmit: (rec: LeaveRecord) => void;
  currentUserId: string;
  leaveTypes: { id: string; name: string }[];
  defaultDate: string;
}) {
  const [leaveTypeId, setLeaveTypeId] = useState(leaveTypes[0]?.id ?? "");
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState("");

  if (leaveTypes.length === 0) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: string[] = [];
    if (!leaveTypeId) errs.push("Choose a type.");
    if (!startDate) errs.push("Start date is required.");
    if (!endDate) errs.push("End date is required.");
    if (startDate && endDate && endDate < startDate) errs.push("End date must be on or after the start date.");
    setErrors(errs);
    if (errs.length) return;

    onSubmit({
      id: `leave-${Date.now()}`,
      employeeId: currentUserId,
      leaveTypeId,
      startDate,
      endDate,
      partialDay: false,
      status: "requested",
      note: note.trim() || undefined,
      enteredBy: currentUserId,
      createdAt: "",
      updatedAt: "",
    });
    setConfirmation(`${typeName(leaveTypeId)} request submitted for approval.`);
    setNote("");
    setErrors([]);
  }

  return (
    <section className="card" aria-labelledby="request-heading">
      <h2 id="request-heading">Request time off</h2>
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        Vacation and similar paid time off need manager approval. Sick leave is recorded by your manager.
      </p>
      {errors.length > 0 && (
        <div className="error-summary" role="alert">
          <strong>Please fix:</strong>
          <ul>{errors.map((er) => <li key={er}>{er}</li>)}</ul>
        </div>
      )}
      <form className="form" onSubmit={submit} style={{ maxWidth: "none" }}>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ flex: "1 1 160px" }}>
            <label htmlFor="req-type">Type</label>
            <select id="req-type" value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)}>
              {leaveTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: "1 1 130px" }}>
            <label htmlFor="req-start">Start</label>
            <input id="req-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="field" style={{ flex: "1 1 130px" }}>
            <label htmlFor="req-end">End</label>
            <input id="req-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="req-note">Note (optional)</label>
          <input id="req-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="row">
          <button type="submit" className="button primary">Submit request</button>
          {confirmation && <span role="status" className="badge ok">{confirmation}</span>}
        </div>
      </form>

      <hr className="divider" />
      <h3>My requests</h3>
      {requests.length === 0 ? (
        <p className="muted">No time-off requests on file.</p>
      ) : (
        <ul className="list-reset stack" style={{ gap: "0.5rem" }}>
          {requests.map((l) => (
            <li key={l.id} className="spread">
              <span>
                {typeName(l.leaveTypeId)} · {humanDate(l.startDate)}
                {l.endDate !== l.startDate ? `–${humanDate(l.endDate)}` : ""}
              </span>
              <span className={`badge ${l.status === "approved" || l.status === "recorded" ? "ok" : l.status === "denied" ? "err" : "warn"}`}>
                {l.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
