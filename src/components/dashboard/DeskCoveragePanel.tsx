"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useStore } from "@/lib/store/StoreProvider";
import { DEFAULT_TIMEZONE } from "@/lib/config";
import { addDays, nowMinutesInTimeZone } from "@/domain/time";
import { fullDayLabel, todayISO } from "@/lib/schedule-view";
import { timeRange } from "@/lib/ui";
import {
  DESK_LOCATION_ID,
  deskCoverageForDate,
  isDeskShift,
  visibleCoverageRequests,
} from "@/domain/desk-coverage";

const HORIZON_DAYS = 7;

export function DeskCoveragePanel() {
  const { db, currentUser, requestCoverage, declineCoverage, expireStaleCoverage } = useStore();
  const today = todayISO();

  const deskHours = useMemo(
    () => db.operatingHours.find((o) => o.locationId === DESK_LOCATION_ID) ?? db.operatingHours[0],
    [db.operatingHours],
  );
  const deskPositionIds = useMemo(
    () =>
      db.positions
        .filter((p) => p.locationId === DESK_LOCATION_ID || /desk/i.test(p.name))
        .map((p) => p.id),
    [db.positions],
  );

  // Retire coverage requests whose shift has already started (logs unfilled).
  useEffect(() => {
    expireStaleCoverage({ date: today, minute: nowMinutesInTimeZone(DEFAULT_TIMEZONE) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const days = useMemo(() => {
    const opts = { deskLocationId: DESK_LOCATION_ID, deskPositionIds };
    return Array.from({ length: HORIZON_DAYS }, (_, i) => addDays(today, i))
      .map((date) => deskCoverageForDate(deskHours, db.shifts, date, opts))
      .filter((d) => d.openMinutes > 0 && d.gaps.length > 0);
  }, [db.shifts, deskHours, deskPositionIds, today]);

  const clock = { date: today, minute: nowMinutesInTimeZone(DEFAULT_TIMEZONE) };
  const requests = useMemo(
    () => visibleCoverageRequests(db.swaps, db.shifts, currentUser.id, clock),
    // clock.minute changes each render but only affects deadline filtering at the boundary
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.swaps, db.shifts, currentUser.id, today],
  );

  const empName = (id: string | null) =>
    id ? db.employees.find((e) => e.id === id)?.preferredName ?? db.employees.find((e) => e.id === id)?.legalName ?? "A teammate" : "A teammate";
  const posName = (id: string) => db.positions.find((p) => p.id === id)?.shortLabel ?? "Desk";

  // The current user's own upcoming desk shifts that aren't already seeking coverage.
  const myDeskShifts = useMemo(() => {
    const seeking = new Set(
      db.swaps.filter((s) => s.kind === "give_up" && s.status === "pending").map((s) => s.shiftId),
    );
    return db.shifts
      .filter(
        (s) =>
          s.employeeId === currentUser.id &&
          s.status !== "cancelled" &&
          s.date >= today &&
          isDeskShift(s, DESK_LOCATION_ID, deskPositionIds) &&
          !seeking.has(s.id),
      )
      .sort((a, b) => (a.date + String(a.start)).localeCompare(b.date + String(b.start)))
      .slice(0, 5);
  }, [db.shifts, db.swaps, currentUser.id, deskPositionIds, today]);

  return (
    <section className="card glass pad-lg" aria-labelledby="desk-coverage-heading">
      <div className="spread" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
        <h2 id="desk-coverage-heading" style={{ marginTop: 0, marginBottom: "0.15rem" }}>
          Borrowing desk coverage
        </h2>
        <Link href="/schedule" className="button sm glass-button">Desk schedule</Link>
      </div>
      <p className="muted" style={{ margin: "0 0 0.85rem", fontSize: "0.86rem" }}>
        The desk needs at least one person — student or staff — whenever it&apos;s open. These hours have
        no coverage yet; anyone eligible can pick them up.
      </p>

      {requests.length > 0 && (
        <div className="coverage-help" role="list" aria-label="Teammates needing coverage">
          {requests.map(({ swap, shift }) => (
            <div key={swap.id} className="coverage-help-item" role="listitem">
              <Link href="/swaps" className="coverage-help-link">
                <strong>{empName(swap.fromEmployeeId)}</strong> needs help with{" "}
                {fullDayLabel(shift.date)} · {timeRange(shift.start, shift.end)} ({posName(shift.positionId)})
              </Link>
              <button
                type="button"
                className="button sm"
                onClick={() => declineCoverage(swap.id)}
                aria-label={`Mark that you can't help ${empName(swap.fromEmployeeId)}`}
              >
                Can&apos;t help
              </button>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ fontSize: "0.95rem", margin: "0.25rem 0 0.5rem" }}>Hours needing coverage</h3>
      {days.length === 0 ? (
        <p className="muted">The desk is fully covered for the next {HORIZON_DAYS} days. 🎉</p>
      ) : (
        <ul className="list-reset stack" style={{ gap: "0.6rem" }}>
          {days.map((day) => (
            <li key={day.date}>
              <div className="spread" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
                <strong style={{ fontSize: "0.9rem" }}>
                  {day.date === today ? "Today · " : ""}{fullDayLabel(day.date)}
                </strong>
                <span className="badge warn">Needs coverage</span>
              </div>
              <div className="row" style={{ flexWrap: "wrap", gap: "0.35rem", marginTop: "0.3rem" }}>
                {day.gaps.map((gap, i) => (
                  <span key={i} className="chip">{timeRange(gap.start, gap.end)}</span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {myDeskShifts.length > 0 && (
        <div className="mt">
          <h3 style={{ fontSize: "0.95rem", margin: "0.75rem 0 0.5rem" }}>Need to give up a desk shift?</h3>
          <ul className="list-reset stack" style={{ gap: "0.4rem" }}>
            {myDeskShifts.map((s) => (
              <li key={s.id} className="spread" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.88rem" }}>
                  {fullDayLabel(s.date)} · {timeRange(s.start, s.end)}
                </span>
                <button type="button" className="button sm" onClick={() => requestCoverage(s.id)}>
                  Ask for coverage
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
