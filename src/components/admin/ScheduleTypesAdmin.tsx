"use client";

import { useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { DEFAULT_TIMEZONE } from "@/lib/config";
import type { Location } from "@/domain/types";

const EMPTY = { name: "", shortName: "", description: "", minStaffing: 0 };

export function ScheduleTypesAdmin() {
  const { db, currentUser, upsertLocation } = useStore();
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  if (!canManage(currentUser)) {
    return <div className="empty-state">You do not have access to this section.</div>;
  }

  const types = [...db.locations].sort((a, b) => a.name.localeCompare(b.name));

  function reset() {
    setForm(EMPTY);
    setEditingId(null);
    setErrors([]);
  }

  function startEdit(loc: Location) {
    setEditingId(loc.id);
    setForm({
      name: loc.name,
      shortName: loc.shortName,
      description: loc.description ?? "",
      minStaffing: loc.minStaffing,
    });
    setErrors([]);
    setSaved(false);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const errs: string[] = [];
    if (!form.name.trim()) errs.push("Name is required.");
    if (!form.shortName.trim()) errs.push("Short name is required.");
    if (form.minStaffing < 0) errs.push("Minimum staffing cannot be negative.");
    setErrors(errs);
    if (errs.length) return;

    const existing = editingId ? db.locations.find((l) => l.id === editingId) : undefined;
    const location: Location = {
      id: editingId ?? `loc-${Date.now()}`,
      name: form.name.trim(),
      shortName: form.shortName.trim(),
      description: form.description.trim() || undefined,
      timeZone: existing?.timeZone ?? DEFAULT_TIMEZONE,
      minStaffing: Math.max(0, Math.round(form.minStaffing)),
      openBufferMinutes: existing?.openBufferMinutes ?? 0,
      closeBufferMinutes: existing?.closeBufferMinutes ?? 0,
      libcalId: existing?.libcalId,
      active: existing?.active ?? true,
    };
    upsertLocation(location);
    reset();
    setSaved(true);
  }

  function toggleActive(loc: Location) {
    upsertLocation({ ...loc, active: !loc.active });
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Schedule types</h1>
        <p className="muted">
          Each schedule type is its own board — Borrowing Services Desk, Stacks, Breaks &amp; Lunches, and
          any you add (e.g. special events). Only the Borrowing Services Desk requires coverage; the others
          are optional. Control who can be scheduled on each type under <strong>Schedule access</strong>.
        </p>
      </div>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>{editingId ? "Edit schedule type" : "Add schedule type"}</h2>
        {errors.length > 0 && (
          <div className="error-summary" role="alert">
            <strong>Please fix:</strong>
            <ul>{errors.map((er) => <li key={er}>{er}</li>)}</ul>
          </div>
        )}
        <form className="form" onSubmit={save} style={{ maxWidth: "none" }}>
          <div className="row">
            <div className="field" style={{ flex: "2 1 240px" }}>
              <label htmlFor="st-name">Name</label>
              <input id="st-name" type="text" value={form.name}
                onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setSaved(false); }}
                placeholder="e.g. Special Events" />
            </div>
            <div className="field" style={{ flex: "1 1 140px" }}>
              <label htmlFor="st-short">Short name</label>
              <input id="st-short" type="text" value={form.shortName}
                onChange={(e) => { setForm((f) => ({ ...f, shortName: e.target.value })); setSaved(false); }}
                placeholder="e.g. Events" />
            </div>
            <div className="field" style={{ flex: "1 1 120px" }}>
              <label htmlFor="st-min">Min staffing</label>
              <input id="st-min" type="number" min={0} value={form.minStaffing}
                onChange={(e) => { setForm((f) => ({ ...f, minStaffing: Number(e.target.value) })); setSaved(false); }} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="st-desc">Description (optional)</label>
            <input id="st-desc" type="text" value={form.description}
              onChange={(e) => { setForm((f) => ({ ...f, description: e.target.value })); setSaved(false); }}
              placeholder="What this schedule covers" />
          </div>
          <div className="row">
            <button type="submit" className="button primary">{editingId ? "Save changes" : "Add schedule type"}</button>
            {editingId && <button type="button" className="button" onClick={reset}>Cancel edit</button>}
            {saved && <span role="status" className="badge ok">Saved</span>}
          </div>
        </form>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Schedule types ({types.length})</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Short</th>
                <th scope="col">Min staffing</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {types.map((l) => (
                <tr key={l.id}>
                  <td>{l.name}{l.id === "loc-desk" && <span className="badge info" style={{ marginLeft: "0.4rem" }}>Required</span>}</td>
                  <td>{l.shortName}</td>
                  <td>{l.minStaffing}</td>
                  <td><span className={`badge ${l.active ? "ok" : ""}`}>{l.active ? "Active" : "Inactive"}</span></td>
                  <td>
                    <div className="row" style={{ gap: "0.35rem" }}>
                      <button type="button" className="button sm" onClick={() => startEdit(l)}>Edit</button>
                      <button type="button" className="button sm" onClick={() => toggleActive(l)}>
                        {l.active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
