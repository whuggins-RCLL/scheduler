"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage } from "@/domain/scope";
import { hoursLabel, humanDate, timeRange } from "@/lib/ui";
import type { Shift } from "@/domain/types";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function Dashboard() {
  const store = useStore();
  const { db, currentUser } = store;
  return canManage(currentUser) ? <ManagerDashboard /> : <EmployeeDashboard />;
}

function EmployeeDashboard() {
  const { db, currentUser } = useStore();
  const today = todayISO();
  const profile = db.employees.find((e) => e.id === currentUser.id);

  const myShifts = useMemo(
    () =>
      db.shifts
        .filter((s) => s.employeeId === currentUser.id && s.status !== "cancelled")
        .sort((a, b) => (a.date + String(a.start)).localeCompare(b.date + String(b.start))),
    [db.shifts, currentUser.id],
  );
  const upcoming = myShifts.filter((s) => s.date >= today);
  const next = upcoming[0];
  const pos = (id: string) => db.positions.find((p) => p.id === id);
  const loc = (id: string) => db.locations.find((l) => l.id === id);
  const notifications = db.notifications.filter((n) => n.userId === currentUser.id);
  const pendingSwaps = db.swaps.filter((s) => s.toEmployeeId === currentUser.id && s.status === "manager_review");
  const myLeave = db.leave.filter((l) => l.employeeId === currentUser.id && l.status !== "cancelled");

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Welcome, {profile?.preferredName ?? currentUser.displayName}</h1>
        <p className="muted">Your schedule, tasks, and requests at a glance.</p>
      </div>

      <div className="grid-hero">
        <div className="stack">
          <section className="card pad-lg" aria-labelledby="next-shift">
            <h2 id="next-shift">Your next shift</h2>
            {next ? (
              <div>
                <p className="metric" style={{ fontSize: "1.4rem" }}>
                  {humanDate(next.date)} · {timeRange(next.start, next.end)}
                </p>
                <p className="muted" style={{ marginBottom: "0.75rem" }}>
                  {pos(next.positionId)?.name} · {loc(next.locationId)?.name}
                </p>
                {next.taskIds.length > 0 && (
                  <div className="row">
                    {next.taskIds.map((t) => (
                      <span key={t} className="chip">{db.tasks.find((x) => x.id === t)?.name}</span>
                    ))}
                  </div>
                )}
                {next.breaks.length > 0 && (
                  <p className="muted mt" style={{ fontSize: "0.85rem" }}>
                    Break: {next.breaks.map((b) => `${b.kind} ${timeRange(b.start, b.end)}`).join(", ")}
                  </p>
                )}
              </div>
            ) : (
              <p className="muted">No upcoming shifts scheduled.</p>
            )}
          </section>

          <section className="card" aria-labelledby="week-glance">
            <h2 id="week-glance">This week</h2>
            {upcoming.length === 0 ? (
              <p className="muted">Nothing scheduled yet.</p>
            ) : (
              <ul className="list-reset stack" style={{ gap: "0.5rem" }}>
                {upcoming.slice(0, 6).map((s) => (
                  <li key={s.id} className="spread">
                    <span>{humanDate(s.date)} · {timeRange(s.start, s.end)}</span>
                    <span className="badge">{pos(s.positionId)?.shortLabel}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/schedule" className="button sm mt">View full schedule</Link>
          </section>
        </div>

        <aside className="stack">
          <DashCard title="Availability" href="/availability" badge={profile ? { cls: "ok", text: "Current" } : { cls: "warn", text: "Not set" }}>
            Keep your recurring availability up to date so schedules fit around you.
          </DashCard>
          <DashCard title="Leave" href="/leave" badge={{ cls: myLeave.length ? "info" : "", text: `${myLeave.length} on file` }}>
            {myLeave.filter((l) => l.status === "requested").length} awaiting a decision.
          </DashCard>
          <DashCard title="Swaps" href="/swaps" badge={{ cls: pendingSwaps.length ? "warn" : "", text: `${pendingSwaps.length} to review` }}>
            Offer a shift or pick up an open one from the marketplace.
          </DashCard>
          <DashCard
            title="Google Calendar"
            href="/settings"
            badge={{ cls: profile?.googleCalendarConnected ? "ok" : "", text: profile?.googleCalendarConnected ? "Connected" : "Disconnected" }}
          >
            Sync your published shifts to your personal calendar.
          </DashCard>
          <section className="card" aria-labelledby="notifs">
            <h2 id="notifs">Notifications</h2>
            {notifications.length === 0 ? (
              <p className="muted">You&apos;re all caught up.</p>
            ) : (
              <ul className="list-reset stack" style={{ gap: "0.4rem" }}>
                {notifications.slice(0, 4).map((n) => (
                  <li key={n.id}>
                    <strong style={{ fontSize: "0.9rem" }}>{n.title}</strong>
                    <div className="muted" style={{ fontSize: "0.82rem" }}>{n.body}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function ManagerDashboard() {
  const store = useStore();
  const { db } = store;
  const today = todayISO();
  const schedule = db.schedules[0];
  const todayShifts = db.shifts.filter((s) => s.date === today && s.status !== "cancelled");
  const findings = schedule ? store.compliance(schedule.id) : [];
  const hard = findings.filter((f) => f.severity === "hard");
  const overrideable = findings.filter((f) => f.severity === "overrideable" || f.severity === "warning");
  const pendingLeave = db.leave.filter((l) => l.status === "requested");
  const swapReview = db.swaps.filter((s) => s.status === "manager_review");
  const openShifts = db.shifts.filter((s) => !s.employeeId && s.status !== "cancelled");
  const notesToday = db.notes.filter(
    (n) => !n.archived && (!n.effectiveStart || n.effectiveStart <= today) && (!n.effectiveEnd || n.effectiveEnd >= today),
  );
  const empName = (id: string | null) => (id ? db.employees.find((e) => e.id === id)?.preferredName ?? "—" : "Open");
  const pos = (id: string) => db.positions.find((p) => p.id === id);

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Manager dashboard</h1>
        <p className="muted">Actionable operational status for today, {humanDate(today)}.</p>
      </div>

      <div className="grid">
        <StatCard value={todayShifts.length} label="Shifts today" href="/schedule/day" />
        <StatCard value={hard.length} label="Blocking compliance" href="/admin/compliance" tone={hard.length ? "err" : "ok"} />
        <StatCard value={pendingLeave.length} label="Leave to approve" href="/leave" tone={pendingLeave.length ? "warn" : ""} />
        <StatCard value={swapReview.length} label="Swaps to review" href="/swaps" tone={swapReview.length ? "warn" : ""} />
        <StatCard value={openShifts.length} label="Open / uncovered" href="/schedule" tone={openShifts.length ? "warn" : ""} />
      </div>

      <div className="grid-2">
        <section className="card" aria-labelledby="working-now">
          <h2 id="working-now">On the schedule today</h2>
          {todayShifts.length === 0 ? (
            <p className="muted">No shifts scheduled today.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th scope="col">Time</th><th scope="col">Employee</th><th scope="col">Position</th></tr>
                </thead>
                <tbody>
                  {todayShifts.sort((a, b) => a.start - b.start).map((s: Shift) => (
                    <tr key={s.id}>
                      <td>{timeRange(s.start, s.end)}</td>
                      <td>{empName(s.employeeId)}</td>
                      <td>{pos(s.positionId)?.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="risks">
          <h2 id="risks">Compliance risks</h2>
          {findings.length === 0 ? (
            <p className="muted">No compliance issues detected.</p>
          ) : (
            <ul className="list-reset stack" style={{ gap: "0.5rem" }}>
              {[...hard, ...overrideable].slice(0, 5).map((f) => (
                <li key={f.id} className="spread">
                  <span style={{ fontSize: "0.88rem" }}>{f.message}</span>
                  <span className={`badge ${f.severity === "hard" ? "err" : "warn"}`}>{f.severity}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/admin/compliance" className="button sm mt">Compliance center</Link>
        </section>

        <section className="card" aria-labelledby="notes-today">
          <h2 id="notes-today">Notes effective today</h2>
          {notesToday.length === 0 ? (
            <p className="muted">No active scheduling notes.</p>
          ) : (
            <ul className="list-reset stack" style={{ gap: "0.5rem" }}>
              {notesToday.map((n) => (
                <li key={n.id}>
                  <strong style={{ fontSize: "0.9rem" }}>{n.title}</strong>
                  <div className="muted" style={{ fontSize: "0.82rem" }}>{n.body}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="draft">
          <h2 id="draft">Draft schedule</h2>
          {schedule && (
            <p>
              {schedule.name}:{" "}
              <span className={`badge ${schedule.status === "published" ? "ok" : "draft"}`}>{schedule.status}</span>
            </p>
          )}
          <Link href="/schedule" className="button sm">Open scheduling workspace</Link>
        </section>
      </div>
    </div>
  );
}

function DashCard({ title, href, badge, children }: { title: string; href: string; badge: { cls: string; text: string }; children: React.ReactNode }) {
  return (
    <Link href={href} className="card card-link">
      <div className="spread">
        <h2 style={{ margin: 0 }}>{title}</h2>
        <span className={`badge ${badge.cls}`}>{badge.text}</span>
      </div>
      <p className="muted" style={{ margin: "0.5rem 0 0", fontSize: "0.88rem" }}>{children}</p>
    </Link>
  );
}

function StatCard({ value, label, href, tone = "" }: { value: number; label: string; href: string; tone?: string }) {
  return (
    <Link href={href} className="card card-link">
      <div className={`metric`} style={{ color: tone === "err" ? "var(--error)" : tone === "warn" ? "var(--warning)" : undefined }}>
        {value}
      </div>
      <div className="metric-label">{label}</div>
    </Link>
  );
}
