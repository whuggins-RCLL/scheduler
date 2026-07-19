"use client";

import { useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { hoursLabel } from "@/lib/ui";
import { defaultFrequency, describeFrequency } from "@/domain/frequency";
import { FrequencyEditor } from "./FrequencyEditor";
import type { Task, TaskPriority } from "@/domain/types";

const PRIORITIES: TaskPriority[] = ["low", "normal", "high", "urgent"];

function blankTask(order: number): Task {
  return {
    id: `task-${Date.now()}`,
    name: "",
    description: undefined,
    category: "General",
    colorToken: "task-neutral",
    icon: "check",
    requiredQualification: undefined,
    applicableLocationIds: [],
    applicablePositionIds: [],
    estimatedMinutes: 30,
    priority: "normal",
    minAssignees: 1,
    maxAssignees: 1,
    allowedDuringPosition: true,
    requiresAcknowledgement: false,
    checklist: [],
    openingDependency: false,
    closingDependency: false,
    frequency: defaultFrequency("times_per_day"),
    order,
    active: true,
  };
}

export function TasksAdmin() {
  const { db, currentUser, upsertTask, archiveTask, deleteTask } = useStore();
  const [editing, setEditing] = useState<Task | null>(null);

  function confirmDelete(t: Task) {
    if (window.confirm(`Permanently delete “${t.name}”? This cannot be undone. To keep it for the record but hide it, archive it instead.`)) {
      deleteTask(t.id);
    }
  }

  if (!canManage(currentUser)) {
    return <div className="empty-state">You do not have access to this section.</div>;
  }

  const tasks = [...db.tasks].sort((a, b) => a.order - b.order);
  const positions = [...db.positions].filter((p) => p.active).sort((a, b) => a.order - b.order);
  const positionName = (id: string) => positions.find((p) => p.id === id)?.shortLabel ?? id;

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Tasks</h1>
        <p className="muted">Create the recurring and one-off duties that can be assigned alongside positions.</p>
      </div>

      <div className="spread">
        <span className="muted" style={{ fontSize: "0.85rem" }}>{tasks.length} task(s)</span>
        <button className="button primary" onClick={() => setEditing(blankTask(tasks.length))}>+ Add task</button>
      </div>

      {tasks.length === 0 ? (
        <div className="empty-state">No tasks yet. Add duties like Shelving, Opening, or Closing.</div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <caption>Tasks ordered by display order</caption>
            <thead>
              <tr>
                <th scope="col">Task</th>
                <th scope="col">Category</th>
                <th scope="col">Priority</th>
                <th scope="col">Est.</th>
                <th scope="col">Assignees</th>
                <th scope="col">Frequency</th>
                <th scope="col">Positions</th>
                <th scope="col">Checklist</th>
                <th scope="col">Dependency</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.category}</td>
                  <td>{t.priority}</td>
                  <td>{hoursLabel(t.estimatedMinutes)}</td>
                  <td>{t.minAssignees}–{t.maxAssignees}</td>
                  <td>{describeFrequency(t.frequency)}</td>
                  <td>
                    {t.applicablePositionIds.length === 0 ? (
                      <span className="muted">Any</span>
                    ) : (
                      t.applicablePositionIds.map((id) => positionName(id)).join(", ")
                    )}
                  </td>
                  <td>{t.checklist.length} steps</td>
                  <td>
                    <span className="row" style={{ gap: "0.35rem" }}>
                      {t.openingDependency ? <span className="badge info">Opening</span> : null}
                      {t.closingDependency ? <span className="badge info">Closing</span> : null}
                      {!t.openingDependency && !t.closingDependency ? <span className="muted">None</span> : null}
                    </span>
                  </td>
                  <td><span className={`badge ${t.active ? "ok" : ""}`}>{t.active ? "Active" : "Archived"}</span></td>
                  <td>
                    <div className="row">
                      <button className="button sm" onClick={() => setEditing({ ...t })}>Edit</button>
                      {t.active && <button className="button sm" onClick={() => archiveTask(t.id)} aria-label={`Archive ${t.name}`}>Archive</button>}
                      <button className="button sm danger" onClick={() => confirmDelete(t)} aria-label={`Delete ${t.name}`}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <TaskDialog
          task={editing}
          positions={positions}
          locations={db.locations.filter((l) => l.active)}
          onCancel={() => setEditing(null)}
          onSave={(t) => { upsertTask(t); setEditing(null); }}
        />
      )}
    </div>
  );
}

