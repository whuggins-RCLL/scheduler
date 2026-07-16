"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";

/**
 * Schedule access grouped by schedule type. Each type is a card listing staff
 * who may be scheduled on that board.
 */
export function ScheduleAccessAdmin() {
  const { db, currentUser, setScheduleTypeAccess } = useStore();

  const employees = useMemo(
    () => db.employees
      .filter((e) => e.active)
      .sort((a, b) => (a.preferredName ?? a.legalName).localeCompare(b.preferredName ?? b.legalName)),
    [db.employees],
  );
  const types = useMemo(
    () => db.locations.filter((l) => l.active).sort((a, b) => a.name.localeCompare(b.name)),
    [db.locations],
  );

  if (!canManage(currentUser)) {
    return <div className="empty-state">You do not have access to this section.</div>;
  }

  function toggle(employeeId: string, typeId: string, on: boolean) {
    const emp = db.employees.find((e) => e.id === employeeId);
    if (!emp) return;
    const next = on
      ? [...new Set([...emp.eligibleLocationIds, typeId])]
      : emp.eligibleLocationIds.filter((id) => id !== typeId);
    setScheduleTypeAccess(employeeId, next);
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Schedule access</h1>
        <p className="muted">
          Control which schedule types each person may be placed on. Grouped by board for easier review
          on any screen size.
        </p>
      </div>

      {employees.length === 0 || types.length === 0 ? (
        <section className="card">
          <p className="muted">
            {employees.length === 0 ? "No active employees yet." : "No active schedule types yet."}
          </p>
        </section>
      ) : (
        <div className="qual-task-grid">
          {types.map((type) => (
            <article key={type.id} className="qual-task-card">
              <header className="qual-task-head">
                <h3 style={{ margin: 0 }}>{type.name}</h3>
                <span className="muted qual-task-est">{type.shortName}</span>
              </header>
              {type.description && <p className="muted" style={{ margin: "0 0 0.75rem", fontSize: "0.85rem" }}>{type.description}</p>}
              <div className="qual-employee-list">
                {employees.map((emp) => {
                  const on = emp.eligibleLocationIds.includes(type.id);
                  const label = emp.preferredName ?? emp.legalName;
                  return (
                    <label key={emp.id} className={`qual-employee-chip ${on ? "on" : ""}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => toggle(emp.id, type.id, e.target.checked)}
                        aria-label={`${label} — ${type.name}`}
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
