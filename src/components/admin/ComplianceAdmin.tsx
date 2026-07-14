"use client";

import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { humanDate, hoursLabel, severityBadge } from "@/lib/ui";
import type { Severity } from "@/domain/types";

const SEVERITIES: Severity[] = ["hard", "overrideable", "warning", "info"];

export function ComplianceAdmin() {
  const { db, currentUser, compliance } = useStore();

  if (!canManage(currentUser)) {
    return <div className="empty-state">You do not have access to this section.</div>;
  }

  const scheduleId = db.schedules[0]?.id;
  const findings = scheduleId ? compliance(scheduleId) : [];

  const employeeName = (id: string | null): string => {
    if (!id) return "Open shift";
    return db.users.find((u) => u.id === id)?.displayName ?? id;
  };

  const counts = SEVERITIES.map((s) => ({
    severity: s,
    count: findings.filter((f) => f.severity === s).length,
  }));

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Compliance</h1>
        <p className="muted">
          Data-driven break, rest, and overtime rules and the findings they surface for the current
          schedule.
        </p>
      </div>

      <section className="card" role="note">
        <h2>Advisory only</h2>
        <p>This tool assists with compliance but does not replace official HR or legal review.</p>
      </section>

      <section className="stack">
        <h2>Break policies</h2>
        <div className="grid">
          {db.breakPolicies.map((p) => (
            <div key={p.id} className="card">
              <h3>{p.name}</h3>
              <p className="metric-label">
                {p.classification.replace(/_/g, " ")} · v{p.version}
              </p>
              <ul className="list-reset mt stack" style={{ gap: "0.35rem", fontSize: "0.88rem" }}>
                <li>Meal required after {hoursLabel(p.mealRequiredAfterMinutes)}</li>
                <li>Min meal duration {p.mealMinDurationMinutes} min</li>
                <li>Meal must start by {hoursLabel(p.mealMustStartByMinutesWorked)} worked</li>
                <li>Second meal after {hoursLabel(p.secondMealAfterMinutes)}</li>
                <li>Daily overtime after {hoursLabel(p.dailyOvertimeMinutes)}</li>
                <li>Weekly overtime after {hoursLabel(p.weeklyOvertimeMinutes)}</li>
                <li>Max continuous public service {hoursLabel(p.maxContinuousPublicServiceMinutes)}</li>
                <li>Min turnaround {hoursLabel(p.minTurnaroundMinutes)}</li>
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="stack">
        <h2>Current findings</h2>
        <div className="row">
          {counts.map((c) => (
            <span key={c.severity} className={`badge ${severityBadge[c.severity].cls}`}>
              {severityBadge[c.severity].label}: {c.count}
            </span>
          ))}
        </div>
        {findings.length === 0 ? (
          <div className="empty-state">No compliance findings for the current schedule.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <caption>Compliance findings for the current schedule</caption>
              <thead>
                <tr>
                  <th scope="col">Severity</th>
                  <th scope="col">Employee</th>
                  <th scope="col">Date</th>
                  <th scope="col">Message</th>
                  <th scope="col">Remediation</th>
                </tr>
              </thead>
              <tbody>
                {findings.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <span className={`badge ${severityBadge[f.severity].cls}`}>
                        {severityBadge[f.severity].label}
                      </span>
                    </td>
                    <td>{employeeName(f.employeeId)}</td>
                    <td>{humanDate(f.date)}</td>
                    <td>{f.message}</td>
                    <td>{f.remediation}</td>
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
