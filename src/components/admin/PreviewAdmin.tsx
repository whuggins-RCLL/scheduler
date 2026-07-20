"use client";

import Link from "next/link";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { humanDate, timeRange } from "@/lib/ui";

export function PreviewAdmin() {
  const { db, currentUser } = useStore();
  if (!canManage(currentUser)) return <div className="empty-state">You do not have access to this section.</div>;

  const student = db.employees.find((e) => e.classification === "student_worker") ?? db.employees[0];
  const staff = db.employees.find((e) => e.classification === "non_exempt_staff" || e.classification === "exempt_staff") ?? db.employees[1] ?? db.employees[0];
  const previewPeople = [
    { label: "Student view", person: student, tone: "info" },
    { label: "Staff view", person: staff, tone: "ok" },
  ];
  const pos = (id: string) => db.positions.find((p) => p.id === id)?.name ?? id;
  const loc = (id: string) => db.locations.find((l) => l.id === id)?.shortName ?? id;

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Student and staff previews</h1>
        <p className="muted">Preview what front-line users see without leaving the admin workspace. These cards use seeded live schedule, task, notification, and exception data.</p>
      </div>
      <div className="grid-2">
        {previewPeople.map(({ label, person, tone }) => {
          const shifts = db.shifts.filter((s) => s.employeeId === person.id && s.status !== "cancelled").sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
          const exceptions = db.leave.filter((l) => l.employeeId === person.id && l.status !== "cancelled");
          const notifications = db.notifications.filter((n) => n.userId === person.id);
          return (
            <section className="card pad-lg preview-frame" key={label} aria-labelledby={`${person.id}-preview`}>
              <div className="spread">
                <div>
                  <span className={`badge ${tone}`}>{label}</span>
                  <h2 id={`${person.id}-preview`} style={{ marginTop: "0.5rem" }}>{person.preferredName ?? person.legalName}</h2>
                  <p className="muted">{person.classification.replaceAll("_", " ")} · target {person.targetWeeklyHours}h/week</p>
                </div>
                <Link className="button sm" href="/guides">Open guides</Link>
              </div>

              <div className="preview-phone" aria-label={`${label} dashboard preview`}>
                <div className="preview-bar">Dashboard</div>
                <h3>Next shifts</h3>
                {shifts.length === 0 ? <p className="muted">No upcoming shifts.</p> : (
                  <ul className="list-reset stack" style={{ gap: "0.45rem" }}>
                    {shifts.slice(0, 3).map((s) => (
                      <li key={s.id} className="preview-item">
                        <strong>{humanDate(s.date)} · {timeRange(s.start, s.end)}</strong>
                        <span>{pos(s.positionId)} · {loc(s.locationId)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: "1rem" }}>
                  <div className="mini-card"><strong>{exceptions.length}</strong><span>exceptions</span></div>
                  <div className="mini-card"><strong>{notifications.length}</strong><span>alerts</span></div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
