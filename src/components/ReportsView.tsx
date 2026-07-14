"use client";

import { useStore } from "@/lib/store/StoreProvider";
import { humanDate, hoursLabel, severityBadge } from "@/lib/ui";
import type { Severity } from "@/domain/types";

const SEVERITIES: Severity[] = ["hard", "overrideable", "warning", "info"];

export function ReportsView() {
  const store = useStore();
  const { db } = store;
  const schedule = db.schedules[0];

  const empName = (id: string | null) =>
    id ? db.employees.find((e) => e.id === id)?.preferredName ?? id : "—";

  if (!schedule) {
    return (
      <div className="stack">
        <div className="page-head">
          <h1>Reports</h1>
        </div>
        <div className="empty-state">No schedule available to report on.</div>
      </div>
    );
  }

  const shifts = db.shifts.filter((s) => s.scheduleId === schedule.id && s.status !== "cancelled");
  const assigned = shifts.filter((s) => s.employeeId);
  const open = shifts.filter((s) => !s.employeeId);

  const fairness = store.fairness(schedule.id);
  const findings = store.compliance(schedule.id);

  const findingCounts = SEVERITIES.map((sev) => ({
    sev,
    count: findings.filter((f) => f.severity === sev).length,
  }));

  function downloadCsv() {
    const header = [
      "Employee",
      "Total minutes",
      "Public service minutes",
      "Opening count",
      "Closing count",
      "Normalized load",
    ];
    const rows = fairness.metrics.map((m) => [
      empName(m.employeeId),
      String(m.totalMinutes),
      String(m.publicServiceMinutes),
      String(m.openingCount),
      String(m.closingCount),
      m.normalizedLoad.toFixed(2),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fairness-${schedule.id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Reports</h1>
        <p className="muted">Operational analytics for {schedule.name}.</p>
      </div>

      <section className="card" aria-labelledby="coverage">
        <h2 id="coverage">Coverage</h2>
        <div className="grid">
          <div className="card">
            <div className="metric">{shifts.length}</div>
            <div className="metric-label">Total shifts</div>
          </div>
          <div className="card">
            <div className="metric">{assigned.length}</div>
            <div className="metric-label">Assigned</div>
          </div>
          <div className="card">
            <div className="metric" style={{ color: open.length ? "var(--warning)" : undefined }}>
              {open.length}
            </div>
            <div className="metric-label">Open / unassigned</div>
          </div>
        </div>
      </section>

      <section className="card" aria-labelledby="fairness">
        <div className="spread">
          <h2 id="fairness">Fairness</h2>
          <button
            type="button"
            className="button sm"
            onClick={downloadCsv}
            aria-label="Download the fairness table as a CSV file"
          >
            Download CSV
          </button>
        </div>
        <p className="muted">
          Fairness normalizes each person&apos;s workload by their availability and %FTE; approved leave
          does not count against anyone. Normalized load of 1.00 means a person is carrying exactly their
          fair share for their availability; higher means more than their share.
        </p>
        <p className="muted">
          <strong>Public-service equality (Gini):</strong> {fairness.giniPublicService.toFixed(2)} — a
          measure of how evenly public-service time is spread across staff, where 0 is perfectly equal and
          1 is maximally unequal.
        </p>
        {fairness.metrics.length === 0 ? (
          <div className="empty-state">No assignments to analyze yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <caption>Per-employee workload, with normalized load relative to a fair share of 1.00.</caption>
              <thead>
                <tr>
                  <th scope="col">Employee</th>
                  <th scope="col">Total hours</th>
                  <th scope="col">Public-service hours</th>
                  <th scope="col">Opening</th>
                  <th scope="col">Closing</th>
                  <th scope="col">Normalized load</th>
                </tr>
              </thead>
              <tbody>
                {fairness.metrics.map((m) => {
                  const width = Math.min(100, m.normalizedLoad * 50);
                  const over = m.normalizedLoad > 1.25;
                  return (
                    <tr key={m.employeeId}>
                      <td>{empName(m.employeeId)}</td>
                      <td>{hoursLabel(m.totalMinutes)}</td>
                      <td>{hoursLabel(m.publicServiceMinutes)}</td>
                      <td>{m.openingCount}</td>
                      <td>{m.closingCount}</td>
                      <td>
                        <div className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
                          <span>{m.normalizedLoad.toFixed(2)}</span>
                          <div
                            className={`meter${over ? " over" : ""}`}
                            style={{ flex: 1, minWidth: "80px" }}
                            role="img"
                            aria-label={`Normalized load ${m.normalizedLoad.toFixed(2)}${over ? ", above fair share" : ""}`}
                          >
                            <span style={{ width: `${width}%` }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="compliance">
        <h2 id="compliance">Compliance findings</h2>
        <div className="row" style={{ marginBottom: "0.75rem" }}>
          {findingCounts.map(({ sev, count }) => {
            const b = severityBadge[sev];
            return (
              <span key={sev} className={`badge ${b.cls}`}>
                {b.label}: {count}
              </span>
            );
          })}
        </div>
        {findings.length === 0 ? (
          <div className="empty-state">No compliance findings for this schedule.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <caption>Compliance findings for the current schedule, by severity.</caption>
              <thead>
                <tr>
                  <th scope="col">Severity</th>
                  <th scope="col">Employee</th>
                  <th scope="col">Date</th>
                  <th scope="col">Finding</th>
                </tr>
              </thead>
              <tbody>
                {findings.map((f) => {
                  const b = severityBadge[f.severity];
                  return (
                    <tr key={f.id}>
                      <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
                      <td>{empName(f.employeeId)}</td>
                      <td>{humanDate(f.date)}</td>
                      <td>{f.message}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
