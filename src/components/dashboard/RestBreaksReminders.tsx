"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store/StoreProvider";
import { computeBreakReminders } from "@/domain/break-reminders";
import { defaultCaliforniaPolicy } from "@/domain/compliance";
import { formatTime12 } from "@/domain/time";
import type { BreakReminderItem } from "@/domain/break-reminders";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function urgencyClass(urgency: BreakReminderItem["urgency"]): string {
  switch (urgency) {
    case "overdue": return "break-chip overdue";
    case "due_soon": return "break-chip due-soon";
    case "taken": return "break-chip taken";
    case "not_eligible": return "break-chip muted";
    default: return "break-chip";
  }
}

function urgencyLabel(urgency: BreakReminderItem["urgency"]): string {
  switch (urgency) {
    case "overdue": return "Past due";
    case "due_soon": return "Due soon";
    case "taken": return "Done";
    case "not_eligible": return "N/A";
    default: return "Upcoming";
  }
}

/** Student/staff-friendly break nudges with a shift progress meter. */
export function RestBreaksReminders() {
  const { db, currentUser } = useStore();
  const today = todayISO();
  const employee = db.employees.find((e) => e.id === currentUser.id);
  const policy = useMemo(() => {
    if (!employee) return defaultCaliforniaPolicy();
    return (
      db.breakPolicies.find((p) => p.classification === employee.classification)
      ?? db.breakPolicies.find((p) => p.id === employee.breakPolicyId)
      ?? defaultCaliforniaPolicy(employee.classification)
    );
  }, [db.breakPolicies, employee]);

  const avail = db.availability.find((p) => p.employeeId === currentUser.id);
  const workHours = db.workingHours.find((p) => p.employeeId === currentUser.id);
  const isDayOff = workHours?.daysOff.some((d) => d.date === today);
  const myShifts = useMemo(
    () => db.shifts.filter((s) => s.employeeId === currentUser.id && s.status !== "cancelled"),
    [db.shifts, currentUser.id],
  );

  const state = useMemo(() => {
    if (!employee) return null;
    return computeBreakReminders({
      employee,
      policy,
      shifts: myShifts,
      date: today,
      nowMinutes: nowMinutes(),
      mealBreakMinutes: avail?.mealBreakMinutes,
    });
  }, [employee, policy, myShifts, today, avail?.mealBreakMinutes]);

  if (!employee || !state) return null;

  if (isDayOff) {
    const note = workHours?.daysOff.find((d) => d.date === today)?.note;
    return (
      <section className="card glass rest-breaks-card" aria-labelledby="rest-breaks">
        <div className="rest-breaks-header">
          <span className="rest-breaks-emoji" aria-hidden>🏖️</span>
          <div>
            <h2 id="rest-breaks" style={{ margin: 0 }}>Rest break reminders</h2>
            <p className="muted" style={{ margin: "0.2rem 0 0", fontSize: "0.85rem" }}>
              You marked today as a day off — enjoy!
            </p>
          </div>
        </div>
        <p className="rest-breaks-headline">Day off today</p>
        <p className="muted rest-breaks-subline">
          {note ? note : "No shift or break tracking needed. See you next time you're on the schedule! ☀️"}
        </p>
        <Link href="/availability" className="button sm glass-button mt">Manage working hours</Link>
      </section>
    );
  }

  const showMeter = state.shiftStart != null && state.shiftEnd != null && state.phase !== "exempt";

  return (
    <section className="card glass rest-breaks-card" aria-labelledby="rest-breaks">
      <div className="rest-breaks-header">
        <span className="rest-breaks-emoji" aria-hidden>🧃</span>
        <div>
          <h2 id="rest-breaks" style={{ margin: 0 }}>Rest break reminders</h2>
          <p className="muted" style={{ margin: "0.2rem 0 0", fontSize: "0.85rem" }}>
            Friendly nudges for meals and rests — not HR paperwork.
          </p>
        </div>
      </div>

      <p className="rest-breaks-headline">{state.headline}</p>
      <p className="muted rest-breaks-subline">{state.subline}</p>

      {showMeter && (
        <div className="rest-breaks-meter-wrap">
          <div className="spread" style={{ fontSize: "0.8rem", marginBottom: "0.35rem" }}>
            <span className="muted">{state.shiftStart != null ? formatTime12(state.shiftStart) : ""}</span>
            <span className="rest-breaks-meter-label">{state.meterLabel}</span>
            <span className="muted">{state.shiftEnd != null ? formatTime12(state.shiftEnd) : ""}</span>
          </div>
          <div
            className="rest-breaks-meter"
            role="meter"
            aria-valuenow={state.progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={state.meterLabel}
          >
            <div
              className="rest-breaks-meter-fill"
              style={{ width: `${state.progressPercent}%` }}
            />
            {state.reminders.map((r) => {
              if (state.shiftStart == null || state.shiftLengthMinutes <= 0) return null;
              const pct = ((r.dueBy - state.shiftStart) / state.shiftLengthMinutes) * 100;
              if (pct < 0 || pct > 100) return null;
              return (
                <span
                  key={`${r.kind}-${r.dueBy}`}
                  className={`rest-breaks-marker ${r.urgency}`}
                  style={{ left: `${pct}%` }}
                  title={`${r.label} by ${formatTime12(r.dueBy)}`}
                  aria-hidden
                >
                  {r.emoji}
                </span>
              );
            })}
          </div>
          <div className="rest-breaks-stats row">
            <span className="chip">Suggested shift: {state.suggestedShiftHours}</span>
            {state.isShortShift && <span className="chip">Short shift — breaks optional</span>}
            {state.hasActiveShift && !state.isShortShift && (
              <span className="chip">Worked so far: {(state.workedMinutes / 60).toFixed(1)} h</span>
            )}
          </div>
        </div>
      )}

      {state.reminders.length > 0 && (
        <ul className="list-reset rest-breaks-list">
          {state.reminders.map((r) => (
            <li key={`${r.kind}-${r.dueBy}`} className={urgencyClass(r.urgency)}>
              <span className="break-chip-emoji" aria-hidden>{r.emoji}</span>
              <div className="break-chip-body">
                <strong>{r.label}</strong>
                <span className="muted" style={{ fontSize: "0.82rem" }}>{r.detail}</span>
                <span className="break-chip-deadline">
                  Must take by <strong>{formatTime12(r.dueBy)}</strong>
                </span>
              </div>
              <span className="badge">{urgencyLabel(r.urgency)}</span>
            </li>
          ))}
        </ul>
      )}

      <Link href="/availability" className="button sm glass-button mt">
        Update working hours &amp; breaks
      </Link>
    </section>
  );
}
