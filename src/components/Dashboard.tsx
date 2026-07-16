"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { canManage, isAdmin } from "@/domain/scope";
import { firstName, humanDate, timeRange } from "@/lib/ui";
import { TIMEKEEPING_URL } from "@/lib/config";
import { DailyNotesFeed } from "./DailyNotesFeed";
import { OperatingHoursCard } from "./OperatingHoursCard";
import { CollapsibleCard } from "./CollapsibleCard";
import { ScheduleHubPanel } from "./dashboard/ScheduleHubPanel";
import { RestBreaksReminders } from "./dashboard/RestBreaksReminders";
import type { Shift } from "@/domain/types";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function longDate(): string {
  return new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export function Dashboard() {
  const { currentUser } = useStore();
  return canManage(currentUser) ? <ManagerDashboard /> : <EmployeeDashboard />;
}

/** Shared right-rail: rolling notes, hours, and quick links. */
function SideRail({ children }: { children?: React.ReactNode }) {
  return (
    <aside className="stack">
      <DailyNotesFeed />
      <OperatingHoursCard />
      <QuickLinks />
      {children}
    </aside>
  );
}

function QuickLinks() {
  const tiles: { href: string; icon: string; title: string; hint: string; external?: boolean }[] = [
    { href: TIMEKEEPING_URL, icon: "🕐", title: "Time-keeping", hint: "Stanford Sequoia sign-in", external: true },
    { href: "/schedule", icon: "🗓️", title: "Schedule", hint: "View the full schedule" },
    { href: "/availability", icon: "✅", title: "Availability", hint: "Update exceptions" },
    { href: "/swaps", icon: "🔄", title: "Swaps", hint: "Offer or pick up shifts" },
  ];
  return (
    <CollapsibleCard title="Quick links" summary="Time-keeping, schedule, availability, and swaps" defaultOpen={false}>
      <div className="link-tiles">
        {tiles.map((t) =>
          t.external ? (
            <a key={t.title} className="link-tile glass-strong" href={t.href} target="_blank" rel="noopener noreferrer">
              <span className="tile-icon" aria-hidden>{t.icon}</span>
              <strong>{t.title} ↗</strong>
              <span>{t.hint}</span>
            </a>
          ) : (
            <Link key={t.title} className="link-tile glass-strong" href={t.href}>
              <span className="tile-icon" aria-hidden>{t.icon}</span>
              <strong>{t.title}</strong>
              <span>{t.hint}</span>
            </Link>
          ),
        )}
      </div>
    </CollapsibleCard>
  );
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
  const myExceptions = db.leave.filter((l) => l.employeeId === currentUser.id && l.status !== "cancelled");

  return (
    <div className="stack">
      <section className="dash-hero">
        <div className="eyebrow">{longDate()}</div>
        <h1>{greeting()}, {profile?.preferredName ?? firstName(currentUser.displayName)}</h1>
        <p className="muted" style={{ margin: 0 }}>Your schedule, exceptions, and team updates at a glance.</p>
        <div className="hero-actions">
          <Link href="/schedule" className="button primary glass-button">View my schedule</Link>
          <Link href="/availability" className="button glass-button">Availability &amp; exceptions</Link>
        </div>
      </section>

      <RestBreaksReminders />

      <div className="dash-columns">
        <div className="stack">
          <ScheduleHubPanel />

          <section className="card glass pad-lg" aria-labelledby="upcoming-shifts">
            <h2 id="upcoming-shifts">Upcoming shifts</h2>
            {upcoming.length === 0 ? (
              <p className="muted">No upcoming shifts scheduled.</p>
            ) : (
              <>
                {next && (
                  <div className="upcoming-featured">
                    <p className="eyebrow" style={{ marginBottom: "0.35rem" }}>Next up</p>
                    <p className="metric" style={{ fontSize: "1.5rem", marginBottom: "0.35rem" }}>
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
                )}
                {upcoming.length > 1 && (
                  <div className={next ? "upcoming-rest" : undefined}>
                    {next && <h3 className="upcoming-rest-label">Also coming up</h3>}
                    <ul className="list-reset stack" style={{ gap: "0.5rem" }}>
                      {(next ? upcoming.slice(1) : upcoming).slice(0, 5).map((s) => (
                        <li key={s.id} className="spread">
                          <span>{humanDate(s.date)} · {timeRange(s.start, s.end)}</span>
                          <span className="badge">{pos(s.positionId)?.shortLabel}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
            <Link href="/schedule" className="button sm glass-button mt">View full schedule</Link>
          </section>

          <section className="card glass" aria-labelledby="my-exceptions">
            <div className="spread">
              <h2 id="my-exceptions" style={{ margin: 0 }}>My availability exceptions</h2>
              <span className={`badge ${myExceptions.length ? "info" : ""}`}>{myExceptions.length} on file</span>
            </div>
            <p className="muted" style={{ margin: "0.5rem 0 0", fontSize: "0.88rem" }}>
              Flag dates or hours you are unavailable so scheduling works around them.
            </p>
            <Link href="/availability" className="button sm glass-button mt">Manage exceptions</Link>
          </section>
        </div>

        <SideRail>
          <section className="card glass" aria-labelledby="notifs">
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
        </SideRail>
      </div>
    </div>
  );
}

function ManagerDashboard() {
  const store = useStore();
  const { db, currentUser, loadSampleData } = store;
  const today = todayISO();
  const admin = isAdmin(currentUser);
  const schedule = db.schedules[0];
  const sampleLoaded = db.employees.some((e) => e.id === "emp-sample-riley");
  const todayShifts = db.shifts.filter((s) => s.date === today && s.status !== "cancelled");
  const findings = schedule ? store.compliance(schedule.id) : [];
  const hard = findings.filter((f) => f.severity === "hard");
  const overrideable = findings.filter((f) => f.severity === "overrideable" || f.severity === "warning");
  const recordedExceptions = db.leave.filter((l) => l.leaveTypeId === "lt-unavailable" && l.status !== "cancelled");
  const swapReview = db.swaps.filter((s) => s.status === "manager_review");
  const openShifts = db.shifts.filter((s) => !s.employeeId && s.status !== "cancelled");
  const empName = (id: string | null) => (id ? db.employees.find((e) => e.id === id)?.preferredName ?? "—" : "Open");
  const pos = (id: string) => db.positions.find((p) => p.id === id);

  return (
    <div className="stack">
      <section className="dash-hero">
        <div className="eyebrow">{longDate()}</div>
        <h1>{greeting()}, {db.employees.find((e) => e.id === currentUser.id)?.preferredName ?? firstName(currentUser.displayName)}</h1>
        <p className="muted" style={{ margin: 0 }}>Operational status and team updates for today.</p>
        <div className="hero-actions">
          <Link href="/schedule" className="button primary glass-button">Scheduling workspace</Link>
          <Link href="/team" className="button glass-button">Team</Link>
          {admin && !sampleLoaded && (
            <button className="button glass-button" onClick={loadSampleData}>Load sample schedule</button>
          )}
        </div>
      </section>

      <div className="grid">
        <StatCard value={todayShifts.length} label="Shifts today" href="/schedule/day" />
        <StatCard value={hard.length} label="Blocking compliance" href="/admin/compliance" tone={hard.length ? "err" : "ok"} />
        <StatCard value={recordedExceptions.length} label="Availability exceptions" href="/availability" tone={recordedExceptions.length ? "warn" : ""} />
        <StatCard value={swapReview.length} label="Swaps to review" href="/swaps" tone={swapReview.length ? "warn" : ""} />
        <StatCard value={openShifts.length} label="Open / uncovered" href="/schedule" tone={openShifts.length ? "warn" : ""} />
      </div>

      <div className="dash-columns">
        <div className="stack">
          <ScheduleHubPanel />

          <section className="card glass" aria-labelledby="working-now">
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

          <section className="card glass" aria-labelledby="risks">
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
            <Link href="/admin/compliance" className="button sm glass-button mt">Compliance center</Link>
          </section>

          <section className="card glass" aria-labelledby="draft">
            <h2 id="draft">Schedule status</h2>
            {schedule && (
              <p>
                {schedule.name}:{" "}
                <span className={`badge ${schedule.status === "published" ? "ok" : "draft"}`}>{schedule.status}</span>
              </p>
            )}
            <Link href="/schedule" className="button sm glass-button">Open scheduling workspace</Link>
          </section>
        </div>

        <SideRail />
      </div>
    </div>
  );
}

function StatCard({ value, label, href, tone = "" }: { value: number; label: string; href: string; tone?: string }) {
  return (
    <Link href={href} className="card glass card-link">
      <div className="metric" style={{ color: tone === "err" ? "var(--error)" : tone === "warn" ? "var(--warning)" : undefined }}>
        {value}
      </div>
      <div className="metric-label">{label}</div>
    </Link>
  );
}
