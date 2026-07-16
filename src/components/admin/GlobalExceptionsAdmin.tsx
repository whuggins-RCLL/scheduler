"use client";

import { useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { humanDateRange } from "@/lib/ui";
import { UNIVERSITY_HOLIDAY_SCHEDULE_URL } from "@/lib/config";
import type { GlobalException } from "@/domain/types";

const EMPTY_FORM = { name: "", startDate: "", endDate: "", note: "" };

export function GlobalExceptionsAdmin() {
  const { db, currentUser, upsertGlobalException, deleteGlobalException } = useStore();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  if (!canManage(currentUser)) {
    return <div className="empty-state">You do not have access to this section.</div>;
  }

  const sorted = [...db.globalExceptions].sort((a, b) => a.startDate.localeCompare(b.startDate));

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setErrors([]);
    setSaved(false);
  }

  function startEdit(exception: GlobalException) {
    setEditingId(exception.id);
    setForm({
      name: exception.name,
      startDate: exception.startDate,
      endDate: exception.endDate,
      note: exception.note ?? "",
    });
    setErrors([]);
    setSaved(false);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const errs: string[] = [];
    if (!form.name.trim()) errs.push("Name is required.");
    if (!form.startDate) errs.push("Start date is required.");
    if (!form.endDate) errs.push("End date is required.");
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      errs.push("End date must be on or after the start date.");
    }
    setErrors(errs);
    if (errs.length) return;

    const id = editingId ?? `ge-${Date.now()}`;
    upsertGlobalException({
      id,
      name: form.name.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      note: form.note.trim() || undefined,
      createdBy: currentUser.id,
      createdAt: "",
      updatedAt: "",
    });
    resetForm();
    setSaved(true);
  }

  function remove(id: string) {
    if (!window.confirm("Remove this global exception from every employee's availability?")) return;
    deleteGlobalException(id);
    if (editingId === id) resetForm();
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Global exceptions</h1>
        <p className="muted">
          Organization-wide holidays and closures. Each entry is posted automatically as an all-day
          exception on every active employee&apos;s Availability &amp; Exceptions page.
        </p>
        <p className="muted" style={{ fontSize: "0.9rem" }}>
          Official Stanford holiday schedule:{" "}
          <a href={UNIVERSITY_HOLIDAY_SCHEDULE_URL} target="_blank" rel="noopener noreferrer">
            University Holiday Schedule (Cardinal at Work) ↗
          </a>
        </p>
      </div>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>{editingId ? "Edit exception" : "Add exception"}</h2>
        {errors.length > 0 && (
          <div className="error-summary" role="alert">
            <strong>Please fix:</strong>
            <ul>{errors.map((er) => <li key={er}>{er}</li>)}</ul>
          </div>
        )}
        <form className="form" onSubmit={save} style={{ maxWidth: "none" }}>
          <div className="field" style={{ maxWidth: 480 }}>
            <label htmlFor="ge-name">Name</label>
            <input
              id="ge-name"
              type="text"
              value={form.name}
              onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setSaved(false); }}
              placeholder="e.g. Memorial Day"
            />
          </div>
          <div className="row">
            <div className="field" style={{ flex: "1 1 160px" }}>
              <label htmlFor="ge-start">Start date</label>
              <input
                id="ge-start"
                type="date"
                value={form.startDate}
                onChange={(e) => { setForm((f) => ({ ...f, startDate: e.target.value })); setSaved(false); }}
              />
            </div>
            <div className="field" style={{ flex: "1 1 160px" }}>
              <label htmlFor="ge-end">End date</label>
              <input
                id="ge-end"
                type="date"
                value={form.endDate}
                onChange={(e) => { setForm((f) => ({ ...f, endDate: e.target.value })); setSaved(false); }}
              />
            </div>
          </div>
          <div className="field" style={{ maxWidth: 480 }}>
            <label htmlFor="ge-note">Note (optional)</label>
            <input
              id="ge-note"
              type="text"
              value={form.note}
              onChange={(e) => { setForm((f) => ({ ...f, note: e.target.value })); setSaved(false); }}
              placeholder="Internal note"
            />
          </div>
          <div className="row">
            <button type="submit" className="button primary">{editingId ? "Save changes" : "Add exception"}</button>
            {editingId && (
              <button type="button" className="button" onClick={resetForm}>Cancel edit</button>
            )}
            {saved && <span role="status" className="badge ok">Saved — synced to all employees</span>}
          </div>
        </form>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Scheduled exceptions ({sorted.length})</h2>
        {sorted.length === 0 ? (
          <p className="muted">No global exceptions configured.</p>
        ) : (
          <ul className="list-reset stack" style={{ gap: "0.65rem" }}>
            {sorted.map((exception) => (
              <li key={exception.id} className="spread" style={{ alignItems: "flex-start", gap: "1rem" }}>
                <div>
                  <strong>{exception.name}</strong>
                  <div className="muted" style={{ fontSize: "0.88rem" }}>
                    {humanDateRange(exception.startDate, exception.endDate)}
                    {" · All day"}
                  </div>
                  {exception.note && (
                    <div className="muted" style={{ fontSize: "0.85rem", marginTop: "0.2rem" }}>{exception.note}</div>
                  )}
                </div>
                <div className="row" style={{ flexShrink: 0 }}>
                  <button type="button" className="button" onClick={() => startEdit(exception)}>Edit</button>
                  <button type="button" className="button danger" onClick={() => remove(exception.id)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
