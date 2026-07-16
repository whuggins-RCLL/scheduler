"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";

/**
 * Matrix of which employees are qualified for which tasks. Backed by each
 * employee's qualifiedTaskIds. Toggling a cell updates that employee's
 * task qualifications.
 */
export function TaskQualificationsAdmin() {
  const { db, currentUser, setTaskQualifications } = useStore();

  const tasks = useMemo(
    () => db.tasks.filter((t) => t.active).sort((a, b) => a.order - b.order),
    [db.tasks],
  );
  const employees = useMemo(
    () => db.employees.filter((e) => e.active).sort((a, b) => (a.preferredName ?? a.legalName).localeCompare(b.preferredName ?? b.legalName)),
    [db.employees],
  );

  if (!canManage(currentUser)) {
    return <div className="empty-state">You do not have access to this section.</div>;
  }

  function toggle(employeeId: string, taskId: string, on: boolean) {
    const emp = db.employees.find((e) => e.id === employeeId);
    if (!emp) return;
    const next = on
      ? [...new Set([...emp.qualifiedTaskIds, taskId])]
      : emp.qualifiedTaskIds.filter((id) => id !== taskId);
    setTaskQualifications(employeeId, next);
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Task qualifications</h1>
        <p className="muted">
          Check which tasks each person is qualified to perform. This controls swap eligibility and
          helps managers assign duties to the right staff.
        </p>
      </div>

      <section className="card">
        {employees.length === 0 || tasks.length === 0 ? (
          <p className="muted">
            {employees.length === 0 ? "No active employees yet." : "No active tasks yet."}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data access-matrix">
              <thead>
                <tr>
                  <th scope="col">Employee</th>
                  {tasks.map((t) => (
                    <th key={t.id} scope="col" style={{ textAlign: "center" }} title={t.name}>
                      {t.name.length > 12 ? `${t.name.slice(0, 11)}…` : t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id}>
                    <th scope="row" style={{ fontWeight: 600 }}>{emp.preferredName ?? emp.legalName}</th>
                    {tasks.map((t) => {
                      const on = emp.qualifiedTaskIds.includes(t.id);
                      return (
                        <td key={t.id} style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) => toggle(emp.id, t.id, e.target.checked)}
                            aria-label={`${emp.preferredName ?? emp.legalName} — ${t.name}`}
                          />
                        </td>
                      );
                    })}
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
