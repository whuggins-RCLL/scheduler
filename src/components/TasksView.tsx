"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { humanDate, hoursLabel, timeRange } from "@/lib/ui";
import type { TaskPriority } from "@/domain/types";

const priorityBadge: Record<TaskPriority, { cls: string; label: string }> = {
  low: { cls: "", label: "Low" },
  normal: { cls: "info", label: "Normal" },
  high: { cls: "warn", label: "High" },
  urgent: { cls: "err", label: "Urgent" },
};

export function TasksView() {
  const { db, currentUser } = useStore();
  const manager = canManage(currentUser);
  const schedule = db.schedules[0];

  const taskName = (id: string) => db.tasks.find((t) => t.id === id)?.name ?? id;
  const empName = (id: string | null) =>
    id ? db.employees.find((e) => e.id === id)?.preferredName ?? "—" : "Open";

  const assignments = useMemo(() => {
    if (!schedule) return [];
    return db.shifts
      .filter(
        (s) =>
          s.scheduleId === schedule.id &&
          s.status !== "cancelled" &&
          s.taskIds.length > 0 &&
          (manager || s.employeeId === currentUser.id),
      )
      .sort((a, b) => (a.date + String(a.start)).localeCompare(b.date + String(b.start)));
  }, [db.shifts, schedule, manager, currentUser.id]);

  const catalog = [...db.tasks].sort((a, b) => a.order - b.order);

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Tasks</h1>
        <p className="muted">The task catalog and how tasks are assigned across the current schedule.</p>
      </div>

      <section className="card" aria-labelledby="task-catalog">
        <h2 id="task-catalog">Task catalog</h2>
        {catalog.length === 0 ? (
          <div className="empty-state">No tasks defined yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <caption>All tasks with category, priority, duration, and workflow flags.</caption>
              <thead>
                <tr>
                  <th scope="col">Task</th>
                  <th scope="col">Category</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Est. duration</th>
                  <th scope="col">Checklist</th>
                  <th scope="col">Dependencies</th>
                  <th scope="col">Acknowledgement</th>
                </tr>
              </thead>
              <tbody>
                {catalog.map((t) => {
                  const pr = priorityBadge[t.priority];
                  const deps: string[] = [];
                  if (t.openingDependency) deps.push("Opening");
                  if (t.closingDependency) deps.push("Closing");
                  return (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.name}</strong>
                        {t.description && (
                          <div className="muted" style={{ fontSize: "0.82rem" }}>{t.description}</div>
                        )}
                        {!t.active && <span className="badge" style={{ marginTop: "0.25rem" }}>Inactive</span>}
                      </td>
                      <td>{t.category}</td>
                      <td><span className={`badge ${pr.cls}`}>{pr.label}</span></td>
                      <td>{hoursLabel(t.estimatedMinutes)}</td>
                      <td>{t.checklist.length} {t.checklist.length === 1 ? "step" : "steps"}</td>
                      <td>{deps.length ? deps.join(", ") : <span className="muted">None</span>}</td>
                      <td>
                        {t.requiresAcknowledgement ? (
                          <span className="badge info">Required</span>
                        ) : (
                          <span className="muted">Not required</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="task-assignments">
        <h2 id="task-assignments">{manager ? "Task assignments this schedule" : "My tasks"}</h2>
        {!schedule ? (
          <div className="empty-state">No schedule available.</div>
        ) : assignments.length === 0 ? (
          <div className="empty-state">
            {manager ? "No shifts have tasks assigned in this schedule." : "You have no shifts with assigned tasks."}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <caption>
                {manager
                  ? "Shifts in the current schedule that carry one or more tasks."
                  : "Your shifts in the current schedule that carry one or more tasks."}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Time</th>
                  {manager && <th scope="col">Employee</th>}
                  <th scope="col">Tasks</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((s) => (
                  <tr key={s.id}>
                    <td>{humanDate(s.date)}</td>
                    <td>{timeRange(s.start, s.end)}</td>
                    {manager && <td>{empName(s.employeeId)}</td>}
                    <td>
                      <div className="row">
                        {s.taskIds.map((id) => (
                          <span key={id} className="chip">{taskName(id)}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
