"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { DEFAULT_TIMEZONE } from "@/lib/config";
import {
  employeesWithScheduleTypeAccess,
  positionScheduleTypeIds,
  positionsForScheduleType,
  taskAppliesToScheduleType,
  tasksForScheduleType,
} from "@/lib/schedule-type-links";
import type { Location, Position, Task } from "@/domain/types";

const EMPTY = { name: "", shortName: "", description: "", minStaffing: 0 };

export function ScheduleTypesAdmin() {
  const { db, currentUser, upsertLocation, setScheduleTypeAccess, upsertPosition, upsertTask } = useStore();
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mappingId, setMappingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  if (!canManage(currentUser)) {
    return <div className="empty-state">You do not have access to this section.</div>;
  }

  const types = [...db.locations].sort((a, b) => a.name.localeCompare(b.name));
  const mappingType = mappingId ? db.locations.find((l) => l.id === mappingId) : undefined;

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

  function toggleEmployeeAccess(employeeId: string, locationId: string, on: boolean) {
    const emp = db.employees.find((e) => e.id === employeeId);
    if (!emp) return;
    const next = on
      ? [...new Set([...emp.eligibleLocationIds, locationId])]
      : emp.eligibleLocationIds.filter((id) => id !== locationId);
    setScheduleTypeAccess(employeeId, next);
  }

  function togglePositionLink(position: Position, locationId: string, on: boolean) {
    const current = positionScheduleTypeIds(position);
    const next = on
      ? [...new Set([...current, locationId])]
      : current.filter((id) => id !== locationId);
    upsertPosition({
      ...position,
      applicableLocationIds: next,
      locationId: next[0],
    });
  }

  function toggleTaskLink(task: Task, locationId: string, on: boolean) {
    const current = task.applicableLocationIds;
    const next = on
      ? [...new Set([...current, locationId])]
      : current.filter((id) => id !== locationId);
    upsertTask({ ...task, applicableLocationIds: next });
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Schedule types</h1>
        <p className="muted">
          Each schedule type is its own board. Link staff, positions, and tasks to each type so
          scheduling automation knows what belongs where. Many-to-many links are supported.
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
                <th scope="col">Links</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {types.map((l) => (
                <ScheduleTypeRow
                  key={l.id}
                  location={l}
                  staffCount={employeesWithScheduleTypeAccess(db.employees, l.id).length}
                  positionCount={positionsForScheduleType(db.positions, l.id).length}
                  taskCount={tasksForScheduleType(db.tasks, l.id).length}
                  onEdit={() => startEdit(l)}
                  onToggle={() => toggleActive(l)}
                  onManageLinks={() => setMappingId(mappingId === l.id ? null : l.id)}
                  linksOpen={mappingId === l.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {mappingType && (
        <ScheduleTypeMappings
          location={mappingType}
          employees={db.employees.filter((e) => e.active)}
          positions={db.positions.filter((p) => p.active)}
          tasks={db.tasks.filter((t) => t.active)}
          onEmployeeToggle={toggleEmployeeAccess}
          onPositionToggle={togglePositionLink}
          onTaskToggle={toggleTaskLink}
          onClose={() => setMappingId(null)}
        />
      )}
    </div>
  );
}

function ScheduleTypeRow({
  location,
  staffCount,
  positionCount,
  taskCount,
  onEdit,
  onToggle,
  onManageLinks,
  linksOpen,
}: {
  location: Location;
  staffCount: number;
  positionCount: number;
  taskCount: number;
  onEdit: () => void;
  onToggle: () => void;
  onManageLinks: () => void;
  linksOpen: boolean;
}) {
  return (
    <tr>
      <td>
        {location.name}
        {location.id === "loc-desk" && <span className="badge info" style={{ marginLeft: "0.4rem" }}>Required</span>}
      </td>
      <td>{location.shortName}</td>
      <td>{location.minStaffing}</td>
      <td className="muted" style={{ fontSize: "0.85rem" }}>
        {staffCount} staff · {positionCount} positions · {taskCount} tasks
      </td>
      <td><span className={`badge ${location.active ? "ok" : ""}`}>{location.active ? "Active" : "Inactive"}</span></td>
      <td>
        <div className="row" style={{ gap: "0.35rem", flexWrap: "wrap" }}>
          <button type="button" className={`button sm ${linksOpen ? "primary" : ""}`} onClick={onManageLinks}>
            {linksOpen ? "Close links" : "Manage links"}
          </button>
          <button type="button" className="button sm" onClick={onEdit}>Edit</button>
          <button type="button" className="button sm" onClick={onToggle}>
            {location.active ? "Deactivate" : "Activate"}
          </button>
        </div>
      </td>
    </tr>
  );
}

function ScheduleTypeMappings({
  location,
  employees,
  positions,
  tasks,
  onEmployeeToggle,
  onPositionToggle,
  onTaskToggle,
  onClose,
}: {
  location: Location;
  employees: import("@/domain/types").EmployeeProfile[];
  positions: Position[];
  tasks: Task[];
  onEmployeeToggle: (employeeId: string, locationId: string, on: boolean) => void;
  onPositionToggle: (position: Position, locationId: string, on: boolean) => void;
  onTaskToggle: (task: Task, locationId: string, on: boolean) => void;
  onClose: () => void;
}) {
  const sortedEmployees = useMemo(
    () => [...employees].sort((a, b) => (a.preferredName ?? a.legalName).localeCompare(b.preferredName ?? b.legalName)),
    [employees],
  );
  const sortedPositions = useMemo(() => [...positions].sort((a, b) => a.order - b.order), [positions]);
  const sortedTasks = useMemo(() => [...tasks].sort((a, b) => a.order - b.order), [tasks]);

  return (
    <section className="card qual-section">
      <div className="spread" style={{ marginBottom: "1rem" }}>
        <div>
          <h2 style={{ margin: 0 }}>Links for {location.name}</h2>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            Staff, positions, and tasks can belong to multiple schedule types.
          </p>
        </div>
        <button type="button" className="button sm" onClick={onClose}>Close</button>
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <div>
          <h3 className="qual-category-title">Staff schedule access</h3>
          <div className="qual-employee-list">
            {sortedEmployees.map((emp) => {
              const on = emp.eligibleLocationIds.includes(location.id);
              return (
                <label key={emp.id} className={`qual-employee-chip ${on ? "on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => onEmployeeToggle(emp.id, location.id, e.target.checked)}
                  />
                  <span>{emp.preferredName ?? emp.legalName}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="qual-category-title">Positions</h3>
          <div className="qual-employee-list">
            {sortedPositions.length === 0 ? (
              <p className="muted">No active positions yet.</p>
            ) : sortedPositions.map((position) => {
              const on = positionScheduleTypeIds(position).includes(location.id);
              return (
                <label key={position.id} className={`qual-employee-chip ${on ? "on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => onPositionToggle(position, location.id, e.target.checked)}
                  />
                  <span>{position.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ marginTop: "1.25rem" }}>
        <h3 className="qual-category-title">Tasks</h3>
        <p className="muted" style={{ fontSize: "0.85rem", margin: "0 0 0.75rem" }}>
          Tasks with no schedule types selected apply everywhere.
        </p>
        <div className="qual-employee-list">
          {sortedTasks.map((task) => {
            const on = taskAppliesToScheduleType(task, location.id) && task.applicableLocationIds.length > 0;
            const universal = task.applicableLocationIds.length === 0;
            return (
              <label key={task.id} className={`qual-employee-chip ${on || universal ? "on" : ""}`}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={universal}
                  onChange={(e) => onTaskToggle(task, location.id, e.target.checked)}
                />
                <span>{task.name}{universal ? " (all types)" : ""}</span>
              </label>
            );
          })}
        </div>
      </div>
    </section>
  );
}
