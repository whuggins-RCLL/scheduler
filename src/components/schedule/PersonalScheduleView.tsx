"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { resolveEmployeeProfile } from "@/domain/employee-profile";
import { addDays, WEEKDAY_LABELS, weekdayOf } from "@/domain/time";
import { firstName, hoursLabel, humanDate, positionColorVar, timeRange } from "@/lib/ui";
import { fullDayLabel, mondayOf, todayISO } from "@/lib/schedule-view";
import { DayTimeline } from "../dashboard/DayTimeline";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function longDate(): string {
  return new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function CalendarHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div className="calendar-help">
      <button
        type="button"
        className="button sm ghost calendar-help-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        How to connect your calendar
      </button>
      {open && (
        <div className="calendar-help-panel" role="region" aria-label="Calendar connection instructions">
          <ol className="calendar-help-steps">
            <li>Click <strong>Connect Google Calendar</strong> above and sign in with your Stanford Google account when prompted.</li>
            <li>Grant permission for Cardinal Shift to add events to your calendar. Only published shifts are synced — drafts stay internal.</li>
            <li>After connecting, new published shifts appear automatically. Existing published shifts sync within a few minutes.</li>
            <li>To use Apple Calendar or Outlook instead, subscribe to the iCal feed from Settings once calendar sync is enabled.</li>
            <li>To disconnect, click <strong>Disconnect</strong>. Your calendar events from Cardinal Shift will be removed.</li>
          </ol>
        </div>
      )}
    </div>
  );
}