function TaskDialog({
  task,
  positions,
  locations,
  onCancel,
  onSave,
}: {
  task: Task;
  positions: { id: string; name: string; shortLabel: string }[];
  locations: { id: string; name: string }[];
  onCancel: () => void;
  onSave: (t: Task) => void;
}) {
  const [t, setT] = useState<Task>(task);
  const [checklistText, setChecklistText] = useState(task.checklist.join("\n"));
  const [error, setError] = useState("");
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setT((cur) => ({ ...cur, [k]: v }));

  function togglePosition(positionId: string, on: boolean) {
    const next = on
      ? [...new Set([...t.applicablePositionIds, positionId])]
      : t.applicablePositionIds.filter((id) => id !== positionId);
    set("applicablePositionIds", next);
  }

  function toggleLocation(locationId: string, on: boolean) {
    const next = on
      ? [...new Set([...t.applicableLocationIds, locationId])]
      : t.applicableLocationIds.filter((id) => id !== locationId);
    set("applicableLocationIds", next);
  }

  function save() {
    if (!t.name.trim()) { setError("Name is required."); return; }
    if (t.maxAssignees < t.minAssignees) { setError("Max assignees must be ≥ min."); return; }
    const checklist = checklistText.split("\n").map((s) => s.trim()).filter(Boolean);
    onSave({ ...t, checklist });
  }

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="task-dialog-title" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog">
        <h2 id="task-dialog-title">{task.name ? "Edit task" : "Add task"}</h2>
        {error && <div className="error-summary" role="alert">{error}</div>}
        <div className="form" style={{ maxWidth: "none" }}>
          <div className="field">
            <label htmlFor="t-name">Name</label>
            <input id="t-name" value={t.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="t-cat">Category</label>
              <input id="t-cat" value={t.category} onChange={(e) => set("category", e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="t-pri">Priority</label>
              <select id="t-pri" value={t.priority} onChange={(e) => set("priority", e.target.value as TaskPriority)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="t-est">Est. minutes</label>
              <input id="t-est" type="number" min={0} step={5} value={t.estimatedMinutes} onChange={(e) => set("estimatedMinutes", Number(e.target.value))} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="t-min">Min assignees</label>
              <input id="t-min" type="number" min={0} value={t.minAssignees} onChange={(e) => set("minAssignees", Number(e.target.value))} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="t-maxa">Max assignees</label>
              <input id="t-maxa" type="number" min={1} value={t.maxAssignees} onChange={(e) => set("maxAssignees", Number(e.target.value))} />
            </div>
          </div>
          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 600, fontSize: "0.88rem" }}>Schedule types</legend>
            <p className="muted" style={{ margin: "0.25rem 0 0.5rem", fontSize: "0.85rem" }}>
              Select which schedule types this task belongs to. A task with nothing checked stays unmapped and
              is hidden from every schedule board until you place it on at least one type.
            </p>
            {locations.length === 0 ? (
              <p className="muted">No active schedule types yet.</p>
            ) : (
              <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem 1rem" }}>
                {locations.map((l) => (
                  <label key={l.id} className="row" style={{ gap: "0.4rem" }}>
                    <input
                      type="checkbox"
                      style={{ width: "auto", minHeight: 0 }}
                      checked={t.applicableLocationIds.includes(l.id)}
                      onChange={(e) => toggleLocation(l.id, e.target.checked)}
                    />
                    {l.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 600, fontSize: "0.88rem" }}>Applicable positions</legend>
            <p className="muted" style={{ margin: "0.25rem 0 0.5rem", fontSize: "0.85rem" }}>
              Select which positions this task can be assigned to. Leave all unchecked to allow any position.
            </p>
            {positions.length === 0 ? (
              <p className="muted">No active positions yet.</p>
            ) : (
              <div className="row" style={{ flexWrap: "wrap", gap: "0.5rem 1rem" }}>
                {positions.map((p) => (
                  <label key={p.id} className="row" style={{ gap: "0.4rem" }}>
                    <input
                      type="checkbox"
                      style={{ width: "auto", minHeight: 0 }}
                      checked={t.applicablePositionIds.includes(p.id)}
                      onChange={(e) => togglePosition(p.id, e.target.checked)}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <FrequencyEditor idPrefix="task-freq" value={t.frequency} onChange={(f) => set("frequency", f)} />
          <div className="field">
            <label htmlFor="t-check">Checklist steps (one per line)</label>
            <textarea id="t-check" value={checklistText} onChange={(e) => setChecklistText(e.target.value)} />
          </div>
          <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 600, fontSize: "0.88rem" }}>Options</legend>
            <label className="row" style={{ gap: "0.4rem" }}><input type="checkbox" style={{ width: "auto", minHeight: 0 }} checked={t.openingDependency} onChange={(e) => set("openingDependency", e.target.checked)} /> Opening dependency</label>
            <label className="row" style={{ gap: "0.4rem" }}><input type="checkbox" style={{ width: "auto", minHeight: 0 }} checked={t.closingDependency} onChange={(e) => set("closingDependency", e.target.checked)} /> Closing dependency</label>
            <label className="row" style={{ gap: "0.4rem" }}><input type="checkbox" style={{ width: "auto", minHeight: 0 }} checked={t.requiresAcknowledgement} onChange={(e) => set("requiresAcknowledgement", e.target.checked)} /> Requires completion acknowledgement</label>
          </fieldset>
          <div className="row">
            <button className="button primary" onClick={save}>Save task</button>
            <button className="button" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
