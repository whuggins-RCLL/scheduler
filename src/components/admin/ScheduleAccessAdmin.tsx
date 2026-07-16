"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";

/**
 * Matrix of which employees may be scheduled on which schedule types. Backed by
 * each employee's eligibleLocationIds. Toggling a cell updates that employee's
 * access for the type.
 */
export function ScheduleAccessAdmin() {
  const { db, currentUser, setScheduleTypeAccess } = useStore();

  const types = useMemo(
    () => db.locations.filter((l) => l.active).sort((a, b) => a.name.localeCompare(b.name)),
    [db.locations],
  );
  const employees = useMemo(
    () => db.employees.filter((e) => e.active).sort((a, b) => (a.preferredName ?? a.legalName).localeCompare(b.preferredName ?? b.legalName)),
    [db.employees],
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
          Check which schedule types each person can be scheduled on. This controls who the engine and
          managers may place on the Borrowing Services Desk, Stacks, Breaks &amp; Lunches, and any other types.
        </p>
      </div>

      <section className="card">
        {employees.length === 0 || types.length === 0 ? (
          <p className="muted">
            {employees.length === 0 ? "No active employees yet." : "No active schedule types yet."}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data access-matrix">
              <thead>
                <tr>
                  <th scope="col">Employee</th>
                  {types.map((t) => (
                    <th key={t.id} scope="col" style={{ textAlign: "center" }}>{t.shortName}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id}>
                    <th scope="row" style={{ fontWeight: 600 }}>{emp.preferredName ?? emp.legalName}</th>
                    {types.map((t) => {
                      const on = emp.eligibleLocationIds.includes(t.id);
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