export function PersonalScheduleView() {
  const { db, currentUser, viewAs, saveEmployeeProfile } = useStore();
  const profile = useMemo(
    () => resolveEmployeeProfile(db.employees, currentUser, viewAs),
    [db.employees, currentUser, viewAs],
  );
  const displayName = profile.preferredName ?? firstName(profile.legalName);
  const today = todayISO();
  const weekStart = mondayOf(today);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const [selectedDate, setSelectedDate] = useState(today);
  const [connecting, setConnecting] = useState(false);

  const myShifts = useMemo(
    () =>
      db.shifts
        .filter((s) => s.employeeId === currentUser.id && s.status !== "cancelled")
        .sort((a, b) => (a.date + String(a.start)).localeCompare(b.date + String(b.start))),
    [db.shifts, currentUser.id],
  );

  const weekShifts = myShifts.filter((s) => weekDays.includes(s.date));
  const upcoming = myShifts.filter((s) => s.date >= today);
  const next = upcoming[0];
  const dayShifts = myShifts.filter((s) => s.date === selectedDate).sort((a, b) => a.start - b.start);
  const weekMinutes = weekShifts.reduce((m, s) => m + (s.end - s.start), 0);

  const pos = (id: string) => db.positions.find((p) => p.id === id);
  const loc = (id: string) => db.locations.find((l) => l.id === id);
  const empName = () => displayName;

  async function toggleCalendar() {
    const stored = db.employees.find((e) => e.id === currentUser.id);
    if (!stored) return;
    setConnecting(true);
    try {
      await saveEmployeeProfile({
        ...stored,
        googleCalendarConnected: !stored.googleCalendarConnected,
      });
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="stack personal-schedule">
      <section className="personal-schedule-hero">
        <div className="eyebrow">{longDate()}</div>
        <h1>{greeting()}, {displayName}</h1>
        <p className="muted" style={{ margin: 0 }}>
          Your personal schedule space — see what&apos;s ahead and keep your calendar in sync.
        </p>
        <div className="personal-schedule-stats">
          <div className="personal-stat">
            <span className="personal-stat-value">{weekShifts.length}</span>
            <span className="personal-stat-label">Shifts this week</span>
          </div>
          <div className="personal-stat">
            <span className="personal-stat-value">{hoursLabel(weekMinutes)}</span>
            <span className="personal-stat-label">Scheduled</span>
          </div>
          <div className="personal-stat">
            <span className="personal-stat-value">{upcoming.length}</span>
            <span className="personal-stat-label">Upcoming</span>
          </div>
        </div>
      </section>

      {next && (
        <section className="card personal-next-shift" aria-labelledby="next-shift-heading">
          <p className="eyebrow" style={{ marginBottom: "0.35rem" }}>Next up</p>
          <h2 id="next-shift-heading" className="personal-next-title">
            {humanDate(next.date)} · {timeRange(next.start, next.end)}
          </h2>
          <p className="muted" style={{ margin: "0.25rem 0 0.75rem" }}>
            {pos(next.positionId)?.name} · {loc(next.locationId)?.name}
          </p>
          {next.taskIds.length > 0 && (
            <div className="row">
              {next.taskIds.map((t) => (
                <span key={t} className="chip">{db.tasks.find((x) => x.id === t)?.name}</span>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="personal-schedule-columns">
        <div className="stack">
          <section className="card" aria-labelledby="week-at-a-glance">
            <h2 id="week-at-a-glance" style={{ marginTop: 0 }}>Your week</h2>
            <p className="muted" style={{ fontSize: "0.86rem", marginTop: "-0.25rem" }}>
              Week of {weekStart}
            </p>
            <div className="personal-week-grid">
              {weekDays.map((date) => {
                const shifts = myShifts.filter((s) => s.date === date);
                const isToday = date === today;
                const isSelected = date === selectedDate;
                return (
                  <button
                    key={date}
                    type="button"
                    className={`personal-week-day ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}`}
                    onClick={() => setSelectedDate(date)}
                    aria-pressed={isSelected}
                    aria-label={`${WEEKDAY_LABELS[weekdayOf(date)]} ${date.slice(5)}, ${shifts.length} shift${shifts.length === 1 ? "" : "s"}`}
                  >
                    <span className="personal-week-day-label">{WEEKDAY_LABELS[weekdayOf(date)].slice(0, 3)}</span>
                    <span className="personal-week-day-date">{date.slice(8)}</span>
                    {shifts.length > 0 ? (
                      <div className="personal-week-day-shifts">
                        {shifts.map((s) => (
                          <span
                            key={s.id}
                            className="personal-week-shift-dot"
                            style={{ ["--pos" as string]: positionColorVar(pos(s.positionId)?.colorToken ?? "") }}
                            title={timeRange(s.start, s.end)}
                          />
                        ))}
                      </div>
                    ) : (
                      <span className="personal-week-day-empty muted">—</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="card" aria-labelledby="day-detail">
            <div className="spread schedule-day-nav" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
              <h2 id="day-detail" style={{ margin: 0 }}>{fullDayLabel(selectedDate)}</h2>
              <div className="row" style={{ gap: "0.35rem" }}>
                <button type="button" className="button sm" onClick={() => setSelectedDate((d) => addDays(d, -1))} aria-label="Previous day">‹</button>
                <button type="button" className="button sm" onClick={() => setSelectedDate(today)}>Today</button>
                <button type="button" className="button sm" onClick={() => setSelectedDate((d) => addDays(d, 1))} aria-label="Next day">›</button>
              </div>
            </div>
            <div className="mt">
              <DayTimeline
                shifts={dayShifts}
                empName={empName}
                pos={pos}
                emptyLabel={selectedDate === today ? "Nothing scheduled for you today." : `Nothing scheduled for ${fullDayLabel(selectedDate)}.`}
              />
            </div>
          </section>
        </div>

        <aside className="stack">
          <section className="card personal-calendar-card" aria-labelledby="calendar-sync">
            <h2 id="calendar-sync" style={{ marginTop: 0 }}>Your calendar</h2>
            <p className="muted" style={{ fontSize: "0.88rem" }}>
              Keep your personal calendar up to date with published shifts — no more copying times by hand.
            </p>
            <div className="personal-calendar-status">
              {profile.googleCalendarConnected ? (
                <span className="badge ok">Google Calendar connected</span>
              ) : (
                <span className="badge">Not connected</span>
              )}
            </div>
            <button
              type="button"
              className={`button ${profile.googleCalendarConnected ? "" : "primary"} mt`}
              onClick={() => void toggleCalendar()}
              disabled={connecting || !db.employees.some((e) => e.id === currentUser.id)}
            >
              {connecting
                ? "Updating…"
                : profile.googleCalendarConnected
                  ? "Disconnect Google Calendar"
                  : "Connect Google Calendar"}
            </button>
            <CalendarHelp />
          </section>

          <section className="card" aria-labelledby="quick-actions">
            <h2 id="quick-actions" style={{ marginTop: 0 }}>Quick actions</h2>
            <div className="personal-actions">
              <Link href="/availability" className="personal-action-tile">
                <span aria-hidden>✅</span>
                <span>Update availability</span>
              </Link>
              <Link href="/swaps" className="personal-action-tile">
                <span aria-hidden>🔄</span>
                <span>Offer or pick up shifts</span>
              </Link>
              <Link href="/calendar" className="personal-action-tile">
                <span aria-hidden>📅</span>
                <span>Full calendar view</span>
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
