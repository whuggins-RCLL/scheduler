"use client";

import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { hoursLabel } from "@/lib/ui";

export function TasksAdmin() {
  const { db, currentUser } = useStore();

  if (!canManage(currentUser)) {
    return <div className="empty-state">You do not have access to this section.</div>;
  }

  const tasks = [...db.tasks].sort((a, b) => a.order - b.order);

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Tasks</h1>
        <p className="muted">
          Recurring and one-off duties that can be assigned alongside positions. Read-only reference.
        </p>
      </div>

      <div className="table-wrap">
        <table className="data">
          <caption>Tasks ordered by display order</caption>
          <thead>
            <tr>
              <th scope="col">Task</th>
              <th scope="col">Category</th>
              <th scope="col">Priority</th>
              <th scope="col">Est. duration</th>
              <th scope="col">Assignees</th>
              <th scope="col">Checklist</th>
              <th scope="col">Dependency</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{t.category}</td>
                <td>{t.priority}</td>
                <td>{hoursLabel(t.estimatedMinutes)}</td>
                <td>
                  {t.minAssignees}–{t.maxAssignees}
                </td>
                <td>{t.checklist.length} steps</td>
                <td>
                  <span className="row" style={{ gap: "0.35rem" }}>
                    {t.openingDependency ? <span className="badge info">Opening</span> : null}
                    {t.closingDependency ? <span className="badge info">Closing</span> : null}
                    {!t.openingDependency && !t.closingDependency ? <span className="muted">None</span> : null}
                  </span>
                </td>
                <td>
                  <span className={`badge ${t.active ? "ok" : ""}`}>{t.active ? "Active" : "Inactive"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
