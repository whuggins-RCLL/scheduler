"use client";

import { useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { humanDate } from "@/lib/ui";
import type { LeaveRecord } from "@/domain/types";

export function LeaveView() {
  const { db, currentUser, submitLeave, decideLeave } = useStore();
  const manager = canManage(currentUser);
  const [onBehalf, setOnBehalf] = useState(currentUser.id);
  const [leaveTypeId, setLeaveTypeId] = useState(db.leaveTypes[0]?.id ?? "");
  const [startDate, setStartDate] = useState(db.schedules[0]?.startDate ?? "");
  const [endDate, setEndDate] = useState(db.schedules[0]?.startDate ?? "");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState("");

  const empName = (id: string) => db.employees.find((e) => e.id === id)?.preferredName ?? id;
  const typeName = (id: string) => db.leaveTypes.find((t) => t.id === id)?.name ?? id;

  const myLeave = db.leave.filter((l) => l.employeeId === currentUser.id);
  const pending = db.leave.filter((l) => l.status === "requested");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: string[] = [];
    if (!startDate) errs.push("Start date is required.");
    if (!endDate) errs.push("End date is required.");
    if (startDate && endDate && endDate < startDate) errs.push("End date must be on or after the start date.");
    const type = db.leaveTypes.find((t) => t.id === leaveTypeId);
    if (type?.requiresNote && !note.trim()) errs.push("This leave type requires a note.");
    setErrors(errs);
    if (errs.length) return;

    const employeeId = manager ? onBehalf : currentUser.id;
    const record: LeaveRecord = {
      id: `leave-${Date.now()}`,
      employeeId,
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
    const behalf = manager && employeeId !== currentUser.id ? ` on behalf of ${empName(employeeId)}` : "";
    setConfirmation(`${typeName(leaveTypeId)} leave submitted${behalf}.`);
    setNote("");
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Leave &amp; time off</h1>
        <p className="muted">Submit requests and, if you manage staff, record or approve leave on their behalf.</p>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>{manager ? "Record / request leave" : "Request leave"}</h2>
          {errors.length > 0 && (
            <div className="error-summary" role="alert">
              <strong>Please fix the following:</strong>
              <ul>{errors.map((er) => <li key={er}>{er}</li>)}</ul>
            </div>
          )}
          <form className="form" onSubmit={submit}>
            {manager && (
              <div className="field">
                <label htmlFor="lv-emp">Employee</label>
                <select id="lv-emp" value={onBehalf} onChange={(e) => setOnBehalf(e.target.value)}>
                  {db.employees.filter((e) => e.active).map((e) => (
                    <option key={e.id} value={e.id}>{e.preferredName ?? e.legalName}</option>
                  ))}
                </select>
                <span className="hint">Manager-entered leave is recorded in the audit log with attribution.</span>
              </div>
            )}
            <div className="field">
              <label htmlFor="lv-type">Leave type</label>
              <select id="lv-type" value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)}>
                {db.leaveTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.approvalRequired ? " (approval required)" : ""}</option>
                ))}
              </select>
            </div>
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="lv-start">Start date</label>
                <input id="lv-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="lv-end">End date</label>
                <input id="lv-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="lv-note">Note</label>
              <textarea id="lv-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="row">
              <button type="submit" className="button primary">Submit</button>
              {confirmation && <span role="status" className="badge ok">{confirmation}</span>}
            </div>
          </form>
        </section>

        <section className="card">
          <h2>My leave</h2>
          {myLeave.length === 0 ? (
            <p className="muted">No leave on file.</p>
          ) : (
            <ul className="list-reset stack" style={{ gap: "0.5rem" }}>
              {myLeave.map((l) => (
                <li key={l.id} className="spread">
                  <span>{typeName(l.leaveTypeId)} · {humanDate(l.startDate)}{l.endDate !== l.startDate ? `–${humanDate(l.endDate)}` : ""}</span>
                  <span className={`badge ${l.status === "approved" || l.status === "recorded" ? "ok" : l.status === "denied" ? "err" : "warn"}`}>{l.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {manager && (
        <section className="card">
          <h2>Pending approvals</h2>
          {pending.length === 0 ? (
            <p className="muted">No requests awaiting a decision.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th scope="col">Employee</th><th scope="col">Type</th><th scope="col">Dates</th><th scope="col">Note</th><th scope="col">Action</th></tr>
                </thead>
                <tbody>
                  {pending.map((l) => (
                    <tr key={l.id}>
                      <td>{empName(l.employeeId)}</td>
                      <td>{typeName(l.leaveTypeId)}</td>
                      <td>{humanDate(l.startDate)}{l.endDate !== l.startDate ? `–${humanDate(l.endDate)}` : ""}</td>
                      <td className="muted">{l.note ?? "—"}</td>
                      <td>
                        <div className="row">
                          <button className="button sm primary" onClick={() => decideLeave(l.id, "approved")}>Approve</button>
                          <button className="button sm" onClick={() => decideLeave(l.id, "denied")}>Deny</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
