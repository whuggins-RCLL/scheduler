"use client";

import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { hoursLabel } from "@/lib/ui";

function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/(^|\s)\S/g, (m) => m.toUpperCase());
}

export function TeamView() {
  const { db, currentUser } = useStore();
  const manager = canManage(currentUser);

  const activeUserIds = new Set(db.users.filter((user) => user.state === "active").map((user) => user.id));
  const employees = db.employees.filter((employee) => employee.active && activeUserIds.has(employee.id));
  const posName = (id: string) => db.positions.find((p) => p.id === id)?.name ?? id;

  const counts = employees.reduce<Record<string, number>>((acc, e) => {
    acc[e.classification] = (acc[e.classification] ?? 0) + 1;
    return acc;
  }, {});
  const countEntries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Team directory</h1>
        <p className="muted">Active staff, their classification, target hours, and qualifications.</p>
      </div>

      {!manager && (
        <p className="muted" role="status">
          This is the team directory. Management actions are available to managers and schedulers.
        </p>
      )}

      <div className="grid">
        <div className="card">
          <div className="metric">{employees.length}</div>
          <div className="metric-label">Active staff</div>
        </div>
        {countEntries.map(([cls, n]) => (
          <div className="card" key={cls}>
            <div className="metric">{n}</div>
            <div className="metric-label">{humanize(cls)}</div>
          </div>
        ))}
      </div>

      <section className="card" aria-labelledby="directory">
        <h2 id="directory">Directory</h2>
        {employees.length === 0 ? (
          <div className="empty-state">No active employees.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <caption>Active employees with classification, target weekly hours, qualified positions, and calendar status.</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Classification</th>
                  <th scope="col">Target weekly hours</th>
                  <th scope="col">Qualified positions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <strong>{e.preferredName ?? e.legalName}</strong>
                      {e.preferredName && e.preferredName !== e.legalName && (
                        <div className="muted" style={{ fontSize: "0.82rem" }}>{e.legalName}</div>
                      )}
                      {!e.setupComplete && <div><span className="badge warn">Setup needed</span></div>}
                    </td>
                    <td>{humanize(e.classification)}</td>
                    <td>{hoursLabel(e.targetWeeklyHours * 60)}</td>
                    <td>
                      {e.qualifiedPositionIds.length === 0 ? (
                        <span className="muted">None</span>
                      ) : (
                        <div className="row">
                          {e.qualifiedPositionIds.map((id) => (
                            <span key={id} className="chip">{posName(id)}</span>
                          ))}
                        </div>
                      )}
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
