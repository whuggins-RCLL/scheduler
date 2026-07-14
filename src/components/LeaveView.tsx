"use client";

import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { humanDate } from "@/lib/ui";
import type { LeaveRecord } from "@/domain/types";

/**
 * Manager leave console: approve/deny pending requests and record leave —
 * including manager-only types such as Sick — on an employee's behalf. Every
 * manager-entered change is attributed in the audit log. Employees manage
 * their own unavailable exceptions on the Availability page.
 */
export function LeaveView() {
  const { db, currentUser, submitLeave, decideLeave } = useStore();
  const manager = canManage(currentUser);

  const [employeeId, setEmployeeId] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState(db.leaveTypes[0]?.id ?? "");
  const [startDate, setStartDate] = useState(db.schedules[0]?.startDate ?? "");
  const [endDate, setEndDate] = useState(db.schedules[0]?.startDate ?? "");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState("");

  const empName = (id: string) => db.employees.find((e) => e.id === id)?.preferredName ?? db.employees.find((e) => e.id === id)?.legalName ?? id;
  const typeName = (id: string) => db.leaveTypes.find((t) => t.id === id)?.name ?? id;
  const staff = db.employees.filter((e) => e.active && e.id !== currentUser.id);
  const pending = db.leave.filter((l) => l.status === "requested");

  if (!manager) {
    const mine = db.leave.filter((l) => l.employeeId === currentUser.id);
    return (
      <div className="stack">
        <div className="page-head">
          <h1>Leave</h1>
          <p className="muted">Availability exceptions are recorded on the Availability &amp; Exceptions page. Sick leave is recorded by your manager.</p>
        </div>
        <Link href="/availability" className="button primary" style={{ justifySelf: "start" }}>Go to Availability &amp; Exceptions</Link>
        <section className="card">
          <h2>My leave</h2>
          {mine.length === 0 ? <p className="muted">No leave on file.</p> : (
            <ul className="list-reset stack" style={{ gap: "0.5rem" }}>
              {mine.map((l) => (
                <li key={l.id} className="spread">
                  <span>{typeName(l.leaveTypeId)} · {humanDate(l.startDate)}{l.endDate !== l.startDate ? `–${humanDate(l.endDate)}` : ""}</span>
                  <span className={`badge ${l.status === "approved" || l.status === "recorded" ? "ok" : l.status === "denied" ? "err" : "warn"}`}>{l.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  function record(e: React.FormEvent) {
    e.preventDefault();
    const errs: string[] = [];
    if (!employeeId) errs.push("Choose an employee.");
    if (!startDate) errs.push("Start date is required.");
    if (!endDate) errs.push("End date is required.");
    if (startDate && endDate && endDate < startDate) errs.push("End date must be on or after the start date.");
    const type = db.leaveTypes.find((t) => t.id === leaveTypeId);
    if (type?.requiresNote && !note.trim()) errs.push("This leave type requires a note.");
    setErrors(errs);
    if (errs.length) return;

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
    setConfirmation(`${typeName(leaveTypeId)} recorded for ${empName(employeeId)}.`);
    setNote("");
    setErrors([]);
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Leave approvals</h1>
        <p className="muted">Approve requests and record leave (including sick) on an employee&apos;s behalf. All entries are audited.</p>
      </div>

      <section className="card">
        <h2>Pending approvals ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="muted">No requests awaiting a decision.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <caption className="muted" style={{ padding: "0.5rem", textAlign: "left" }}>Leave requests awaiting a manager decision.</caption>
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

      <section className="card">
        <h2>Record leave on behalf</h2>
        {errors.length > 0 && (
          <div className="error-summary" role="alert">
            <strong>Please fix:</strong>
            <ul>{errors.map((er) => <li key={er}>{er}</li>)}</ul>
          </div>
        )}
        <form className="form" onSubmit={record}>
          <div className="field">
            <label htmlFor="lv-emp">Employee</label>
            <select id="lv-emp" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Select an employee…</option>
              {staff.map((e) => <option key={e.id} value={e.id}>{e.preferredName ?? e.legalName}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="lv-type">Leave type</label>
            <select id="lv-type" value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)}>
              {db.leaveTypes.filter((t) => t.active).map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.employeeSelectable ? "" : " (manager only)"}</option>
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
            <button type="submit" className="button primary">Record</button>
            {confirmation && <span role="status" className="badge ok">{confirmation}</span>}
          </div>
        </form>
      </section>
    </div>
  );
}
