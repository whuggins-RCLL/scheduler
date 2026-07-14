"use client";

import { useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { humanDate } from "@/lib/ui";
import type { LeaveRecord } from "@/domain/types";

/**
 * Employee-facing time off & availability exceptions, shown alongside the
 * recurring availability editor so both live in one place. Employees can add
 * vacation, PTO, days off, appointments, etc. — but NOT manager-only types
 * such as Sick leave (those are recorded by a manager on the Leave approvals
 * screen).
 */
export function TimeOffPanel() {
  const { db, currentUser, submitLeave } = useStore();
  const selectableTypes = db.leaveTypes.filter((t) => t.active && t.employeeSelectable);
  const [leaveTypeId, setLeaveTypeId] = useState(selectableTypes[0]?.id ?? "");
  const [startDate, setStartDate] = useState(db.schedules[0]?.startDate ?? "");
  const [endDate, setEndDate] = useState(db.schedules[0]?.startDate ?? "");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState("");

  const typeName = (id: string) => db.leaveTypes.find((t) => t.id === id)?.name ?? id;
  const mine = db.leave
    .filter((l) => l.employeeId === currentUser.id && l.status !== "cancelled")
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: string[] = [];
    if (!leaveTypeId) errs.push("Choose a type.");
    if (!startDate) errs.push("Start date is required.");
    if (!endDate) errs.push("End date is required.");
    if (startDate && endDate && endDate < startDate) errs.push("End date must be on or after the start date.");
    const type = db.leaveTypes.find((t) => t.id === leaveTypeId);
    if (type && !type.employeeSelectable) errs.push(`${type.name} can only be recorded by a manager.`);
    if (type?.requiresNote && !note.trim()) errs.push("This type requires a note.");
    setErrors(errs);
    if (errs.length) return;

    const record: LeaveRecord = {
      id: `leave-${Date.now()}`,
      employeeId: currentUser.id,
      leaveTypeId,
      startDate,
      endDate,
      partialDay: false,
      status: "requested",
      note: note.trim() || undefined,
      enteredBy: currentUser.id,
      createdAt: "",
      updatedAt: "",
    };
    submitLeave(record);
    setConfirmation(`${typeName(leaveTypeId)} request submitted.`);
    setNote("");
    setErrors([]);
  }

  return (
    <section className="card" aria-labelledby="timeoff-heading">
      <h2 id="timeoff-heading">Time off &amp; exceptions</h2>
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        Request vacation, days off, or other exceptions to your recurring availability. Sick leave is
        recorded by your manager.
      </p>

      {errors.length > 0 && (
        <div className="error-summary" role="alert">
          <strong>Please fix:</strong>
          <ul>{errors.map((er) => <li key={er}>{er}</li>)}</ul>
        </div>
      )}

      <form className="form" onSubmit={submit} style={{ maxWidth: "none" }}>
        <div className="row">
          <div className="field" style={{ flex: "1 1 160px" }}>
            <label htmlFor="to-type">Type</label>
            <select id="to-type" value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)}>
              {selectableTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.approvalRequired ? " (needs approval)" : ""}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: "1 1 130px" }}>
            <label htmlFor="to-start">Start</label>
            <input id="to-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="field" style={{ flex: "1 1 130px" }}>
            <label htmlFor="to-end">End</label>
            <input id="to-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="to-note">Note (optional)</label>
          <input id="to-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="row">
          <button type="submit" className="button primary">Request time off</button>
          {confirmation && <span role="status" className="badge ok">{confirmation}</span>}
        </div>
      </form>

      <hr className="divider" />
      <h3>My time off</h3>
      {mine.length === 0 ? (
        <p className="muted">No time off on file.</p>
      ) : (
        <ul className="list-reset stack" style={{ gap: "0.5rem" }}>
          {mine.map((l) => (
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
